/**
 * vb-monitor.js - Volatility Breakout → Grid Bot Strategy
 *
 * Detects Keltner Channel breakout, then deploys an OKX Grid Bot at the
 * breakout point. Stops the Grid Bot when price exits the range or SL is hit.
 *
 * Usage:
 *   node scripts/vb-monitor.js              # demo mode (default)
 *   node scripts/vb-monitor.js --live       # live mode
 *   node scripts/vb-monitor.js --dry-run    # simulate without executing
 */

const { execSync } = require('child_process');
const fs    = require('fs');
const path  = require('path');
const chalk = require('chalk');
const Table = require('cli-table3');
const ti    = require('technicalindicators');

// ── Config ────────────────────────────────────────────────────────────────────
const PROFILE     = process.argv.includes('--live') ? 'live' : 'demo';
const DRY_RUN     = process.argv.includes('--dry-run');
const INST_ID     = 'ETH-USDT-SWAP';
const RUNTIME_DIR = path.join(__dirname, '..', 'runtime');
const STATE_FILE  = path.join(RUNTIME_DIR, 'vb-state.json');
const LOG_FILE    = path.join(RUNTIME_DIR, 'vb-log.ndjson');

const CFG = {
  // Candle
  bar:            '1H',
  candleLimit:    300,
  // Keltner Channel
  kcLen:          22,
  kcMult:         2.0,
  kcAtrPeriod:    10,
  // Filters
  emaLen:         220,
  adxPeriod:      14,
  adxThresh:      20,
  volLen:         18,
  rsiLen:         14,
  atrLen:         14,
  useEmaFilter:   true,
  useAdxFilter:   true,
  useVolFilter:   true,
  // Grid Bot params (triggered on signal)
  gridNum:        12,
  lever:          2,
  sz:             0.3,        // contracts per grid
  rangeHalfWidth: 100,        // ±USDT from entry price
  tdMode:         'isolated',
  // Stop conditions
  slBuffer:       50,         // stop bot if price exits range by this much
  cooldownMs:     4 * 60 * 60 * 1000,
};

// ── OKX helpers ───────────────────────────────────────────────────────────────
function okx(args) {
  try {
    return execSync(`okx --profile ${PROFILE} ${args}`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) { return e.stdout || ''; }
}

function okxExec(args) {
  return execSync(`okx --profile ${PROFILE} ${args}`, {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
}

// ── State ─────────────────────────────────────────────────────────────────────
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (_) {
    return { gridBot: null, lastTradeTs: 0, tradesToday: 0, todayDate: '' };
  }
}

function saveState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2), 'utf8');
}

// ── Candle parsing ────────────────────────────────────────────────────────────
function parseCandles(raw) {
  const candles = [];
  for (const line of raw.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    const o = parseFloat(parts[parts.length - 5]);
    const h = parseFloat(parts[parts.length - 4]);
    const l = parseFloat(parts[parts.length - 3]);
    const c = parseFloat(parts[parts.length - 2]);
    const v = parseFloat(parts[parts.length - 1]);
    if (isNaN(o) || isNaN(c) || o <= 0) continue;
    candles.push({ o, h, l, c, v });
  }
  return candles.reverse();
}

// ── Indicators ────────────────────────────────────────────────────────────────
function calcIndicators(candles) {
  const highs  = candles.map(x => x.h);
  const lows   = candles.map(x => x.l);
  const closes = candles.map(x => x.c);
  const vols   = candles.map(x => x.v);

  const ema220 = ti.EMA.calculate({ period: CFG.emaLen,       values: closes });
  const kcEma  = ti.EMA.calculate({ period: CFG.kcLen,        values: closes });
  const atrKC  = ti.ATR.calculate({ period: CFG.kcAtrPeriod,  high: highs, low: lows, close: closes });
  const atrSL  = ti.ATR.calculate({ period: CFG.atrLen,       high: highs, low: lows, close: closes });
  const rsi    = ti.RSI.calculate({ period: CFG.rsiLen,       values: closes });
  const adxArr = ti.ADX.calculate({ period: CFG.adxPeriod,    close: closes, high: highs, low: lows });
  const volSma = ti.SMA.calculate({ period: CFG.volLen,       values: vols });

  const kcLen = Math.min(kcEma.length, atrKC.length);
  const kcUpper = [], kcLower = [];
  for (let i = 0; i < kcLen; i++) {
    const e = kcEma[kcEma.length - kcLen + i];
    const a = atrKC[atrKC.length - kcLen + i];
    kcUpper.push(e + a * CFG.kcMult);
    kcLower.push(e - a * CFG.kcMult);
  }

  return { closes, highs, lows, vols, ema220, kcUpper, kcLower, atrSL, rsi, adxArr, volSma };
}

// ── Signal ────────────────────────────────────────────────────────────────────
function getSignal(ind) {
  const cur  = arr => arr[arr.length - 2];
  const prv  = arr => arr[arr.length - 3];

  const currClose = cur(ind.closes);
  const prevClose = prv(ind.closes);
  const currKcU   = cur(ind.kcUpper);
  const prevKcU   = prv(ind.kcUpper);
  const currKcL   = cur(ind.kcLower);
  const prevKcL   = prv(ind.kcLower);
  const currEma   = cur(ind.ema220);
  const currRsi   = cur(ind.rsi);
  const currAdx   = cur(ind.adxArr)?.adx ?? 0;
  const currVol   = cur(ind.vols);
  const currVolMA = cur(ind.volSma);

  const volOk     = !CFG.useVolFilter || currVol > currVolMA;
  const adxOk     = !CFG.useAdxFilter || currAdx > CFG.adxThresh;
  const uptrend   = !CFG.useEmaFilter || currClose > currEma;
  const downtrend = !CFG.useEmaFilter || currClose < currEma;

  const longSignal  = prevClose <= prevKcU && currClose > currKcU
                      && volOk && uptrend  && currRsi > 50 && adxOk;
  const shortSignal = prevClose >= prevKcL && currClose < currKcL
                      && volOk && downtrend && currRsi < 50 && adxOk;

  return {
    longSignal, shortSignal,
    currClose, currKcU, currKcL, currEma,
    currRsi, currAdx, currVol, currVolMA,
    volOk, adxOk, uptrend, downtrend,
  };
}

// ── Grid Bot helpers ──────────────────────────────────────────────────────────
function parseBotOrders(raw) {
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (/^\d{19}\s+/.test(trimmed)) {
      const p = trimmed.split(/\s+/);
      return { algoId: p[0], instId: p[1], state: p[3], pnl: p[4] || null, maxPx: p[6], minPx: p[7] };
    }
  }
  return null;
}

function getField(text, key) {
  const m = text.match(new RegExp(`^${key}\\s+(\\S+)`, 'm'));
  return m ? m[1] : null;
}

// ── Print summary ─────────────────────────────────────────────────────────────
function fmtN(n, d = 2) {
  return n != null && !isNaN(n)
    ? Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
    : '—';
}

function printSummary(sig, state, action, execResult, ts) {
  const modeLabel = PROFILE === 'live'
    ? chalk.bgRed.white.bold(' LIVE ')
    : chalk.bgYellow.black.bold(' DEMO ');
  const timeStr = new Date(ts).toLocaleString('zh-TW', { hour12: false });

  console.log('');
  console.log(chalk.magenta('━'.repeat(54)));
  console.log(chalk.bold('  VB→Grid Monitor') + '  ' + modeLabel + chalk.gray('  ' + timeStr));
  console.log(chalk.magenta('━'.repeat(54)));

  // Price & KC
  console.log('');
  const emaArrow = sig.currClose > sig.currEma ? chalk.green('↑ EMA') : chalk.red('↓ EMA');
  console.log(
    `  ${chalk.bold('ETH-USDT-SWAP')}  ${chalk.white.bold(fmtN(sig.currClose))}  ` +
    chalk.gray(`KC [${fmtN(sig.currKcL)} ~ ${fmtN(sig.currKcU)}]`) + `  ${emaArrow}`
  );

  // Filters
  console.log('');
  const tbl = new Table({
    head: [chalk.gray('RSI'), chalk.gray('ADX'), chalk.gray('Vol/MA'), chalk.gray('Trend')],
    style: { border: ['gray'], head: [] },
    colAligns: ['right', 'right', 'right', 'center'],
  });
  tbl.push([
    (sig.currRsi > 50 ? chalk.green : chalk.red)(fmtN(sig.currRsi, 1)),
    (sig.currAdx > CFG.adxThresh ? chalk.green : chalk.red)(fmtN(sig.currAdx, 1)),
    (sig.volOk ? chalk.green : chalk.red)(`${(sig.currVol / sig.currVolMA).toFixed(2)}x`),
    sig.uptrend ? chalk.green('Up') : (sig.downtrend ? chalk.red('Dn') : chalk.gray('—')),
  ]);
  for (const l of tbl.toString().split('\n')) console.log('  ' + l);

  // Signal
  console.log('');
  console.log(chalk.magenta('  ── Signal ──'));
  if (sig.longSignal)       console.log('  ' + chalk.bgGreen.black.bold(' LONG ')  + chalk.green(' KC 突破上軌 → 建 Grid Bot (long)'));
  else if (sig.shortSignal) console.log('  ' + chalk.bgRed.white.bold(' SHORT ') + chalk.red(' KC 突破下軌 → 建 Grid Bot (short)'));
  else                      console.log('  ' + chalk.gray('No signal'));

  // Grid Bot status
  console.log('');
  console.log(chalk.magenta('  ── Grid Bot ──'));
  const bot = state.gridBot;
  if (bot) {
    const pnlRatio = parseFloat(bot.pnlRatio);
    const pnlStr = !isNaN(pnlRatio)
      ? (pnlRatio >= 0 ? chalk.green : chalk.red)((pnlRatio >= 0 ? '+' : '') + (pnlRatio * 100).toFixed(4) + '%')
      : chalk.gray('—');
    console.log(
      '  ' + chalk.green('●') + ' ' + chalk.white.bold(bot.direction.toUpperCase()) +
      chalk.gray(`  algoId: ${bot.algoId}`)
    );
    console.log(
      '  ' + chalk.gray('區間') + `  ${chalk.white(fmtN(bot.minPx))} ~ ${chalk.white(fmtN(bot.maxPx))}` +
      chalk.gray(`  ${CFG.gridNum} grids`)
    );
    console.log('  ' + chalk.gray('收益率') + '  ' + pnlStr);
    console.log(
      '  ' + chalk.gray('止損線') + '  ' +
      chalk.yellow(bot.direction === 'long' ? fmtN(bot.minPx - CFG.slBuffer) : fmtN(bot.maxPx + CFG.slBuffer))
    );
  } else {
    console.log('  ' + chalk.gray('無運行中的 Grid Bot'));
  }

  // Action
  if (action) {
    console.log('');
    console.log(chalk.magenta('  ── Action ──'));
    const resultStr = execResult === 'created' || execResult === 'stopped'
      ? chalk.green('✓ ' + execResult)
      : execResult === 'dry-run' ? chalk.yellow('dry-run')
      : chalk.red('✗ ' + execResult);
    console.log(`  ${chalk.white(action.type.toUpperCase())}  ${chalk.gray(action.reason)}  ${resultStr}`);
  }

  const inCooldown = (Date.now() - (state.lastTradeTs || 0)) < CFG.cooldownMs;
  if (inCooldown && !state.gridBot) {
    const left = Math.ceil((CFG.cooldownMs - (Date.now() - state.lastTradeTs)) / 60000);
    console.log('  ' + chalk.gray(`cooldown: ${left}min left`));
  }

  console.log('');
  console.log(chalk.magenta('━'.repeat(54)));
  console.log('');
}

// ── Main ──────────────────────────────────────────────────────────────────────
if (!fs.existsSync(RUNTIME_DIR)) fs.mkdirSync(RUNTIME_DIR, { recursive: true });

const ts    = new Date().toISOString();
const state = loadState();

if (state.todayDate !== ts.slice(0, 10)) {
  state.tradesToday = 0;
  state.todayDate   = ts.slice(0, 10);
}

// Fetch candles & calculate signal
const candleRaw = okx(`market candles ${INST_ID} --bar ${CFG.bar} --limit ${CFG.candleLimit}`);
const candles   = parseCandles(candleRaw);

if (candles.length < CFG.emaLen + 20) {
  console.log(chalk.red(`Not enough candles: got ${candles.length}, need ${CFG.emaLen + 20}`));
  process.exit(1);
}

const ind = calcIndicators(candles);
const sig = getSignal(ind);

// Current ETH price
const tickerRaw = okx(`market ticker ${INST_ID}`);
const currPrice = parseFloat(getField(tickerRaw, 'last') || sig.currClose);

// ── Sync Grid Bot state with OKX ──────────────────────────────────────────────
const botOrdersRaw = okx('bot grid orders --algoOrdType contract_grid');
const okxBot = parseBotOrders(botOrdersRaw);

if (state.gridBot) {
  if (!okxBot || okxBot.algoId !== state.gridBot.algoId || okxBot.state !== 'running') {
    console.log(chalk.yellow('Grid Bot stopped externally — clearing state'));
    state.gridBot = null;
    state.lastTradeTs = Date.now();
  } else {
    // Refresh pnlRatio from bot details
    const detailsRaw = okx(`bot grid details --algoOrdType contract_grid --algoId ${state.gridBot.algoId}`);
    state.gridBot.pnlRatio = getField(detailsRaw, 'pnlRatio') || null;
  }
} else if (okxBot && okxBot.state === 'running') {
  // Cloud-Native Recovery: If local state is missing but bot is running on OKX
  console.log(chalk.yellow('Recovered Grid Bot state from OKX (Stateless Run)'));
  state.gridBot = {
    algoId: okxBot.algoId,
    direction: 'auto', // direction may not be available from CLI, use auto
    maxPx: parseFloat(okxBot.maxPx),
    minPx: parseFloat(okxBot.minPx),
    pnlRatio: null,
    ts: ts,
  };
}

// ── Stop condition (price exits range + slBuffer) ─────────────────────────────
let action = null;

if (state.gridBot) {
  const bot = state.gridBot;
  const slLong  = bot.minPx - CFG.slBuffer;
  const slShort = bot.maxPx + CFG.slBuffer;

  const isLongStop = (bot.direction === 'long' || bot.direction === 'auto') && currPrice < slLong;
  const isShortStop = (bot.direction === 'short' || bot.direction === 'auto') && currPrice > slShort;

  if (isLongStop) {
    action = { type: 'stop', reason: `Price ${fmtN(currPrice)} < SL ${fmtN(slLong)} (minPx ${fmtN(bot.minPx)} - ${CFG.slBuffer})` };
  } else if (isShortStop) {
    action = { type: 'stop', reason: `Price ${fmtN(currPrice)} > SL ${fmtN(slShort)} (maxPx ${fmtN(bot.maxPx)} + ${CFG.slBuffer})` };
  }
}

// ── Entry signal → create Grid Bot ───────────────────────────────────────────
const inCooldown = (Date.now() - (state.lastTradeTs || 0)) < CFG.cooldownMs;

if (!state.gridBot && !inCooldown) {
  if (sig.longSignal || sig.shortSignal) {
    const direction = sig.longSignal ? 'long' : 'short';
    const center    = currPrice;
    const maxPx     = Math.round(center + CFG.rangeHalfWidth);
    const minPx     = Math.round(center - CFG.rangeHalfWidth);
    action = { type: 'create', direction, maxPx, minPx, reason: `KC 突破 ${direction}` };
  }
}

// ── Execute ───────────────────────────────────────────────────────────────────
let execResult = null;

if (action) {
  if (action.type === 'stop') {
    if (!DRY_RUN) {
      try {
        okxExec(`bot grid stop --algoOrdType contract_grid --algoId ${state.gridBot.algoId} --instId ${INST_ID}`);
        execResult = 'stopped';
      } catch (e) { execResult = 'error: ' + e.message; }
    } else {
      execResult = 'dry-run';
    }
    if (execResult !== 'error') {
      state.gridBot     = null;
      state.lastTradeTs = Date.now();
    }
  } else if (action.type === 'create') {
    if (!DRY_RUN) {
      try {
        const result = okxExec(
          `bot grid create --instId ${INST_ID} --algoOrdType contract_grid ` +
          `--direction ${action.direction} --lever ${CFG.lever} --gridNum ${CFG.gridNum} ` +
          `--maxPx ${action.maxPx} --minPx ${action.minPx} --sz ${CFG.sz} --tdMode ${CFG.tdMode}`
        );
        const algoIdMatch = result.match(/(\d{19})/);
        state.gridBot = {
          algoId:    algoIdMatch ? algoIdMatch[1] : 'unknown',
          direction: action.direction,
          maxPx:     action.maxPx,
          minPx:     action.minPx,
          pnlRatio:  null,
          ts,
        };
        state.lastTradeTs = Date.now();
        state.tradesToday++;
        execResult = 'created';
      } catch (e) { execResult = 'error: ' + e.message; }
    } else {
      state.gridBot = {
        algoId: 'dry-run', direction: action.direction,
        maxPx: action.maxPx, minPx: action.minPx, pnlRatio: null, ts,
      };
      execResult = 'dry-run';
    }
  }
}

saveState(state);
fs.appendFileSync(LOG_FILE, JSON.stringify({ ts, sig, action, execResult, gridBot: state.gridBot }) + '\n', 'utf8');

printSummary(sig, state, action, execResult, ts);

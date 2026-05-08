# setup-vb.ps1
# VB Monitor 啟動前設定：設定槓桿、確認餘額、確認無衝突倉位
# 對應 Grid Bot 的 create-bot.ps1

$INST_ID   = 'ETH-USDT-SWAP'
$LEVER     = 2
$MGN_MODE  = 'cross'
$PROFILE   = 'demo'
$MIN_USDT  = 50   # 最低保證金門檻

Write-Host ""
Write-Host "=== VB Monitor Setup ===" -ForegroundColor Cyan
Write-Host "Profile  : $PROFILE"
Write-Host "InstId   : $INST_ID"
Write-Host "Leverage : ${LEVER}x $MGN_MODE"
Write-Host ""

# 1. 設定槓桿
Write-Host "[1/4] Setting leverage ${LEVER}x $MGN_MODE ..." -ForegroundColor Yellow
$leverResult = & okx --profile $PROFILE swap leverage `
    --instId $INST_ID `
    --lever $LEVER `
    --mgnMode $MGN_MODE 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "      OK" -ForegroundColor Green
} else {
    Write-Host "      WARN: $leverResult" -ForegroundColor Yellow
}

# 2. 確認帳戶餘額
Write-Host "[2/4] Checking USDT balance ..." -ForegroundColor Yellow
$balRaw = & okx --profile $PROFILE account balance 2>&1
$balLine = $balRaw | Select-String 'USDT' | Select-Object -First 1
if ($balLine) {
    $parts = ($balLine.ToString().Trim()) -split '\s+'
    $usdt = [double]($parts[1])
    if ($usdt -ge $MIN_USDT) {
        Write-Host ("      USDT available: {0:N2}  OK" -f $usdt) -ForegroundColor Green
    } else {
        Write-Host ("      USDT available: {0:N2}  too low (min {1})" -f $usdt, $MIN_USDT) -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "      Could not parse balance" -ForegroundColor Yellow
}

# 3. 確認目前無持倉
Write-Host "[3/4] Checking existing positions ..." -ForegroundColor Yellow
$posRaw = & okx --profile $PROFILE swap positions $INST_ID 2>&1
if ($posRaw -match 'No open') {
    Write-Host "      No positions  OK" -ForegroundColor Green
} else {
    Write-Host "      WARNING: existing position detected:" -ForegroundColor Red
    Write-Host $posRaw
    Write-Host ""
    $confirm = Read-Host "      Existing position found. Continue anyway? (y/N)"
    if ($confirm -ne 'y') { exit 1 }
}

# 4. 確認 OKX CLI 可連線
Write-Host "[4/4] Verifying OKX connection ..." -ForegroundColor Yellow
$ticker = & okx --profile $PROFILE market ticker $INST_ID 2>&1
$priceLine = $ticker | Select-String 'last'
if ($priceLine) {
    $price = (($priceLine.ToString().Trim()) -split '\s+')[1]
    Write-Host ("      ETH price: {0}  OK" -f $price) -ForegroundColor Green
} else {
    Write-Host "      Could not fetch price — check OKX CLI connection" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Setup complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next step: start the monitor" -ForegroundColor White
Write-Host "  node scripts/vb-monitor.js           # run once manually"
Write-Host "  .\scripts\setup-vb-scheduler.ps1     # register auto-schedule (every 30 min)"
Write-Host ""

---
name: eth-vb-monitor-demo
description: "ETH-USDT-SWAP Volatility Breakout → Grid Bot | 模擬盤 | KC 突破信號觸發 Grid Bot 建立/停止"
license: MIT
metadata:
  author: jacobhsu
  version: "2.0.0-demo"
  profile: demo
  agent:
    requires:
      bins: ["okx"]
---

# ETH Volatility Breakout → Grid Bot Skill v2.0【模擬盤】

> ⚠️ 本文件僅用於模擬盤（demo profile）測試，禁止用於正式帳戶。

---

## 策略定位

- 標的：ETH-USDT-SWAP（永續合約，1H K 線）
- 類型：趨勢突破 → Grid Bot 執行
- 信號來源：Keltner Channel 突破 + EMA/ADX/RSI/成交量四重過濾
- 執行方式：信號觸發時建立 OKX Grid Bot（`bot grid create`），而非直接市價單
- 止損：價格突破 Grid 區間 ± 50 USDT 時停止 Grid Bot（`bot grid stop`）
- 冷卻期：進場後 4 小時內不重複建立

---

## 核心參數

| 參數 | 值 | 說明 |
|------|----|------|
| K 線週期 | 1H | 每次檢查取最近 300 根 |
| Keltner EMA | 22 | KC 中線 |
| Keltner ATR | 10 | KC 寬度用 ATR(10) × 2.0 |
| 趨勢 EMA | 220 | 收盤需在 EMA(220) 上/下方 |
| ADX 閾值 | 20 | ADX > 20 才確認趨勢 |
| 成交量過濾 | SMA(18) | 成交量需大於 18 根均量 |
| RSI | 14 | 多頭 RSI > 50，空頭 RSI < 50 |
| Grid Bot 區間 | ±100 USDT | 以進場價為中心，上下各 100 |
| Grid 數量 | 12 | 每格張數 0.3 |
| 槓桿 | 2x | isolated 模式 |
| SL 緩衝 | 50 USDT | 超出區間 50 USDT 觸發停止 |
| 冷卻期 | 4 小時 | 上次操作後不重複建立 |

---

## Step 1：採集 K 線資料

```bash
okx --profile demo market candles ETH-USDT-SWAP --bar 1H --limit 300
```

取得最近 300 根 1H K 線（time / open / high / low / close / vol），輸出為最新在前，解析時需反轉為時間正序。

---

## Step 2：計算技術指標

使用最近 300 根 K 線計算：

| 指標 | 計算方式 |
|------|----------|
| KC Upper | EMA(close, 22) + ATR(high, low, close, 10) × 2.0 |
| KC Lower | EMA(close, 22) − ATR(high, low, close, 10) × 2.0 |
| Trend EMA | EMA(close, 220) |
| ADX | Wilder's ADX(14) |
| RSI | RSI(close, 14) |
| Vol MA | SMA(volume, 18) |

> 使用**倒數第二根**已完成 K 線（index -2）做為訊號判斷基準，避免使用未收盤的 bar。

---

## Step 3：判斷進場信號

### 多頭進場（Long）—— 全部成立才觸發

1. 前一根收盤 ≤ KC Upper，**當前收盤 > KC Upper**（向上突破）
2. 當前成交量 > Vol MA
3. 當前收盤 > EMA(220)
4. 當前 RSI > 50
5. 當前 ADX > 20

### 空頭進場（Short）—— 全部成立才觸發

1. 前一根收盤 ≥ KC Lower，**當前收盤 < KC Lower**（向下突破）
2. 當前成交量 > Vol MA
3. 當前收盤 < EMA(220)
4. 當前 RSI < 50
5. 當前 ADX > 20

---

## Step 4：查詢 Grid Bot 狀態

```bash
okx --profile demo bot grid orders --algoOrdType contract_grid
```

讀取 `runtime/vb-state.json` 確認是否有記錄中的 Grid Bot（`gridBot.algoId`）。

- **有 Grid Bot 運行中** → 跳至 Step 5（止損檢查）
- **無 Grid Bot + 無冷卻** + 有信號 → 執行 Step 6（建立 Grid Bot）
- **無 Grid Bot + 冷卻中** → 輸出狀態後結束

---

## Step 5：止損檢查（有 Grid Bot 時執行）

查詢當前 ETH 價格：

```bash
okx --profile demo market ticker ETH-USDT-SWAP
```

計算止損線：

| 方向 | 止損條件 |
|------|----------|
| Long | 當前價 < gridBot.minPx − 50 |
| Short | 當前價 > gridBot.maxPx + 50 |

觸發止損 → 跳至 Step 7（停止 Grid Bot）

---

## Step 6：建立 Grid Bot

以當前 ETH 價格為中心，建立 ±100 USDT 區間的 Grid Bot：

```bash
# Long 方向
okx --profile demo bot grid create \
  --instId ETH-USDT-SWAP \
  --algoOrdType contract_grid \
  --direction long \
  --lever 2 \
  --gridNum 12 \
  --maxPx <currPrice + 100> \
  --minPx <currPrice - 100> \
  --sz 0.3 \
  --tdMode isolated

# Short 方向（direction 改為 short）
okx --profile demo bot grid create \
  --instId ETH-USDT-SWAP \
  --algoOrdType contract_grid \
  --direction short \
  --lever 2 \
  --gridNum 12 \
  --maxPx <currPrice + 100> \
  --minPx <currPrice - 100> \
  --sz 0.3 \
  --tdMode isolated
```

從返回結果中提取 `algoId`，記錄至 `runtime/vb-state.json`：

```json
{
  "gridBot": {
    "algoId": "<algoId>",
    "direction": "long",
    "maxPx": 2100,
    "minPx": 1900,
    "pnlRatio": null,
    "ts": "<ISO timestamp>"
  },
  "lastTradeTs": "<timestamp ms>",
  "tradesToday": 1,
  "todayDate": "2026-05-08"
}
```

---

## Step 7：停止 Grid Bot

```bash
okx --profile demo bot grid stop \
  --algoOrdType contract_grid \
  --algoId <algoId> \
  --instId ETH-USDT-SWAP
```

停止後清除 `runtime/vb-state.json` 的 `gridBot` 欄位，更新 `lastTradeTs`。

---

## Step 8：狀態輸出格式

每次執行後輸出：

```
狀態：LONG Grid Bot / SHORT Grid Bot / FLAT / SL 觸發停止
ETH 價格：[last]
KC 區間：[KC Lower] ~ [KC Upper]
趨勢 EMA(220)：[值] ([上方/下方])
RSI：[值]  ADX：[值]  Vol：[vol/volMA]x
信號：[Long 突破 / Short 突破 / 無信號]
Grid Bot：[algoId]  區間：[minPx] ~ [maxPx]  收益率：[pnlRatio]
本次操作：[無 / 建立 Grid Bot Long / 建立 Grid Bot Short / 止損停止 Grid Bot]
```

---

## 切換正式版條件

- [ ] 連續 48 小時無命令報錯
- [ ] 至少完成 1 次完整進出（Grid Bot 建立 → 止損或手動停止）
- [ ] `runtime/vb-log.ndjson` 日誌正常記錄
- [ ] 信號判斷符合預期（對照 TradingView pine 腳本回測結果）

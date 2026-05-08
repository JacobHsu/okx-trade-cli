---
name: okx-grid-bot-monitor
description: "ETH-USDT-SWAP 震盪網格策略 | 正式盤版 | bot grid 自動維護 | 先判斷再執行"
license: MIT
metadata:
  author: jacobhsu
  version: "3.0.0"
  agent:
    requires:
      bins: ["okx"]
---

# ETH 震盪網格 Skill v3.0【正式盤版】

> 本策略在 ETH-USDT-SWAP 的震盪行情中，透過 OKX bot grid 自動維護網格，
> 並在價格偏離區間或橫盤無活躍掛單時自動重建。
>
> 本策略不預測漲跌方向，只在震盪條件成立時執行。條件不成立時等待，不強行交易。

---

## 策略定位

| 項目 | 說明 |
|------|------|
| 標的 | ETH-USDT-SWAP（USDT 永續合約）|
| 策略類型 | 震盪網格 |
| 執行分工 | Skill 判斷重建時機，OKX bot grid 負責掛單維護 |
| 適用行情 | 橫盤震盪 |
| 不適用行情 | 強趨勢單邊行情 |

---

## 歷史驗證數據

> 來自 ETH-USDT 現貨網格（2026-03-31 至 2026-04-09），用於驗證策略邏輯。
> 永續合約因槓桿效應，實際表現與現貨有差異。

| 指標 | 數值 |
|------|------|
| 運行時長 | 9.1 天 |
| 總成交 | 100 筆 |
| 完整往返 | 48 次 |
| 獲利往返 | 28 次（勝率 58%）|
| 總利潤 | 37.03 USDT |

**關鍵結論**：低槓桿 + 自動重建 + 暫停機制是核心，高槓桿會直接摧毀盈利。

---

## 當前執行參數

| 參數 | 值 | 說明 |
|------|-----|------|
| 標的 | ETH-USDT-SWAP | |
| 網格數 | 12 格等差 | |
| 槓桿 | 2x，逐倉（isolated）| 固定，不可調高 |
| 區間半寬 | ±100 USDT | 以當前價為中心 |
| 方向 | long | |
| sz | 0.3 張 / 格 | |
| 冷卻期 | 1 小時 | 每次重建後最短間隔 |
| 日重建上限 | 2 次 | 防止頻繁交易 |

---

## Step 1：採集市場狀態

```bash
okx market ticker ETH-USDT-SWAP
okx account balance
okx bot grid orders --algoOrdType contract_grid
okx bot grid sub-orders --algoOrdType contract_grid --algoId <algoId>
```

取得：
- `last`：當前 ETH 價格
- `USDT available`：可用保證金
- `state`：bot 運行狀態
- `maxPx` / `minPx`：當前 bot 區間
- `liveOrders`：活躍掛單數量

---

## Step 2：判斷是否需要重建

### 三個觸發條件（任一成立即觸發）

| 條件 | 觸發閾值 | 說明 |
|------|----------|------|
| 上突破 | `last > maxPx + 50` | 價格突破區間上限 50 USDT |
| 下突破 | `last < minPx - 50` | 價格跌破區間下限 50 USDT |
| 橫盤耗盡 | 連續 6 次 `liveOrders = 0` | 約 30 分鐘無活躍掛單 |

### 安全閥（任一成立則不執行）

| 規則 | 說明 |
|------|------|
| 冷卻期 | 距上次重建不足 1 小時 |
| 日上限 | 當日已重建 2 次 |
| 負價保護 | 新 `minPx ≤ 0` |

---

## Step 3：執行重建

### 3-1. 停止舊 bot

```bash
okx bot grid stop \
  --algoOrdType contract_grid \
  --algoId <algoId> \
  --instId ETH-USDT-SWAP \
  --stopType 1
```

### 3-2. 建立新 bot

```bash
okx bot grid create \
  --instId ETH-USDT-SWAP \
  --algoOrdType contract_grid \
  --direction long \
  --lever 2 \
  --gridNum 12 \
  --maxPx <last + 100> \
  --minPx <last - 100> \
  --sz 0.3 \
  --tdMode isolated
```

### 3-3. 確認成功

```bash
okx bot grid orders --algoOrdType contract_grid
```

新 `algoId` 出現且 `state = running` 代表重建完成。

---

## Step 4：狀態輸出格式

每次執行後輸出：

```
狀態：RUNNING / REBUILT / PAUSED
當前價格：[ETH 價格]
Bot 區間：[minPx] ~ [maxPx]
活躍掛單：[liveOrders 數量]
橫盤計數：[count] / 6
今日重建次數：[n] / 2
本次操作：[無操作 / 重建]
原因：[說明]
```

---

## Step 5：風險控制

### 暫停條件（任一成立則停止重建，等待人工確認）

| 條件 | 說明 |
|------|------|
| 當日重建已達上限 | maxDailyTrades = 2 |
| 重建後仍無掛單 | bot 建立但 liveOrders 持續為 0 |
| 價格持續單邊下跌 | 超出區間後連續觸發下突破 |

### 緊急停止

```bash
okx bot grid stop \
  --algoOrdType contract_grid \
  --algoId <algoId> \
  --instId ETH-USDT-SWAP \
  --stopType 1
```

---

## 策略原則

1. 只做 ETH-USDT-SWAP 震盪網格
2. 先確認 bot 狀態，再判斷是否重建
3. 三個觸發條件任一成立才重建，不主動追價
4. 固定 2x 槓桿、逐倉，不調高
5. 所有計榜訂單必須透過 Agent Trade Kit 自動執行，不使用 App 手動下單

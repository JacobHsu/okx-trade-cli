---
name: eth-grid-monitor-demo
description: "ETH-USDT-SWAP 震盪網格策略 | 模擬盤測試版 | bot grid 自動維護"
license: MIT
metadata:
  author: jacobhsu
  version: "3.0.0-demo"
  profile: demo
  agent:
    requires:
      bins: ["okx"]
---

# ETH 震盪網格 Skill v3.0【模擬盤測試版】

> ⚠️ 本文件僅用於模擬盤（demo profile）測試，禁止用於正式帳戶。
> 正式版請使用 `SKILL.live.md`。

---

## 策略定位

- 標的：ETH-USDT-SWAP（永續合約）
- 執行方式：OKX `bot grid` 自動維護網格掛單
- 判斷邏輯：檢查三個觸發條件，決定是否重建 bot
- 本 Skill 負責「判斷與重建」，掛單循環由 OKX 官方 bot grid 負責

---

## 當前執行參數

| 參數 | 值 |
|------|----|
| 標的 | ETH-USDT-SWAP |
| 網格數 | 12 格等差 |
| 槓桿 | 2x，逐倉（isolated）|
| 區間半寬 | 當前價格 ±100 USDT |
| 方向 | long |
| sz | 0.3 張 / 格 |

---

## Step 1：採集市場狀態

```bash
okx --profile demo market ticker ETH-USDT-SWAP
okx --profile demo account balance
okx --profile demo bot grid orders --algoOrdType contract_grid
```

取得：
- `last`：當前 ETH 價格
- `USDT`：可用保證金
- bot 狀態：`algoId`、`state`、`maxPx`、`minPx`

---

## Step 2：判斷是否需要重建

檢查以下三個條件（任一成立即觸發重建）：

| 條件 | 觸發閾值 | 重建方式 |
|------|----------|----------|
| 價格突破區間上限 | `last > maxPx + 50` | 以當前價為中心重建 |
| 價格跌破區間下限 | `last < minPx - 50` | 以當前價為中心重建 |
| 橫盤無掛單 | 連續 6 次檢查 `liveOrders = 0` | 以當前價為中心重建 |

安全閥（以下任一成立則不執行）：
- 距上次重建不足 1 小時
- 當日已重建 2 次

---

## Step 3：執行重建

### 3-1. 停止舊 bot

```bash
okx --profile demo bot grid stop \
  --algoOrdType contract_grid \
  --algoId <algoId> \
  --instId ETH-USDT-SWAP \
  --stopType 1
```

### 3-2. 建立新 bot（以當前價格為中心）

```bash
okx --profile demo bot grid create \
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

### 3-3. 確認建立成功

```bash
okx --profile demo bot grid orders --algoOrdType contract_grid
```

看到新 `algoId` 且 `state = running` 代表成功。

---

## Step 4：狀態輸出格式

每次執行後輸出：

```
狀態：RUNNING / REBUILT / IDLE
當前價格：[ETH 價格]
Bot 區間：[minPx] ~ [maxPx]
活躍掛單：[liveOrders 數量]
橫盤計數：[noLiveOrdersCount] / 6
本次操作：[無操作 / 重建]
原因：[說明]
```

---

## 切換正式版條件

- [ ] 連續 24 小時無命令報錯
- [ ] 至少完成 1 次完整重建（觸發 → 停舊 → 建新）
- [ ] `runtime/notifications.txt` 日誌正常記錄
- [ ] 重建後 liveOrders 恢復正常

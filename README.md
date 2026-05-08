# OKX Grid Bot Monitor & Auto-Trader

> ETH-USDT-SWAP 永續合約 — 網格策略監控 + Volatility Breakout 策略，兩套獨立系統

---

## 專案簡介

兩套完全獨立的交易策略，共用 OKX CLI 但各自有狀態檔與監控腳本：

| 策略 | 腳本 | 類型 | 說明 |
|------|------|------|------|
| 網格 Bot | `scripts/monitor.js` | 區間震盪 | 自動監控 + 重建 OKX Grid Bot |
| Volatility Breakout | `scripts/vb-monitor.js` | 趨勢突破 | Keltner Channel + EMA/ADX/RSI 信號 |

---

## 功能特性

**網格 Bot Monitor**

| 功能 | 說明 |
|------|------|
| 網格狀態監控 | 掃描 bot 狀態、掛單數量、持倉損益、收益率 |
| 自動重建 | 價格突破區間或橫盤無掛單時，自動停舊 bot → 建新 bot |
| 風控保護 | 冷卻期 1 小時、每日上限 2 次、負價保護 |
| 結構化日誌 | NDJSON 日誌 + 人類可讀通知，完整可追溯 |

**Volatility Breakout Monitor**

| 功能 | 說明 |
|------|------|
| K 線指標計算 | 本地計算 Keltner Channel、EMA(220)、ADX、RSI、Volume |
| 突破信號 | 收盤突破 KC 上下軌 + 多重過濾條件確認 |
| 止損管理 | ATR × 4 止損、保本移停、追蹤止損 |
| 4 小時冷卻期 | 避免連續進場 |

---

## 專案結構

```text
okx-grid-bot-monitor/
├── scripts/
│   ├── monitor.js              # 網格 Bot 監控 + 自動重建
│   ├── vb-monitor.js           # Volatility Breakout 策略監控
│   ├── create-bot.ps1          # 建立第一個 Grid Bot
│   ├── setup-okx-profile.ps1  # 設定 OKX CLI demo/live profile
│   ├── run-monitor.vbs         # 網格 Bot 背景執行包裝器
│   ├── run-monitor.ps1         # 網格 Bot PowerShell 包裝器
│   ├── setup-scheduler.ps1     # 網格 Bot 排程註冊（每 5 分鐘）
│   ├── run-vb-monitor.vbs      # VB 背景執行包裝器
│   ├── run-vb-monitor.ps1      # VB PowerShell 包裝器
│   └── setup-vb-scheduler.ps1  # VB 排程註冊（每 30 分鐘）
├── pine/
│   └── Volatility-Breakout.pine  # TradingView 原始策略（參考用）
├── runtime/                   # 執行時狀態（不提交 git）
│   ├── latest-state.json      # 網格 Bot 最新狀態
│   ├── monitor-log.ndjson     # 網格 Bot 完整日誌
│   ├── alert-log.ndjson       # 告警日誌
│   ├── notifications.txt      # 人類可讀通知
│   ├── auto-trade-config.json # 網格自動重建設定
│   ├── auto-trade-state.json  # 網格自動重建狀態
│   ├── vb-state.json          # VB 策略持倉狀態
│   └── vb-log.ndjson          # VB 策略完整日誌
├── research/                  # 策略研究文件
├── SETUP.md                   # 前置設定教學
└── README.md                  # 本文件
```

---

## 快速開始

詳細步驟見 [SETUP.md](SETUP.md)，簡要如下：

### 1. 安裝依賴

```powershell
# Node.js >= 18
node --version

# OKX Trade CLI
npm install -g @okx_ai/okx-trade-cli

# 專案套件（chalk、technicalindicators 等）
npm install
```

### 2. 設定 OKX CLI

```powershell
Copy-Item .env.example .env
# 填入 OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE
.\scripts\setup-okx-profile.ps1
```

---

## 啟動指令

### 網格 Bot Monitor

```powershell
# 步驟 1：建立 Grid Bot（首次使用）
.\scripts\create-bot.ps1

# 步驟 2：啟動監控
node scripts/monitor.js           # 模擬盤（預設）
node scripts/monitor.js --live    # 正式盤（僅監控）
node scripts/monitor.js --dry-run # 模擬下單不執行
```

### Volatility Breakout Monitor

```powershell
# 步驟 1：初始化設定（首次使用，設定槓桿、確認餘額）
.\scripts\setup-vb.ps1

# 步驟 2：啟動監控
node scripts/vb-monitor.js

# 正式盤
node scripts/vb-monitor.js --live

# 模擬下單但不實際執行
node scripts/vb-monitor.js --dry-run
```

> 兩個腳本可以同時執行，狀態檔完全獨立不衝突。

---

## 部署到模擬盤（自動排程）

### 網格 Bot Monitor（每 5 分鐘）

```powershell
# 以管理員身份執行
.\scripts\setup-scheduler.ps1

# 移除排程
.\scripts\setup-scheduler.ps1 -Remove
```

### Volatility Breakout Monitor（每 30 分鐘）

VB 策略以 1H K 線為基礎，每 30 分鐘檢查一次已足夠。

```powershell
# 以管理員身份執行
.\scripts\setup-vb-scheduler.ps1

# 移除排程
.\scripts\setup-vb-scheduler.ps1 -Remove
```

排程建立後，任務會在背景靜默執行（無視窗彈出），結果寫入：

| 檔案 | 說明 |
|------|------|
| `runtime/vb-state.json` | 目前持倉狀態（每次覆蓋）|
| `runtime/vb-log.ndjson` | 完整執行紀錄（追加）|

**常用管理指令：**

```powershell
# 查看任務狀態
Get-ScheduledTask -TaskName 'OKX-VB-Monitor-Demo'

# 查看上次執行時間
Get-ScheduledTaskInfo -TaskName 'OKX-VB-Monitor-Demo'

# 立即觸發一次
Start-ScheduledTask -TaskName 'OKX-VB-Monitor-Demo'
```

---

## 雲端部署：OKX Agent Trade Kit（不需自己的伺服器）

將策略打包成 Skill 上傳到 OKX，由 OKX 代管執行，不需本地機器常開。

### 目前支援的 Skill

| 檔案 | 對應策略 | 狀態 |
|------|----------|------|
| [deploy/SKILL.vb-demo.md](deploy/SKILL.vb-demo.md) | **Volatility Breakout（模擬盤）**| 可上傳 |
| [deploy/SKILL.demo.md](deploy/SKILL.demo.md) | 網格 Bot（模擬盤）| 可上傳 |
| [deploy/SKILL.live.md](deploy/SKILL.live.md) | 網格 Bot（正式盤）| 模擬盤穩定後再用 |

### 上傳步驟（以 VB 策略為例）

詳細流程見 [deploy/UPLOAD.md](deploy/UPLOAD.md)，簡要如下：

1. 登入 OKX → **Trade → Agent Trade Kit**
2. 新增 Skill，貼上或上傳 [deploy/SKILL.vb-demo.md](deploy/SKILL.vb-demo.md) 內容
3. 確認 frontmatter（`name: eth-vb-monitor-demo`、`profile: demo`）正確後送出
4. 在介面啟用 Skill

### VB 策略上傳前確認清單

- [ ] `node scripts/vb-monitor.js` 本地已成功運行，terminal 輸出正常
- [ ] `runtime/vb-log.ndjson` 有日誌紀錄
- [ ] 至少手動跑過一次有信號的情境（或 dry-run 驗證邏輯正確）
- [ ] 確認 `SKILL.vb-demo.md` 內 `profile: demo`（模擬盤）

> ⚠️ OKX CLI 沒有 `skill publish` 指令，只能透過網頁介面上傳，詳見 [deploy/UPLOAD.md](deploy/UPLOAD.md)。

### 建立第一個 Grid Bot

```powershell
.\scripts\create-bot.ps1
```

### 設定 Windows 排程（每 5 分鐘自動執行）

```powershell
# 以管理員身份執行
.\scripts\setup-scheduler.ps1
```

---

## 觸發邏輯

```
每 5 分鐘檢查：
├─ 價格 > 區間上限 + 50    → 上移重建
├─ 價格 < 區間下限 - 50    → 下移重建
└─ 連續 6 次無活躍掛單     → 橫盤重建

安全閥：
├─ 冷卻期未過（1 小時）    → 不執行
├─ 當日已重建 2 次          → 不執行
└─ 新 minPx ≤ 0            → 不執行
```

---

## 設定檔

編輯 `runtime/auto-trade-config.json` 調整參數：

| 欄位 | 預設值 | 說明 |
|------|--------|------|
| `enabled` | `true` | 是否啟用自動重建 |
| `triggers.aboveBy` | `50` | 突破上限觸發閾值（USDT）|
| `triggers.belowBy` | `50` | 跌破下限觸發閾值（USDT）|
| `triggers.noLiveOrdersChecks` | `6` | 橫盤觸發次數（× 5 分鐘）|
| `newBot.gridNum` | `12` | 網格數量 |
| `newBot.lever` | `2` | 槓桿倍數 |
| `newBot.rangeHalfWidth` | `100` | 新區間半寬（USDT）|
| `cooldownMs` | `3600000` | 重建冷卻期（毫秒）|
| `maxDailyTrades` | `2` | 每日重建上限 |

---

## 日誌說明

| 檔案 | 格式 | 說明 |
|------|------|------|
| `latest-state.json` | JSON | 最新一次檢查快照（覆蓋）|
| `monitor-log.ndjson` | NDJSON | 所有檢查記錄（追加）|
| `alert-log.ndjson` | NDJSON | 僅告警記錄（追加）|
| `notifications.txt` | 文字 | 人類可讀通知（追加）|

查看最新通知：

```powershell
Get-Content runtime\notifications.txt -Tail 10 -Encoding UTF8
```

---

## 風險提示

⚠️ **本專案僅供學習研究，不構成投資建議。**

- 模擬盤（`demo`）模式下，自動交易為真實模擬交易，會產生模擬損益
- 正式盤（`live`）模式預設**關閉**自動重建，僅作監控
- 網格策略在**單邊行情**中會虧損，請確認理解策略原理後再使用
- 建議先用模擬盤跑至少 3 次完整往返驗證策略有效性

---

## 技術棧

- **Node.js** — 核心腳本
- **PowerShell** — Windows 環境整合
- **OKX Trade CLI** — 與 OKX API 互動
- **Windows Task Scheduler** — 定時觸發

---

## 作者

本專案 fork 自 [QiYongchuan/okx-grid-bot-monitor](https://github.com/QiYongchuan/okx-grid-bot-monitor)。

- **QiYongchuan** — 原作者
- **jacobhsu** — 繁體中文版、自動化腳本擴充（`.env` 設定流程、`create-bot.ps1`、`setup-okx-profile.ps1`）

---

## License

MIT License

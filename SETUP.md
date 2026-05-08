# OKX Grid Bot Monitor — 前置設定教學

> 適用於 Windows 11，完成後可執行 `node scripts/monitor.js` 並看到正確的 bot 狀態。

---

## 總覽：需要完成的步驟

| 步驟 | 項目 | 預計時間 |
|------|------|----------|
| 1 | 安裝 Node.js ≥ 18 | 5 分鐘 |
| 2 | 安裝 OKX Trade CLI | 2 分鐘 |
| 3 | 在 OKX 網站申請模擬盤 API Key | 5 分鐘 |
| 4 | 填寫 `.env` 並設定 demo profile | 2 分鐘 |
| 5 | 確認帳戶餘額 | 1 分鐘 |
| 6 | 在模擬盤建立第一個 Grid Bot | 5 分鐘 |
| 7 | 啟動監控 | 1 分鐘 |
| 8 | 設定 Windows 排程任務（可選）| 2 分鐘 |

---

## 步驟 1：安裝 Node.js ≥ 18

1. 開啟瀏覽器，前往 [https://nodejs.org](https://nodejs.org)
2. 下載 **LTS** 版本（目前為 20.x 或 22.x）
3. 執行安裝程式，全部按「Next」即可
4. 安裝完成後，開啟 PowerShell 確認版本：

```powershell
node --version
npm --version
```

看到 `v20.x.x` 以上即代表安裝成功。

---

## 步驟 2：安裝 OKX Trade CLI

開啟 PowerShell（不需要管理員），執行：

```powershell
npm install -g @okx_ai/okx-trade-cli
```

安裝完成後確認：

```powershell
okx --version
```

若顯示版本號碼（例如 `1.x.x`）即代表安裝成功。

> 若出現 `okx: command not found`，關掉 PowerShell 重新開啟再試一次。

---

## 步驟 3：在 OKX 網站申請模擬盤 API Key

### 3-1. 登入 OKX

前往 [https://www.okx.com](https://www.okx.com) 並登入帳號。
（若還沒有帳號，免費註冊即可，不需要入金）

### 3-2. 切換到模擬盤環境

1. 點擊右上角頭像 → 選「模擬交易」
2. 畫面頂部出現橘色「模擬盤」標示，確認已切換

### 3-3. 建立 API Key

1. 點擊右上角頭像 → 選「API」
2. 點擊「建立 V5 API Key」
3. 填寫：
   - **名稱**：隨意（例如 `grid-monitor`）
   - **權限**：勾選 **讀取**、**交易**（需要建立／停止 bot）
   - **IP 白名單**：可留空（方便測試）
   - **Passphrase**：自訂一組密碼（請記住，下一步要用）
4. 完成驗證（手機驗證碼或 Google 驗證器）
5. 記下以下三個值：
   - `API Key`（形如 `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`）
   - `Secret Key`（**只顯示一次，請立即複製**）
   - `Passphrase`（你剛才自訂的密碼）

> ⚠️ Secret Key 只會顯示一次，請務必立即保存！

---

## 步驟 4：填寫 `.env` 並設定 demo profile

### 4-1. 複製範本

在專案根目錄開啟 PowerShell，執行：

```powershell
Copy-Item .env.example .env
```

### 4-2. 開啟 `.env`，填入你的 API 資訊

用任意文字編輯器開啟 `.env`，將三個欄位替換為你的實際值：

```
OKX_API_KEY=貼上你的API_KEY
OKX_SECRET_KEY=貼上你的SECRET_KEY
OKX_PASSPHRASE=貼上你的PASSPHRASE
```

> ⚠️ `.env` 含有 API 密鑰，**請勿 commit 到 git**（已加入 `.gitignore`）。

### 4-3. 執行設定腳本

```powershell
.\scripts\setup-okx-profile.ps1
```

腳本會：
1. 讀取 `.env` 的三個值
2. 自動寫入 `%USERPROFILE%\.okx\config.toml`（OKX CLI 的設定檔）
3. 立即測試連線並顯示帳戶餘額

成功輸出範例：
```
設定完成！config.toml 已寫入：C:\Users\你的帳號\.okx\config.toml

正在驗證連線...

連線成功！帳戶餘額：
...USDT  100000.00...
```

---

## 步驟 5：確認帳戶餘額

若步驟 4 的腳本已顯示餘額，可跳過此步驟。

手動確認：

```powershell
okx --profile demo account balance
```

模擬盤預設有 100,000 USDT，看到數字代表設定成功。

---

## 步驟 6：在模擬盤建立第一個 Grid Bot

監控腳本需要「至少一個 running 狀態的 Grid Bot」才能運作，自動交易才有對象可管理。

### 6-1. 切換帳戶模式為「合約模式」

合約 Grid Bot 需要帳戶模式支援，否則會出現錯誤 `[51057] This bot isn't available in current account mode`。

**操作路徑（OKX Web 模擬盤）：**

1. 確認已切換到**模擬盤**（畫面頂部橘色標示）
2. 進入任意**交易介面**（例如 ETH-USDT-SWAP 合約頁面）
3. 找到畫面**右側欄**，點擊**交易設置**（齒輪或設定圖示）
4. 找到**賬戶模式設置**
5. 將模式切換為**合約模式**
6. 確認儲存

> 此設定僅影響模擬盤，不會改動正式帳戶。

---

### 6-2. 建立 Grid Bot

帳戶模式設定完成後，執行以下腳本（自動抓目前價格計算區間）：

```powershell
.\scripts\create-bot.ps1
```

腳本會讀取 `runtime/auto-trade-config.json` 的參數，自動計算 `minPx` / `maxPx`（當前價格 ± `rangeHalfWidth`）並建立 bot。

**若要調整參數**，編輯 `runtime/auto-trade-config.json`：

| 欄位 | 預設值 | 說明 |
|------|--------|------|
| `targetInstId` | `ETH-USDT-SWAP` | 交易對 |
| `newBot.gridNum` | `12` | 網格數量 |
| `newBot.lever` | `2` | 槓桿倍數 |
| `newBot.sz` | `200` | 每格下單量（USDT）|
| `newBot.direction` | `long` | 做多方向 |
| `newBot.rangeHalfWidth` | `100` | 區間半寬（當前價 ±100）|

建立後確認 bot 狀態：

```powershell
okx --profile demo bot grid orders --algoOrdType contract_grid
```

看到 `state: running` 代表 bot 已啟動。

---

## 步驟 7：啟動監控

在專案根目錄執行：

```powershell
node scripts/monitor.js
```

正常輸出範例：

```
[2026-05-01T01:22:30Z] ETH=2263.16(-0.24%) pos=long 0.3 | bot=1 running liveOrders=5 | USDT=98500 | autoTrade=idle(no trigger)
```

| 欄位 | 意義 |
|------|------|
| `bot=1 running` | 有一個 bot 在跑 |
| `liveOrders=5` | 有 5 筆掛單中 |
| `autoTrade=idle` | 自動交易待機中，尚未觸發條件 |

---

## 步驟 8（可選）：設定 Windows 排程任務

設定後每 5 分鐘自動執行監控，不需要手動跑。

以**管理員身份**開啟 PowerShell，在專案根目錄執行：

```powershell
.\scripts\setup-scheduler.ps1
```

確認任務已建立：

```powershell
Get-ScheduledTask -TaskName 'OKX-Grid-Monitor-Demo'
```

立即測試執行一次：

```powershell
Start-ScheduledTask -TaskName 'OKX-Grid-Monitor-Demo'
```

移除任務：

```powershell
.\scripts\setup-scheduler.ps1 -Remove
```

---

## 常見問題

### `okx: command not found`
關掉 PowerShell 重新開啟，或重新安裝：
```powershell
npm install -g @okx_ai/okx-trade-cli
```

### `USDT=0` 或連線失敗
- 確認 API Key 是在**模擬盤**環境（橘色標示）下建立的
- 確認 `.env` 三個欄位都已填寫，沒有多餘空格
- 重新執行 `.\scripts\setup-okx-profile.ps1`

### `NO_BOT_FOUND` 告警
按照步驟 6 建立 Grid Bot，監控腳本需要 bot 存在才能運作。

### API Key 認證失敗
- Passphrase 區分大小寫
- Secret Key 只顯示一次，確認有完整複製
- 重新執行 `.\scripts\setup-okx-profile.ps1` 覆蓋設定

---

## 完成狀態確認清單

- [ ] `node --version` 顯示 v18 以上
- [ ] `okx --version` 顯示版本號
- [ ] `.\scripts\setup-okx-profile.ps1` 顯示連線成功與 USDT 餘額
- [ ] `okx --profile demo bot grid orders --algoOrdType contract_grid` 顯示 running bot
- [ ] `node scripts/monitor.js` 輸出 `bot=1 running`

# 部署教學：透過 Claude Code 執行策略

> OKX Agent Trade Kit 是 MCP 工具 + CLI，**沒有網頁上傳介面**。
> 策略是透過 Claude Code Skill 呼叫，由 Claude 執行 OKX CLI 指令。

---

## 架構說明

```
Claude Code
  └─ /eth-vb-monitor-demo      ← 呼叫 Skill
       └─ SKILL.md              ← Claude 讀取策略步驟
            └─ okx CLI 指令     ← Claude 逐步執行
```

Skill 檔案存放在 `~/.claude/skills/<skill-name>/SKILL.md`，
專案內的 `deploy/SKILL.*.md` 是**原始碼**，修改後需同步到上方路徑。

---

## 可用 Skills

| Skill 名稱 | 呼叫指令 | 對應策略 |
|-----------|---------|---------|
| `eth-vb-monitor-demo` | `/eth-vb-monitor-demo` | Volatility Breakout（模擬盤）|
| `eth-grid-monitor-demo` | `/eth-grid-monitor-demo` | 網格 Bot（模擬盤）|

---

## 執行方式

### 單次執行（手動觸發）

在 Claude Code 對話框輸入：

```
/eth-vb-monitor-demo
```

Claude 會依照 Skill 內的步驟，執行 OKX CLI 指令，輸出本次狀態。

### 定時執行（自動排程）

使用 `/loop` 讓 Claude 定時重複執行：

```
/loop 30m /eth-vb-monitor-demo
```

> 每 30 分鐘自動執行一次 VB 策略檢查。
> 網格 Bot 用 5 分鐘：`/loop 5m /eth-grid-monitor-demo`

---

## 首次使用前提

1. 已安裝 OKX CLI 並完成授權：
   ```powershell
   npm install -g @okx_ai/okx-trade-cli
   .\scripts\setup-okx-profile.ps1
   ```

2. 確認 demo profile 可用：
   ```powershell
   okx --profile demo market ticker ETH-USDT-SWAP
   ```

3. Skill 已在 `~/.claude/skills/` 內（本專案已自動安裝）

---

## Skill 更新方式

修改 `deploy/SKILL.vb-demo.md` 後，同步到 Skill 路徑：

```powershell
Copy-Item deploy\SKILL.vb-demo.md `
  "$env:USERPROFILE\.claude\skills\eth-vb-monitor-demo\SKILL.md" -Force

Copy-Item deploy\SKILL.demo.md `
  "$env:USERPROFILE\.claude\skills\eth-grid-monitor-demo\SKILL.md" -Force
```

---

## 注意事項

- Skill 執行時 Claude 會消耗 API token，定時執行會持續計費
- `/loop` 需要 Claude Code 視窗保持開啟，關閉後排程停止
- 要完全不依賴本機開著，請改用 [VPS + cron 方案](../README.md#雲端部署okx-agent-trade-kit不需自己的伺服器)
- 模擬盤與正式盤 Skill 完全分開，`profile: demo` 不會影響真實帳戶

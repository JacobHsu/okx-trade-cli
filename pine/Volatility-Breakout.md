# 波動率突破策略（Volatility Breakout System）

> 官方網址：[Volatility Breakout System - Fixed Risk](https://cn.tradingview.com/script/36zwwSMa-Volatility-Breakout-System-Fixed-Risk/)
>
> 腳本版本：Pine Script v5  
> 策略名稱：`Volume Breakout Strategy [Tables Fixed]`

---

## 策略概述

本策略是一套以「**波動率突破**」為核心的量化交易系統，結合了 Keltner 通道突破訊號、多重過濾條件（趨勢、成交量、ADX、RSI）以及動態風控機制（停損、保本、移動止盈）。

適合用於加密貨幣、外匯等高波動市場，支援自動化 Webhook/Bot 下單，並內建多時間框架趨勢儀表板。

---

## 策略架構總覽

```
輸入參數
├── Webhook / Bot 訊息設定
├── 資金管理（Money Management）
├── 策略邏輯（Strategy Logic）
└── 風險管理（Risk Management）

核心計算
├── 趨勢 EMA（200 均線）
├── Keltner 通道（突破訊號）
├── 過濾條件（成交量、ADX、RSI）
└── 部位規模計算

進出場執行
├── 進場：突破 + 多重過濾
├── 出場：動態停損 / 保本 / 移動止盈
└── 冷卻期（4 小時）

視覺呈現
├── 趨勢 EMA 線
├── Keltner 通道帶
├── 右下角：RSI / DI+ / DI- / ADX 儀表板
└── 左下角：多時間框架趨勢儀表板（1M ~ Monthly）
```

---

## 一、參數設定詳解

### 1.1 Webhook / Bot 訊息（Webhook / Bot Messages）

| 參數 | 預設值 | 說明 |
|------|--------|------|
| Long Entry JSON | `{"action": "open_long", "ticker": "ETHUSD"}` | 多單進場時發送的 Webhook JSON |
| Long Exit JSON | `{"action": "close_long", "ticker": "ETHUSD"}` | 多單出場時發送的 Webhook JSON |
| Short Entry JSON | `{"action": "open_short", "ticker": "ETHUSD"}` | 空單進場時發送的 Webhook JSON |
| Short Exit JSON | `{"action": "close_short", "ticker": "ETHUSD"}` | 空單出場時發送的 Webhook JSON |

這些 JSON 訊息可透過 TradingView 警報的 Webhook 功能，自動傳送給交易機器人（如 3Commas、Alertatron 等）執行實際下單。

---

### 1.2 資金管理（Money Management）

| 參數 | 預設值 | 說明 |
|------|--------|------|
| Use Compounding? | `true` | 是否使用複利模式（每次用帳戶淨值的固定百分比下單） |
| Equity % per Trade | `50%` | 複利模式下，每筆交易使用的帳戶淨值比例 |
| Fixed Margin (if Compounding OFF) | `500` | 非複利模式下，每筆交易固定使用的保證金金額（美元） |
| Leverage (x) | `2` | 槓桿倍數（最小 1x，最大 50x） |

**部位規模計算公式：**

```
保證金 = 複利模式 ? (帳戶淨值 × Equity%) : Fixed Margin
下單數量 = (保證金 × 槓桿) / 當前收盤價
```

**範例：** 帳戶淨值 $2,000、複利模式、50%、2x 槓桿、BTC 價格 $50,000
```
保證金 = 2,000 × 50% = $1,000
下單數量 = (1,000 × 2) / 50,000 = 0.04 BTC
```

---

### 1.3 策略邏輯（Strategy Logic）

| 參數 | 預設值 | 說明 |
|------|--------|------|
| Keltner Length | `22` | Keltner 通道 EMA 基礎週期 |
| Keltner Multiplier | `2.0` | Keltner 通道寬度倍數（ATR × 倍數） |
| Trade with 200 EMA Trend Only | `true` | 是否只順 EMA 趨勢方向交易 |
| Trend EMA Length | `220` | 趨勢 EMA 週期（預設 220，約等效 200 EMA） |
| Use ADX Filter | `true` | 是否啟用 ADX 趨勢強度過濾 |
| Min ADX Value | `20` | ADX 最小值（低於此值視為盤整，不進場） |
| Require Volume Spike | `true` | 是否要求成交量放大才能進場 |
| Volume Average Length | `18` | 計算平均成交量的週期 |
| RSI Length | `14` | RSI 計算週期 |

---

### 1.4 風險管理（Risk Management）

| 參數 | 預設值 | 說明 |
|------|--------|------|
| ATR Length | `14` | ATR 計算週期（用於動態停損） |
| Stop Loss (ATR Multiplier) | `4.0` | 停損距離 = ATR × 此倍數 |
| Breakeven Trigger (%) | `1.5%` | 價格達進場價 +1.5% 時，停損移至保本（進場價） |
| Use Trailing Stop | `true` | 是否啟用移動止盈 |
| Start Trailing after % Gain | `3.0%` | 獲利達 3% 後開始啟動移動止盈 |
| Trailing Offset % | `1.0%` | 移動止盈的追蹤偏移距離（1%） |

---

## 二、核心計算邏輯

### 2.1 趨勢 EMA

```pine
trend_ema = ta.ema(close, ema_len)  // 預設 EMA(220)
```

- 收盤價 > EMA → 上升趨勢（允許做多）
- 收盤價 < EMA → 下降趨勢（允許做空）

---

### 2.2 Keltner 通道（突破訊號來源）

```pine
kc_basis = ta.ema(close, kc_len)      // 中線：EMA(22)
kc_range = ta.atr(10) * kc_mult       // 通道寬度：ATR(10) × 2.0
kc_upper = kc_basis + kc_range        // 上軌
kc_lower = kc_basis - kc_range        // 下軌
```

Keltner 通道是以 EMA 為中心、ATR 為寬度的波動率通道。價格突破上軌代表上漲動能強勁，突破下軌代表下跌動能強勁。

---

### 2.3 多重過濾條件

#### 成交量過濾
```pine
vol_avg  = ta.sma(volume, vol_len)    // 成交量 SMA(18)
vol_cond = use_vol_filter ? (volume > vol_avg) : true
```
要求當前成交量大於 18 根 K 線的平均成交量，確保突破有足夠的市場參與度。

#### ADX 過濾
```pine
[di_plus, di_minus, adx] = ta.dmi(14, 14)
adx_cond = use_adx ? (adx > adx_thresh) : true  // 預設 ADX > 20
```
ADX 衡量趨勢強度，過濾震盪盤整行情（ADX < 20 通常表示無明顯趨勢）。

#### RSI 過濾
```pine
rsi = ta.rsi(close, rsi_len)  // RSI(14)
// 做多需 RSI > 50，做空需 RSI < 50
```
確保動能方向與進場方向一致。

---

### 2.4 進場條件

```pine
// 做多：收盤突破 Keltner 上軌 + 成交量放大 + 上升趨勢 + RSI > 50 + ADX 強趨勢
long_condition  = ta.crossover(close, kc_upper)
                  and vol_cond
                  and is_uptrend      // close > EMA(220)
                  and rsi > 50
                  and adx_cond        // ADX > 20

// 做空：收盤跌破 Keltner 下軌 + 成交量放大 + 下降趨勢 + RSI < 50 + ADX 強趨勢
short_condition = ta.crossunder(close, kc_lower)
                  and vol_cond
                  and is_downtrend    // close < EMA(220)
                  and rsi < 50
                  and adx_cond
```

**5 個條件必須同時成立才會進場：**

| # | 條件 | 多單 | 空單 |
|---|------|------|------|
| 1 | Keltner 通道突破 | 突破上軌 | 跌破下軌 |
| 2 | 成交量放大 | ✓ | ✓ |
| 3 | EMA 趨勢方向 | 價格 > EMA | 價格 < EMA |
| 4 | RSI 動能 | RSI > 50 | RSI < 50 |
| 5 | ADX 趨勢強度 | ADX > 20 | ADX > 20 |

---

### 2.5 冷卻期機制

```pine
var int last_trade_time = 0
is_cooldown_over = (time - last_trade_time) > (4 * 60 * 60 * 1000)
```

每次進場後設置 **4 小時冷卻期**，防止在短時間內連續進場，避免過度交易。

---

## 三、出場邏輯

### 3.1 動態停損（ATR-Based Stop Loss）

```pine
// 多單停損：進場價 - (ATR × 4.0)
long_sl  = entry_p - (atr * sl_multiplier)

// 空單停損：進場價 + (ATR × 4.0)
short_sl = entry_p + (atr * sl_multiplier)
```

使用 ATR（真實波動幅度均值）計算停損距離，可自動適應市場波動狀況。

### 3.2 保本機制（Breakeven）

```pine
// 多單：獲利達 1.5% 時，停損上移至進場價
if strategy.position_size > 0 and high > entry_p * (1 + 1.5/100)
    long_sl := entry_p

// 空單：獲利達 1.5% 時，停損下移至進場價
if strategy.position_size < 0 and low < entry_p * (1 - 1.5/100)
    short_sl := entry_p
```

當持倉達到一定獲利後，將停損移至成本價，確保此筆交易不虧損。

### 3.3 移動止盈（Trailing Stop）

```pine
// 多單：獲利達 3% 後啟動，追蹤偏移 1%
strategy.exit("Exit Long", "Long",
    stop=long_sl,
    trail_price=use_trail ? entry_p * (1 + 3.0/100) : na,
    trail_offset=use_trail ? entry_p * (1.0/100) : na)
```

**出場順序優先級：**
1. 首先使用 ATR 停損保護下行風險
2. 獲利 1.5% 後移至保本（停損 = 成本價）
3. 獲利 3% 後啟動移動止盈，追蹤偏移 1%

---

## 四、視覺呈現

### 4.1 圖表疊加層

| 元素 | 顏色 | 說明 |
|------|------|------|
| 趨勢 EMA 線 | 白色 | EMA(220) 趨勢參考線 |
| Keltner 上軌 | 綠色（60% 透明） | 突破上軌 = 做多訊號 |
| Keltner 下軌 | 紅色（60% 透明） | 跌破下軌 = 做空訊號 |
| 通道填充 | 藍色（95% 透明） | Keltner 通道視覺區域 |

### 4.2 右下角指標儀表板

顯示當前 K 線的 4 個關鍵指標值：

| 欄位 | 顏色 | 含義 |
|------|------|------|
| RSI | 青色 | RSI(14) 當前值 |
| DI+ | 綠色 | 方向性指標（正向） |
| DI- | 紅色 | 方向性指標（負向） |
| ADX | 深綠 | 趨勢強度值 |

### 4.3 左下角多時間框架趨勢儀表板

顯示從 1 分鐘到月線共 12 個時間框架的趨勢狀態：

| 顏色 | 含義 |
|------|------|
| 綠點（●） | 該時間框架收盤價 > EMA → 上升趨勢 |
| 紅點（●） | 該時間框架收盤價 < EMA → 下降趨勢 |
| 灰點（●） | EMA 資料不足（歷史資料不夠長） |

時間框架涵蓋：1M、3M、5M、15M、30M、1H、2H、4H、8H、日線、週線、月線

---

## 五、策略初始設定

| 設定項目 | 數值 |
|---------|------|
| 初始資金 | $1,000 USD |
| 每筆預設金額 | $1,000 |
| 下單類型 | 固定金額（strategy.cash） |
| 手續費 | 0.1%（每筆） |
| 滑點 | 5 ticks |
| 計價幣 | USD |

---

## 六、適用場景與建議

### 適合的市場
- 加密貨幣（BTC、ETH 等高波動資產）
- 外匯主要貨幣對
- 波動率較高的股票期貨

### 建議時間框架
- **15 分鐘 ~ 4 小時**：最佳平衡訊號品質與交易頻率
- 時間框架越短，訊號越多但假突破也越多

### 參數調整建議

| 場景 | 建議調整 |
|------|---------|
| 盤整市場 | 提高 ADX 門檻（如 25~30），減少假突破 |
| 高波動市場 | 增大 ATR 倍數（如 5.0~6.0），給予更大停損空間 |
| 保守交易 | 降低 Equity%（如 20~30%），控制單筆風險 |
| 激進交易 | 提高槓桿（如 3x~5x），但需注意清算風險 |

### 風險提示
- 本策略使用槓桿，虧損可能超過保證金
- 請在回測驗證後，先用小額資金進行實盤測試
- 加密貨幣市場 7×24 小時運行，需確保 Webhook 機器人穩定運作

---

## 七、Webhook 自動化下單設置

1. 在 TradingView 建立警報，選擇此策略
2. 勾選「Order fills only」
3. 在 Webhook URL 填入你的機器人接收網址
4. 訊息欄位會自動使用策略內設定的 JSON 格式

**JSON 格式可根據交易所 API 要求自行修改，例如：**
```json
{
  "action": "open_long",
  "ticker": "BTCUSDT",
  "amount": "{{strategy.order.contracts}}",
  "price": "{{strategy.order.price}}"
}
```

---

## 相關資源

- [TradingView Pine Script v5 文檔](https://www.tradingview.com/pine-script-docs/en/v5/Introduction.html)
- [Keltner 通道說明](https://www.investopedia.com/terms/k/keltnerchannel.asp)
- [ADX 指標說明](https://www.investopedia.com/terms/a/adx.asp)
- 官方腳本頁面：https://cn.tradingview.com/script/36zwwSMa-Volatility-Breakout-System-Fixed-Risk/

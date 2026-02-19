# 📡 Daily Telegram Report Worker

A Cloudflare Worker that sends a compact daily Telegram report including:

- 🌤 Weather (Open-Meteo)
- 🥇 Gold (XAU/USD)
- 🥈 Silver (XAG/USD)
- ₿ Bitcoin
- Ξ Ethereum
- ⚽ Favorite Matches (ESPN API)

Deployed on Cloudflare Workers with automatic daily cron trigger.

---

## 🚀 Features

- ☁️ Cloudflare Workers deployment
- ⏰ Daily cron trigger
- 💬 Telegram Bot integration
- ♻️ 10-minute API caching
- 🔁 Telegram 429 auto-retry handling
- 🛡 CoinGecko rate-limit fallback
- 🧪 Dry run mode (`/run?dry=1`)
- 📱 Compact Telegram-friendly formatting

---

## 🛠 Tech Stack

- JavaScript (ES Modules)
- Cloudflare Workers
- Telegram Bot API
- Open-Meteo API
- Stooq API (metals)
- CoinGecko API (crypto)
- ESPN API (matches)

---

## ⚙️ Setup

### 1️⃣ Install dependencies

```bash
npm install

2️⃣ Configure secrets

wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID

Optional location override:
wrangler secret put LAT
wrangler secret put LON

🚀 Deploy
wrangler deploy

🧪 Manual Test

Dry run (does NOT send Telegram message):
https://your-worker-url/run?dry=1

Normal run (sends Telegram message):
https://your-worker-url/run

⏰ Cron Schedule
Runs automatically every day at 08:00 (Turkey time via Cloudflare cron trigger).

📌 Notes

External API calls are cached for 10 minutes.

Telegram 429 errors are retried automatically using retry_after.

If CoinGecko rate limit is exceeded, crypto section falls back gracefully.

Match scores are shown only when match is live or finished.


📸 Example Output

📌 19.02.2026 Thursday 08:00

🌤 4.7°/10.8° ☔ 63%
🥇 4964.07 (-0.27%) | 🥈 76.79 (-0.52%)
₿ 66557 (-0.78%) | Ξ 1959.8 (-0.63%)

⚽ Favorites:
• Fenerbahce vs Nottingham Forest | 20:45 | Scheduled






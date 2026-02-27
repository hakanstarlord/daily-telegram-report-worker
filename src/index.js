const TZ = "Europe/Istanbul";
const CITY = "Istanbul";
const LAT = 41.0082;
const LON = 28.9784;

const FAVORITE_TEAMS = [
  "Galatasaray",
  "Fenerbahce",
  "Besiktas",
  "Trabzonspor",
  "Real Madrid",
  "Barcelona",
  "Manchester City",
  "Liverpool",
  "Bayern Munich",
  "PSG",
  "Juventus",
  "Inter",
  "Milan",
  "Arsenal",
  "Chelsea",
];

// DEBUG bölümünü mesaja eklemek istersen true yap
const INCLUDE_DEBUG_SOURCES = false;

// Cron aynı gün 1 kere göndersin mi?
const ENABLE_DAILY_DEDUPE = true;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJSON(url, init = {}) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${url} | body: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function fetchText(url, init = {}) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${url} | body: ${body.slice(0, 200)}`);
  }
  return res.text();
}

function formatDate() {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: TZ,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function yyyymmddInTZ(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const d = parts.find((p) => p.type === "day").value;
  return `${y}${m}${d}`;
}

function norm(s) {
  return (s || "")
    .toLowerCase()
    .replaceAll("ı", "i")
    .replaceAll("ş", "s")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fmtPct(x) {
  if (x === null || x === undefined || Number.isNaN(Number(x))) return "N/A";
  const n = Number(x);
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

async function safe(label, fn, fallback, debug) {
  try {
    const v = await fn();
    debug[label] = "fresh";
    return v;
  } catch (e) {
    debug[label] = `ERR: ${e?.message || String(e)}`;
    return fallback;
  }
}

async function getWeatherRaw() {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=${TZ}`;

  const data = await fetchJSON(url);
  const min = data.daily.temperature_2m_min[0];
  const max = data.daily.temperature_2m_max[0];
  const rain = data.daily.precipitation_probability_max[0];

  return `🌤 ${min.toFixed(1)}°/${max.toFixed(1)}° 🌧${rain}%`;
}

async function getCryptoRaw() {
  const apiUrl =
    "https://api.coingecko.com/api/v3/simple/price" +
    "?ids=bitcoin,ethereum" +
    "&vs_currencies=usd" +
    "&include_24hr_change=true";

  const cacheKey = new Request("https://cache.local/coingecko?btceth=1");
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    const data = await cached.json();
    const btc = data.bitcoin.usd;
    const eth = data.ethereum.usd;
    const btcCh = data.bitcoin.usd_24h_change;
    const ethCh = data.ethereum.usd_24h_change;
    return `₿ BTC: $${btc} (${fmtPct(btcCh)}) | Ξ ETH: $${eth} (${fmtPct(ethCh)})`;
  }

  const res = await fetch(apiUrl, {
    headers: {
      "User-Agent": "newsdailyreport/1.0 (Cloudflare Worker)",
      Accept: "application/json",
    },
  });

  if (res.status === 429) throw new Error("CoinGecko 429 (rate limit)");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${apiUrl} | body: ${body.slice(0, 200)}`);
  }

  const data = await res.json();

  await caches.default.put(
    cacheKey,
    new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=600" },
    })
  );

  const btc = data.bitcoin.usd;
  const eth = data.ethereum.usd;
  const btcCh = data.bitcoin.usd_24h_change;
  const ethCh = data.ethereum.usd_24h_change;

  return `₿ BTC: $${btc} (${fmtPct(btcCh)}) | Ξ ETH: $${eth} (${fmtPct(ethCh)})`;
}

async function getMetalsRaw(debug) {
  const cacheKey = new Request("https://cache.local/stooq?metals=xau_xag_v3");
  const cached = await caches.default.match(cacheKey);

  async function getLastTwoCloses(symbol) {
    const url = `https://stooq.com/q/d/l/?s=${symbol}&i=d`;

    const csv = await fetchText(url, {
      headers: {
        "User-Agent": "newsdailyreport/1.0 (Cloudflare Worker)",
        Accept: "text/csv",
      },
    });

    const lines = csv.trim().split("\n");
    if (lines.length < 4) throw new Error(`Not enough rows for ${symbol}`);

    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const closeIdx = header.indexOf("close");
    if (closeIdx === -1) throw new Error(`Close column not found for ${symbol}`);

    const last = lines[lines.length - 1].split(",").map((v) => v.trim());
    const prev = lines[lines.length - 2].split(",").map((v) => v.trim());

    const lastClose = Number(last[closeIdx]);
    const prevClose = Number(prev[closeIdx]);

    if (!Number.isFinite(lastClose) || !Number.isFinite(prevClose)) {
      throw new Error(`Bad close values for ${symbol}`);
    }

    const pct = ((lastClose - prevClose) / prevClose) * 100;
    return { lastClose, pct };
  }

  try {
    const [xau, xag] = await Promise.all([getLastTwoCloses("xauusd"), getLastTwoCloses("xagusd")]);

    const text =
      `🥇 ${xau.lastClose.toFixed(2)} ${fmtPct(xau.pct)}  ` +
      `🥈 ${xag.lastClose.toFixed(2)} ${fmtPct(xag.pct)}`;

    await caches.default.put(
      cacheKey,
      new Response(text, { headers: { "Cache-Control": "public, max-age=21600" } }) // 6 saat
    );

    return text;
  } catch (e) {
    if (cached) {
      debug.stooq_metals = "cache_fallback";
      return await cached.text();
    }
    throw e;
  }
}

async function getFavoriteMatchesRaw() {
  const dateStr = yyyymmddInTZ();
  const leagues = [
    "tur.1",
    "eng.1",
    "esp.1",
    "ita.1",
    "ger.1",
    "fra.1",
    "uefa.champions",
    "uefa.europa",
    "uefa.europa.conf",
  ];

  const favSet = new Set(FAVORITE_TEAMS.map(norm));
  const cacheKey = new Request(`https://cache.local/espn/favs?d=${dateStr}`);
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached.text();

  async function fetchLeague(league) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${dateStr}`;
    const data = await fetchJSON(url, {
      headers: {
        "User-Agent": "newsdailyreport/1.0 (Cloudflare Worker)",
        Accept: "application/json",
      },
    });
    return data?.events || [];
  }

  const allEvents = (await Promise.all(leagues.map(fetchLeague))).flat();

  const matches = [];
  for (const ev of allEvents) {
    const comp = ev?.competitions?.[0];
    const comps = comp?.competitors || [];
    if (comps.length < 2) continue;

    const home = comps.find((c) => c.homeAway === "home") || comps[0];
    const away = comps.find((c) => c.homeAway === "away") || comps[1];

    const homeName = home?.team?.displayName || "";
    const awayName = away?.team?.displayName || "";

    const isFav = favSet.has(norm(homeName)) || favSet.has(norm(awayName));
    if (!isFav) continue;

    const startISO = ev?.date;
    const startText = startISO
      ? new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(
          new Date(startISO)
        )
      : "";

    const st = ev?.status?.type;
    const status = st?.shortDetail || st?.description || "";
    const state = st?.state;
    const completed = st?.completed === true;

    const scoreHome = home?.score;
    const scoreAway = away?.score;

    const showScore = state === "in" || state === "post" || completed === true;

    const parts = [];
    if (startText) parts.push(startText);
    if (showScore && scoreHome != null && scoreAway != null) parts.push(`${scoreHome}-${scoreAway}`);
    if (status) parts.push(status);

    matches.push({
      startISO: startISO || "",
      line: `• ${homeName} vs ${awayName}` + (parts.length ? ` | ${parts.join(" | ")}` : ""),
    });
  }

  matches.sort((a, b) => (a.startISO || "").localeCompare(b.startISO || ""));

  const top = matches.slice(0, 6).map((m) => m.line);
  const text = top.length ? `⚽ Maçlar:\n${top.join("\n")}` : `⚽ Bugün favori maç yok`;

  await caches.default.put(cacheKey, new Response(text, { headers: { "Cache-Control": "public, max-age=900" } }));

  return text;
}

// 429 bekleme süresini olabildiğince doğru yakala:
// - JSON: parameters.retry_after
// - Header: Retry-After
// - Body regex (JSON parse edilemezse)
function extractRetryAfterSeconds({ status, headers, bodyText, json }) {
  if (status !== 429) return null;

  const j = json || {};
  const ra1 = Number(j?.parameters?.retry_after);
  if (Number.isFinite(ra1) && ra1 > 0) return ra1;

  const h = headers?.get?.("Retry-After") || headers?.get?.("retry-after");
  const ra2 = Number(h);
  if (Number.isFinite(ra2) && ra2 > 0) return ra2;

  const m = (bodyText || "").match(/retry_after"\s*:\s*(\d+)/i);
  if (m) {
    const ra3 = Number(m[1]);
    if (Number.isFinite(ra3) && ra3 > 0) return ra3;
  }

  return 5; // en kötü varsayım
}

async function sendTelegram(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID");
  }

  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: env.TELEGRAM_CHAT_ID,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  // Flood control’u büyütmemek için toplam beklemeyi sınırlayalım
  let totalWaitMs = 0;
  const MAX_TOTAL_WAIT_MS = 45_000;

  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const bodyText = await res.text().catch(() => "");
    const data = (() => {
      try {
        return bodyText ? JSON.parse(bodyText) : {};
      } catch {
        return {};
      }
    })();

    if (res.ok && data.ok !== false) return;

    if (res.status === 429) {
      const retryAfter = extractRetryAfterSeconds({
        status: res.status,
        headers: res.headers,
        bodyText,
        json: data,
      });

      // Telegram’ın söylediği süre + küçük tampon
      const waitMs = (retryAfter + 1) * 1000;

      totalWaitMs += waitMs;
      if (totalWaitMs > MAX_TOTAL_WAIT_MS) {
        throw new Error(`Telegram 429: retry_after=${retryAfter}s (giving up)`);
      }

      await sleep(waitMs);
      continue;
    }

    throw new Error(`Telegram error: ${res.status} | body: ${bodyText.slice(0, 300)}`);
  }

  throw new Error("Telegram 429 (retry failed)");
}

async function buildMessageSafe() {
  const debug = {};
  const date = formatDate();

  const [weather, metals, crypto, matches] = await Promise.all([
    safe("open_meteo_weather", () => getWeatherRaw(), "🌤 Hava: N/A", debug),
    safe("stooq_metals", () => getMetalsRaw(debug), "🥇 N/A  🥈 N/A", debug),
    safe("coingecko_crypto", () => getCryptoRaw(), "₿ BTC/ETH: N/A", debug),
    safe("espn_matches", () => getFavoriteMatchesRaw(), "⚽ Bugün favori maç yok", debug),
  ]);

  const lines = [
    `📌 ${date}`,
    "",
    typeof weather === "string" ? weather : "🌤 Hava: N/A",
    typeof metals === "string" ? metals : "🥇 N/A  🥈 N/A",
    typeof crypto === "string" ? crypto : "₿ BTC/ETH: N/A",
    "",
    typeof matches === "string" ? matches : "⚽ Bugün favori maç yok",
  ];

  if (INCLUDE_DEBUG_SOURCES) {
    lines.push(
      "",
      "---",
      "DEBUG: sources",
      ...Object.entries(debug).map(([k, v]) =>
        v === "fresh" || v === "cache_fallback" ? `- ✅ ${k}: ${v}` : `- ❌ ${k}: ${v}`
      )
    );
  }

  return lines.join("\n");
}

// Aynı anda 2 cron instance koşarsa biri skip etsin (2 dk lock)
async function acquireCronLock() {
  const key = new Request("https://cache.local/lock/cron");
  const locked = await caches.default.match(key);
  if (locked) return false;

  await caches.default.put(key, new Response("1", { headers: { "Cache-Control": "public, max-age=120" } }));
  return true;
}

// Aynı gün 1 kere gönder (23 saat TTL yeterli)
async function isAlreadySentToday() {
  const today = yyyymmddInTZ();
  const key = new Request(`https://cache.local/sent/${today}`);
  const hit = await caches.default.match(key);
  return Boolean(hit);
}
async function markSentToday() {
  const today = yyyymmddInTZ();
  const key = new Request(`https://cache.local/sent/${today}`);
  await caches.default.put(key, new Response("1", { headers: { "Cache-Control": "public, max-age=82800" } }));
}

// --- Pending (cron fail olursa retry) ---
const pendingKey = () => new Request(`https://cache.local/pending/${yyyymmddInTZ()}`);

async function savePendingMessage(text) {
  // 2 gün dursun (cronlar kaçarsa da kurtarır)
  await caches.default.put(
    pendingKey(),
    new Response(text, {
      headers: { "Cache-Control": "public, max-age=172800" },
    })
  );
}

async function loadPendingMessage() {
  const res = await caches.default.match(pendingKey());
  if (!res) return null;
  return res.text();
}

async function clearPendingMessage() {
  await caches.default.delete(pendingKey());
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        try {
          const gotLock = await acquireCronLock();
          if (!gotLock) {
            console.log("cron: locked (another instance running) -> skip");
            return;
          }

          // Önce pending varsa onu dene (retry cron’larda asıl iş bu)
          const pending = await loadPendingMessage();
          if (pending) {
            console.log("cron: pending message found -> retry sending");
            await sendTelegram(env, pending);
            await clearPendingMessage();
            if (ENABLE_DAILY_DEDUPE) await markSentToday();
            return;
          }

          if (ENABLE_DAILY_DEDUPE) {
            const sent = await isAlreadySentToday();
            if (sent) {
              console.log("cron: already sent today -> skip");
              return;
            }
          }

          const message = await buildMessageSafe();

          try {
            await sendTelegram(env, message);
            if (ENABLE_DAILY_DEDUPE) await markSentToday();
          } catch (e) {
            // Gönderim fail olursa mesaj kaybolmasın: pending’e kaydet
            await savePendingMessage(message);
            throw e;
          }
        } catch (e) {
          // Telegram 429 iken fallback mesajı atmak limiti büyütür => sadece log
          console.error("cron error:", e?.message || String(e));
        }
      })()
    );
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/favicon.ico") return new Response(null, { status: 204 });
    if (url.pathname === "/") return new Response("OK. Use /run to send manually. /run?dry=1 to preview.", { status: 200 });

    if (url.pathname === "/run") {
      // dry=1: sadece preview
      const message = await buildMessageSafe();
      if (url.searchParams.get("dry") === "1") {
        return new Response(message, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }

      // manuel spamı engelle (60s)
      const lockKey = new Request("https://cache.local/lock/run");
      const locked = await caches.default.match(lockKey);
      if (locked) return new Response("Rate limited: try again in ~60s", { status: 429 });

      await caches.default.put(lockKey, new Response("1", { headers: { "Cache-Control": "public, max-age=60" } }));

      try {
        // Manual’da da önce pending varsa onu kurtarmayı dene
        const pending = await loadPendingMessage();
        if (pending) {
          await sendTelegram(env, pending);
          await clearPendingMessage();
          if (ENABLE_DAILY_DEDUPE) await markSentToday();
          return new Response("Manual run OK (sent pending)", { status: 200 });
        }

        await sendTelegram(env, message);
        if (ENABLE_DAILY_DEDUPE) await markSentToday();
        return new Response("Manual run OK", { status: 200 });
      } catch (e) {
        // Manual’da da: fail olursa pending’e kaydet (mesaj kaybolmasın)
        try {
          await savePendingMessage(message);
        } catch {}
        return new Response(`Manual run failed: ${e?.message || String(e)}`, { status: 500 });
      }
    }

    return new Response("Not found", { status: 404 });
  },
};
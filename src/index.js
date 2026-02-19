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



async function getWeather() {
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

function fmtPct(x) {
  if (x === null || x === undefined || Number.isNaN(Number(x))) return "N/A";
  const n = Number(x);
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}



async function getCrypto() {
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

    return `₿${btc} (${fmtPct(btcCh)}) Ξ${eth} (${fmtPct(ethCh)})`;

  }

  const res = await fetch(apiUrl, {
    headers: {
      "User-Agent": "newsdailyreport/1.0 (Cloudflare Worker)",
      "Accept": "application/json",
    },
  });

  if (res.status === 429) {
    return `₿ BTC/ETH: (CoinGecko limit aşıldı)`;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${apiUrl} | body: ${body.slice(0, 200)}`);
  }

  const data = await res.json();

  await caches.default.put(
    cacheKey,
    new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=600",
      },
    })
  );

  const btc = data.bitcoin.usd;
  const eth = data.ethereum.usd;
  const btcCh = data.bitcoin.usd_24h_change;
  const ethCh = data.ethereum.usd_24h_change;

  return `₿ BTC: $${btc} (${fmtPct(btcCh)}) | Ξ ETH: $${eth} (${fmtPct(ethCh)})`;
}


async function getMetals() {
  const cacheKey = new Request("https://cache.local/stooq?metals=xau_xag_v2");
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached.text();

  async function getLastTwoCloses(symbol) {
    // Günlük tarihsel veri (CSV): Date,Open,High,Low,Close,Volume
    const url = `https://stooq.com/q/d/l/?s=${symbol}&i=d`;

    const csv = await fetchText(url, {
      headers: {
        "User-Agent": "newsdailyreport/1.0 (Cloudflare Worker)",
        "Accept": "text/csv",
      },
    });

    const lines = csv.trim().split("\n");
    if (lines.length < 4) throw new Error(`Not enough rows for ${symbol}`);

    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const closeIdx = header.indexOf("close");
    if (closeIdx === -1) throw new Error(`Close column not found for ${symbol}`);

    // Son 2 satır (en alttakiler en yeni)
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

  const [xau, xag] = await Promise.all([
    getLastTwoCloses("xauusd"),
    getLastTwoCloses("xagusd"),
  ]);

  const text =
  	`🥇 ${xau.lastClose.toFixed(2)} ${fmtPct(xau.pct)}  ` +
  	`🥈 ${xag.lastClose.toFixed(2)} ${fmtPct(xag.pct)}`;


  await caches.default.put(
    cacheKey,
    new Response(text, { headers: { "Cache-Control": "public, max-age=600" } })
  );

  return text;
}

async function getFavoriteMatches() {
  const dateStr = yyyymmddInTZ();

  // Takım ağırlıklı: TR + top ligler + UCL/UEL
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
        "Accept": "application/json",
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

    const isFav =
      favSet.has(norm(homeName)) ||
      favSet.has(norm(awayName));

    if (!isFav) continue;

    const startISO = ev?.date; // ISO
    const startText = startISO
      ? new Intl.DateTimeFormat("tr-TR", {
          timeZone: TZ,
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(startISO))
      : "";

    const status = ev?.status?.type?.shortDetail || ev?.status?.type?.description || "";
    const scoreHome = home?.score;
    const scoreAway = away?.score;

    // skor varsa göster, yoksa sadece saat
    // state bilgisini al (pre / in / post)

// status objesini al
const st = ev?.status?.type;
const state = st?.state;
const completed = st?.completed === true;

// sadece canlı veya bitmiş maçta skor göster
const showScore =
  state === "in" ||
  state === "post" ||
  completed === true;

let parts = [];

// saat varsa ekle
if (startText) {
  parts.push(startText);
}

// skor sadece gerçekten oynanıyorsa / bittiyse
if (showScore && scoreHome != null && scoreAway != null) {
  parts.push(`${scoreHome}-${scoreAway}`);
}

// her zaman status yaz (Scheduled, Live, FT vs.)
if (status) {
  parts.push(status);
}

matches.push({
  startISO: startISO || "",
  line:
    `• ${homeName} vs ${awayName}` +
    (parts.length ? ` | ${parts.join(" | ")}` : ""),
});


}

  matches.sort((a, b) => (a.startISO || "").localeCompare(b.startISO || ""));

  const top = matches.slice(0, 6).map((m) => m.line);
  const text =
  	top.length
    	? `⚽ Favoriler:\n` + top.join("\n")
    	: `⚽ Bugün favori maç yok`;



  await caches.default.put(
    cacheKey,
    new Response(text, { headers: { "Cache-Control": "public, max-age=600" } })
  );

  return text;
}




async function sendTelegram(env, text) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  const payload = {
    chat_id: env.TELEGRAM_CHAT_ID,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  // 1 kez retry: Telegram 429 dönerse "retry_after" kadar bekle
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.ok !== false) return;

    // 429 => bekle ve tekrar dene
    if (res.status === 429) {
	  console.log("Telegram 429 payload:", JSON.stringify(data));
      const retryAfter = data?.parameters?.retry_after ?? 3; // saniye
      await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
      continue;
    }

    throw new Error(`Telegram error: ${res.status} ${JSON.stringify(data)}`);
  }

  throw new Error("Telegram error: 429 (retry failed)");
}



async function buildMessage() {
  const date = formatDate();

  const [weather, crypto, metals, matches] = await Promise.all([
    getWeather(),
    getCrypto(),
    getMetals(),
    getFavoriteMatches(),
  ]);

  return [
    `📌 ${date}`,
    "",
    weather,
    metals,
    crypto,
    "",
    matches
  ].join("\n");
}


export default {
  async scheduled(event, env, ctx) {
    const message = await buildMessage();
    await sendTelegram(env, message);
  },

  async fetch(request, env) {
  const url = new URL(request.url);

  // favicon gibi isteklerde hiçbir şey yapma
  if (url.pathname === "/favicon.ico") {
    return new Response(null, { status: 204 });

  }

  // Ana sayfa: yanlışlıkla tetiklemeyi engelle
  if (url.pathname === "/") {
    return new Response("OK. Use /run to send the report manually.", { status: 200 });
  }

  // Manuel tetikleme sadece /run
  if (url.pathname === "/run") {
  const message = await buildMessage();

  // DRY MODE (Telegram'a göndermez)
  if (url.searchParams.get("dry") === "1") {
    return new Response(message, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // 60 saniye rate limit
  const lockKey = new Request("https://cache.local/lock/run");
  const locked = await caches.default.match(lockKey);
  if (locked) {
    return new Response("Rate limited: try again in ~60s", { status: 429 });
  }

  await caches.default.put(
    lockKey,
    new Response("1", { headers: { "Cache-Control": "public, max-age=60" } })
  );

  try {
    await sendTelegram(env, message);
    return new Response("Manual run OK", { status: 200 });
  } catch (e) {
    return new Response(`Manual run skipped: ${e.message}`, { status: 200 });
  }
}



  return new Response("Not found", { status: 404 });
}
,
};

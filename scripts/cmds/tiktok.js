"use strict";

const axios = require("axios");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { send } = require("./lib/messenger");

// ───────────────────────── Réglages ─────────────────────────
const API_HOSTS = ["https://www.tikwm.com", "https://tikwm.com"];
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // limite d'upload Messenger
const MAX_DURATION_SEC = 10 * 60; // on ignore les vidéos de plus de 10 min
const MAX_CANDIDATES = 8; // nombre de vidéos essayées avant d'abandonner
const MAX_QUERY_CHARS = 100;
const SEARCH_COUNT = 15;
const COOLDOWN_MS = 15 * 1000;
const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_WAIT_MS = 1200;

const cooldowns = new Map(); // senderID -> timestamp de fin de cooldown
const running = new Set(); // senderID avec une recherche en cours

// ───────────────────────── Utilitaires ─────────────────────────
const defaultDeps = {
  axios,
  fs,
  hosts: API_HOSTS,
  maxVideoBytes: MAX_VIDEO_BYTES,
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  now: () => Date.now()
};

function cleanQuery(args) {
  const raw = Array.isArray(args) ? args.join(" ") : "";
  return raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_CHARS);
}

function isTikTokUrl(text) {
  return /^https?:\/\/(?:[a-z0-9-]+\.)?tiktok\.com\/\S+/i.test(String(text || "").trim());
}

function errorText(error) {
  const message = error && (error.message || error.code) || "erreur inconnue";
  return String(message).replace(/\s+/g, " ").slice(0, 160);
}

function getUserID(event) {
  return String(event && (event.senderID || event.userID || event.author) || "");
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (!total) return "";
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function toAbsoluteUrl(value, host) {
  if (typeof value !== "string" || !value.trim()) return null;
  const url = value.trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${host}${url}`;
  return null;
}

function isMp4(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > 1024 && buffer.toString("ascii", 4, 8) === "ftyp";
}

// ───────────────────────── API TikWM ─────────────────────────
function browserHeaders(host, extra = {}) {
  return {
    "User-Agent": USER_AGENT,
    Accept: "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
    "sec-ch-ua": "\"Chromium\";v=\"130\", \"Not?A_Brand\";v=\"99\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "X-Requested-With": "XMLHttpRequest",
    Origin: host,
    Referer: `${host}/`,
    ...extra
  };
}

function hostLabel(host) {
  try { return new URL(host).hostname; } catch (_) { return String(host); }
}

async function callApi(deps, endpoint, fields) {
  const attempts = [];
  const form = new URLSearchParams(fields).toString();
  for (const host of deps.hosts) {
    // POST d'abord, puis GET : certains pare-feux bloquent l'un et pas l'autre.
    for (const method of ["POST", "GET"]) {
      const label = `${hostLabel(host)} ${method}`;
      for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt++) {
        try {
          const response = method === "POST"
            ? await deps.axios.post(`${host}${endpoint}`, form, {
              headers: browserHeaders(host, { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" }),
              timeout: 25000,
              maxContentLength: 4 * 1024 * 1024
            })
            : await deps.axios.get(`${host}${endpoint}?${form}`, {
              headers: browserHeaders(host),
              timeout: 25000,
              maxContentLength: 4 * 1024 * 1024
            });
          const body = response && response.data;
          if (!body || typeof body !== "object") {
            attempts.push(`${label} → réponse illisible (page de protection ?)`);
            break;
          }
          if (body.code === 0) return { host, data: body.data };

          const message = String(body.msg || "erreur API");
          if (/limit|too many|second/i.test(message) && attempt < RATE_LIMIT_RETRIES) {
            await deps.sleep(RATE_LIMIT_WAIT_MS);
            continue;
          }
          attempts.push(`${label} → ${message.slice(0, 80)}`);
          break;
        } catch (error) {
          const status = error && error.response && error.response.status;
          if (status === 429 && attempt < RATE_LIMIT_RETRIES) {
            await deps.sleep(RATE_LIMIT_WAIT_MS);
            continue;
          }
          attempts.push(`${label} → ${status ? `HTTP ${status}` : errorText(error)}`);
          break;
        }
      }
    }
  }
  const error = new Error(`API TikTok injoignable (${attempts.join(" | ")})`);
  error.attempts = attempts;
  error.blocked = attempts.length > 0 && attempts.every(line => /HTTP 403/.test(line));
  throw error;
}

function normalizeVideo(raw, host) {
  if (!raw || typeof raw !== "object") return null;
  const urls = [raw.play, raw.wmplay]
    .map(value => toAbsoluteUrl(value, host))
    .filter(Boolean);
  const unique = [...new Set(urls)];
  if (!unique.length) return null;

  const author = raw.author && (raw.author.unique_id || raw.author.nickname) || "";
  const id = String(raw.video_id || raw.id || "");
  return {
    id,
    title: String(raw.title || "").replace(/\s+/g, " ").trim(),
    author: String(author),
    duration: Number(raw.duration) || 0,
    size: Number(raw.size) || 0,
    urls: unique,
    pageUrl: author && id ? `https://www.tiktok.com/@${author}/video/${id}` : ""
  };
}

async function searchVideos(query, deps = defaultDeps) {
  const { host, data } = await callApi(deps, "/api/feed/search", {
    keywords: query,
    count: String(SEARCH_COUNT),
    cursor: "0",
    web: "1",
    hd: "1"
  });
  const videos = data && Array.isArray(data.videos) ? data.videos : [];
  return videos.map(video => normalizeVideo(video, host)).filter(Boolean);
}

async function resolveVideoUrl(url, deps = defaultDeps) {
  const { host, data } = await callApi(deps, "/api/", { url, hd: "1" });
  const video = normalizeVideo(data, host);
  return video ? [video] : [];
}

// ───────────────────────── Téléchargement ─────────────────────────
async function downloadVideo(video, deps = defaultDeps) {
  const referers = ["https://www.tikwm.com/", "https://www.tiktok.com/", null];
  const failures = [];
  for (const url of video.urls) {
    for (const referer of referers) {
      try {
        const headers = { "User-Agent": USER_AGENT, Accept: "video/mp4,video/*;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9" };
        if (referer) headers.Referer = referer;
        const response = await deps.axios.get(url, {
          responseType: "arraybuffer",
          timeout: 60000,
          maxContentLength: deps.maxVideoBytes,
          maxBodyLength: deps.maxVideoBytes,
          maxRedirects: 5,
          headers
        });
        const buffer = Buffer.from(response.data);
        if (buffer.length > deps.maxVideoBytes) throw new Error("Vidéo trop lourde pour Messenger.");
        if (!isMp4(buffer)) throw new Error("Le fichier reçu n'est pas un MP4 valide.");
        return buffer;
      } catch (error) {
        const status = error && error.response && error.response.status;
        failures.push(`${hostLabel(url)} → ${status ? `HTTP ${status}` : errorText(error)}`);
        if (status !== 403 && status !== 401) break; // seul un refus d'accès justifie d'essayer un autre Referer
      }
    }
  }
  const error = new Error(`Téléchargement impossible (${[...new Set(failures)].slice(0, 3).join(" | ")})`);
  error.blocked = failures.length > 0 && failures.every(line => /HTTP 40[13]/.test(line));
  throw error;
}

function isCandidateAllowed(video, deps) {
  if (video.size && video.size > deps.maxVideoBytes) return false;
  if (video.duration && video.duration > MAX_DURATION_SEC) return false;
  return true;
}

function buildCaption(video, query, isLink) {
  const lines = [isLink ? "🎵 TikTok" : `🎵 TikTok · « ${query} »`];
  if (video.title) lines.push(`📝 ${video.title.slice(0, 180)}`);
  if (video.author) lines.push(`👤 @${video.author}`);
  const duration = formatDuration(video.duration);
  if (duration) lines.push(`⏱️ ${duration}`);
  if (video.pageUrl) lines.push(`🔗 ${video.pageUrl}`);
  return lines.join("\n");
}

function explainError(error, stage) {
  const status = error && error.response && error.response.status;
  if (error && error.blocked) {
    return `❌ Accès refusé (HTTP 403) pendant « ${stage} » : le service TikTok bloque l'adresse IP du serveur du bot.\n🔧 ${String(error.message).slice(0, 220)}`;
  }
  if (status === 429 || /limit|too many/i.test(String(error && error.message))) {
    return "❌ Le service TikTok est saturé. Réessaie dans quelques secondes.";
  }
  if (status === 403) return "❌ Le service TikTok a refusé la requête (HTTP 403). Réessaie plus tard.";
  if (error && (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT")) {
    return `❌ Délai dépassé pendant l'étape « ${stage} ». Réessaie.`;
  }
  return `❌ Échec de l'étape « ${stage} » : ${String(error && error.message || "erreur inconnue").replace(/\s+/g, " ").slice(0, 260)}`;
}

// ───────────────────────── Commande ─────────────────────────
async function run({ api, message, event, args, prefix }, deps = defaultDeps) {
  const reply = payload => send({ api, message, event }, payload);
  const pfx = prefix || "!";
  const query = cleanQuery(args);

  if (!query) {
    return reply(`🎵 Utilisation : ${pfx}tiktok <recherche>\nExemple : ${pfx}tiktok chat drôle\nTu peux aussi coller un lien TikTok.`);
  }
  if (!api || typeof api.sendMessage !== "function" || !event || !event.threadID) {
    return reply("❌ L'API Messenger ou la conversation est indisponible.");
  }

  const userID = getUserID(event);
  const now = deps.now();
  if (userID) {
    if (running.has(userID)) return reply("⏳ Ta précédente recherche TikTok est encore en cours.");
    const until = cooldowns.get(userID) || 0;
    if (until > now) {
      return reply(`⏳ Patiente encore ${Math.ceil((until - now) / 1000)} s avant une nouvelle recherche TikTok.`);
    }
    running.add(userID);
  }

  let stage = "recherche TikTok";
  let tempDir;
  let stream;
  try {
    await reply(isTikTokUrl(query) ? "🔗 Lecture du lien TikTok…" : `🔎 Recherche TikTok : « ${query} »…`);

    const byLink = isTikTokUrl(query);
    const candidates = byLink ? await resolveVideoUrl(query, deps) : await searchVideos(query, deps);
    if (!candidates.length) {
      return reply(`🔎 Aucune vidéo TikTok trouvée pour « ${query} ». Essaie d'autres mots-clés.`);
    }

    const eligible = candidates.filter(video => isCandidateAllowed(video, deps)).slice(0, MAX_CANDIDATES);
    if (!eligible.length) {
      return reply("❌ Les vidéos trouvées sont trop lourdes ou trop longues pour Messenger (max 25 Mo / 10 min). Essaie une autre recherche.");
    }

    stage = "téléchargement de la vidéo";
    let chosen = null;
    let buffer = null;
    let lastError = null;
    let blockedCount = 0;
    for (const video of eligible) {
      try {
        buffer = await downloadVideo(video, deps);
        chosen = video;
        break;
      } catch (error) {
        lastError = error;
        console.warn(`[Commande tiktok] Vidéo ${video.id || "?"} ignorée : ${errorText(error)}`);
        // Deux refus d'accès d'affilée = l'IP est bloquée, inutile d'insister.
        if (error && error.blocked && ++blockedCount >= 2) break;
      }
    }
    if (!chosen) throw lastError || new Error("Aucune vidéo téléchargeable.");

    stage = "création du fichier temporaire";
    tempDir = await deps.fs.promises.mkdtemp(path.join(os.tmpdir(), "goat-tiktok-"));
    const filePath = path.join(tempDir, `tiktok-${deps.now()}.mp4`);
    await deps.fs.promises.writeFile(filePath, buffer);

    stage = "envoi sur Messenger";
    stream = deps.fs.createReadStream(filePath);
    await api.sendMessage({ body: buildCaption(chosen, query, byLink), attachment: stream }, event.threadID);

    if (userID) cooldowns.set(userID, deps.now() + COOLDOWN_MS);
    return true;
  } catch (error) {
    console.error(`[Commande tiktok] Échec étape « ${stage} » :`, error && error.stack || error);
    try {
      return await reply(explainError(error, stage));
    } catch (replyError) {
      console.error("[Commande tiktok] Impossible d'envoyer le diagnostic :", replyError && replyError.stack || replyError);
      return null;
    }
  } finally {
    if (userID) running.delete(userID);
    if (stream && typeof stream.destroy === "function" && !stream.destroyed) stream.destroy();
    if (tempDir) {
      await deps.fs.promises.rm(tempDir, { recursive: true, force: true })
        .catch(error => console.error("[Commande tiktok] Nettoyage temporaire :", error.message));
    }
  }
}

module.exports = {
  config: {
    name: "tiktok",
    aliases: ["tt"],
    version: "1.0.0",
    author: "Diwate",
    description: "Recherche une vidéo TikTok (ou lit un lien) et l'envoie sur Messenger",
    category: "Médias",
    usages: "tiktok <recherche | lien>",
    role: 0
  },

  // exposés pour les tests
  cleanQuery,
  isTikTokUrl,
  searchVideos,
  resolveVideoUrl,
  downloadVideo,
  normalizeVideo,
  run,
  _state: { cooldowns, running },

  onStart: function (context) {
    return run(context, defaultDeps);
  }
};

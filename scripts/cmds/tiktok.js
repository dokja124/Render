"use strict";

const axios = require("axios");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { send } = require("./lib/messenger");

const TIKWM_ORIGIN = "https://www.tikwm.com";
const SEARCH_URL = `${TIKWM_ORIGIN}/api/feed/search`;
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const MAX_QUERY_CHARS = 120;
const SEARCH_RESULT_COUNT = 8;
const MAX_DOWNLOAD_ATTEMPTS = 3;
const MAX_VIDEO_BYTES = 22 * 1024 * 1024;
const MAX_VIDEO_DURATION_SECONDS = 600;
const MAX_CONCURRENT_REQUESTS = 3;
const REQUEST_TIMEOUT_MS = 25000;
const activeRequests = new Set();

function cleanText(value, maxChars = 300) {
  if (value == null) return "";
  return Array.from(String(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim())
    .slice(0, maxChars)
    .join("");
}

function getPrefixes(context = {}) {
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  const candidates = [context.prefix, config.prefix];
  const prefixes = [];
  for (const candidate of candidates) {
    const values = Array.isArray(candidate) ? candidate : [candidate];
    for (const value of values) {
      const prefix = String(value || "").trim();
      if (prefix && !prefixes.includes(prefix)) prefixes.push(prefix);
    }
  }
  if (!prefixes.length) prefixes.push("!");
  return prefixes.sort((a, b) => b.length - a.length);
}

function getQuery(context = {}) {
  const normalize = value => String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const argsQuery = Array.isArray(context.args)
    ? normalize(context.args.join(" "))
    : normalize(context.args);
  if (argsQuery) return argsQuery;

  const body = String((context.event && (context.event.body || context.event.message)) || "").trim();
  const firstToken = body.split(/\s+/)[0] || "";
  for (const prefix of getPrefixes(context)) {
    if (!firstToken.startsWith(prefix)) continue;
    const withoutPrefix = body.slice(prefix.length).trim();
    const match = withoutPrefix.match(/^tiktok(?:\s+|$)([\s\S]*)$/i);
    return match ? normalize(match[1]) : "";
  }
  return "";
}

function makeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isMp4(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp";
}

function getVideoUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw makeError("VIDEO_URL_MISSING", "TikWM n’a pas fourni de lien vidéo.");
  }

  let url;
  try {
    url = new URL(rawUrl, TIKWM_ORIGIN);
  } catch (_) {
    throw makeError("VIDEO_URL_INVALID", "Le lien vidéo retourné est invalide.");
  }

  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !["www.tikwm.com", "tikwm.com"].includes(host) || url.username || url.password) {
    throw makeError("VIDEO_URL_UNTRUSTED", "Le lien vidéo ne provient pas du domaine TikWM attendu.");
  }
  return url.toString();
}

function getVideos(payload) {
  const data = payload && payload.data;
  if (data && Array.isArray(data.videos)) return data.videos;
  if (payload && Array.isArray(payload.videos)) return payload.videos;
  return [];
}

async function searchTikTok(query, http = axios) {
  const response = await http.get(SEARCH_URL, {
    params: { keywords: query, count: SEARCH_RESULT_COUNT, cursor: 0, web: 1, hd: 1 },
    timeout: REQUEST_TIMEOUT_MS,
    maxContentLength: 2 * 1024 * 1024,
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": USER_AGENT,
      Referer: `${TIKWM_ORIGIN}/`
    }
  });

  const payload = response && response.data;
  if (!payload || Number(payload.code) !== 0) {
    throw makeError("SEARCH_FAILED", cleanText(payload && payload.msg, 150) || "Le service TikWM a refusé la recherche.");
  }
  return getVideos(payload);
}

function getCandidateUrl(video) {
  if (!video || typeof video !== "object") return "";
  const sources = [video.play, video.wmplay].filter(value => typeof value === "string" && value.trim());
  if (!sources.length) throw makeError("VIDEO_URL_MISSING", "TikWM n’a pas fourni de lien vidéo.");
  let lastError;
  for (const source of sources) {
    try {
      return getVideoUrl(source);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || makeError("VIDEO_URL_INVALID", "Aucun lien vidéo TikWM valide n’a été fourni.");
}

function isCandidate(video) {
  if (!video || typeof video !== "object" || video.is_ad === true) return false;
  const duration = Number(video.duration);
  if (Number.isFinite(duration) && duration > MAX_VIDEO_DURATION_SECONDS) return false;
  const declaredSize = Number(video.size);
  if (Number.isFinite(declaredSize) && declaredSize > 0 && declaredSize > MAX_VIDEO_BYTES) return false;
  try {
    return Boolean(getCandidateUrl(video));
  } catch (_) {
    return false;
  }
}

async function downloadVideo(video, http = axios, maxBytes = MAX_VIDEO_BYTES) {
  const url = getCandidateUrl(video);
  const response = await http.get(url, {
    responseType: "arraybuffer",
    timeout: REQUEST_TIMEOUT_MS,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    maxRedirects: 4,
    headers: {
      Accept: "video/mp4,application/octet-stream;q=0.9,*/*;q=0.5",
      "User-Agent": USER_AGENT,
      Referer: `${TIKWM_ORIGIN}/`
    }
  });

  const buffer = Buffer.isBuffer(response && response.data)
    ? response.data
    : Buffer.from((response && response.data) || []);
  if (!buffer.length) throw makeError("VIDEO_EMPTY", "Le fichier vidéo reçu est vide.");
  if (buffer.length > maxBytes) throw makeError("VIDEO_TOO_LARGE", "La vidéo dépasse la limite d’envoi Messenger.");
  if (!isMp4(buffer)) throw makeError("VIDEO_NOT_MP4", "Le fichier reçu n’est pas une vidéo MP4 valide.");
  return { buffer, url };
}

function isAxiosSizeLimitError(error) {
  const message = String(error && error.message || "");
  return Boolean(error && (error.code === "ERR_FR_MAX_BODY_LENGTH_EXCEEDED" || /maxContentLength|maxBodyLength/i.test(message)));
}

async function searchAndDownload(query, http = axios) {
  const videos = await searchTikTok(query, http);
  if (!videos.length) return { status: "not-found" };

  const candidates = videos.filter(isCandidate);
  const sawOversized = videos.some(video => Number(video && video.size) > MAX_VIDEO_BYTES);
  if (!candidates.length) {
    return { status: sawOversized ? "too-large" : "unavailable" };
  }

  let lastError = null;
  for (const video of candidates.slice(0, MAX_DOWNLOAD_ATTEMPTS)) {
    try {
      const downloaded = await downloadVideo(video, http);
      return { status: "ok", video, ...downloaded };
    } catch (error) {
      lastError = isAxiosSizeLimitError(error)
        ? makeError("VIDEO_TOO_LARGE", "La vidéo dépasse la limite d’envoi Messenger.")
        : error;
    }
  }

  if (lastError && lastError.code === "VIDEO_TOO_LARGE") return { status: "too-large" };
  return { status: "download-failed", error: lastError };
}

function makeTikTokLink(video) {
  const id = cleanText(video && (video.video_id || video.id), 80);
  const author = video && video.author && video.author.unique_id;
  const username = cleanText(author, 80).replace(/^@/, "");
  if (!id) return "";
  return username
    ? `https://www.tiktok.com/@${encodeURIComponent(username)}/video/${encodeURIComponent(id)}`
    : `https://www.tiktok.com/video/${encodeURIComponent(id)}`;
}

function makeCaption(query, video) {
  const title = cleanText(video && (video.title || video.desc || video.description), 240) || "Vidéo TikTok";
  const author = video && video.author || {};
  const nickname = cleanText(author.nickname || author.unique_id, 100) || "Créateur TikTok";
  const username = cleanText(author.unique_id, 80).replace(/^@/, "");
  const duration = Number(video && video.duration);
  const lines = [
    `🎵 Résultat TikTok pour « ${cleanText(query, MAX_QUERY_CHARS)} »`,
    `📌 ${title}`,
    `👤 ${nickname}${username ? ` (@${username})` : ""}`
  ];
  if (Number.isFinite(duration) && duration > 0) lines.push(`⏱️ ${duration} s`);
  const link = makeTikTokLink(video);
  if (link) lines.push(`🔗 ${link}`);
  lines.push("ℹ️ Source : TikTok via TikWM. Respecte les droits du créateur.");
  return lines.join("\n");
}

function requestKey(event = {}) {
  const threadID = String(event.threadID || "");
  const senderID = String(event.senderID || event.messageID || "inconnu");
  return `${threadID}:${senderID}`;
}

function messageForError(result, query) {
  if (result.status === "not-found") return `🔎 Je n’ai trouvé aucune vidéo TikTok pour « ${cleanText(query, MAX_QUERY_CHARS)} ». Essaie un autre mot-clé.`;
  if (result.status === "too-large") return "📦 Les vidéos trouvées dépassent la taille maximale d’envoi Messenger. Essaie un mot-clé plus précis.";
  if (result.status === "unavailable") return "⚠️ Des résultats ont été trouvés, mais aucune vidéo téléchargeable et compatible n’est disponible.";
  if (result.status === "download-failed") return "❌ La vidéo a été trouvée, mais son téléchargement a échoué. Réessaie plus tard.";
  return "❌ Le service de recherche TikTok est momentanément indisponible. Réessaie dans un instant.";
}

async function handleTikTok(context = {}, dependencies = {}) {
  const { api, message, event, prefix } = context;
  const query = getQuery(context);
  const currentPrefix = prefix || getPrefixes(context)[0];

  if (!query) {
    return send({ api, message, event }, `🎵 Utilisation : ${currentPrefix}tiktok <recherche>\nExemple : ${currentPrefix}tiktok Naruto`);
  }
  const queryLength = Array.from(query).length;
  if (queryLength < 2 || queryLength > MAX_QUERY_CHARS) {
    return send({ api, message, event }, `❌ Le mot-clé doit contenir entre 2 et ${MAX_QUERY_CHARS} caractères.`);
  }
  if (!event || !event.threadID || !api || typeof api.sendMessage !== "function") {
    return send({ api, message, event }, "❌ L’API Messenger ou l’identifiant de la conversation est indisponible.");
  }

  const key = requestKey(event);
  if (activeRequests.has(key)) {
    return send({ api, message, event }, "⏳ Une recherche TikTok est déjà en cours pour toi dans cette conversation.");
  }
  if (activeRequests.size >= MAX_CONCURRENT_REQUESTS) {
    return send({ api, message, event }, "⏳ Trop de recherches vidéo sont en cours. Réessaie dans quelques instants.");
  }

  activeRequests.add(key);
  let tempDir;
  let videoStream;
  try {
    const http = dependencies.http || axios;
    const result = await searchAndDownload(query, http);
    if (result.status !== "ok") return send({ api, message, event }, messageForError(result, query));

    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "goat-tiktok-"));
    const videoPath = path.join(tempDir, "tiktok-video.mp4");
    await fs.promises.writeFile(videoPath, result.buffer, { flag: "wx" });
    const stat = await fs.promises.stat(videoPath);
    if (!stat.size || stat.size > MAX_VIDEO_BYTES) throw makeError("VIDEO_TOO_LARGE", "Le MP4 temporaire dépasse la limite Messenger.");

    videoStream = fs.createReadStream(videoPath);
    return await api.sendMessage({
      body: makeCaption(query, result.video),
      attachment: videoStream
    }, event.threadID);
  } catch (error) {
    console.error("[Commande tiktok] Échec de la recherche ou de l’envoi :", error && (error.stack || error.message) || error);
    const text = error && error.code === "SEARCH_FAILED"
      ? "❌ Le service TikTok a refusé la recherche. Réessaie plus tard."
      : "❌ Impossible de récupérer ou d’envoyer cette vidéo TikTok pour le moment.";
    try {
      return await send({ api, message, event }, text);
    } catch (replyError) {
      console.error("[Commande tiktok] Impossible d’envoyer le message d’erreur :", replyError && replyError.message || replyError);
      return null;
    }
  } finally {
    if (videoStream && !videoStream.destroyed) videoStream.destroy();
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true })
        .catch(error => console.error("[Commande tiktok] Nettoyage du fichier temporaire :", error.message));
    }
    activeRequests.delete(key);
  }
}

module.exports = {
  config: {
    name: "tiktok",
    version: "1.0.0",
    author: "Diwate",
    description: "Recherche une vidéo TikTok par mot-clé et l’envoie sur Messenger",
    category: "Médias",
    usages: "tiktok <recherche>",
    role: 0
  },
  getQuery,
  getVideos,
  getVideoUrl,
  isMp4,
  searchTikTok,
  downloadVideo,
  searchAndDownload,
  makeTikTokLink,
  makeCaption,
  handleTikTok,
  MAX_QUERY_CHARS,
  MAX_VIDEO_BYTES,
  SEARCH_URL,
  MAX_CONCURRENT_REQUESTS,
  onStart: async function (context) {
    return handleTikTok(context);
  }
};

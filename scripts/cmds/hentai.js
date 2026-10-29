const axios = require("axios");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { send } = require("./lib/messenger");

const MAX_USES = 5;
const COOLDOWN_MS = 10 * 60 * 1000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const CACHE_MS = 10 * 60 * 1000;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const PAGES = [
  "https://lucioushentai.com/",
  "https://lucioushentai.com/page/2/",
  "https://lucioushentai.com/page/3/"
];
const IMAGE_PATTERN = /https:\/\/img\.lucioushentai\.com\/data\/[^\s"'<>\\]+?\.(?:webp|jpg|jpeg|png)/gi;
const usage = new Map();
let urlCache = { updatedAt: 0, urls: [] };

function getUserID(event) {
  return String(event && (event.senderID || event.userID || event.author) || "");
}

function getUsageState(userID) {
  let state = usage.get(userID);
  if (!state) {
    state = { count: 0, cooldownUntil: 0, timer: null, threadID: null, api: null };
    usage.set(userID, state);
  }
  return state;
}

function clearCooldownTimer(state) {
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
}

function pickUrl(urls) {
  if (!urls.length) return null;
  const preferred = urls.filter(url => !/\.webp(?:$|\?)/i.test(url));
  const pool = preferred.length ? preferred : urls;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function scrapePage(pageUrl) {
  const response = await axios.get(pageUrl, {
    timeout: 15000,
    maxRedirects: 3,
    maxContentLength: 3 * 1024 * 1024,
    responseType: "text",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    },
    validateStatus: status => status >= 200 && status < 400
  });
  const html = String(response.data || "");
  return [...new Set((html.match(IMAGE_PATTERN) || []).map(url => url.replace(/&amp;/g, "&")))];
}

async function fetchImageUrl() {
  const now = Date.now();
  if (urlCache.urls.length && now - urlCache.updatedAt < CACHE_MS) return pickUrl(urlCache.urls);

  const urls = [];
  let lastError;
  for (const page of PAGES) {
    try {
      urls.push(...await scrapePage(page));
      if (urls.length >= 12) break;
    } catch (error) {
      lastError = error;
      console.warn("[hentai] Échec de lecture de la page :", error.message);
    }
  }

  const unique = [...new Set(urls)];
  if (!unique.length) {
    if (urlCache.urls.length) return pickUrl(urlCache.urls);
    throw lastError || new Error("Aucune image trouvée sur le site source.");
  }

  urlCache = { updatedAt: now, urls: unique };
  return pickUrl(unique);
}

function imageFormat(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { ext: "png", mime: "image/png" };
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.toString("ascii", 0, 6))) return { ext: "gif", mime: "image/gif" };
  return null;
}

async function downloadImage(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30000,
    maxContentLength: MAX_IMAGE_BYTES,
    maxBodyLength: MAX_IMAGE_BYTES,
    maxRedirects: 4,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      Referer: "https://lucioushentai.com/"
    },
    validateStatus: status => status >= 200 && status < 400
  });
  const buffer = Buffer.from(response.data);
  if (buffer.length < 500 || buffer.length > MAX_IMAGE_BYTES) throw new Error("Fichier image vide, trop petit ou trop volumineux.");
  const format = imageFormat(buffer);
  if (!format) throw new Error("Le fichier récupéré n’est pas une image prise en charge.");
  return { buffer, format };
}

async function convertToJpeg(buffer, format) {
  if (format.mime === "image/jpeg") return { buffer, format: { ext: "jpg", mime: "image/jpeg" } };

  try {
    const sharp = require("sharp");
    const jpeg = await sharp(buffer).jpeg({ quality: 85 }).toBuffer();
    if (jpeg.length > 500) return { buffer: jpeg, format: { ext: "jpg", mime: "image/jpeg" } };
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") console.warn("[hentai] Conversion Sharp indisponible :", error.message);
  }

  try {
    const jimpModule = require("jimp");
    const Jimp = jimpModule.Jimp || jimpModule;
    const image = await Jimp.read(buffer);
    let jpeg;
    if (typeof image.getBufferAsync === "function") jpeg = await image.getBufferAsync("image/jpeg");
    else if (typeof image.getBuffer === "function") jpeg = await image.getBuffer("image/jpeg");
    if (jpeg && jpeg.length > 500) return { buffer: Buffer.from(jpeg), format: { ext: "jpg", mime: "image/jpeg" } };
  } catch (error) {
    console.warn("[hentai] Conversion Jimp indisponible; envoi au format image d’origine :", error.message);
  }

  return { buffer, format };
}

function errorMessage(error) {
  const status = error && error.response && error.response.status;
  if (status === 403 || status === 429) return `Le site source a refusé la requête (HTTP ${status}). Réessaie plus tard.`;
  return String(error && (error.message || error.code) || "Erreur inconnue").replace(/\s+/g, " ").slice(0, 160);
}

module.exports = {
  config: {
    name: "hentai",
    version: "1.0.0",
    author: "Diwate",
    description: "Envoie une image depuis la source configurée (limite individuelle de 5 essais)",
    category: "18+ — réservé aux adultes",
    usages: "hentai",
    role: 0
  },

  // Exports utilitaires pour les tests locaux, sans effectuer de requête réseau.
  _usage: usage,
  _fetchImageUrl: fetchImageUrl,
  _downloadImage: downloadImage,
  _convertToJpeg: convertToJpeg,
  _imageFormat: imageFormat,

  onStart: async function ({ api, message, event }) {
    const userID = getUserID(event);
    if (!userID) return send({ api, message, event }, "❌ Impossible d’identifier l’utilisateur.");
    if (!event || !event.threadID || !api || typeof api.sendMessage !== "function") {
      return send({ api, message, event }, "❌ L’API Messenger ou la conversation est indisponible.");
    }

    const state = getUsageState(userID);
    const now = Date.now();
    if (state.cooldownUntil > now) {
      const minutes = Math.max(1, Math.ceil((state.cooldownUntil - now) / 60000));
      return send(
        { api, message, event },
        `⏳ Limite atteinte espèce de pervers (*${MAX_USES}* fois).\nRéessaie dans *~${minutes} min*.`
      );
    }
    if (state.cooldownUntil && state.cooldownUntil <= now) {
      clearCooldownTimer(state);
      state.count = 0;
      state.cooldownUntil = 0;
    }
    if (state.count >= MAX_USES) {
      state.cooldownUntil = now + COOLDOWN_MS;
      state.threadID = event.threadID;
      state.api = api;
      clearCooldownTimer(state);
      state.timer = setTimeout(async () => {
        state.count = 0;
        state.cooldownUntil = 0;
        state.timer = null;
        try {
          if (state.api && state.threadID) {
            await state.api.sendMessage(
              { body: "✅ Tu peux à nouveau utiliser *.hentai*. Mais je te surveille" },
              state.threadID
            );
          }
        } catch (error) {
          console.error("[Commande hentai] Notification de fin de délai impossible :", error.message);
        }
      }, COOLDOWN_MS);
      if (typeof state.timer.unref === "function") state.timer.unref();
      return send(
        { api, message, event },
        `🚫 *.hentai* utilisé *${MAX_USES}* fois.\nBloqué *10 minutes* (proprio inclus).`
      );
    }

    let tempDir;
    let stream;
    try {
      const url = await fetchImageUrl();
      const downloaded = await downloadImage(url);
      const converted = await convertToJpeg(downloaded.buffer, downloaded.format);
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "goat-hentai-"));
      const filename = `image-${Date.now()}.${converted.format.ext}`;
      const imagePath = path.join(tempDir, filename);
      await fs.promises.writeFile(imagePath, converted.buffer);
      const stat = await fs.promises.stat(imagePath);
      if (!stat.size || stat.size > MAX_IMAGE_BYTES) throw new Error("L’image préparée est vide ou dépasse la taille autorisée.");

      stream = fs.createReadStream(imagePath);
      const result = await api.sendMessage({
        body: `🔞 Contenu réservé aux adultes (18+). (${state.count + 1}/${MAX_USES})`,
        attachment: stream
      }, event.threadID);
      state.count += 1;
      return result;
    } catch (error) {
      console.error("[Commande hentai] Échec de l’envoi :", error.stack || error);
      return send({ api, message, event }, `❌ Impossible de récupérer ou d’envoyer l’image. ${errorMessage(error)}`);
    } finally {
      if (stream && !stream.destroyed) stream.destroy();
      if (tempDir) await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(error => console.error("[Commande hentai] Nettoyage temporaire :", error.message));
    }
  }
};

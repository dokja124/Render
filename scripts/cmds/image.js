const axios = require("axios");
const Jimp = require("jimp");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { send } = require("./lib/messenger");

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const PINTEREST_ORIGIN = "https://www.pinterest.com";
const BOT_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const HTML_HEADERS = {
  "User-Agent": BOT_USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8"
};

function cleanQuery(args) {
  return Array.isArray(args) ? args.join(" ").trim() : "";
}

function errorText(error) {
  const message = error && (error.error || error.message || error.code) || "erreur inconnue";
  return String(message).replace(/\s+/g, " ").slice(0, 160);
}

function isPinterestImageUrl(url) {
  if (typeof url !== "string" || !/^https:\/\//i.test(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "pinimg.com" || host.endsWith(".pinimg.com");
  } catch (_) {
    return false;
  }
}

function updateCookies(cookieJar, setCookieHeaders) {
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : (setCookieHeaders ? [setCookieHeaders] : []);
  for (const header of headers) {
    const firstPart = String(header).split(";", 1)[0];
    const separator = firstPart.indexOf("=");
    if (separator <= 0) continue;
    const name = firstPart.slice(0, separator).trim();
    const value = firstPart.slice(separator + 1).trim();
    if (!name) continue;
    if (/max-age=0/i.test(String(header))) cookieJar.delete(name);
    else cookieJar.set(name, value);
  }
}

function cookieHeader(cookieJar) {
  return Array.from(cookieJar.entries(), ([name, value]) => `${name}=${value}`).join("; ");
}

function extractPinterestImageUrls(pin) {
  const images = pin && (pin.images || (pin.media && pin.media.images));
  if (!images || typeof images !== "object") return [];
  const preferred = [images.orig, images["736x"], images["474x"], images["600x"], images["1200x"], ...Object.values(images)];
  return [...new Set(preferred
    .map(image => typeof image === "string" ? image : image && image.url)
    .filter(isPinterestImageUrl))];
}

async function searchPinterest(query) {
  const sourcePath = `/search/pins/?q=${encodeURIComponent(query)}`;
  const landingUrl = `${PINTEREST_ORIGIN}${sourcePath}`;
  const cookieJar = new Map();

  // La page publique initialise la session/cookie et fournit la version web attendue par Pinterest.
  const landingResponse = await axios.get(landingUrl, {
    headers: { ...HTML_HEADERS, Referer: `${PINTEREST_ORIGIN}/` },
    timeout: 25000,
    maxContentLength: 4 * 1024 * 1024,
    responseType: "text"
  });
  updateCookies(cookieJar, landingResponse.headers && landingResponse.headers["set-cookie"]);
  const html = typeof landingResponse.data === "string" ? landingResponse.data : String(landingResponse.data || "");
  const appDataMatch = html.match(/<script\b[^>]*\bid=["']__PWS_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!appDataMatch || !cookieJar.has("csrftoken")) {
    const error = new Error("Pinterest n’a pas fourni les cookies et données de session nécessaires.");
    error.code = "PINTEREST_SESSION_MISSING";
    throw error;
  }

  let appVersion;
  try {
    appVersion = JSON.parse(appDataMatch[1]).appVersion;
  } catch (_) {
    appVersion = null;
  }
  if (!appVersion) {
    const error = new Error("Version de l’application web Pinterest introuvable.");
    error.code = "PINTEREST_SESSION_MISSING";
    throw error;
  }

  const options = { query, scope: "pins", page_size: 25, gated: false, bookmarks: [] };
  const params = new URLSearchParams({
    source_url: sourcePath,
    data: JSON.stringify({ options, context: {} })
  });
  const searchUrl = `${PINTEREST_ORIGIN}/resource/BaseSearchResource/get/?${params.toString()}`;
  const searchResponse = await axios.get(searchUrl, {
    headers: {
      "User-Agent": BOT_USER_AGENT,
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      "X-Requested-With": "XMLHttpRequest",
      "X-App-Version": String(appVersion),
      "X-Pinterest-Pws-Handler": "www/index.js",
      "X-CSRFToken": cookieJar.get("csrftoken"),
      Referer: landingUrl,
      Cookie: cookieHeader(cookieJar)
    },
    timeout: 20000,
    maxContentLength: 4 * 1024 * 1024
  });
  updateCookies(cookieJar, searchResponse.headers && searchResponse.headers["set-cookie"]);

  const resource = searchResponse.data && searchResponse.data.resource_response;
  const data = resource && resource.data;
  const items = Array.isArray(data) ? data : (data && Array.isArray(data.results) ? data.results : []);
  const pins = items.filter(item => item && (item.type === "pin" || (item.id && item.images)));
  const pin = pins.find(item => extractPinterestImageUrls(item).length > 0);
  if (!pin) return null;

  const urls = extractPinterestImageUrls(pin);
  return {
    urls,
    url: urls[0],
    title: [pin.title, pin.grid_title, pin.auto_alt_text, pin.description].find(value => typeof value === "string" && value.trim()) || query,
    pageUrl: pin.id ? `${PINTEREST_ORIGIN}/pin/${encodeURIComponent(String(pin.id))}/` : landingUrl,
    source: "Pinterest"
  };
}

async function fetchJpeg(imageUrls) {
  const urls = [...new Set((Array.isArray(imageUrls) ? imageUrls : [imageUrls]).filter(isPinterestImageUrl))];
  if (!urls.length) throw new Error("Pinterest n’a pas fourni d’URL d’image pinimg valide.");
  let lastError;
  for (const url of urls) {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 20000,
        maxContentLength: MAX_IMAGE_BYTES,
        maxBodyLength: MAX_IMAGE_BYTES,
        maxRedirects: 5,
        headers: {
          Accept: "image/jpeg,image/png,image/webp,image/*;q=0.8",
          "User-Agent": BOT_USER_AGENT,
          Referer: `${PINTEREST_ORIGIN}/`
        }
      });
      const input = Buffer.from(response.data);
      if (!input.length || input.length > MAX_IMAGE_BYTES) throw new Error("Image Pinterest vide ou trop volumineuse.");
      const image = await Jimp.read(input);
      return await image.quality(88).getBufferAsync(Jimp.MIME_JPEG);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Impossible de récupérer ou convertir l’image Pinterest.");
}

function explainPinterestError(error, stage) {
  const status = error && error.response && error.response.status;
  if (status === 403 || status === 429) {
    return `❌ Pinterest a refusé la requête (HTTP ${status}). Réessaie plus tard; aucune image d’une autre source ne sera envoyée.`;
  }
  if (error && error.code === "PINTEREST_SESSION_MISSING") {
    return "❌ Pinterest n’a pas fourni la session web nécessaire à la recherche depuis Render. Réessaie plus tard; le bot n’enverra pas d’image d’une autre source.";
  }
  return `❌ Échec de l’étape « ${stage} » : ${errorText(error)}`;
}

module.exports = {
  config: {
    name: "image",
    version: "7.0.0",
    author: "Diwate",
    description: "Recherche une image sur Pinterest avec User-Agent et l’envoie en JPEG",
    category: "Médias",
    usages: "image <sujet>",
    role: 0
  },
  searchPinterest,
  fetchJpeg,

  onStart: async function ({ api, message, event, args, prefix }) {
    const query = cleanQuery(args);
    if (!query) {
      return send({ api, message, event }, `🖼️ Utilisation : ${prefix || "!"}image <sujet>\nExemple : ${prefix || "!"}image Naruto`);
    }
    if (!api || typeof api.sendMessage !== "function" || !event || !event.threadID) {
      return send({ api, message, event }, "❌ L’API Messenger ou la conversation est indisponible.");
    }

    let stage = "recherche Pinterest";
    let tempDir;
    let imageStream;
    try {
      const result = await searchPinterest(query);
      if (!result) return send({ api, message, event }, `🔎 Pinterest n’a renvoyé aucune photo pour « ${query} ». Essaie un autre mot-clé.`);

      stage = "téléchargement de l’image Pinterest";
      const jpeg = await fetchJpeg(result.urls || result.url);
      if (!jpeg || !jpeg.length) throw new Error("Conversion JPEG vide.");

      stage = "création du fichier JPEG";
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "goat-image-"));
      const imagePath = path.join(tempDir, `image-${Date.now()}.jpg`);
      await fs.promises.writeFile(imagePath, jpeg);
      const imageStat = await fs.promises.stat(imagePath);
      if (!imageStat.size || imageStat.size > MAX_IMAGE_BYTES) throw new Error("Le JPEG généré dépasse la taille autorisée.");

      const lines = [
        `🖼️ Résultat Pinterest pour « ${query} »`,
        `📌 ${String(result.title).trim().slice(0, 180) || query}`,
        "📷 Source : Pinterest",
        `🔗 ${result.pageUrl}`
      ];
      stage = "upload Messenger";
      imageStream = fs.createReadStream(imagePath);
      return await api.sendMessage({ body: lines.join("\n"), attachment: imageStream }, event.threadID);
    } catch (error) {
      console.error(`[Commande image] Échec étape « ${stage} » :`, error.stack || error);
      try {
        return await send({ api, message, event }, explainPinterestError(error, stage));
      } catch (replyError) {
        console.error("[Commande image] Impossible d’envoyer le diagnostic Messenger :", replyError.stack || replyError);
        return null;
      }
    } finally {
      if (imageStream && typeof imageStream.destroy === "function" && !imageStream.destroyed) imageStream.destroy();
      if (tempDir) await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(error => console.error("[Commande image] Nettoyage temporaire :", error.message));
    }
  }
};
  

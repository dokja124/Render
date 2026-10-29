const axios = require("axios");
const Jimp = require("jimp");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { send } = require("./lib/messenger");

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const PINTEREST_SEARCH_URL = "https://api.pinterest.com/v5/search/partner/pins";

function cleanQuery(args) {
  return Array.isArray(args) ? args.join(" ").trim() : "";
}

function errorText(error) {
  const message = error && (error.error || error.message || error.code) || "erreur inconnue";
  return String(message).replace(/\s+/g, " ").slice(0, 160);
}

function pickPinterestImage(pin) {
  const images = pin && pin.media && pin.media.images;
  if (!images || typeof images !== "object") return null;
  const preferred = [images["1200x"], images["600x"], images["400x300"], ...Object.values(images)];
  return preferred.find(image => image && typeof image.url === "string" && /^https:\/\//i.test(image.url)) || null;
}

async function searchPinterest(query) {
  const token = process.env.PINTEREST_ACCESS_TOKEN;
  if (!token) return null;
  const response = await axios.get(PINTEREST_SEARCH_URL, {
    params: { term: query, country_code: "FR", locale: "fr-FR", limit: 10 },
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    timeout: 15000
  });
  const pins = Array.isArray(response.data && response.data.items) ? response.data.items : [];
  const pin = pins.find(item => item && item.media && item.media.media_type === "image" && pickPinterestImage(item));
  if (!pin) return null;
  const image = pickPinterestImage(pin);
  return {
    url: image.url,
    title: pin.title || pin.alt_text || pin.description || query,
    pageUrl: pin.link || `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`,
    source: "Pinterest"
  };
}

async function searchWikimedia(query) {
  const { data } = await axios.get("https://commons.wikimedia.org/w/api.php", {
    params: {
      action: "query", generator: "search", gsrsearch: query, gsrnamespace: 6, gsrlimit: 15,
      prop: "imageinfo", iiprop: "url|mime", iiurlwidth: 1000, format: "json"
    },
    headers: { "User-Agent": "Mozilla/5.0 (compatible; GoatBot/1.0; https://github.com/ntkhang03/Goat-Bot-V2)" },
    timeout: 15000
  });
  const pages = Object.values(data && data.query && data.query.pages || {});
  const page = pages.find(item => {
    const info = item.imageinfo && item.imageinfo[0];
    return info && ["image/jpeg", "image/png"].includes(String(info.mime || "").toLowerCase()) && (info.thumburl || info.url);
  });
  if (!page) return null;
  const info = page.imageinfo[0];
  return {
    url: info.thumburl || info.url,
    urls: [...new Set([info.thumburl, info.url].filter(value => typeof value === "string" && /^https:\/\//i.test(value)))],
    title: String(page.title || query).replace(/^File:/i, "").replace(/_/g, " "),
    pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(page.title || "").replace(/ /g, "_"))}`,
    source: "Wikimedia Commons"
  };
}

async function fetchJpeg(imageUrl) {
  const urls = [...new Set((Array.isArray(imageUrl) ? imageUrl : [imageUrl]).filter(url => typeof url === "string" && /^https:\/\//i.test(url)))];
  if (!urls.length) throw new Error("Aucune URL d’image HTTPS valide.");
  let lastError;
  for (const url of urls) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      const referer = host.endsWith("pinimg.com") ? "https://www.pinterest.com/" : "https://commons.wikimedia.org/";
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 20000,
        maxContentLength: MAX_IMAGE_BYTES,
        maxBodyLength: MAX_IMAGE_BYTES,
        maxRedirects: 5,
        headers: {
          Accept: "image/jpeg,image/png,image/webp,image/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (compatible; GoatBot/1.0; +https://github.com/ntkhang03/Goat-Bot-V2)",
          Referer: referer
        }
      });
      const input = Buffer.from(response.data);
      if (!input.length || input.length > MAX_IMAGE_BYTES) throw new Error("Image vide ou trop volumineuse.");
      const image = await Jimp.read(input);
      return await image.quality(88).getBufferAsync(Jimp.MIME_JPEG);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Impossible de récupérer ou convertir l’image.");
}

module.exports = {
  config: {
    name: "image",
    version: "5.0.0",
    author: "Diwate",
    description: "Recherche une image Pinterest et l’envoie en JPEG",
    category: "Médias",
    usages: "image <sujet>",
    role: 0
  },
  searchPinterest,
  searchWikimedia,
  fetchJpeg,

  onStart: async function ({ api, message, event, args, prefix }) {
    const query = cleanQuery(args);
    if (!query) {
      return send({ api, message, event }, `🖼️ Utilisation : ${prefix || "!"}image <sujet>\nExemple : ${prefix || "!"}image Naruto`);
    }
    if (!api || typeof api.sendMessage !== "function" || !event || !event.threadID) {
      return send({ api, message, event }, "❌ L’API Messenger ou la conversation est indisponible.");
    }

    let stage = "recherche";
    let tempDir;
    let imageStream;
    try {
      let result = null;
      let jpeg = null;
      let pinterestError = null;
      if (process.env.PINTEREST_ACCESS_TOKEN) {
        try {
          result = await searchPinterest(query);
          if (result) {
            stage = "conversion JPEG";
            jpeg = await fetchJpeg(result.urls || result.url);
          } else {
            pinterestError = new Error("Aucune image Pinterest exploitable.");
          }
        } catch (error) {
          pinterestError = error;
          result = null;
          jpeg = null;
          console.warn("[Commande image] Pinterest indisponible, essai Wikimedia :", errorText(error));
        }
      }

      if (!result || !jpeg) {
        stage = "recherche Wikimedia";
        result = await searchWikimedia(query);
        if (result && !process.env.PINTEREST_ACCESS_TOKEN) {
          result.notice = "Pinterest nécessite un jeton OAuth et l’accès à son API bêta; image de secours affichée.";
        }
        if (result && pinterestError) {
          result.notice = "Pinterest a refusé ou n’a pas renvoyé d’image; image de secours affichée.";
        }
        if (result) {
          stage = "conversion JPEG";
          jpeg = await fetchJpeg(result.urls || result.url);
        }
      }
      if (!result) return send({ api, message, event }, `🔎 Aucune image trouvée pour « ${query} ». Essaie un autre mot-clé.`);
      if (!jpeg || !jpeg.length) throw new Error("Conversion JPEG vide.");

      stage = "création du fichier JPEG";
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "goat-image-"));
      const imagePath = path.join(tempDir, `image-${Date.now()}.jpg`);
      await fs.promises.writeFile(imagePath, jpeg);
      const imageStat = await fs.promises.stat(imagePath);
      if (!imageStat.size || imageStat.size > MAX_IMAGE_BYTES) throw new Error("Le JPEG généré dépasse la taille autorisée.");

      const lines = [`🖼️ Résultat pour « ${query} »`, `📌 ${String(result.title).slice(0, 180)}`, `📷 Source : ${result.source}`];
      if (result.notice) lines.push(`ℹ️ ${result.notice}`);
      if (result.pageUrl) lines.push(`🔗 ${result.pageUrl}`);

      stage = "upload Messenger";
      imageStream = fs.createReadStream(imagePath);
      const sent = await api.sendMessage({ body: lines.join("\n"), attachment: imageStream }, event.threadID);
      return sent;
    } catch (error) {
      console.error(`[Commande image] Échec étape « ${stage} » :`, error.stack || error);
      try {
        return await send({ api, message, event }, `❌ Échec de l’étape « ${stage} » : ${errorText(error)}`);
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
    

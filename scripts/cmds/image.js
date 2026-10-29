const axios = require("axios");
const Jimp = require("jimp");
const { Readable } = require("stream");
const { send } = require("./lib/messenger");

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const PINTEREST_SEARCH_URL = "https://api.pinterest.com/v5/search/partner/pins";

function cleanQuery(args) {
  return Array.isArray(args) ? args.join(" ").trim() : "";
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
    headers: { "User-Agent": "MessengerBot/4.0 (image search)" },
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
    title: String(page.title || query).replace(/^File:/i, "").replace(/_/g, " "),
    pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(page.title || "").replace(/ /g, "_"))}`,
    source: "Wikimedia Commons"
  };
}

async function fetchJpeg(imageUrl) {
  const response = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 20000,
    maxContentLength: MAX_IMAGE_BYTES,
    maxBodyLength: MAX_IMAGE_BYTES,
    maxRedirects: 5,
    headers: { Accept: "image/jpeg,image/png,image/webp,image/*;q=0.8" }
  });
  const input = Buffer.from(response.data);
  if (!input.length || input.length > MAX_IMAGE_BYTES) throw new Error("Image vide ou trop volumineuse.");
  // Jimp decodes common image types then re-encodes the attachment as a true JPEG.
  const image = await Jimp.read(input);
  return image.quality(88).getBufferAsync(Jimp.MIME_JPEG);
}

module.exports = {
  config: {
    name: "image",
    version: "4.0.0",
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

    let imageStream;
    try {
      let result = null;
      let jpeg = null;
      let pinterestError = null;
      if (process.env.PINTEREST_ACCESS_TOKEN) {
        try {
          result = await searchPinterest(query);
          if (result) jpeg = await fetchJpeg(result.url);
          else pinterestError = new Error("Pinterest n’a renvoyé aucune image exploitable.");
        } catch (error) {
          pinterestError = error;
          result = null;
          console.warn("[Commande image] Recherche Pinterest indisponible, essai Wikimedia :", error.response?.status || error.message);
        }
      }

      if (!result || !jpeg) {
        result = await searchWikimedia(query);
        if (result && !process.env.PINTEREST_ACCESS_TOKEN) result.notice = "Pinterest nécessite un jeton OAuth et l’accès à l’API bêta; résultat de secours affiché.";
        if (result && pinterestError) result.notice = "La recherche Pinterest a échoué ou n’est pas autorisée pour cette application; résultat de secours affiché.";
        if (result) jpeg = await fetchJpeg(result.url);
      }
      if (!result) {
        return send({ api, message, event }, `🔎 Aucune image trouvée pour « ${query} ». Essaie un autre mot-clé.`);
      }

      if (!jpeg || !jpeg.length) throw new Error("Conversion JPEG vide.");
      imageStream = Readable.from([jpeg]);
      imageStream.path = `image-${Date.now()}.jpg`;
      const lines = [`🖼️ Résultat pour « ${query} »`, `📌 ${String(result.title).slice(0, 180)}`, `📷 Source : ${result.source}`];
      if (result.notice) lines.push(`ℹ️ ${result.notice}`);
      if (result.pageUrl) lines.push(`🔗 ${result.pageUrl}`);
      return await api.sendMessage({ body: lines.join("\n"), attachment: imageStream }, event.threadID);
    } catch (error) {
      if (imageStream && !imageStream.destroyed) imageStream.destroy();
      console.error("[Commande image]", error.stack || error);
      return send({ api, message, event }, "❌ Impossible de trouver, convertir ou envoyer cette image. Vérifie le jeton/accès Pinterest, puis réessaie.");
    }
  }
};

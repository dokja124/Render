const axios = require("axios");
const { send } = require("./lib/messenger");

function extensionForMime(mime) {
  const map = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  return map[String(mime || "").split(";")[0].toLowerCase()] || "jpg";
}

module.exports = {
  config: {
    name: "image",
    version: "2.0.0",
    author: "Diwate",
    description: "Recherche et envoie une image depuis Wikimedia Commons",
    category: "Médias",
    usages: "image <sujet>",
    role: 0
  },

  onStart: async function ({ api, message, event, args, prefix }) {
    let stream;
    try {
      const query = args.join(" ").trim();
      if (!query) {
        return send({ api, message, event }, `🖼️ Utilisation : ${prefix || "!"}image <sujet>\nExemple : ${prefix || "!"}image Naruto`);
      }

      const { data } = await axios.get("https://commons.wikimedia.org/w/api.php", {
        params: {
          action: "query",
          generator: "search",
          gsrsearch: query,
          gsrnamespace: 6,
          gsrlimit: 10,
          prop: "imageinfo",
          iiprop: "url|mime",
          iiurlwidth: 1200,
          format: "json"
        },
        headers: { "User-Agent": "MessengerCommandBot/1.0 (image search)" },
        timeout: 15000
      });
      const pages = Object.values(data && data.query && data.query.pages || {});
      const result = pages.find(page => {
        const info = page.imageinfo && page.imageinfo[0];
        return info && /^image\/(jpeg|png|webp|gif)$/i.test(info.mime || "");
      });
      if (!result) {
        return send({ api, message, event }, `🔎 Aucune image exploitable trouvée pour « ${query} ». Essaie un autre mot-clé.`);
      }

      const imageInfo = result.imageinfo[0];
      const imageUrl = imageInfo.thumburl || imageInfo.url;
      const response = await axios.get(imageUrl, { responseType: "stream", timeout: 20000, maxRedirects: 5 });
      stream = response.data;
      stream.path = `image.${extensionForMime(imageInfo.mime)}`;
      const title = String(result.title || "Image").replace(/^File:/i, "").replace(/_/g, " ");
      const pageUrl = `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(result.title || "").replace(/ /g, "_"))}`;
      await send({ api, message, event }, {
        body: `🖼️ Résultat pour « ${query} »\n📌 ${title}\n🔗 Source : ${pageUrl}`,
        attachment: stream
      });
    } catch (error) {
      if (stream && typeof stream.destroy === "function" && !stream.destroyed) stream.destroy();
      console.error("[Commande image]", error.message);
      const query = args.join(" ").trim();
      const link = `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(query)}&title=Special:MediaSearch&type=image`;
      return send({ api, message, event }, `❌ La recherche ou l’envoi de l’image a échoué. Tu peux consulter les résultats ici :\n${link}`);
    }
  }
};

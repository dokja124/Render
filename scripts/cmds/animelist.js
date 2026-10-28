const axios = require("axios");
const { send } = require("./lib/messenger");

module.exports = {
  config: {
    name: "animelist", version: "2.1.0", author: "Diwate",
    description: "Recherche des informations sur un anime",
    category: "Anime", usages: "animelist <nom>", role: 0
  },
  onStart: async function ({ api, message, event, args, prefix }) {
    try {
      const query = args.join(" ").trim();
      if (!query) return send({ api, message, event }, `🔎 Utilisation : ${prefix || "!"}animelist <nom de l’anime>`);
      const { data } = await axios.get("https://kitsu.io/api/edge/anime", {
        params: { "filter[text]": query, "page[limit]": 5 },
        headers: { Accept: "application/vnd.api+json", "User-Agent": "MessengerAnimeBot/2.1" },
        timeout: 15000
      });
      const results = Array.isArray(data && data.data) ? data.data : [];
      if (!results.length) return send({ api, message, event }, `🎌 Aucun anime trouvé pour « ${query} ».`);
      const body = results.map((item, index) => {
        const anime = item.attributes || {};
        const title = anime.canonicalTitle || (anime.titles && (anime.titles.en_jp || anime.titles.en)) || "Sans titre";
        const score = anime.averageRating == null ? "non notée" : `${anime.averageRating}/100`;
        const episodes = anime.episodeCount == null ? "inconnus" : anime.episodeCount;
        const status = anime.status || "inconnu";
        const url = `https://kitsu.io/anime/${encodeURIComponent(item.id)}`;
        return `${index + 1}. ${title}\n⭐ Note : ${score}\n📺 Épisodes : ${episodes}\n📌 Statut : ${status}\n🔗 ${url}`;
      }).join("\n\n");
      return send({ api, message, event }, `🎌 RÉSULTATS POUR « ${query} »\n\n${body}`);
    } catch (error) {
      console.error("[Commande animelist]", error.message);
      return send({ api, message, event }, "❌ La recherche anime est indisponible. Réessaie dans quelques instants.");
    }
  }
};

module.exports = {
  config: {
    name: "animelist",
    version: "1.0.0-messenger",
    author: "Diwate",
    description: "Recherche des informations sur un anime",
    category: "Anime",
    usages: "animelist",
    role: 0
  },
  langs: {
    fr: {
      error: "Une erreur est survenue pendant l’exécution de la commande."
    }
  },
  onStart: async function ({ api, message, event, args, prefix }) {
    try {
      const query = args.join(" ").trim();
    if (!query) return message.reply(`🔎 ${prefix}animelist <nom de l'anime>`);
    const { data } = await require("axios").get("https://api.jikan.moe/v4/anime", { params: { q: query, limit: 5 }, timeout: 12000 });
    const list = data.data || [];
    if (!list.length) return message.reply("Aucun anime trouvé.");
    return message.reply("🎌 Résultats :\n\n" + list.map((a, i) => `${i+1}. ${a.title}\n⭐ Note : ${a.score ?? "inconnue"}\n📺 Épisodes : ${a.episodes ?? "inconnus"}\n🔗 ${a.url}`).join("\n\n"));
    } catch (error) {
      console.error("[Commande animelist]", error);
      return message.reply("❌ Une erreur est survenue. Réessaie plus tard.");
    }
  }
};

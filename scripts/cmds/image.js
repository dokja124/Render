module.exports = {
  config: {
    name: "image",
    version: "1.0.0-messenger",
    author: "Diwate",
    description: "Recherche des images",
    category: "Médias",
    usages: "image",
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
    if (!query) return message.reply(`🖼️ ${prefix}image <sujet>\nExemple : ${prefix}image Naruto`);
    const q = encodeURIComponent(query);
    return message.reply(`🖼️ Recherche d’images pour « ${query} » :\nhttps://www.google.com/search?tbm=isch&q=${q}`);
    } catch (error) {
      console.error("[Commande image]", error);
      return message.reply("❌ Une erreur est survenue. Réessaie plus tard.");
    }
  }
};

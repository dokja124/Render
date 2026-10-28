module.exports = {
  config: {
    name: "animestats",
    version: "1.0.0-messenger",
    author: "Diwate",
    description: "Statistiques du quiz anime",
    category: "Anime",
    usages: "animestats",
    role: 0
  },
  langs: {
    fr: {
      error: "Une erreur est survenue pendant l’exécution de la commande."
    }
  },
  onStart: async function ({ api, message, event, args, prefix }) {
    try {
      return message.reply("📊 Les statistiques du quiz anime seront disponibles après le portage du système de quiz WhatsApp vers Messenger. Cette commande ne modifie aucune donnée.");
    } catch (error) {
      console.error("[Commande animestats]", error);
      return message.reply("❌ Une erreur est survenue. Réessaie plus tard.");
    }
  }
};

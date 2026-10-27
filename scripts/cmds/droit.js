module.exports = {
  config: {
    name: "droit",
    version: "1.0.0-messenger",
    author: "Diwate",
    description: "Affiche les droits",
    category: "Administration",
    usages: "droit",
    role: 0
  },
  langs: {
    fr: {
      error: "Une erreur est survenue pendant l’exécution de la commande."
    }
  },
  onStart: async function ({ api, message, event, args, prefix }) {
    try {
      return message.reply("🔐 Les droits disponibles dépendent des autorisations accordées au bot dans cette conversation Messenger. Vérifie les permissions dans les paramètres de la page.");
    } catch (error) {
      console.error("[Commande droit]", error);
      return message.reply("❌ Une erreur est survenue. Réessaie plus tard.");
    }
  }
};

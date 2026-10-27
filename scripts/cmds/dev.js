module.exports = {
  config: {
    name: "dev",
    version: "1.0.0-messenger",
    author: "Diwate",
    description: "Informations du développeur",
    category: "Général",
    usages: "dev",
    role: 0
  },
  langs: {
    fr: {
      error: "Une erreur est survenue pendant l’exécution de la commande."
    }
  },
  onStart: async function ({ api, message, event, args, prefix }) {
    try {
      return message.reply("👨‍💻 Bot Diwate — version adaptée à Messenger. Pour les informations du développeur, consulte le fichier README du projet.");
    } catch (error) {
      console.error("[Commande dev]", error);
      return message.reply("❌ Une erreur est survenue. Réessaie plus tard.");
    }
  }
};

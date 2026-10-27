module.exports = {
  config: {
    name: "alive",
    version: "1.0.0-messenger",
    author: "Diwate",
    description: "Affiche le temps de fonctionnement du bot",
    category: "Général",
    usages: "alive",
    role: 0
  },
  langs: {
    fr: {
      error: "Une erreur est survenue pendant l’exécution de la commande."
    }
  },
  onStart: async function ({ api, message, event, args, prefix }) {
    try {
      const s = Math.floor(process.uptime());
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return message.reply(`💚 Le bot est en ligne.\n⏳ Fonctionnement : ${h} h ${m} min ${sec} s`);
    } catch (error) {
      console.error("[Commande alive]", error);
      return message.reply("❌ Une erreur est survenue. Réessaie plus tard.");
    }
  }
};

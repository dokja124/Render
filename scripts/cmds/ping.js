module.exports = {
  config: {
    name: "ping",
    version: "1.0.0-messenger",
    author: "Diwate",
    description: "Vérifie la latence",
    category: "Général",
    usages: "ping",
    role: 0
  },
  langs: {
    fr: {
      error: "Une erreur est survenue pendant l’exécution de la commande."
    }
  },
  onStart: async function ({ api, message, event, args, prefix }) {
    try {
      const start = Date.now();
    await message.reply("🏓 Calcul de la latence…");
    const latency = Date.now() - start;
    return message.reply(`🏓 Pong !\n⚡ Temps de réponse : environ ${latency} ms`);
    } catch (error) {
      console.error("[Commande ping]", error);
      return message.reply("❌ Une erreur est survenue. Réessaie plus tard.");
    }
  }
};

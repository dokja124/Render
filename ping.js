const { send } = require("./lib/messenger");

module.exports = {
  config: {
    name: "ping", version: "2.0.0", author: "Diwate",
    description: "Mesure le temps de réponse Messenger",
    category: "Général", usages: "ping", role: 0
  },
  onStart: async function ({ api, message, event }) {
    const started = Date.now();
    try {
      await send({ api, message, event }, "🏓 Mesure du temps de réponse…");
      const elapsed = Date.now() - started;
      return send({ api, message, event }, `🏓 Pong !\n⚡ Temps de réponse du premier envoi : ${elapsed} ms`);
    } catch (error) {
      console.error("[Commande ping]", error);
      return send({ api, message, event }, "❌ Messenger n’a pas confirmé l’envoi. Vérifie la connexion du bot.");
    }
  }
};

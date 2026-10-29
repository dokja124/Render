const { send } = require("./lib/messenger");
const offCommand = require("./off");

module.exports = {
  config: {
    name: "on",
    version: "1.0.0",
    author: "Diwate",
    description: "Désactive le mode maintenance et réactive les commandes",
    category: "Administration",
    usages: "on",
    role: 0
  },

  // Appelle aussi l’installation du garde si on.js est chargé avant off.js.
  onLoad: offCommand._installGuard,

  onStart: async function ({ api, message, event, globalData }) {
    if (!offCommand._isOwner(event)) {
      return send({ api, message, event }, "⛔ Seul le propriétaire du bot peut utiliser cette commande.");
    }
    try {
      const current = await offCommand._getMode(globalData);
      if (!current.off) return send({ api, message, event }, "ℹ️ Le bot est déjà actif.");
      await offCommand._setMode(globalData, false, event.senderID || event.userID || event.author);
      return send({ api, message, event }, "🟢 Mode maintenance désactivé : toutes les commandes sont de nouveau actives.");
    } catch (error) {
      console.error("[Commande on] Échec :", error.stack || error);
      return send({ api, message, event }, "❌ Impossible de réactiver le bot : le stockage persistant du bot est indisponible.");
    }
  }
};

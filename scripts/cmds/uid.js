const { send } = require("./lib/messenger");

function getFacebookID(event) {
  const candidates = event && [event.senderID, event.userID, event.author];
  if (!candidates) return "";
  for (const value of candidates) {
    if (value == null) continue;
    const id = String(value).trim();
    if (/^\d{5,25}$/.test(id)) return id;
  }
  return "";
}

module.exports = {
  config: {
    name: "uid",
    version: "1.0.0",
    author: "Diwate",
    description: "Affiche ton identifiant numérique Facebook Messenger",
    category: "Outils",
    usages: "uid",
    role: 0
  },
  getFacebookID,

  onStart: async function ({ api, message, event }) {
    const uid = getFacebookID(event);
    if (!uid) {
      return send({ api, message, event }, "❌ Je n’arrive pas à lire ton identifiant Facebook dans cet événement. Réessaie dans la conversation où le bot est actif.");
    }
    return send({ api, message, event }, `🆔 Ton ID Facebook Messenger est : ${uid}`);
  }
};
    

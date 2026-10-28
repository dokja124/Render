const { send } = require("./lib/messenger");

function normalizeID(value) {
  if (value && typeof value === "object") return String(value.id || value.userID || value.uid || "");
  return String(value || "");
}

module.exports = {
  config: {
    name: "droit",
    version: "2.0.0",
    author: "Diwate",
    description: "Vérifie le rôle et les droits dans cette conversation",
    category: "Administration",
    usages: "droit",
    role: 0
  },

  onStart: async function ({ api, message, event, role }) {
    try {
      const senderID = normalizeID(event && event.senderID);
      const roleNumber = Number(role);
      const roleLabel = roleNumber >= 2 ? "Administrateur du bot" : roleNumber === 1 ? "Administrateur du groupe" : "Membre";
      let threadInfo = null;
      let botID = "";

      if (api && typeof api.getCurrentUserID === "function") botID = normalizeID(api.getCurrentUserID());
      if (event && event.threadID && api && typeof api.getThreadInfo === "function") {
        threadInfo = await api.getThreadInfo(event.threadID);
      }

      const admins = Array.isArray(threadInfo && threadInfo.adminIDs)
        ? threadInfo.adminIDs.map(normalizeID).filter(Boolean)
        : [];
      const isGroupAdmin = Boolean(senderID && admins.includes(senderID));
      const botIsGroupAdmin = Boolean(botID && admins.includes(botID));
      const isGroup = Boolean(threadInfo && (threadInfo.isGroup || threadInfo.threadType === 2));
      const lines = [
        "🔐 VÉRIFICATION DES DROITS",
        `👤 Ton ID : ${senderID || "indisponible"}`,
        `🛡️ Rôle bot : ${roleLabel} (niveau ${Number.isFinite(roleNumber) ? roleNumber : 0})`
      ];

      if (isGroup) {
        lines.push(
          `👑 Administrateur de ce groupe : ${isGroupAdmin ? "oui" : "non"}`,
          `🤖 Le bot est administrateur du groupe : ${botIsGroupAdmin ? "oui" : "non"}`
        );
      } else {
        lines.push("ℹ️ Cette conversation n’est pas un groupe Messenger.");
      }
      lines.push("", "Niveaux de commande : 0 = tous, 1 = admins du groupe, 2 = admins du bot.");
      return send({ api, message, event }, lines.join("\n"));
    } catch (error) {
      console.error("[Commande droit]", error);
      return send({ api, message, event }, "❌ Impossible de lire les droits de cette conversation. Vérifie que le bot peut accéder aux informations du groupe.");
    }
  }
};

const { send } = require("./lib/messenger");

function normalizeIDs(values) {
  if (!Array.isArray(values)) return [];
  return values.map(value => {
    if (value == null) return "";
    if (typeof value === "object") return String(value.id || value.userID || value.user_id || "");
    return String(value);
  }).filter(Boolean);
}

function getReplyTarget(event) {
  const reply = event && (event.messageReply || event.repliedMessage || event.replyToMessage);
  const id = reply && (reply.senderID || reply.senderId || reply.userID || reply.author);
  return id ? { id: String(id), name: reply.senderName || reply.name || null } : null;
}

function getMemberName(threadInfo, target) {
  if (target.name) return String(target.name).slice(0, 60);
  const member = Array.isArray(threadInfo.userInfo)
    ? threadInfo.userInfo.find(user => String(user.id || user.userID) === target.id)
    : null;
  return member && (member.name || member.firstName) || "ce membre";
}

module.exports = {
  config: {
    name: "denomme",
    version: "1.0.0",
    author: "Diwate",
    description: "Retire le rôle administrateur au membre dont tu cites le message",
    category: "Groupe",
    usages: "Réponds au message d’un administrateur avec !denomme",
    role: 0
  },
  normalizeIDs,
  getReplyTarget,

  onStart: async function ({ api, message, event }) {
    try {
      const threadID = String(event && event.threadID || "");
      const callerID = String(event && (event.senderID || event.userID || event.author) || "");
      const target = getReplyTarget(event);
      if (!threadID || !callerID) return send({ api, message, event }, "❌ Impossible d’identifier le groupe ou la personne qui lance la commande.");
      if (!target) return send({ api, message, event }, "↩️ Réponds au message de la personne à dénommer, puis écris !denomme.");
      if (!api || typeof api.getThreadInfo !== "function" || typeof api.changeAdminStatus !== "function") {
        return send({ api, message, event }, "❌ L’API de gestion des administrateurs n’est pas disponible dans cette version du bot.");
      }

      const threadInfo = await api.getThreadInfo(threadID);
      if (!threadInfo || threadInfo.isGroup !== true) {
        return send({ api, message, event }, "⛔ Cette commande fonctionne uniquement dans un groupe Messenger.");
      }
      const adminIDs = normalizeIDs(threadInfo.adminIDs);
      const participantIDs = normalizeIDs(threadInfo.participantIDs);
      if (!participantIDs.includes(target.id)) return send({ api, message, event }, "❌ La personne visée n’est pas membre de ce groupe.");
      if (!adminIDs.includes(callerID)) return send({ api, message, event }, "⛔ Seuls les administrateurs du groupe peuvent retirer un rôle administrateur.");

      const botID = api && typeof api.getCurrentUserID === "function" ? String(api.getCurrentUserID() || "") : "";
      if (botID && !adminIDs.includes(botID)) {
        return send({ api, message, event }, "⛔ Le compte Messenger du bot doit lui-même être administrateur du groupe pour modifier les rôles.");
      }
      if (!adminIDs.includes(target.id)) return send({ api, message, event }, `ℹ️ ${getMemberName(threadInfo, target)} n’est pas administrateur du groupe.`);
      if (botID && target.id === botID) {
        return send({ api, message, event }, "🛡️ Je ne peux pas retirer le rôle administrateur du compte du bot, sinon je ne pourrais plus gérer les rôles.");
      }
      if (adminIDs.length <= 1) {
        return send({ api, message, event }, "🛡️ Impossible de retirer le dernier administrateur. Nomme d’abord un autre admin avec !nomme.");
      }

      await api.changeAdminStatus(threadID, [target.id], false);
      return send({ api, message, event }, `✅ Le rôle administrateur a été retiré à ${getMemberName(threadInfo, target)}.`);
    } catch (error) {
      console.error("[Commande denomme]", error.stack || error);
      const detail = String(error && (error.message || error.error) || "").toLowerCase();
      if (detail.includes("not an admin") || detail.includes("1976004")) {
        return send({ api, message, event }, "⛔ Facebook a refusé l’action : vérifie que le compte du bot est administrateur du groupe.");
      }
      if (detail.includes("not a group") || detail.includes("1357031")) {
        return send({ api, message, event }, "⛔ Cette action est réservée aux conversations de groupe Messenger.");
      }
      return send({ api, message, event }, "❌ Impossible de retirer le rôle administrateur. Vérifie les droits du bot et réessaie.");
    }
  }
};
                    

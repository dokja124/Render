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
    name: "nomme",
    version: "1.0.0",
    author: "Diwate",
    description: "Nomme administrateur le membre dont tu cites le message",
    category: "Groupe",
    usages: "Réponds au message du membre (ou au tien) avec !nomme",
    role: 0
  },
  normalizeIDs,
  getReplyTarget,

  onStart: async function ({ api, message, event, role }) {
    try {
      const threadID = String(event && event.threadID || "");
      const callerID = String(event && (event.senderID || event.userID || event.author) || "");
      const target = getReplyTarget(event);
      if (!threadID || !callerID) return send({ api, message, event }, "❌ Impossible d’identifier le groupe ou la personne qui lance la commande.");
      if (!target) return send({ api, message, event }, "↩️ Réponds au message de la personne à nommer, puis écris !nomme.");
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
      const isSelfTarget = target.id === callerID;
      const isGlobalBotAdmin = Number(role) === 2;
      if (!adminIDs.includes(callerID) && !(isSelfTarget && isGlobalBotAdmin)) {
        const reason = isSelfTarget
          ? "⛔ Pour te nommer toi-même, tu dois être administrateur global du bot (rôle 2)."
          : "⛔ Seuls les administrateurs du groupe peuvent nommer un autre administrateur.";
        return send({ api, message, event }, reason);
      }

      const botID = api && typeof api.getCurrentUserID === "function" ? String(api.getCurrentUserID() || "") : "";
      if (botID && !adminIDs.includes(botID)) {
        return send({ api, message, event }, "⛔ Le compte Messenger du bot doit lui-même être administrateur du groupe pour modifier les rôles.");
      }
      if (adminIDs.includes(target.id)) return send({ api, message, event }, `ℹ️ ${getMemberName(threadInfo, target)} est déjà administrateur du groupe.`);

      await api.changeAdminStatus(threadID, [target.id], true);
      return send({ api, message, event }, `✅👑 ${getMemberName(threadInfo, target)} est maintenant administrateur du groupe.`);
    } catch (error) {
      console.error("[Commande nomme]", error.stack || error);
      const detail = String(error && (error.message || error.error) || "").toLowerCase();
      if (detail.includes("not an admin") || detail.includes("1976004")) {
        return send({ api, message, event }, "⛔ Facebook a refusé l’action : vérifie que le compte du bot est administrateur du groupe.");
      }
      if (detail.includes("not a group") || detail.includes("1357031")) {
        return send({ api, message, event }, "⛔ Cette action est réservée aux conversations de groupe Messenger.");
      }
      return send({ api, message, event }, "❌ Impossible de nommer cette personne administrateur. Vérifie les droits du bot et réessaie.");
    }
  }
};
      

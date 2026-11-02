"use strict";

const { send } = require("./lib/messenger");
const removalInProgress = new Set();

function normalizeID(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    return String(value.id || value.userID || value.userId || value.user_id || value.senderID || "").trim();
  }
  return String(value).trim();
}

function normalizeIDs(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(normalizeID).filter(Boolean))];
}

function getReplyTarget(event) {
  const reply = event && (event.messageReply || event.repliedMessage || event.replyToMessage);
  if (!reply) return null;
  const id = normalizeID(reply.senderID || reply.senderId || reply.userID || reply.userId || reply.user_id || reply.author || (reply.sender && reply.sender.id));
  if (!id) return null;
  const name = String(reply.senderName || reply.name || (reply.sender && reply.sender.name) || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return { id, name };
}

function getParticipants(threadInfo) {
  if (threadInfo && Array.isArray(threadInfo.participantIDs)) {
    return normalizeIDs(threadInfo.participantIDs);
  }
  if (threadInfo && Array.isArray(threadInfo.userInfo)) {
    return normalizeIDs(threadInfo.userInfo.map(user => user && (user.id || user.userID || user.userId)));
  }
  if (threadInfo && Array.isArray(threadInfo.members)) {
    return normalizeIDs(threadInfo.members.map(member => member && (member.userID || member.userId || member.id)));
  }
  return null;
}

function getMemberName(threadInfo, target) {
  if (target.name) return target.name;
  const userInfo = threadInfo && Array.isArray(threadInfo.userInfo) ? threadInfo.userInfo : [];
  const member = userInfo.find(user => normalizeID(user && (user.id || user.userID || user.userId)) === target.id);
  const name = String(member && (member.name || member.firstName) || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return name ? name.slice(0, 60) : "ce membre";
}

function getUsagePrefix(context = {}) {
  if (context.prefix) return String(context.prefix);
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  return String(config.prefix || "!");
}

function explainError(error, adminDemoted, adminRestored = false, adminRestoreFailed = false) {
  const detail = String(error && (error.code || error.message || error.error) || "").toLowerCase();
  if (adminRestored) {
    return "❌ L’expulsion a échoué, mais le statut administrateur a été rétabli. La personne est toujours dans le groupe.";
  }
  if (adminDemoted && adminRestoreFailed) {
    return "⚠️ L’expulsion a échoué et le statut administrateur n’a pas pu être rétabli. Vérifie le groupe et restaure ce statut manuellement si la personne y est encore.";
  }
  if (adminDemoted) {
    return "⚠️ Le statut administrateur a été retiré, mais l’expulsion a échoué. Vérifie les droits du bot et rétablis le statut de cette personne si elle est toujours dans le groupe.";
  }
  if (detail.includes("not an admin") || detail.includes("1976004") || detail.includes("permission")) {
    return "⛔ Facebook a refusé l’action. Vérifie que le compte du bot est administrateur du groupe et qu’il peut gérer les membres.";
  }
  if (detail.includes("not a group") || detail.includes("1357031")) {
    return "⛔ Cette action fonctionne uniquement dans un groupe Messenger.";
  }
  if (detail.includes("cannot remove") || detail.includes("cannot kick")) {
    return "❌ Messenger a refusé le retrait. Vérifie que la personne est toujours dans le groupe et que le bot a les permissions nécessaires.";
  }
  return "❌ Impossible de retirer cette personne. Vérifie les droits du bot et réessaie.";
}

async function handleSuprime(context = {}) {
  const { api, message, event } = context;
  const threadID = normalizeID(event && event.threadID);
  const callerID = normalizeID(event && (event.senderID || event.senderId || event.userID || event.author));

  if (!threadID || !callerID) {
    return send({ api, message, event }, "❌ Je ne peux pas identifier le groupe ou la personne qui lance la commande.");
  }
  const target = getReplyTarget(event);
  if (!target) {
    return send({ api, message, event }, `↩️ Réponds au message de la personne à retirer, puis écris ${getUsagePrefix(context)}suprime.`);
  }
  if (target.id === callerID) {
    return send({ api, message, event }, "⛔ Tu ne peux pas utiliser cette commande pour te retirer toi-même du groupe.");
  }
  if (!api || typeof api.getThreadInfo !== "function" || typeof api.removeUserFromGroup !== "function") {
    return send({ api, message, event }, "❌ L’API de gestion du groupe n’est pas disponible; aucune personne n’a été retirée.");
  }

  const lockKey = `${threadID}:${target.id}`;
  if (removalInProgress.has(lockKey)) {
    return send({ api, message, event }, "⏳ Le retrait de cette personne est déjà en cours.");
  }
  removalInProgress.add(lockKey);

  let adminDemoted = false;
  let adminRestored = false;
  let adminRestoreFailed = false;
  try {
    const threadInfo = await api.getThreadInfo(threadID);
    if (!threadInfo || threadInfo.isGroup !== true) {
      return send({ api, message, event }, "⛔ Cette commande fonctionne uniquement dans un groupe Messenger.");
    }

    const adminIDs = normalizeIDs(threadInfo.adminIDs);
    if (!adminIDs.includes(callerID)) {
      return send({ api, message, event }, `⛔ Seuls les administrateurs de ce groupe peuvent utiliser ${getUsagePrefix(context)}suprime.`);
    }

    const botID = typeof api.getCurrentUserID === "function" ? normalizeID(api.getCurrentUserID()) : "";
    if (!botID || !adminIDs.includes(botID)) {
      return send({ api, message, event }, "⛔ Le compte du bot doit lui-même être administrateur du groupe pour retirer une personne.");
    }
    if (target.id === botID) {
      return send({ api, message, event }, "⛔ Je ne peux pas me retirer moi-même du groupe.");
    }

    const participants = getParticipants(threadInfo);
    if (!participants) {
      return send({ api, message, event }, "⚠️ Je ne peux pas vérifier les membres du groupe; aucune action n’a été effectuée.");
    }
    if (!participants.includes(target.id)) {
      return send({ api, message, event }, "ℹ️ La personne citée n’est plus membre de ce groupe.");
    }

    const memberName = getMemberName(threadInfo, target);
    if (adminIDs.includes(target.id)) {
      if (typeof api.changeAdminStatus !== "function") {
        return send({ api, message, event }, "⚠️ La personne citée est administratrice, mais l’API ne permet pas de lui retirer ce statut; elle n’a pas été expulsée.");
      }
      try {
        await api.changeAdminStatus(threadID, [target.id], false);
        adminDemoted = true;
      } catch (error) {
        console.warn("[Commande suprime] Rétrogradation de l’administrateur refusée :", String(error && (error.code || error.message) || "erreur inconnue").slice(0, 140));
        return send({ api, message, event }, "❌ Je n’ai pas pu retirer le statut administrateur; la personne n’a pas été expulsée.");
      }
    }

    try {
      await api.removeUserFromGroup(target.id, threadID);
    } catch (error) {
      if (adminDemoted && typeof api.changeAdminStatus === "function") {
        try {
          await api.changeAdminStatus(threadID, [target.id], true);
          adminRestored = true;
        } catch (restoreError) {
          adminRestoreFailed = true;
          console.warn("[Commande suprime] Rétablissement du statut admin impossible :", String(restoreError && (restoreError.code || restoreError.message) || "erreur inconnue").slice(0, 140));
        }
      }
      throw error;
    }
    const success = adminDemoted
      ? `✅👑 ${memberName} a perdu son statut administrateur et a été retiré du groupe.`
      : `✅ ${memberName} a été retiré du groupe.`;
    return send({ api, message, event }, success);
  } catch (error) {
    console.error("[Commande suprime] Échec :", String(error && (error.code || error.message) || "erreur inconnue").slice(0, 180));
    return send({ api, message, event }, explainError(error, adminDemoted, adminRestored, adminRestoreFailed));
  } finally {
    removalInProgress.delete(lockKey);
  }
}

module.exports = {
  config: {
    name: "suprime",
    version: "1.0.0",
    author: "Diwate",
    description: "Retire du groupe la personne dont l’administrateur cite le message",
    category: "Groupe",
    usages: "Réponds au message de la personne, puis écris suprime",
    role: 0
  },
  normalizeIDs,
  getReplyTarget,
  getParticipants,
  getMemberName,
  explainError,
  handleSuprime,
  onStart: async function (context) {
    return handleSuprime(context);
  }
};

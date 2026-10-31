"use strict";

const crypto = require("crypto");
const { send } = require("./lib/messenger");

const STORAGE_PATH = "data.antiSpam";
const REPEAT_LIMIT = 4; // Le 4e envoi identique déclenche l’action : plus de 3 envois.
const WINDOW_MS = 10 * 1000;
const MAX_TRACKED_KEYS = 5000;
const repeatHistory = new Map();
const removalInProgress = new Set();

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

function normalizeIDs(values) {
  if (!Array.isArray(values)) return [];
  return values.map(value => {
    if (value == null) return "";
    if (typeof value === "object") return String(value.id || value.userID || value.user_id || "");
    return String(value);
  }).filter(Boolean);
}

function getSenderID(event) {
  const id = event && (event.senderID || event.userID || event.author);
  return id == null ? "" : String(id);
}

function getRepeatKey(threadID, senderID, body) {
  const normalizedBody = normalize(body);
  if (!threadID || !senderID || !normalizedBody) return null;
  const bodyHash = crypto.createHash("sha256").update(normalizedBody, "utf8").digest("hex");
  return `${String(threadID)}:${String(senderID)}:${bodyHash}`;
}

function recordOccurrence(key, now = Date.now(), history = repeatHistory) {
  if (!key) return { count: 0, triggered: false };
  const recent = (history.get(key) || []).filter(timestamp => now - timestamp < WINDOW_MS);
  recent.push(now);
  history.delete(key);
  history.set(key, recent);
  while (history.size > MAX_TRACKED_KEYS) history.delete(history.keys().next().value);
  return { count: recent.length, triggered: recent.length >= REPEAT_LIMIT };
}

async function getEnabled(threadsData, threadID) {
  if (!threadsData || typeof threadsData.get !== "function") {
    throw new Error("Le stockage des paramètres de groupe n’est pas disponible.");
  }
  return (await threadsData.get(String(threadID), STORAGE_PATH, false)) === true;
}

async function setEnabled(threadsData, threadID, enabled) {
  if (!threadsData || typeof threadsData.set !== "function") {
    throw new Error("Le stockage des paramètres de groupe n’est pas disponible.");
  }
  await threadsData.set(String(threadID), Boolean(enabled), STORAGE_PATH);
  return Boolean(enabled);
}

function getMemberName(threadInfo, event, senderID, usersData) {
  const eventName = event && (event.senderName || event.userName || event.name);
  if (eventName && String(eventName).trim()) return String(eventName).trim().slice(0, 60);
  const member = Array.isArray(threadInfo && threadInfo.userInfo)
    ? threadInfo.userInfo.find(user => String(user.id || user.userID || user.user_id || "") === senderID)
    : null;
  if (member && (member.name || member.fullName || member.firstName)) {
    return String(member.name || member.fullName || member.firstName).trim().slice(0, 60);
  }
  return usersData && typeof usersData.getName === "function"
    ? Promise.resolve().then(() => usersData.getName(senderID)).then(name => String(name || "un membre").slice(0, 60)).catch(() => "un membre")
    : "un membre";
}

function isControlCommand(body, prefix) {
  const commandPrefix = String(prefix || "!");
  const escapedPrefix = commandPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*${escapedPrefix}\\s*anti-spam(?:\\s|$)`, "i").test(String(body || ""));
}

async function sendText(context, text) {
  try {
    return await send(context, text);
  } catch (error) {
    console.warn("[Anti-spam] Échec de l’envoi d’un avis Messenger :", String(error && error.message || "erreur inconnue").slice(0, 120));
    return null;
  }
}

async function removeSpammer(context, threadID, senderID) {
  const { api, event, usersData } = context;
  const lockKey = `${threadID}:${senderID}`;
  if (removalInProgress.has(lockKey)) return false;
  removalInProgress.add(lockKey);

  try {
    if (!api || typeof api.getThreadInfo !== "function" || typeof api.removeUserFromGroup !== "function") {
      await sendText(context, "⚠️ Anti-spam : l’API de gestion du groupe n’est pas disponible; aucun membre n’a été retiré.");
      return false;
    }

    const threadInfo = await api.getThreadInfo(threadID);
    if (!threadInfo || threadInfo.isGroup !== true) return false;

    const participantIDs = normalizeIDs(threadInfo.participantIDs);
    if (!participantIDs.includes(senderID)) return false;

    const adminIDs = normalizeIDs(threadInfo.adminIDs);
    // Le bot ne retire ni ses propres comptes ni les administrateurs du groupe.
    if (adminIDs.includes(senderID)) {
      await sendText(context, "ℹ️ Anti-spam : un administrateur du groupe a dépassé le seuil; il n’a pas été retiré automatiquement.");
      return false;
    }

    const botID = typeof api.getCurrentUserID === "function" ? String(api.getCurrentUserID() || "") : "";
    if (!botID || !adminIDs.includes(botID)) {
      await sendText(context, "⚠️ Anti-spam détecté, mais le compte du bot doit être administrateur du groupe pour retirer un membre.");
      return false;
    }

    const memberName = await getMemberName(threadInfo, event, senderID, usersData);
    await api.removeUserFromGroup(senderID, threadID);
    await sendText(context, `🛡️ Anti-spam : ${memberName} a été retiré du groupe après ${REPEAT_LIMIT} envois identiques en moins de ${WINDOW_MS / 1000} secondes.`);
    return true;
  } catch (error) {
    console.warn("[Anti-spam] Échec du retrait d’un membre :", String(error && (error.code || error.message) || "erreur inconnue").slice(0, 160));
    await sendText(context, "❌ Anti-spam : le retrait a échoué. Vérifie que le bot est toujours administrateur du groupe.");
    return false;
  } finally {
    removalInProgress.delete(lockKey);
  }
}

async function monitorMessage(context) {
  const { api, event, threadsData, prefix } = context;
  if (!event || event.isGroup !== true) return false;
  if (event.type && !["message", "message_reply"].includes(event.type)) return false;

  const threadID = String(event.threadID || "");
  const senderID = getSenderID(event);
  const body = typeof event.body === "string" ? event.body : "";
  if (!threadID || !senderID || !normalize(body) || isControlCommand(body, prefix)) return false;

  const botID = api && typeof api.getCurrentUserID === "function" ? String(api.getCurrentUserID() || "") : "";
  if (botID && senderID === botID) return false;

  let enabled;
  try {
    enabled = await getEnabled(threadsData, threadID);
  } catch (error) {
    console.warn("[Anti-spam] Impossible de lire le réglage du groupe :", String(error && error.message || "erreur inconnue").slice(0, 120));
    return false;
  }
  if (!enabled) return false;

  const key = getRepeatKey(threadID, senderID, body);
  const timestamp = Number.isFinite(context.now) ? context.now : Date.now();
  const result = recordOccurrence(key, timestamp);
  if (!result.triggered) return false;

  repeatHistory.delete(key);
  return removeSpammer(context, threadID, senderID);
}

module.exports = {
  config: {
    name: "anti-spam",
    version: "1.0.0",
    author: "Diwate",
    description: "Active ou désactive l’anti-spam pour un groupe Messenger",
    category: "Groupe",
    usages: "anti-spam oui | anti-spam non",
    role: 0
  },
  REPEAT_LIMIT,
  WINDOW_MS,
  STORAGE_PATH,
  normalize,
  normalizeIDs,
  getSenderID,
  getRepeatKey,
  recordOccurrence,
  isControlCommand,
  getEnabled,
  setEnabled,
  monitorMessage,
  removeSpammer,

  onChat: async function (context) {
    try {
      await monitorMessage(context || {});
    } catch (error) {
      console.error("[Anti-spam] Erreur du contrôle de message :", String(error && error.message || "erreur inconnue").slice(0, 160));
    }
  },

  onStart: async function ({ api, message, event, args, prefix, threadsData }) {
    try {
      const threadID = String(event && event.threadID || "");
      const senderID = getSenderID(event);
      if (!threadID || !senderID) return send({ api, message, event }, "❌ Impossible d’identifier le groupe ou l’administrateur.");

      const action = normalize(Array.isArray(args) ? args[0] : "");
      if (!["oui", "non", "on", "off", "activer", "desactiver", "disable", "enable"].includes(action)) {
        const active = await getEnabled(threadsData, threadID);
        const status = active ? "✅ activé" : "❌ désactivé";
        return send(
          { api, message, event },
          `╭━━━〔 🛡️ ANTI-SPAM 〕━━━╮\n📍 État dans ce groupe : ${status}\n⚠️ Au 4e envoi du même texte en moins de ${WINDOW_MS / 1000} secondes, le membre est retiré.\n✅ Activer : ${prefix || "!"}anti-spam oui\n🚫 Désactiver : ${prefix || "!"}anti-spam non\n╰━━━━━━━━━━━━━━━━━━━━━━╯`
        );
      }

      if (!api || typeof api.getThreadInfo !== "function") {
        return send({ api, message, event }, "❌ L’API ne permet pas de vérifier les droits du groupe.");
      }
      const threadInfo = await api.getThreadInfo(threadID);
      if (!threadInfo || threadInfo.isGroup !== true) {
        return send({ api, message, event }, "⛔ La commande anti-spam fonctionne uniquement dans un groupe Messenger.");
      }

      const adminIDs = normalizeIDs(threadInfo.adminIDs);
      if (!adminIDs.includes(senderID)) {
        return send({ api, message, event }, "⛔ Seuls les administrateurs du groupe peuvent activer ou désactiver l’anti-spam.");
      }

      const enable = ["oui", "on", "activer", "enable"].includes(action);
      if (enable) {
        const botID = typeof api.getCurrentUserID === "function" ? String(api.getCurrentUserID() || "") : "";
        if (!botID || !adminIDs.includes(botID)) {
          return send({ api, message, event }, "⛔ Pour activer l’anti-spam, le compte du bot doit d’abord être administrateur du groupe.");
        }
      }

      const oldState = await getEnabled(threadsData, threadID);
      if (oldState === enable) {
        return send({ api, message, event }, enable ? "ℹ️ L’anti-spam est déjà activé dans ce groupe." : "ℹ️ L’anti-spam est déjà désactivé dans ce groupe.");
      }
      await setEnabled(threadsData, threadID, enable);
      if (!enable) {
        for (const key of repeatHistory.keys()) {
          if (key.startsWith(`${threadID}:`)) repeatHistory.delete(key);
        }
      }
      const details = enable
        ? `✅🛡️ Anti-spam activé pour ce groupe. Un membre non-administrateur qui envoie le même texte ${REPEAT_LIMIT} fois en moins de ${WINDOW_MS / 1000} secondes sera retiré.`
        : "🚫 Anti-spam désactivé pour ce groupe. Aucun membre ne sera retiré pour des répétitions de message.";
      return send({ api, message, event }, details);
    } catch (error) {
      console.error("[Commande anti-spam]", String(error && error.message || "erreur inconnue").slice(0, 180));
      return send({ api, message, event }, "❌ Impossible de modifier l’anti-spam. Vérifie les droits du groupe et le stockage du bot.");
    }
  }
};

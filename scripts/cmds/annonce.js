"use strict";

const fs = require("fs");
const path = require("path");
const { send } = require("./lib/messenger");

const THREAD_LIST_LIMIT = 9999999;
const BROADCAST_DELAY_MS = 1500;
const MAX_ANNOUNCEMENT_CHARS = 1700;
const MAX_STYLED_MESSAGE_CHARS = 1900;
const MAX_REMEMBERED_MESSAGE_IDS = 500;
const ANNOUNCEMENT_IMAGE_NAME = "Diwate.jpg";

const processedMessageIDs = new Map();
let broadcastInProgress = false;

function normalizeID(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    return String(value.id || value.userID || value.userId || value.senderID || value.threadID || "").trim();
  }
  return String(value).trim();
}

function getOwnerIDs() {
  const configuredOwner = String(process.env.BOT_OWNER_ID || "").trim();
  if (configuredOwner) return [configuredOwner];
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  const configuredAdmins = Array.isArray(config.adminBot)
    ? config.adminBot
    : config.adminBot != null
      ? [config.adminBot]
      : [];
  return configuredAdmins.map(normalizeID).filter(Boolean);
}

function isOwner(event) {
  const senderID = normalizeID(event && (event.senderID || event.senderId || event.userID || event.author));
  return Boolean(senderID && getOwnerIDs().includes(senderID));
}

function getPrefixes(context = {}) {
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  const candidates = context.prefix != null && String(context.prefix).trim()
    ? [context.prefix]
    : [config.prefix];
  const prefixes = [];
  for (const candidate of candidates) {
    const values = Array.isArray(candidate) ? candidate : [candidate];
    for (const value of values) {
      const prefix = String(value || "").trim();
      if (prefix && !prefixes.includes(prefix)) prefixes.push(prefix);
    }
  }
  if (!prefixes.length) prefixes.push("!");
  return prefixes.sort((a, b) => b.length - a.length);
}

function cleanAnnouncement(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

function extractAnnouncement(context = {}) {
  const event = context.event || {};
  const body = String(event.body || event.message || "");
  if (body.trim()) {
    const firstToken = body.trimStart().split(/\s+/)[0] || "";
    for (const prefix of getPrefixes(context)) {
      if (!firstToken.startsWith(prefix)) continue;
      const withoutPrefix = body.trimStart().slice(prefix.length).trimStart();
      const match = withoutPrefix.match(/^annonce(?:\s+|$)([\s\S]*)$/i);
      if (match && cleanAnnouncement(match[1])) return cleanAnnouncement(match[1]);
      break;
    }
  }

  if (Array.isArray(context.args)) return cleanAnnouncement(context.args.join(" "));
  if (typeof context.args === "string") return cleanAnnouncement(context.args);
  return "";
}

function formatAnnouncement(text) {
  return [
    "╭━━━〔 📢 ANNONCE OFFICIELLE 〕━━━╮",
    "",
    text,
    "",
    "╰━━━〔 ✨ Merci de votre attention ✨ 〕━━━╯"
  ].join("\n");
}

function getGroupIDs(threadList) {
  if (!Array.isArray(threadList)) return [];
  const ids = new Set();
  for (const thread of threadList) {
    if (!thread || typeof thread !== "object") continue;
    const isGroup = thread.isGroup === true
      || thread.threadType === 2
      || String(thread.threadType || "").toUpperCase() === "GROUP";
    if (!isGroup) continue;
    const threadID = normalizeID(thread.threadID || thread.threadId || thread.id);
    if (!/^\d+$/.test(threadID)) continue;
    ids.add(threadID);
  }
  return Array.from(ids);
}

/**
 * Cherche les images directement dans le dossier assets.
 * Le module peut être placé dans scripts/cmds, dans cmds ou à la racine.
 */
function getAssetsDirectories() {
  return Array.from(new Set([
    path.resolve(__dirname, "../../assets"),
    path.resolve(__dirname, "../assets"),
    path.resolve(__dirname, "assets"),
    path.resolve(process.cwd(), "assets")
  ]));
}

function getAnnouncementImagePath() {
  for (const directory of getAssetsDirectories()) {
    const imagePath = path.join(directory, ANNOUNCEMENT_IMAGE_NAME);
    try {
      if (fs.statSync(imagePath).isFile() && fs.statSync(imagePath).size > 0) {
        return imagePath;
      }
    } catch (_) {
      // Continue la recherche dans les autres emplacements possibles de assets.
    }
  }
  return null;
}

function rememberMessageID(event) {
  const messageID = normalizeID(event && (event.messageID || event.messageId));
  if (!messageID) return false;
  if (processedMessageIDs.has(messageID)) return true;
  processedMessageIDs.set(messageID, Date.now());
  while (processedMessageIDs.size > MAX_REMEMBERED_MESSAGE_IDS) {
    processedMessageIDs.delete(processedMessageIDs.keys().next().value);
  }
  return false;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function helpText(prefix) {
  return `📢 Utilisation : ${prefix}annonce <message>\nExemple : ${prefix}annonce 🌸 Réunion à 18 h, soyez présents !\n\n🖼️ Une image sera jointe automatiquement depuis le dossier assets.`;
}

/**
 * Envoi compatible avec l'API Messenger de type FCA/GoatBot.
 * Un nouveau ReadStream est créé pour chaque groupe : un flux déjà consommé
 * ne peut pas être réutilisé pour les groupes suivants.
 */
function sendAnnouncementToGroup(api, text, imagePath, threadID) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stream;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (error && stream && typeof stream.destroy === "function") stream.destroy();
      if (error) reject(error);
      else resolve(result);
    };

    try {
      stream = fs.createReadStream(imagePath);
      stream.once("error", error => finish(error));
      const payload = { body: text, attachment: stream };
      const callback = (error, info) => finish(error || null, info);
      const result = api.sendMessage(payload, threadID, callback);

      // Certaines versions renvoient une Promise, d'autres utilisent le callback.
      if (result && typeof result.then === "function") {
        result.then(value => finish(null, value), error => finish(error));
      } else if (api.sendMessage.length < 3) {
        // API sans callback : l'appel synchrone est considéré comme accepté.
        finish(null, result);
      }
    } catch (error) {
      finish(error);
    }
  });
}

async function handleAnnouncement(context = {}, dependencies = {}) {
  const { api, message, event } = context;
  const prefix = context.prefix || getPrefixes(context)[0];

  if (!isOwner(event)) {
    return send({ api, message, event }, "⛔ Seul le propriétaire du bot peut envoyer une annonce générale.");
  }

  const text = extractAnnouncement(context);
  if (!text) return send({ api, message, event }, helpText(prefix));
  if (text.length > MAX_ANNOUNCEMENT_CHARS) {
    return send({ api, message, event }, `❌ L’annonce est trop longue. Limite : ${MAX_ANNOUNCEMENT_CHARS} caractères.`);
  }

  const styledMessage = formatAnnouncement(text);
  if (styledMessage.length > MAX_STYLED_MESSAGE_CHARS) {
    return send({ api, message, event }, "❌ L’annonce mise en forme dépasse la longueur autorisée par Messenger. Raccourcis le texte et réessaie.");
  }
  if (broadcastInProgress) {
    return send({ api, message, event }, "⏳ Une diffusion est déjà en cours. Attends son résumé avant d’en lancer une autre.");
  }
  if (!api || typeof api.getThreadList !== "function" || typeof api.sendMessage !== "function") {
    return send({ api, message, event }, "❌ L’API Messenger ne permet pas de récupérer les groupes ou d’envoyer les messages.");
  }

  // Vérifier l'image avant de marquer la commande comme traitée et avant tout envoi.
  const imagePath = typeof dependencies.getImagePath === "function"
    ? dependencies.getImagePath()
    : getAnnouncementImagePath();
  if (!imagePath) {
    return send(
      { api, message, event },
      `❌ Photo introuvable : assets/${ANNOUNCEMENT_IMAGE_NAME}. Vérifie que le fichier existe avec exactement ce nom.`,
    );
  }
  if (!fs.existsSync(imagePath)) {
    return send({ api, message, event }, "❌ La photo sélectionnée est introuvable ou a été supprimée. Vérifie le dossier assets.");
  }

  if (rememberMessageID(event)) {
    return send({ api, message, event }, "ℹ️ Cette commande d’annonce a déjà été traitée; aucun second envoi n’a été lancé.");
  }

  broadcastInProgress = true;
  let groupCount = 0;
  let sentCount = 0;
  let failedCount = 0;
  let broadcastStarted = false;
  let broadcastFinished = false;

  try {
    const threadList = await api.getThreadList(THREAD_LIST_LIMIT, null, "INBOX");
    if (!Array.isArray(threadList)) {
      throw new Error("Messenger n’a pas retourné une liste de conversations valide.");
    }
    const groupIDs = getGroupIDs(threadList);
    groupCount = groupIDs.length;
    if (groupIDs.length === 0) {
      return send({ api, message, event }, "ℹ️ Aucun groupe Messenger actif n’a été trouvé; rien n’a été envoyé.");
    }

    const imageName = path.basename(imagePath);
    await send(
      { api, message, event },
      `📡 Diffusion lancée vers ${groupIDs.length} groupe(s).\n🖼️ Photo jointe : ${imageName}\n⏳ Envoi un par un…`
    );
    broadcastStarted = true;

    const delayMs = Number.isFinite(dependencies.delayMs)
      ? Math.max(0, Math.floor(dependencies.delayMs))
      : BROADCAST_DELAY_MS;
    const sleep = typeof dependencies.sleep === "function" ? dependencies.sleep : wait;

    for (let index = 0; index < groupIDs.length; index++) {
      const threadID = groupIDs[index];
      try {
        await sendAnnouncementToGroup(api, styledMessage, imagePath, threadID);
        sentCount++;
      } catch (error) {
        failedCount++;
        console.error(`[Commande annonce] Échec d’envoi au groupe ${index + 1}/${groupIDs.length} (${threadID}) :`, error && (error.stack || error.message) || error);
      }
      if (index < groupIDs.length - 1 && delayMs > 0) await sleep(delayMs);
    }
    broadcastFinished = true;

    const summary = [
      "✅ Diffusion terminée.",
      `📨 Annonces + photos envoyées : ${sentCount}/${groupIDs.length}`,
      `⚠️ Échecs : ${failedCount}`,
      `🖼️ Photo utilisée : ${imageName}`
    ].join("\n");
    return await send({ api, message, event }, summary);
  } catch (error) {
    console.error("[Commande annonce] Diffusion interrompue avant ou pendant la récupération des groupes :", error && (error.stack || error.message) || error);
    if (broadcastFinished) {
      return send({ api, message, event }, `⚠️ Les annonces ont été envoyées (${sentCount}/${groupCount}), mais le résumé final n’a pas pu être transmis. Consulte les logs Render.`);
    }
    if (broadcastStarted) {
      return send({ api, message, event }, `⚠️ La diffusion a été interrompue. Envois confirmés : ${sentCount}/${groupCount}; certains groupes ont peut-être déjà reçu l’annonce. Consulte les logs avant de relancer.`);
    }
    return send({ api, message, event }, "❌ Diffusion annulée avant le premier envoi. Vérifie la connexion Messenger et les logs Render, puis réessaie.");
  } finally {
    broadcastInProgress = false;
  }
}

module.exports = {
  config: {
    name: "annonce",
    version: "2.1.0",
    author: "Diwate",
    description: "Diffuse une annonce accompagnée d'une photo du dossier assets dans les groupes du bot",
    category: "Administration",
    usages: "annonce <message>",
    role: 0
  },
  getOwnerIDs,
  isOwner,
  getPrefixes,
  extractAnnouncement,
  formatAnnouncement,
  getGroupIDs,
  getAssetsDirectories,
  getAnnouncementImagePath,
  ANNOUNCEMENT_IMAGE_NAME,
  sendAnnouncementToGroup,
  handleAnnouncement,
  BROADCAST_DELAY_MS,
  MAX_ANNOUNCEMENT_CHARS,
  onStart: async function (context) {
    return handleAnnouncement(context);
  }
};

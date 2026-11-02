"use strict";

const fs = require("fs");
const path = require("path");
const { send } = require("./lib/messenger");

const THREAD_LIST_LIMIT = 9999999;
const BROADCAST_DELAY_MS = 1500;        // délai entre deux groupes
const PHASE_DELAY_MS = 2000;            // délai entre la fin de la passe texte et le début de la passe photo
const MAX_ANNOUNCEMENT_CHARS = 1700;
const MAX_STYLED_MESSAGE_CHARS = 1900;
const MAX_REMEMBERED_MESSAGE_IDS = 500;
const ANNOUNCEMENT_IMAGE_NAME = "Diwate.jpg";

const processedMessageIDs = new Map();
let broadcastInProgress = false;

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

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

/**
 * Détection large des groupes : isGroup, threadType numérique/chaîne, type, community.
 */
function getGroupIDs(threadList) {
  if (!Array.isArray(threadList)) return [];
  const ids = new Set();
  for (const thread of threadList) {
    if (!thread || typeof thread !== "object") continue;
    const threadTypeRaw = thread.threadType != null ? String(thread.threadType).toUpperCase() : "";
    const typeRaw = thread.type != null ? String(thread.type).toUpperCase() : "";
    const isGroup =
      thread.isGroup === true ||
      thread.isGroup === 1 ||
      thread.isGroup === "true" ||
      thread.threadType === 2 ||
      threadTypeRaw === "GROUP" ||
      threadTypeRaw === "2" ||
      typeRaw === "GROUP" ||
      thread.community === true;
    if (!isGroup) continue;
    const threadID = normalizeID(thread.threadID || thread.threadId || thread.id);
    if (!/^\d+$/.test(threadID)) continue;
    ids.add(threadID);
  }
  return Array.from(ids);
}

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
      const stat = fs.statSync(imagePath);
      if (stat.isFile() && stat.size > 0) return imagePath;
    } catch (_) {}
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
  return `📢 Utilisation : ${prefix}annonce <message>\nExemple : ${prefix}annonce 🌸 Réunion à 18 h, soyez présents !\n\n🖼️ Envoi en deux passes : d'abord le texte dans les groupes, puis la photo uniquement dans ceux qui ont reçu le texte.`;
}

// ---------------------------------------------------------------------------
// Envoi bas niveau (callback OU Promise)
// ---------------------------------------------------------------------------

function sendTextToGroup(api, text, threadID) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, info) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(info);
    };
    try {
      const result = api.sendMessage(text, threadID, (error, info) => finish(error || null, info));
      if (result && typeof result.then === "function") {
        result.then(value => finish(null, value), error => finish(error));
      } else if (api.sendMessage.length < 3) {
        finish(null, result);
      }
    } catch (error) {
      finish(error);
    }
  });
}

function sendPhotoToGroup(api, imagePath, threadID) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stream;
    const finish = (error, info) => {
      if (settled) return;
      settled = true;
      if (error && stream && typeof stream.destroy === "function") stream.destroy();
      if (error) reject(error);
      else resolve(info);
    };
    try {
      stream = fs.createReadStream(imagePath);
      stream.once("error", error => finish(error));
      const payload = { attachment: stream };
      const result = api.sendMessage(payload, threadID, (error, info) => finish(error || null, info));
      if (result && typeof result.then === "function") {
        result.then(value => finish(null, value), error => finish(error));
      } else if (api.sendMessage.length < 3) {
        finish(null, result);
      }
    } catch (error) {
      finish(error);
    }
  });
}

// ---------------------------------------------------------------------------
// Commande principale
// ---------------------------------------------------------------------------

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

  const imagePath = typeof dependencies.getImagePath === "function"
    ? dependencies.getImagePath()
    : getAnnouncementImagePath();
  if (!imagePath || !fs.existsSync(imagePath)) {
    return send(
      { api, message, event },
      `❌ Photo introuvable : assets/${ANNOUNCEMENT_IMAGE_NAME}. Vérifie que le fichier existe avec exactement ce nom.`
    );
  }

  if (rememberMessageID(event)) {
    return send({ api, message, event }, "ℹ️ Cette commande d’annonce a déjà été traitée; aucun second envoi n’a été lancé.");
  }

  broadcastInProgress = true;

  const delayMs = Number.isFinite(dependencies.delayMs)
    ? Math.max(0, Math.floor(dependencies.delayMs))
    : BROADCAST_DELAY_MS;
  const phaseDelayMs = Number.isFinite(dependencies.phaseDelay)
    ? Math.max(0, Math.floor(dependencies.phaseDelay))
    : PHASE_DELAY_MS;
  const sleep = typeof dependencies.sleep === "function" ? dependencies.sleep : wait;

  let groupIDs = [];
  let textSentIDs = [];        // groupes où le TEXTE est passé
  let photoSentIDs = [];       // groupes où la PHOTO est passée (parmi textSentIDs)
  let textFailedIDs = [];      // groupes où le texte a échoué
  let photoFailedIDs = [];     // groupes où le texte est passé mais la photo a échoué

  let phaseTextStarted = false;
  let phaseTextDone = false;
  let phasePhotoStarted = false;
  let phasePhotoDone = false;

  try {
    const threadList = await api.getThreadList(THREAD_LIST_LIMIT, null, "INBOX");
    if (!Array.isArray(threadList)) {
      throw new Error("Messenger n’a pas retourné une liste de conversations valide.");
    }
    groupIDs = getGroupIDs(threadList);
    if (groupIDs.length === 0) {
      return send({ api, message, event }, "ℹ️ Aucun groupe Messenger actif n’a été trouvé; rien n’a été envoyé.");
    }

    const imageName = path.basename(imagePath);

    // ------------------------------------------------------------------
    // PHASE 1 — Texte dans tous les groupes
    // ------------------------------------------------------------------
    await send(
      { api, message, event },
      `📡 PHASE 1/2 — Envoi du texte dans ${groupIDs.length} groupe(s)…\n🖼️ La photo suivra uniquement dans les groupes où le texte est bien parti.`
    );
    phaseTextStarted = true;

    for (let index = 0; index < groupIDs.length; index++) {
      const threadID = groupIDs[index];
      try {
        await sendTextToGroup(api, styledMessage, threadID);
        textSentIDs.push(threadID);
      } catch (error) {
        textFailedIDs.push(threadID);
        console.error(
          `[Commande annonce] PHASE 1 — Échec texte ${index + 1}/${groupIDs.length} (${threadID}) :`,
          error && (error.stack || error.message) || error
        );
      }
      if (index < groupIDs.length - 1 && delayMs > 0) await sleep(delayMs);
    }
    phaseTextDone = true;

    if (textSentIDs.length === 0) {
      return send(
        { api, message, event },
        `⚠️ PHASE 1 terminée : aucun texte n’a pu être envoyé (0/${groupIDs.length}).\n❌ PHASE 2 annulée : aucune photo n’a été diffusée.\nConsulte les logs Render pour connaître les causes.`
      );
    }

    await send(
      { api, message, event },
      `✅ PHASE 1 terminée : texte envoyé dans ${textSentIDs.length}/${groupIDs.length} groupe(s).\n⏳ Pause de ${Math.round(phaseDelayMs / 1000)} s avant la photo…`
    );

    // ------------------------------------------------------------------
    // PHASE 2 — Photo uniquement dans les groupes où le texte est passé
    // ------------------------------------------------------------------
    if (phaseDelayMs > 0) await sleep(phaseDelayMs);

    await send(
      { api, message, event },
      `🖼️ PHASE 2/2 — Envoi de ${imageName} dans ${textSentIDs.length} groupe(s) où le texte a bien été reçu…`
    );
    phasePhotoStarted = true;

    for (let index = 0; index < textSentIDs.length; index++) {
      const threadID = textSentIDs[index];
      try {
        await sendPhotoToGroup(api, imagePath, threadID);
        photoSentIDs.push(threadID);
      } catch (error) {
        photoFailedIDs.push(threadID);
        console.error(
          `[Commande annonce] PHASE 2 — Échec photo ${index + 1}/${textSentIDs.length} (${threadID}) :`,
          error && (error.stack || error.message) || error
        );
      }
      if (index < textSentIDs.length - 1 && delayMs > 0) await sleep(delayMs);
    }
    phasePhotoDone = true;

    // ------------------------------------------------------------------
    // Résumé final
    // ------------------------------------------------------------------
    const summaryLines = [
      "✅ Diffusion terminée (2 passes).",
      "",
      `📝 PHASE 1 — Texte : ${textSentIDs.length}/${groupIDs.length} envoyé(s)`,
      `🖼️ PHASE 2 — Photo : ${photoSentIDs.length}/${textSentIDs.length} envoyée(s)`,
      "",
      `⚠️ Échecs texte : ${textFailedIDs.length}`,
      `⚠️ Échecs photo (après texte OK) : ${photoFailedIDs.length}`,
      `📎 Photo utilisée : ${imageName}`
    ];
    if (textFailedIDs.length > 0) {
      summaryLines.push("", "Groupes sans texte (photo non tentée) :", textFailedIDs.slice(0, 8).map(id => `• ${id}`).join("\n"));
      if (textFailedIDs.length > 8) summaryLines.push(`… +${textFailedIDs.length - 8} autres`);
    }
    if (photoFailedIDs.length > 0) {
      summaryLines.push("", "Groupes avec texte mais sans photo :", photoFailedIDs.slice(0, 8).map(id => `• ${id}`).join("\n"));
      if (photoFailedIDs.length > 8) summaryLines.push(`… +${photoFailedIDs.length - 8} autres`);
    }

    return await send({ api, message, event }, summaryLines.join("\n"));
  } catch (error) {
    console.error(
      "[Commande annonce] Diffusion interrompue :",
      error && (error.stack || error.message) || error
    );

    const state = {
      totalGroups: groupIDs.length,
      textSent: textSentIDs.length,
      textFailed: textFailedIDs.length,
      photoSent: photoSentIDs.length,
      photoFailed: photoFailedIDs.length,
      phaseTextStarted,
      phaseTextDone,
      phasePhotoStarted,
      phasePhotoDone
    };

    if (phasePhotoDone) {
      return send(
        { api, message, event },
        `⚠️ Diffusion terminée mais le résumé final n’a pas pu être transmis.\n` +
        `Texte : ${state.textSent}/${state.totalGroups} • Photo : ${state.photoSent}/${state.textSent || 0}\n` +
        `Consulte les logs Render.`
      );
    }

    if (phasePhotoStarted) {
      return send(
        { api, message, event },
        `⚠️ Diffusion interrompue pendant la PHASE 2 (photo).\n` +
        `Texte : ${state.textSent}/${state.totalGroups} • Photo envoyée : ${state.photoSent}/${state.textSent}\n` +
        `Consulte les logs avant de relancer.`
      );
    }

    if (phaseTextDone) {
      return send(
        { api, message, event },
        `⚠️ Diffusion interrompue entre les deux phases.\n` +
        `Texte : ${state.textSent}/${state.totalGroups} envoyé(s) • Aucune photo n’a été envoyée.\n` +
        `Consulte les logs avant de relancer.`
      );
    }

    if (phaseTextStarted) {
      return send(
        { api, message, event },
        `⚠️ Diffusion interrompue pendant la PHASE 1 (texte).\n` +
        `Texte : ${state.textSent}/${state.totalGroups} • Aucune photo envoyée.\n` +
        `Consulte les logs avant de relancer.`
      );
    }

    return send(
      { api, message, event },
      "❌ Diffusion annulée avant le premier envoi. Vérifie la connexion Messenger et les logs Render, puis réessaie."
    );
  } finally {
    broadcastInProgress = false;
  }
}

module.exports = {
  config: {
    name: "annonce",
    version: "3.0.0",
    author: "Diwate",
    description: "Diffuse une annonce en deux passes : texte dans tous les groupes, puis photo uniquement où le texte est passé",
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
  sendTextToGroup,
  sendPhotoToGroup,
  handleAnnouncement,
  BROADCAST_DELAY_MS,
  PHASE_DELAY_MS,
  MAX_ANNOUNCEMENT_CHARS,
  onStart: async function (context) {
    return handleAnnouncement(context);
  }
};

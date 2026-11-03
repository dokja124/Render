"use strict";

const { send } = require("./lib/messenger");

const STORAGE_KEY = "privateMessagesV1";
const INDEX_KEY = "privateMessagesIndexV1"; // liste des utilisateurs connus
const MAX_MESSAGE_LENGTH = 1500;
const MAX_INBOX = 50;
const MESSAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
const MAX_USERS_CACHE = 500;

let store = null;          // { messageId: { from, fromName, to, text, at, read } }
let knownUsers = null;     // { userId: { name, lastSeen } }
let loadPromise = null;
let mutationQueue = Promise.resolve();

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function normalizeID(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    return String(value.id || value.userID || value.userId || value.senderID || value.author || "").trim();
  }
  return String(value).trim();
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function getSenderID(event) {
  return normalizeID(event && (event.senderID || event.senderId || event.userID || event.author));
}

function getThreadID(event) {
  return String(event && (event.threadID || event.threadId) || "").trim();
}

function getPrefix(context = {}) {
  if (context.prefix) return String(context.prefix);
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  return String(config.prefix || "!");
}

function getOwnerIDs() {
  const configuredOwner = String(process.env.BOT_OWNER_ID || "").trim();
  if (configuredOwner) return [configuredOwner];
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  const ids = Array.isArray(config.adminBot) ? config.adminBot : config.adminBot ? [config.adminBot] : [];
  return ids.map(normalizeID).filter(Boolean);
}

function isOwner(userID) {
  return getOwnerIDs().includes(normalizeID(userID));
}

function cleanName(value, fallback = "Utilisateur") {
  const name = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return name && !/^\d+$/.test(name) ? name.slice(0, 50) : fallback;
}

function getOwnerDisplayName() {
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  const configured = config.ownerName || config.botName || "Propriétaire";
  return cleanName(configured, "Propriétaire");
}

function formatDate(timestamp) {
  try {
    const date = new Date(timestamp);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  } catch (_) {
    return "date inconnue";
  }
}

function makeMessageID() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Persistance
// ---------------------------------------------------------------------------

async function loadAll(globalData) {
  if (store && knownUsers) return { store, knownUsers };
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    store = {};
    knownUsers = {};
    if (globalData && typeof globalData.get === "function") {
      try {
        const s = await globalData.get(STORAGE_KEY, "data", {});
        if (s && typeof s === "object" && !Array.isArray(s)) store = { ...s };
      } catch (error) {
        console.warn("[Message] Lecture messages impossible :", error.message || error);
      }
      try {
        const u = await globalData.get(INDEX_KEY, "data", {});
        if (u && typeof u === "object" && !Array.isArray(u)) knownUsers = { ...u };
      } catch (error) {
        console.warn("[Message] Lecture utilisateurs impossible :", error.message || error);
      }
    }
    // Purge des messages expirés
    const now = Date.now();
    for (const [id, msg] of Object.entries(store)) {
      if (!msg || now - (msg.at || 0) > MESSAGE_TTL_MS) delete store[id];
    }
    return { store, knownUsers };
  })();
  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

async function persist(globalData, which) {
  if (!globalData || typeof globalData.set !== "function") return;
  try {
    if (which === "messages" || which === "all") {
      await globalData.set(STORAGE_KEY, store, "data");
    }
    if (which === "users" || which === "all") {
      await globalData.set(INDEX_KEY, knownUsers, "data");
    }
  } catch (error) {
    console.warn("[Message] Sauvegarde impossible :", error.message || error);
  }
}

async function mutate(globalData, fn) {
  const run = async () => {
    await loadAll(globalData);
    const result = fn();
    if (result && result.persist) await persist(globalData, result.persist);
    return result;
  };
  const pending = mutationQueue.then(run, run);
  mutationQueue = pending.catch(() => {});
  return pending;
}

async function rememberUser(globalData, userID, name) {
  const id = normalizeID(userID);
  if (!id) return;
  const cleanN = cleanName(name, "Utilisateur");
  await mutate(globalData, () => {
    const existing = knownUsers[id];
    knownUsers[id] = {
      name: cleanN,
      lastSeen: Date.now(),
      isOwner: isOwner(id) || (existing && existing.isOwner) || false
    };
    // Limite de taille
    const entries = Object.entries(knownUsers);
    if (entries.length > MAX_USERS_CACHE) {
      entries
        .sort((a, b) => (b[1].lastSeen || 0) - (a[1].lastSeen || 0))
        .slice(MAX_USERS_CACHE)
        .forEach(([k]) => delete knownUsers[k]);
    }
    return { persist: "users" };
  });
}

// ---------------------------------------------------------------------------
// Résolution du pseudo d'un utilisateur
// ---------------------------------------------------------------------------

async function resolveDisplayName(context, userID) {
  const id = normalizeID(userID);
  if (!id) return "Utilisateur";

  // Owner ?
  if (isOwner(id)) return getOwnerDisplayName();

  // Déjà connu ?
  await loadAll(context.globalData);
  if (knownUsers[id] && knownUsers[id].name) return knownUsers[id].name;

  // Recherche usersData
  const usersData = context.usersData;
  if (usersData && typeof usersData.get === "function") {
    try {
      const p = await usersData.get(id);
      const name = typeof p === "string" ? p : p && (p.name || p.fullName || p.nickname || p.firstName);
      if (name) return cleanName(name, "Utilisateur");
    } catch (_) {}
  }

  // Recherche via event
  const event = context.event;
  if (event && normalizeID(event.senderID) === id && event.senderName) {
    return cleanName(event.senderName, "Utilisateur");
  }

  // Recherche via api.getUserInfo
  const api = context.api;
  if (api && typeof api.getUserInfo === "function") {
    try {
      const profiles = await api.getUserInfo([id]);
      const p = profiles && (profiles[id] || profiles[Number(id)]);
      const name = p && (p.name || p.firstName);
      if (name) return cleanName(name, "Utilisateur");
    } catch (_) {}
  }

  return `Utilisateur ${id.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Construction de la liste des destinataires
// ---------------------------------------------------------------------------

async function buildRecipientsList(context) {
  const { globalData, event } = context;
  const senderID = getSenderID(event);
  await loadAll(globalData);

  const list = [];
  const seen = new Set();

  // 1. Propriétaire en tête
  const owners = getOwnerIDs();
  for (const ownerID of owners) {
    if (ownerID === senderID) continue;
    if (seen.has(ownerID)) continue;
    seen.add(ownerID);
    list.push({ userID: ownerID, name: getOwnerDisplayName(), isOwner: true });
  }

  // 2. Utilisateurs connus (hors sender)
  const known = Object.entries(knownUsers)
    .filter(([id]) => id !== senderID && !seen.has(id))
    .sort((a, b) => (b[1].lastSeen || 0) - (a[1].lastSeen || 0));
  for (const [id, info] of known) {
    seen.add(id);
    list.push({ userID: id, name: info.name || `Utilisateur ${id.slice(-4)}`, isOwner: isOwner(id) });
    if (list.length >= 20) break;
  }

  return list;
}

function buildRecipientsText(prefix, list) {
  const lines = list.map((r, i) => {
    const tag = r.isOwner ? " 👑" : "";
    return `${i + 1}. ${r.name}${tag}`;
  });
  return [
    `📬 **Choisis le destinataire** en répondant par son numéro :`,
    "",
    lines.join("\n"),
    "",
    `💡 Exemple : \`${prefix}message 1\``,
    `🛑 Pour annuler : \`${prefix}message annule\``
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Commande principale
// ---------------------------------------------------------------------------

async function handleMessage(context = {}) {
  const { api, message, event, globalData } = context;
  const prefix = getPrefix(context);
  const senderID = getSenderID(event);
  const args = Array.isArray(context.args) ? context.args : [];
  const body = String(event && (event.body || event.message) || "").trim();

  if (!senderID) return send({ api, message, event }, "❌ Impossible d’identifier ton compte.");

  // Extraction du texte après "!message"
  const afterCommand = body.replace(/^[^\s]+\s*/, "").trim();
  const rawText = args.length ? args.join(" ").trim() : afterCommand;

  // ===== Cas 1 : sous-commande "annule" ou "cancel" =====
  const firstWord = normalize(rawText.split(/\s+/)[0] || "");
  if (["annule", "annuler", "cancel", "stop"].includes(firstWord)) {
    return send({ api, message, event }, "🛑 Envoi de message annulé.");
  }

  // ===== Cas 2 : réponse par un numéro (choix du destinataire) =====
  if (/^\d+$/.test(rawText) && context.messageSession) {
    return finalizeSend(context, parseInt(rawText, 10));
  }

  // On mémorise l'utilisateur courant (pseudo)
  const senderName = await resolveDisplayName(context, senderID);
  await rememberUser(globalData, senderID, senderName);

  // ===== Cas 3 : texte vide → aide =====
  if (!rawText) {
    return send(
      { api, message, event },
      `📨 **Commande message**\n\n` +
      `Utilisation : \`${prefix}message <ton message>\`\n` +
      `Puis choisis le destinataire dans la liste.\n\n` +
      `Pour lire tes messages reçus : \`${prefix}voir\`\n` +
      `Pour annuler : \`${prefix}message annule\``
    );
  }

  // ===== Cas 4 : texte trop long =====
  if (rawText.length > MAX_MESSAGE_LENGTH) {
    return send(
      { api, message, event },
      `❌ Ton message dépasse **${MAX_MESSAGE_LENGTH} caractères** (actuellement ${rawText.length}). Raccourcis-le et réessaie.`
    );
  }

  // ===== Cas 5 : stocker le message en attente et demander le destinataire =====
  const recipients = await buildRecipientsList(context);
  if (recipients.length === 0) {
    return send(
      { api, message, event },
      `⚠️ Aucun autre utilisateur connu pour le moment. Attends que d’autres personnes utilisent le bot, puis réessaie.`
    );
  }

  // Stocker dans une session "pending" par sender+thread
  await mutate(globalData, () => {
    store[`pending_${senderID}`] = {
      type: "pending",
      from: senderID,
      fromName: senderName,
      threadID: getThreadID(event),
      text: rawText,
      at: Date.now(),
      recipients: recipients.map(r => ({ userID: r.userID, name: r.name, isOwner: r.isOwner }))
    };
    return { persist: "messages" };
  });

  return send(
    { api, message, event },
    `✍️ **Message enregistré :**\n« ${rawText.slice(0, 200)}${rawText.length > 200 ? "…" : ""} »\n\n${buildRecipientsText(prefix, recipients)}`
  );
}

// ---------------------------------------------------------------------------
// Finalisation : choisir le destinataire et envoyer la notification
// ---------------------------------------------------------------------------

async function finalizeSend(context, index) {
  const { api, message, event, globalData } = context;
  const prefix = getPrefix(context);
  const senderID = getSenderID(event);
  const pending = store[`pending_${senderID}`];

  if (!pending || pending.type !== "pending") {
    return send({ api, message, event }, `❌ Aucun message en attente. Commence par \`${prefix}message <ton message>\`.`);
  }

  const recipients = Array.isArray(pending.recipients) ? pending.recipients : [];
  if (index < 1 || index > recipients.length) {
    return send({ api, message, event }, `❌ Numéro invalide. Choisis entre 1 et ${recipients.length}.`);
  }

  const target = recipients[index - 1];
  const messageID = makeMessageID();
  const now = Date.now();

  await mutate(globalData, () => {
    delete store[`pending_${senderID}`];
    const inbox = store[target.userID] && typeof store[target.userID] === "object" && !store[target.userID].type
      ? store[target.userID]
      : { inbox: [] };
    if (!Array.isArray(inbox.inbox)) inbox.inbox = [];
    inbox.inbox.push({
      id: messageID,
      from: senderID,
      fromName: pending.fromName,
      text: pending.text,
      at: now,
      read: false
    });
    if (inbox.inbox.length > MAX_INBOX) inbox.inbox = inbox.inbox.slice(-MAX_INBOX);
    store[target.userID] = inbox;
    return { persist: "messages" };
  });

  // Notification au destinataire dans le thread courant
  const senderLabel = pending.fromName || "Quelqu’un";
  await send(
    { api, message, event },
    `📨 **Message envoyé à ${target.name}** ✅\n\n` +
    `Dès que ${target.name} écrira \`${prefix}voir\`, il/elle verra ton message.`
  );

  // Petit message "notification" affiché dans le groupe pour rappeler au destinataire (optionnel)
  try {
    await send(
      { api, message, event },
      `🔔 ${target.name}, tu as reçu un message privé de ${senderLabel}. Écris \`${prefix}voir\` pour le consulter.`
    );
  } catch (_) {
    // Certaines versions de Messenger limitent l'envoi de mentions non sollicitées
  }

  return true;
}

// ---------------------------------------------------------------------------
// Commande "voir"
// ---------------------------------------------------------------------------

async function handleVoir(context = {}) {
  const { api, message, event, globalData } = context;
  const prefix = getPrefix(context);
  const userID = getSenderID(event);
  if (!userID) return send({ api, message, event }, "❌ Impossible d’identifier ton compte.");

  await loadAll(globalData);
  const box = store[userID];
  if (!box || !Array.isArray(box.inbox) || box.inbox.length === 0) {
    return send({ api, message, event }, `📭 Aucun message reçu pour le moment.\n\n💡 Quand quelqu’un t’enverra un message, reviens avec \`${prefix}voir\`.`);
  }

  const now = Date.now();
  const fresh = box.inbox.filter(m => m && now - (m.at || 0) <= MESSAGE_TTL_MS);
  if (fresh.length === 0) {
    await mutate(globalData, () => {
      store[userID] = { inbox: [] };
      return { persist: "messages" };
    });
    return send({ api, message, event }, `📭 Tous tes messages ont expiré (plus de 7 jours).`);
  }

  const lines = fresh.map((m, i) => {
    const status = m.read ? "✔️ lu" : "🆕 non lu";
    return [
      `**${i + 1}.** ${status}`,
      `👤 De : ${m.fromName || "Utilisateur"}`,
      `🕐 ${formatDate(m.at)}`,
      `💬 « ${String(m.text).slice(0, 500)}${String(m.text).length > 500 ? "…" : ""} »`
    ].join("\n");
  });

  // Marquer comme lus
  await mutate(globalData, () => {
    for (const m of fresh) m.read = true;
    store[userID] = { inbox: fresh };
    return { persist: "messages" };
  });

  return send(
    { api, message, event },
    `📬 **Tes messages (${fresh.length}) :**\n\n${lines.join("\n\n")}\n\n` +
    `✅ Ces messages sont maintenant marqués comme lus.\n` +
    `Pour répondre : \`${prefix}message <ton texte>\` puis choisis le destinataire.`
  );
}

// ---------------------------------------------------------------------------
// Détection de la commande réellement invoquée
// ---------------------------------------------------------------------------

function invokedCommand(context) {
  const event = context.event || {};
  const body = String(event.body || "").trim();
  const firstToken = body.split(/\s+/)[0] || "";
  const raw = normalize(firstToken.replace(/^[^A-Za-z0-9]+/, ""));
  if (raw === "voir" || raw === "messages" || raw === "inbox") return "voir";
  if (raw === "message" || raw === "msg" || raw === "dm") return "message";
  return normalize(context.commandName || "");
}

async function handleCommand(context = {}) {
  const invoked = invokedCommand(context);
  if (invoked === "voir") return handleVoir(context);
  return handleMessage(context);
}

module.exports = {
  config: {
    name: "message",
    aliases: ["msg", "dm", "voir", "messages", "inbox"],
    version: "1.0.0",
    author: "Diwate",
    description: "Envoie un message privé à un autre utilisateur du bot via une liste numérotée",
    category: "Social",
    usages: "message <texte> | message <numéro> | message annule | voir",
    role: 0
  },
  STORAGE_KEY,
  INDEX_KEY,
  MAX_MESSAGE_LENGTH,
  handleMessage,
  handleVoir,
  onStart: async function (context) {
    try {
      return await handleCommand(context);
    } catch (error) {
      console.error("[Commande message]", error.stack || error);
      return send({ api: context.api, message: context.message, event: context.event }, "❌ La commande message a échoué. Réessaie.");
    }
  }
};
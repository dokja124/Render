"use strict";

const { send } = require("./lib/messenger");

const STORAGE_KEY = "privateMessagesV2";
const INDEX_KEY = "privateMessagesUsersV2";
const ACTIVITY_KEY = "privateMessagesActivityV2"; // { userId: { threadID: count } }
const MAX_MESSAGE_LENGTH = 1500;
const MAX_INBOX = 50;
const MESSAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_USERS_CACHE = 500;
const MAX_THREADS_PER_USER = 20;

let store = null;
let knownUsers = null;
let activity = null;
let loadPromise = null;
let mutationQueue = Promise.resolve();

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function normalizeID(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    return String(value.id || value.userID || value.userId || value.senderID || value.author || value.threadID || "").trim();
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
  const p = config.prefix;
  if (Array.isArray(p)) return String(p[0] || "!");
  return String(p || "!");
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
  return cleanName(config.ownerName || config.botName || "Propriétaire", "Propriétaire");
}

function formatDate(timestamp) {
  try {
    const d = new Date(timestamp);
    const pad = n => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch (_) { return "date inconnue"; }
}

function makeMessageID() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Persistance
// ---------------------------------------------------------------------------

async function loadAll(globalData) {
  if (store && knownUsers && activity) return { store, knownUsers, activity };
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    store = {};
    knownUsers = {};
    activity = {};
    if (globalData && typeof globalData.get === "function") {
      try {
        const s = await globalData.get(STORAGE_KEY, "data", {});
        if (s && typeof s === "object" && !Array.isArray(s)) store = { ...s };
      } catch (e) { console.warn("[Message] Lecture messages :", e.message || e); }
      try {
        const u = await globalData.get(INDEX_KEY, "data", {});
        if (u && typeof u === "object" && !Array.isArray(u)) knownUsers = { ...u };
      } catch (e) { console.warn("[Message] Lecture users :", e.message || e); }
      try {
        const a = await globalData.get(ACTIVITY_KEY, "data", {});
        if (a && typeof a === "object" && !Array.isArray(a)) activity = { ...a };
      } catch (e) { console.warn("[Message] Lecture activity :", e.message || e); }
    }
    const now = Date.now();
    for (const [id, msg] of Object.entries(store)) {
      if (!msg || (msg.at && now - msg.at > MESSAGE_TTL_MS)) delete store[id];
    }
    return { store, knownUsers, activity };
  })();
  try { return await loadPromise; } finally { loadPromise = null; }
}

async function persist(globalData, which) {
  if (!globalData || typeof globalData.set !== "function") return;
  try {
    if (which === "messages" || which === "all") await globalData.set(STORAGE_KEY, store, "data");
    if (which === "users" || which === "all") await globalData.set(INDEX_KEY, knownUsers, "data");
    if (which === "activity" || which === "all") await globalData.set(ACTIVITY_KEY, activity, "data");
  } catch (e) { console.warn("[Message] Sauvegarde :", e.message || e); }
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
  const cleanN = cleanName(name);
  await mutate(globalData, () => {
    const existing = knownUsers[id];
    knownUsers[id] = {
      name: cleanN,
      lastSeen: Date.now(),
      isOwner: isOwner(id) || (existing && existing.isOwner) || false
    };
    const entries = Object.entries(knownUsers);
    if (entries.length > MAX_USERS_CACHE) {
      entries.sort((a, b) => (b[1].lastSeen || 0) - (a[1].lastSeen || 0))
        .slice(MAX_USERS_CACHE)
        .forEach(([k]) => delete knownUsers[k]);
    }
    return { persist: "users" };
  });
}

// ---------------------------------------------------------------------------
// Suivi d'activité : à appeler à chaque message d'un utilisateur
// ---------------------------------------------------------------------------

/**
 * Enregistre une activité dans le groupe courant.
 * À appeler depuis onEvent.js (ou onChat) à chaque message.
 */
async function trackActivity(context = {}) {
  const { event, globalData } = context;
  const userID = getSenderID(event);
  const threadID = getThreadID(event);
  if (!userID || !threadID) return;

  await loadAll(globalData);
  await mutate(globalData, () => {
    if (!activity[userID] || typeof activity[userID] !== "object") activity[userID] = {};
    activity[userID][threadID] = (Number(activity[userID][threadID]) || 0) + 1;
    const threads = Object.entries(activity[userID]);
    if (threads.length > MAX_THREADS_PER_USER) {
      threads.sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(MAX_THREADS_PER_USER)
        .forEach(([tid]) => delete activity[userID][tid]);
    }
    return { persist: "activity" };
  });
}

/**
 * Renvoie le threadID le plus actif pour un utilisateur, ou null.
 */
async function getMostActiveThread(globalData, userID) {
  await loadAll(globalData);
  const map = activity[normalizeID(userID)];
  if (!map || typeof map !== "object") return null;
  let best = null;
  let bestCount = 0;
  for (const [tid, count] of Object.entries(map)) {
    const n = Number(count) || 0;
    if (n > bestCount) { bestCount = n; best = tid; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Résolution du pseudo
// ---------------------------------------------------------------------------

async function resolveDisplayName(context, userID) {
  const id = normalizeID(userID);
  if (!id) return "Utilisateur";
  if (isOwner(id)) return getOwnerDisplayName();

  await loadAll(context.globalData);
  if (knownUsers[id] && knownUsers[id].name) return knownUsers[id].name;

  const usersData = context.usersData;
  if (usersData && typeof usersData.get === "function") {
    try {
      const p = await usersData.get(id);
      const name = typeof p === "string" ? p : p && (p.name || p.fullName || p.nickname || p.firstName);
      if (name) return cleanName(name);
    } catch (_) {}
  }

  const api = context.api;
  if (api && typeof api.getUserInfo === "function") {
    try {
      const profiles = await api.getUserInfo([id]);
      const p = profiles && (profiles[id] || profiles[Number(id)]);
      const name = p && (p.name || p.firstName);
      if (name) return cleanName(name);
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

  for (const ownerID of getOwnerIDs()) {
    if (ownerID === senderID || seen.has(ownerID)) continue;
    seen.add(ownerID);
    list.push({ userID: ownerID, name: getOwnerDisplayName(), isOwner: true });
  }

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
  const lines = list.map((r, i) => `${i + 1}. ${r.name}${r.isOwner ? " 👑" : ""}`);
  return [
    `📬 **Choisis le destinataire** en écrivant \`${prefix}1\`, \`${prefix}2\`, \`${prefix}3\`…`,
    "",
    lines.join("\n"),
    "",
    `💡 Exemple : \`${prefix}2\` pour choisir le 2ᵉ destinataire.`,
    `🛑 Pour annuler : \`${prefix}message annule\``
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Commande !message
// ---------------------------------------------------------------------------

async function handleMessage(context = {}) {
  const { api, message, event, globalData } = context;
  const prefix = getPrefix(context);
  const senderID = getSenderID(event);
  const args = Array.isArray(context.args) ? context.args : [];
  const body = String(event && (event.body || event.message) || "").trim();

  if (!senderID) return send({ api, message, event }, "❌ Impossible d’identifier ton compte.");

  const afterCommand = body.replace(/^[^\s]+\s*/, "").trim();
  const rawText = args.length ? args.join(" ").trim() : afterCommand;
  const firstWord = normalize(rawText.split(/\s+/)[0] || "");

  if (["annule", "annuler", "cancel", "stop"].includes(firstWord)) {
    await mutate(globalData, () => {
      delete store[`pending_${senderID}`];
      return { persist: "messages" };
    });
    return send({ api, message, event }, "🛑 Envoi de message annulé.");
  }

  const senderName = await resolveDisplayName(context, senderID);
  await rememberUser(globalData, senderID, senderName);

  if (!rawText) {
    return send(
      { api, message, event },
      `📨 **Commande message**\n\n` +
      `Utilisation : \`${prefix}message <ton message>\`\n` +
      `Puis choisis le destinataire en écrivant \`${prefix}1\`, \`${prefix}2\`…\n\n` +
      `Pour lire tes messages : \`${prefix}voir\`\n` +
      `Pour annuler : \`${prefix}message annule\``
    );
  }

  if (rawText.length > MAX_MESSAGE_LENGTH) {
    return send({ api, message, event }, `❌ Message trop long (${rawText.length}). Limite : ${MAX_MESSAGE_LENGTH}.`);
  }

  const recipients = await buildRecipientsList(context);
  if (recipients.length === 0) {
    return send({ api, message, event }, "⚠️ Aucun autre utilisateur connu. Attends que d’autres personnes utilisent le bot.");
  }

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
// Sélection par numéro : !1, !2, !3…
// ---------------------------------------------------------------------------

async function handleNumberSelection(context, index) {
  const { api, message, event, globalData } = context;
  const prefix = getPrefix(context);
  const senderID = getSenderID(event);

  await loadAll(globalData);
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
    const box = store[target.userID] && typeof store[target.userID] === "object" && !store[target.userID].type
      ? store[target.userID]
      : { inbox: [] };
    if (!Array.isArray(box.inbox)) box.inbox = [];
    box.inbox.push({
      id: messageID,
      from: senderID,
      fromName: pending.fromName,
      text: pending.text,
      at: now,
      read: false
    });
    if (box.inbox.length > MAX_INBOX) box.inbox = box.inbox.slice(-MAX_INBOX);
    store[target.userID] = box;
    return { persist: "messages" };
  });

  // Confirmation à l'expéditeur
  await send(
    { api, message, event },
    `📨 **Message envoyé à ${target.name}** ✅\n\n` +
    `Dès que ${target.name} écrira \`${prefix}voir\`, il/elle verra ton message.`
  );

  // Notification : dans le groupe le plus actif du destinataire
  const activeThread = await getMostActiveThread(globalData, target.userID);
  const notifyThread = activeThread || getThreadID(event);
  const senderLabel = pending.fromName || "Quelqu’un";

  try {
    await api.sendMessage(
      `🔔 ${target.name}, tu as reçu un message privé de ${senderLabel}. Écris \`${prefix}voir\` pour le consulter.`,
      notifyThread
    );
  } catch (error) {
    console.warn("[Message] Notification impossible dans le groupe le plus actif :", error.message || error);
    // Fallback dans le groupe courant
    try {
      await api.sendMessage(
        `🔔 ${target.name}, tu as reçu un message privé de ${senderLabel}. Écris \`${prefix}voir\` pour le consulter.`,
        getThreadID(event)
      );
    } catch (_) {}
  }
  return true;
}

// ---------------------------------------------------------------------------
// Commande !voir
// ---------------------------------------------------------------------------

async function handleVoir(context = {}) {
  const { api, message, event, globalData } = context;
  const prefix = getPrefix(context);
  const userID = getSenderID(event);
  if (!userID) return send({ api, message, event }, "❌ Impossible d’identifier ton compte.");

  await loadAll(globalData);
  const box = store[userID];
  if (!box || !Array.isArray(box.inbox) || box.inbox.length === 0) {
    return send({ api, message, event }, `📭 Aucun message reçu.\n\n💡 Quand quelqu’un t’écrira, reviens avec \`${prefix}voir\`.`);
  }

  const now = Date.now();
  const fresh = box.inbox.filter(m => m && now - (m.at || 0) <= MESSAGE_TTL_MS);
  if (fresh.length === 0) {
    await mutate(globalData, () => {
      store[userID] = { inbox: [] };
      return { persist: "messages" };
    });
    return send({ api, message, event }, "📭 Tous tes messages ont expiré (plus de 7 jours).");
  }

  const lines = fresh.map((m, i) => {
    const status = m.read ? "✔️ lu" : "🆕 non lu";
    const preview = String(m.text).slice(0, 500);
    return [
      `**${i + 1}.** ${status}`,
      `👤 De : ${m.fromName || "Utilisateur"}`,
      `🕐 ${formatDate(m.at)}`,
      `💬 « ${preview}${String(m.text).length > 500 ? "…" : ""} »`
    ].join("\n");
  });

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
// Détection
// ---------------------------------------------------------------------------

function invokedCommand(context) {
  const body = String(context.event && context.event.body || "").trim();
  const firstToken = body.split(/\s+/)[0] || "";
  const raw = normalize(firstToken.replace(/^[^A-Za-z0-9]+/, ""));
  if (raw === "voir" || raw === "messages" || raw === "inbox") return "voir";
  if (raw === "message" || raw === "msg" || raw === "dm") return "message";
  return normalize(context.commandName || "");
}

async function handleCommand(context = {}) {
  const prefix = getPrefix(context);
  const body = String(context.event && context.event.body || "").trim();

  // Cas particulier : "!1", "!2"… pour choisir le destinataire
  const numericMatch = body.match(new RegExp(`^\\${prefix}\\s*(\\d+)\\s*$`));
  if (numericMatch) {
    return handleNumberSelection(context, parseInt(numericMatch[1], 10));
  }

  const invoked = invokedCommand(context);
  if (invoked === "voir") return handleVoir(context);
  return handleMessage(context);
}

module.exports = {
  config: {
    name: "message",
    aliases: ["msg", "dm", "voir", "messages", "inbox"],
    version: "2.0.0",
    author: "Diwate",
    description: "Envoie un message privé à un utilisateur (choix par !1, !2…) et notifie dans son groupe le plus actif",
    category: "Social",
    usages: "message <texte> | <préfixe><numéro> | message annule | voir",
    role: 0
  },
  STORAGE_KEY,
  INDEX_KEY,
  ACTIVITY_KEY,
  MAX_MESSAGE_LENGTH,
  trackActivity,
  getMostActiveThread,
  handleMessage,
  handleNumberSelection,
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

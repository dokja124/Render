"use strict";

const { send } = require("./lib/messenger");

const STORAGE_KEY = "privateMessagesV5";
const INDEX_KEY = "privateMessagesUsersV5";
const ACTIVITY_KEY = "privateMessagesActivityV5";
const MAX_MESSAGE_LENGTH = 1500;
const MAX_INBOX = 50;
const MESSAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RECIPIENTS_PER_PAGE = 20;
const MAX_THREADS_PER_USER = 20;

let store = null;
let knownUsers = null;
let activity = null;
let loadPromise = null;
let mutationQueue = Promise.resolve();
const MAX_TRACKED_EVENT_IDS = 1000;
const RECENT_ACTIVITY_EVENT_IDS = new Map();
const RECENT_ACTIVITY_EVENT_OBJECTS = new WeakSet();

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

function isNettoieMessage(event, context = {}) {
  const body = String(event && (event.body || event.message) || "").trim();
  if (!body) return false;
  const token = body.split(/\s+/, 1)[0];
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  const configured = context.prefix || config.prefix || "!";
  const prefixes = Array.isArray(configured) ? configured : [configured];
  return prefixes.some(value => {
    const prefix = String(value || "");
    return prefix && token.startsWith(prefix) && normalize(token.slice(prefix.length)) === "nettoie";
  });
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
  const name = String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || /^\d+$/.test(name) || /^(?:undefined|null|\[object object\])$/i.test(name)) return fallback;
  return Array.from(name).slice(0, 50).join("");
}

function extractProfileName(profile) {
  if (typeof profile === "string") return cleanName(profile, "");
  if (!profile || typeof profile !== "object") return "";
  return cleanName(profile.name || profile.fullName || profile.displayName || profile.nickname || profile.firstName, "");
}

function getOwnerDisplayName() {
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  return cleanName(config.ownerName || config.botName || "Propriétaire", "Propriétaire");
}

function formatDate(ts) {
  try {
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch (_) { return "date inconnue"; }
}

function makeMessageID() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Persistance locale (fallback si globalData absent)
// ---------------------------------------------------------------------------

async function loadAll(globalData) {
  if (store && knownUsers && activity) return { store, knownUsers, activity };
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    store = {};
    knownUsers = {};
    activity = {};
    if (globalData && typeof globalData.get === "function") {
      await ensureGlobalDataKey(globalData, STORAGE_KEY, {});
      await ensureGlobalDataKey(globalData, INDEX_KEY, {});
      await ensureGlobalDataKey(globalData, ACTIVITY_KEY, {});
      try { store = (await globalData.get(STORAGE_KEY, "data", {})) || {}; } catch (e) { console.warn("[Message] Lecture du stockage des messages impossible :", e.message || e); }
      try { knownUsers = (await globalData.get(INDEX_KEY, "data", {})) || {}; } catch (e) { console.warn("[Message] Lecture de l’index utilisateurs impossible :", e.message || e); }
      try { activity = (await globalData.get(ACTIVITY_KEY, "data", {})) || {}; } catch (e) { console.warn("[Message] Lecture de l’activité impossible :", e.message || e); }
    }
    if (!store || typeof store !== "object" || Array.isArray(store)) store = {};
    if (!knownUsers || typeof knownUsers !== "object" || Array.isArray(knownUsers)) knownUsers = {};
    if (!activity || typeof activity !== "object" || Array.isArray(activity)) activity = {};
    const now = Date.now();
    for (const [id, msg] of Object.entries(store)) {
      if (!msg || (msg.at && now - msg.at > MESSAGE_TTL_MS)) delete store[id];
    }
    return { store, knownUsers, activity };
  })();
  try { return await loadPromise; } finally { loadPromise = null; }
}

async function ensureGlobalDataKey(globalData, key, initialData) {
  if (!globalData || typeof globalData.create !== "function") return;
  try {
    if (typeof globalData.existsSync === "function" && globalData.existsSync(key)) return;
    await globalData.create(key, { data: initialData });
  } catch (error) {
    if (error && (error.name === "KEY_EXISTS" || error.code === "KEY_EXISTS")) return;
    console.warn(`[Message] Création du stockage ${key} impossible :`, error && (error.message || error));
  }
}

async function persist(globalData, which) {
  if (!globalData || typeof globalData.set !== "function") return;
  try {
    if (which === "messages" || which === "all") await globalData.set(STORAGE_KEY, store, "data");
    if (which === "users" || which === "all") await globalData.set(INDEX_KEY, knownUsers, "data");
    if (which === "activity" || which === "all") await globalData.set(ACTIVITY_KEY, activity, "data");
  } catch (e) { console.warn("[Message] Échec de sauvegarde persistante :", e && (e.message || e)); }
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

// ---------------------------------------------------------------------------
// Résolution du pseudo
// ---------------------------------------------------------------------------

async function resolveDisplayName(context, userID) {
  const id = normalizeID(userID);
  if (!id) return "Utilisateur";
  if (isOwner(id)) return getOwnerDisplayName();

  await loadAll(context.globalData);

  const usersData = context.usersData;
  if (usersData && typeof usersData.get === "function") {
    try {
      const p = await usersData.get(id);
      const name = extractProfileName(p);
      if (name) return name;
    } catch (_) {}
  }

  const api = context.api;
  if (api && typeof api.getUserInfo === "function") {
    try {
      const profiles = await api.getUserInfo([id]);
      const p = profiles && (profiles[id] || profiles[Number(id)]);
      const name = extractProfileName(p);
      if (name) return name;
    } catch (_) {}
  }
  if (knownUsers[id] && knownUsers[id].name) return cleanName(knownUsers[id].name, `Utilisateur ${id.slice(-4)}`);
  return `Utilisateur ${id.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Lecture ROBUSTE de TOUS les utilisateurs de GoatBot
// ---------------------------------------------------------------------------

async function getAllUsersFromGoatBot(context) {
  const result = new Map();
  const add = (idValue, profile) => {
    const id = normalizeID(idValue);
    if (!id) return;
    const name = extractProfileName(profile);
    const fallback = `Utilisateur ${id.slice(-4)}`;
    if (!result.has(id) || (result.get(id) === fallback && name)) result.set(id, name || fallback);
  };
  const addList = list => {
    if (!Array.isArray(list)) return;
    for (const user of list) {
      const id = normalizeID(user && (user.userID || user.userId || user.id));
      add(id, user);
    }
  };

  // Source canonique : la base des fiches utilisateurs du bot.
  const usersData = context.usersData || (global.GoatBot && global.GoatBot.usersData);
  if (usersData && typeof usersData.getAll === "function") {
    try {
      addList(await usersData.getAll());
    } catch (e) {
      console.warn("[Message] usersData.getAll a échoué :", e.message || e);
    }
  }

  // Sources de secours : elles complètent aussi une liste partielle de getAll().
  if (global.db && Array.isArray(global.db.allUserData)) addList(global.db.allUserData);
  if (global.GoatBot && Array.isArray(global.GoatBot.allUserData)) addList(global.GoatBot.allUserData);

  if (global.GoatBot && global.GoatBot.users instanceof Map) {
    for (const [id, user] of global.GoatBot.users.entries()) {
      add(id, user);
    }
  }

  return Array.from(result.entries()).map(([userID, name]) => ({ userID, name }));
}

// ---------------------------------------------------------------------------
// trackActivity
// ---------------------------------------------------------------------------

async function trackActivity(context = {}) {
  const { event, globalData } = context;
  if (isNettoieMessage(event, context)) return;
  const eventType = String(event && event.type || "").toLowerCase();
  if (eventType && eventType !== "message" && eventType !== "message_reply") return;
  const userID = getSenderID(event);
  const threadID = getThreadID(event);
  if (!userID || !threadID) return;

  const rawMessageID = normalizeID(event && (event.messageID || event.messageId));
  const activityEventID = rawMessageID ? `${threadID}:${rawMessageID}` : "";
  if (activityEventID && RECENT_ACTIVITY_EVENT_IDS.has(activityEventID)) return;
  if (!activityEventID && event && typeof event === "object") {
    if (RECENT_ACTIVITY_EVENT_OBJECTS.has(event)) return;
    RECENT_ACTIVITY_EVENT_OBJECTS.add(event);
  }
  if (activityEventID) {
    RECENT_ACTIVITY_EVENT_IDS.set(activityEventID, Date.now());
    while (RECENT_ACTIVITY_EVENT_IDS.size > MAX_TRACKED_EVENT_IDS) {
      RECENT_ACTIVITY_EVENT_IDS.delete(RECENT_ACTIVITY_EVENT_IDS.keys().next().value);
    }
  }

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

  const name = await resolveDisplayName(context, userID);
  await mutate(globalData, () => {
    knownUsers[userID] = { name, lastSeen: Date.now(), isOwner: isOwner(userID) };
    return { persist: "users" };
  });
}

async function getMostActiveThread(globalData, userID) {
  await loadAll(globalData);
  const map = activity[normalizeID(userID)];
  if (!map || typeof map !== "object") return null;
  let best = null, bestCount = 0;
  for (const [tid, count] of Object.entries(map)) {
    const n = Number(count) || 0;
    if (n > bestCount) { bestCount = n; best = tid; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Construction de la liste des destinataires
// ---------------------------------------------------------------------------

async function buildRecipientsList(context) {
  const { globalData, event } = context;
  const senderID = getSenderID(event);
  await loadAll(globalData);

  const goatUsers = await getAllUsersFromGoatBot(context);

  const merged = new Map();
  for (const u of goatUsers) merged.set(u.userID, u.name);
  for (const [id, info] of Object.entries(knownUsers)) {
    if (info && info.name && !merged.has(id)) merged.set(id, cleanName(info.name, `Utilisateur ${id.slice(-4)}`));
  }

  const list = [];
  const seen = new Set();

  for (const ownerID of getOwnerIDs()) {
    if (ownerID === senderID || seen.has(ownerID)) continue;
    seen.add(ownerID);
    list.push({ userID: ownerID, name: getOwnerDisplayName(), isOwner: true });
  }

  const others = Array.from(merged.entries())
    .filter(([id]) => id !== senderID && !seen.has(id))
    .map(([id, name]) => ({
      userID: id,
      name,
      isOwner: isOwner(id),
      lastSeen: (knownUsers[id] && knownUsers[id].lastSeen) || 0
    }))
    .sort((a, b) => b.lastSeen - a.lastSeen || a.name.localeCompare(b.name, "fr"));

  for (const u of others) list.push({ userID: u.userID, name: u.name, isOwner: u.isOwner });

  return list;
}

function buildRecipientsText(prefix, list, requestedPage = 1) {
  const pageSize = RECIPIENTS_PER_PAGE;
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const page = Math.max(1, Math.min(pageCount, Math.floor(Number(requestedPage) || 1)));
  const start = (page - 1) * pageSize;
  const lines = list.slice(start, start + pageSize).map((r, i) => `${start + i + 1}. ${r.name}${r.isOwner ? " 👑" : ""}`);
  return [
    `📬 **Choisis le destinataire** en écrivant \`${prefix}choisir <numéro>\`.`,
    "",
    lines.join("\n"),
    "",
    pageCount > 1 ? `📄 Page ${page}/${pageCount} — écris \`${prefix}message page <numéro>\` pour parcourir les autres pages.` : "",
    `💡 Exemple : \`${prefix}choisir ${start + 1}\``,
    `🛑 Annuler : \`${prefix}message annule\``
  ].filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// Sous-commandes
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

  const pageMatch = rawText.match(/^page(?:\s+(\d+))?$/i);
  if (pageMatch) {
    await loadAll(globalData);
    const pending = store[`pending_${senderID}`];
    if (!pending || pending.type !== "pending" || !Array.isArray(pending.recipients)) {
      return send({ api, message, event }, `❌ Aucun choix de destinataire en attente. Commence par \`${prefix}message <ton message>\`.`);
    }
    const page = pageMatch[1] ? Number(pageMatch[1]) : 1;
    const pageCount = Math.max(1, Math.ceil(pending.recipients.length / RECIPIENTS_PER_PAGE));
    if (!Number.isInteger(page) || page < 1 || page > pageCount) {
      return send({ api, message, event }, `❌ Page invalide. Choisis une page entre 1 et ${pageCount}.`);
    }
    return send({ api, message, event }, buildRecipientsText(prefix, pending.recipients, page));
  }

  if (["annule", "annuler", "cancel", "stop"].includes(firstWord)) {
    await mutate(globalData, () => {
      delete store[`pending_${senderID}`];
      return { persist: "messages" };
    });
    return send({ api, message, event }, "🛑 Envoi de message annulé.");
  }

  const senderName = await resolveDisplayName(context, senderID);

  if (!rawText) {
    return send(
      { api, message, event },
      `📨 **Commande message**\n\n` +
      `\`${prefix}message <ton message>\` puis \`${prefix}choisir <numéro>\`\n` +
      `\`${prefix}voir\` pour lire tes messages\n` +
      `\`${prefix}message annule\` pour annuler`
    );
  }

  if (rawText.length > MAX_MESSAGE_LENGTH) {
    return send({ api, message, event }, `❌ Message trop long (${rawText.length}). Limite : ${MAX_MESSAGE_LENGTH}.`);
  }

  const recipients = await buildRecipientsList(context);
  if (recipients.length === 0) {
    return send({ api, message, event }, "⚠️ Aucun autre utilisateur connu. Attends que d'autres personnes utilisent le bot.");
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
  if (!Number.isInteger(index) || index < 1 || index > recipients.length) {
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

  await send(
    { api, message, event },
    `📨 **Message envoyé à ${target.name}** ✅\n\nDès que ${target.name} écrira \`${prefix}voir\`, il/elle verra ton message.`
  );

  const activeThread = await getMostActiveThread(globalData, target.userID);
  const notifyThread = activeThread || getThreadID(event);
  const senderLabel = pending.fromName || "Quelqu’un";

  try {
    await api.sendMessage(
      `🔔 ${target.name}, tu as reçu un message privé de ${senderLabel}. Écris \`${prefix}voir\` pour le consulter.`,
      notifyThread
    );
  } catch (error) {
    console.warn("[Message] notif :", error.message || error);
    try {
      await api.sendMessage(
        `🔔 ${target.name}, tu as reçu un message privé de ${senderLabel}. Écris \`${prefix}voir\` pour le consulter.`,
        getThreadID(event)
      );
    } catch (_) {}
  }
  return true;
}

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
    `✅ Marques comme lus.\nPour répondre : \`${prefix}message <texte>\` puis \`${prefix}choisir <numéro>\`.`
  );
}

// ---------------------------------------------------------------------------
// Routage interne
// ---------------------------------------------------------------------------

async function handleCommand(context = {}) {
  const args = Array.isArray(context.args) ? context.args : [];
  const commandName = String(context.commandName || "").toLowerCase();
  const body = String(context.event && context.event.body || "").trim();
  const firstToken = body.split(/\s+/)[0] || "";
  const invokedFromBody = normalize(firstToken.replace(/^[^A-Za-z0-9]+/, ""));

  const invoked = commandName || invokedFromBody;

  // Cas "!choisir 2" / "!select 2" / "!destinataire 2"
  if (["choisir", "select", "destinataire"].includes(invoked) || ["choisir", "select", "destinataire"].includes(invokedFromBody)) {
    const rawSelection = String(args[0] || "").trim();
    const num = /^\d+$/.test(rawSelection) ? Number(rawSelection) : NaN;
    if (!Number.isInteger(num)) {
      return send(context, "❌ Utilisation : `!choisir <numéro>` — exemple : `!choisir 2`.");
    }
    return handleNumberSelection(context, num);
  }

  // Cas "!voir"
  if (invoked === "voir" || invoked === "messages" || invoked === "inbox" || ["voir", "messages", "inbox"].includes(invokedFromBody)) {
    return handleVoir(context);
  }

  // Sinon : !message
  return handleMessage(context);
}

module.exports = {
  config: {
    name: "message",
    aliases: ["msg", "dm", "voir", "messages", "inbox", "choisir", "select", "destinataire"],
    version: "6.0.0",
    author: "Diwate",
    description: "Enregistre les utilisateurs actifs et permet de leur envoyer un message privé via une liste paginée",
    category: "Social",
    usages: "message <texte> | message page <numéro> | choisir <numéro> | message annule | voir",
    role: 0
  },
  STORAGE_KEY, INDEX_KEY, ACTIVITY_KEY, MAX_MESSAGE_LENGTH,
  trackActivity, getMostActiveThread, getAllUsersFromGoatBot,
  handleMessage, handleNumberSelection, handleVoir,
  buildRecipientsList, buildRecipientsText, resolveDisplayName, cleanName, extractProfileName,
  async _clearMemory() {
    await mutationQueue.catch(() => {});
    store = {};
    knownUsers = {};
    activity = {};
    loadPromise = null;
    mutationQueue = Promise.resolve();
    RECENT_ACTIVITY_EVENT_IDS.clear();
    return true;
  },
  onChat: function (context) {
    return async function () {
      try { await trackActivity(context); }
      catch (error) { console.warn("[Message] Suivi de l’activité impossible :", error && (error.message || error)); }
    };
  },
  onStart: async function (context) {
    try {
      await trackActivity(context);
      return await handleCommand(context);
    } catch (error) {
      console.error("[Commande message]", error.stack || error);
      return send(context, "❌ La commande message a échoué. Réessaie.");
    }
  }
};

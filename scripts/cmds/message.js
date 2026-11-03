"use strict";

const { send } = require("./lib/messenger");

const STORAGE_KEY = "privateMessagesV6";
const INDEX_KEY = "privateMessagesUsersV6";
const ACTIVITY_KEY = "privateMessagesActivityV6";
const MAX_MESSAGE_LENGTH = 1500;
const MAX_INBOX = 50;
const MESSAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RECIPIENTS_PER_PAGE = 20;
const MAX_THREADS_PER_USER = 20;
const MAX_NOTIFICATIONS = 5; // Éviter de spammer si l'utilisateur est dans 50 groupes

let store = null;
let knownUsers = null;
let activity = null;
let loadPromise = null;
let mutationQueue = Promise.resolve();
const RECENT_ACTIVITY_EVENT_IDS = new Map();

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
      await ensureGlobalDataKey(globalData, STORAGE_KEY, {});
      await ensureGlobalDataKey(globalData, INDEX_KEY, {});
      await ensureGlobalDataKey(globalData, ACTIVITY_KEY, {});
      try { store = (await globalData.get(STORAGE_KEY, "data", {})) || {}; } catch (e) {}
      try { knownUsers = (await globalData.get(INDEX_KEY, "data", {})) || {}; } catch (e) {}
      try { activity = (await globalData.get(ACTIVITY_KEY, "data", {})) || {}; } catch (e) {}
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
  } catch (error) {}
}

async function persist(globalData, which) {
  if (!globalData || typeof globalData.set !== "function") return;
  try {
    if (which === "messages" || which === "all") await globalData.set(STORAGE_KEY, store, "data");
    if (which === "users" || which === "all") await globalData.set(INDEX_KEY, knownUsers, "data");
    if (which === "activity" || which === "all") await globalData.set(ACTIVITY_KEY, activity, "data");
  } catch (e) {}
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
// Résolution et Récupération des utilisateurs
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

  const usersData = context.usersData || (global.GoatBot && global.GoatBot.usersData);
  if (usersData && typeof usersData.getAll === "function") {
    try { addList(await usersData.getAll()); } catch (e) {}
  }

  if (global.db && Array.isArray(global.db.allUserData)) addList(global.db.allUserData);
  if (global.GoatBot && Array.isArray(global.GoatBot.allUserData)) addList(global.GoatBot.allUserData);

  if (global.GoatBot && global.GoatBot.users instanceof Map) {
    for (const [id, user] of global.GoatBot.users.entries()) add(id, user);
  }

  return Array.from(result.entries()).map(([userID, name]) => ({ userID, name }));
}

async function trackActivity(context = {}) {
  const { event, globalData } = context;
  if (!event || !event.senderID) return;
  const userID = getSenderID(event);
  const threadID = getThreadID(event);
  if (!userID || !threadID) return;

  const rawMessageID = normalizeID(event && (event.messageID || event.messageId));
  const activityEventID = rawMessageID ? `${threadID}:${rawMessageID}` : "";
  if (activityEventID && RECENT_ACTIVITY_EVENT_IDS.has(activityEventID)) return;
  if (activityEventID) {
    RECENT_ACTIVITY_EVENT_IDS.set(activityEventID, Date.now());
    if (RECENT_ACTIVITY_EVENT_IDS.size > 1000) {
      RECENT_ACTIVITY_EVENT_IDS.delete(RECENT_ACTIVITY_EVENT_IDS.keys().next().value);
    }
  }

  await loadAll(globalData);
  await mutate(globalData, () => {
    if (!activity[userID] || typeof activity[userID] !== "object") activity[userID] = {};
    activity[userID][threadID] = (Number(activity[userID][threadID]) || 0) + 1;
    return { persist: "activity" };
  });

  const name = await resolveDisplayName(context, userID);
  await mutate(globalData, () => {
    knownUsers[userID] = { name, lastSeen: Date.now(), isOwner: isOwner(userID) };
    return { persist: "users" };
  });
}

// ---------------------------------------------------------------------------
// Récupération des groupes d'un utilisateur
// ---------------------------------------------------------------------------

async function getAllActiveThreads(globalData, userID) {
  await loadAll(globalData);
  const map = activity[normalizeID(userID)];
  if (!map || typeof map !== "object") return [];
  
  // On trie par nombre de messages décroissant, et on renvoie les IDs des threads
  return Object.entries(map)
    .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
    .map(([tid]) => tid);
}

// ---------------------------------------------------------------------------
// Recherche intelligente du destinataire par pseudo
// ---------------------------------------------------------------------------

async function findTargetByName(context, nameToFind) {
  const query = normalize(nameToFind);
  if (!query) return [];

  const goatUsers = await getAllUsersFromGoatBot(context);
  const merged = new Map();
  
  for (const u of goatUsers) merged.set(u.userID, u.name);
  for (const [id, info] of Object.entries(knownUsers)) {
    if (info && info.name && !merged.has(id)) merged.set(id, cleanName(info.name));
  }

  const matches = [];
  for (const [id, name] of merged.entries()) {
    const safeName = normalize(name);
    if (safeName === query) {
        matches.push({ userID: id, name, exact: true });
    } else if (safeName.includes(query) || query.includes(safeName)) {
        matches.push({ userID: id, name, exact: false });
    }
  }

  return matches.sort((a, b) => b.exact - a.exact);
}

function buildRecipientsText(prefix, list, requestedPage = 1) {
  const pageSize = RECIPIENTS_PER_PAGE;
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const page = Math.max(1, Math.min(pageCount, Math.floor(Number(requestedPage) || 1)));
  const start = (page - 1) * pageSize;
  const lines = list.slice(start, start + pageSize).map((r, i) => `${start + i + 1}. ${r.name}${r.isOwner ? " 👑" : ""}`);
  return [
    `📬 **Plusieurs destinataires possibles.** Choisis avec \`${prefix}choisir <numéro>\`.`,
    "",
    lines.join("\n"),
    "",
    `🛑 Annuler : \`${prefix}message annule\``
  ].filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// Envoi de la notification dans plusieurs groupes
// ---------------------------------------------------------------------------

async function sendNotificationsToUserGroups(context, targetID, targetName, senderName, prefix, fallbackThread) {
  const { api, globalData } = context;
  
  let threadsToNotify = await getAllActiveThreads(globalData, targetID);
  
  // Si on n'a aucun groupe enregistré pour lui, on utilise le groupe courant
  if (threadsToNotify.length === 0) {
    threadsToNotify = [fallbackThread];
  } else {
    // S'assurer que le groupe courant est inclus s'il n'y est pas
    if (!threadsToNotify.includes(fallbackThread)) {
      threadsToNotify.push(fallbackThread);
    }
    // Limiter pour éviter le spam / rate limit
    threadsToNotify = threadsToNotify.slice(0, MAX_NOTIFICATIONS);
  }

  const notificationText = `🔔 **Notification privée**\n${targetName}, tu as reçu un message privé de ${senderName}. Écris \`${prefix}voir\` dans ce groupe pour le consulter.`;

  for (const threadID of threadsToNotify) {
    try {
      await api.sendMessage(notificationText, threadID);
      // Petit délai pour éviter que Facebook ne considère ça comme du spam
      await sleep(800); 
    } catch (error) {
      // On ignore l'erreur si le bot n'est plus dans le groupe ou n'a pas la permission
      console.warn(`[Message] Impossible de notifier dans le groupe ${threadID}:`, error.message || error);
    }
  }
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

  await trackActivity(context);

  let rawText = args.length ? args.join(" ").trim() : body.replace(/^[^\s]+\s*/, "").trim();
  const firstWord = normalize(rawText.split(/\s+/)[0] || "");

  if (["annule", "annuler", "cancel", "stop"].includes(firstWord)) {
    await mutate(globalData, () => {
      delete store[`pending_${senderID}`];
      return { persist: "messages" };
    });
    return send({ api, message, event }, "🛑 Envoi de message annulé.");
  }

  if (!rawText) {
    return send(
      { api, message, event },
      `📨 **Commande message**\n\n` +
      `Réponds au message de quelqu'un et écris \`${prefix}message <ton texte>\`\n` +
      `Ou écris \`${prefix}message <ton texte> à <pseudo>\`\n` +
      `Exemple : \`${prefix}message Salut ! à Daniel\`\n\n` +
      `\`${prefix}voir\` pour lire tes messages`
    );
  }

  if (rawText.length > MAX_MESSAGE_LENGTH) {
    return send({ api, message, event }, `❌ Message trop long (${rawText.length}). Limite : ${MAX_MESSAGE_LENGTH}.`);
  }

  let targetID = null;
  let finalText = rawText;

  const reply = event.messageReply || event.repliedMessage;
  if (reply && reply.senderID && String(reply.senderID) !== senderID) {
    targetID = String(reply.senderID);
  }

  if (!targetID && event.mentions && Object.keys(event.mentions).length > 0) {
    targetID = Object.keys(event.mentions)[0];
    const mentionName = event.mentions[targetID];
    finalText = finalText.replace(new RegExp(`@${mentionName}`, 'gi'), '').replace(new RegExp(mentionName, 'gi'), '').trim();
    if (!finalText) finalText = rawText;
  }

  if (!targetID) {
    let pseudoQuery = null;
    let extractedText = rawText;

    const regexA = /\s+(?:à|a|pour)\s+(.+)$/i;
    const matchA = rawText.match(regexA);
    
    if (matchA) {
      pseudoQuery = matchA[1].trim();
      extractedText = rawText.substring(0, matchA.index).trim();
    } else {
      const words = rawText.split(/\s+/);
      if (words.length > 1) {
        pseudoQuery = words[words.length - 1];
        extractedText = words.slice(0, -1).join(" ");
      }
    }

    if (pseudoQuery) {
      const matches = await findTargetByName(context, pseudoQuery);
      if (matches.length === 1) {
        targetID = matches[0].userID;
        finalText = extractedText;
      } else if (matches.length > 1) {
        const senderName = await resolveDisplayName(context, senderID);
        await mutate(globalData, () => {
          store[`pending_${senderID}`] = {
            type: "pending",
            from: senderID,
            fromName: senderName,
            threadID: getThreadID(event),
            text: extractedText,
            at: Date.now(),
            recipients: matches.map(m => ({ userID: m.userID, name: m.name, isOwner: isOwner(m.userID) }))
          };
          return { persist: "messages" };
        });
        return send({ api, message, event }, `⚠️ J'ai trouvé plusieurs personnes pour "${pseudoQuery}".\n\n` + buildRecipientsText(prefix, matches));
      } else {
        return send({ api, message, event }, `❌ Aucun utilisateur trouvé avec le pseudo "${pseudoQuery}".\nVérifie l'orthographe ou réponds directement à son message avec \`${prefix}message <texte>\`.`);
      }
    }
  }

  if (!targetID) {
    return send({ api, message, event }, `❓ Je ne sais pas à qui envoyer ce message.\nRéponds à son message avec \`${prefix}message <texte>\` ou précise \`${prefix}message <texte> à <pseudo>\`.`);
  }

  const targetName = await resolveDisplayName(context, targetID);
  const senderName = await resolveDisplayName(context, senderID);
  const messageID = makeMessageID();
  const now = Date.now();

  await mutate(globalData, () => {
    const box = store[targetID] && typeof store[targetID] === "object" && !store[targetID].type
      ? store[targetID]
      : { inbox: [] };
    if (!Array.isArray(box.inbox)) box.inbox = [];
    box.inbox.push({
      id: messageID,
      from: senderID,
      fromName: senderName,
      text: finalText,
      at: now,
      read: false
    });
    if (box.inbox.length > MAX_INBOX) box.inbox = box.inbox.slice(-MAX_INBOX);
    store[targetID] = box;
    return { persist: "messages" };
  });

  await send(
    { api, message, event },
    `📨 **Message envoyé à ${targetName}** ✅\n\nDès que ${targetName} écrira \`${prefix}voir\`, il/elle verra ton message.`
  );

  // Envoi des notifications dans les groupes du destinataire
  await sendNotificationsToUserGroups(context, targetID, targetName, senderName, prefix, getThreadID(event));

  return true;
}

async function handleNumberSelection(context, index) {
  const { api, message, event, globalData } = context;
  const prefix = getPrefix(context);
  const senderID = getSenderID(event);

  await loadAll(globalData);
  const pending = store[`pending_${senderID}`];

  if (!pending || pending.type !== "pending") {
    return send({ api, message, event }, `❌ Aucun message en attente. Commence par \`${prefix}message <texte> à <pseudo>\`.`);
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

  // Envoi des notifications dans les groupes du destinataire
  await sendNotificationsToUserGroups(context, target.userID, target.name, pending.fromName, prefix, getThreadID(event));

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
    `✅ Marques comme lus.\nPour répondre : \`${prefix}message <texte> à <pseudo>\``
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

  if (["choisir", "select"].includes(invoked)) {
    const num = parseInt(args[0], 10);
    if (isNaN(num)) {
      return send(context, "❌ Utilisation : `!choisir <numéro>` — exemple : `!choisir 2`.");
    }
    return handleNumberSelection(context, num);
  }

  if (["voir", "messages", "inbox"].includes(invoked)) {
    return handleVoir(context);
  }

  return handleMessage(context);
}

module.exports = {
  config: {
    name: "message",
    aliases: ["msg", "dm", "voir", "messages", "inbox", "choisir", "select"],
    version: "6.2.0",
    author: "Diwate",
    description: "Envoie un message privé (syntaxe : !message <texte> à <pseudo>)",
    category: "Social",
    usages: "message <texte> à <pseudo> | choisir <numéro> | message annule | voir",
    role: 0
  },
  trackActivity,
  getAllUsersFromGoatBot,
  handleMessage,
  handleNumberSelection,
  handleVoir,
  onStart: async function (context) {
    try {
      return await handleCommand(context);
    } catch (error) {
      console.error("[Commande message]", error.stack || error);
      return send(context, "❌ La commande message a échoué. Réessaie.");
    }
  }
};

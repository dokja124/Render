"use strict";

const { send } = require("./lib/messenger");

const STORAGE_KEY = "userCommandUsageLimitsV1";
const ACTIVE_DURATION_MS = 10 * 60 * 1000;
const COOLDOWN_DURATION_MS = 10 * 60 * 1000;
const STATE_CACHE_MS = 500;
const MAX_USERS_IN_STATE = 50000;
const GUARDED_HOOKS = ["onStart", "onReply", "onChat", "onEvent", "onAnyEvent", "onFirstChat", "onReaction"];
const WRAPPED_COMMANDS = new WeakSet();
const PATCHED_MAPS = new WeakSet();

let cachedState = null;
let cachedAt = 0;
let stateMutationQueue = Promise.resolve();

function normalizeID(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    return String(value.id || value.userID || value.userId || value.senderID || value.author || "").trim();
  }
  return String(value).trim();
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getOwnerIDs() {
  const envOwner = String(process.env.BOT_OWNER_ID || "").trim();
  if (envOwner) return [envOwner];

  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  const explicitOwner = normalizeID(config.ownerID || config.ownerId || config.botOwnerID);
  if (explicitOwner) return [explicitOwner];

  const admins = Array.isArray(config.adminBot) ? config.adminBot : config.adminBot ? [config.adminBot] : [];
  const firstAdmin = admins.map(normalizeID).find(Boolean);
  return firstAdmin ? [firstAdmin] : [];
}

function isOwner(event) {
  const senderID = normalizeID(event && (event.senderID || event.senderId || event.userID || event.author));
  return Boolean(senderID && getOwnerIDs().includes(senderID));
}

function getPrefix(context = {}) {
  if (context.prefix) return String(context.prefix);
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  const prefix = config.prefix;
  if (Array.isArray(prefix)) return String(prefix[0] || "!");
  return String(prefix || "!");
}

function normalizeState(value) {
  const state = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const users = state.users && typeof state.users === "object" && !Array.isArray(state.users) ? state.users : {};
  return { version: 1, enabled: state.enabled === true, users };
}

function getUserIDFromContext(context = {}) {
  const event = context.event || {};
  return normalizeID(event.senderID || event.senderId || event.userID || event.author);
}

async function ensureStorageKey(globalData) {
  if (!globalData || typeof globalData.get !== "function") {
    throw new Error("Le stockage global du bot n’est pas disponible.");
  }
  if (typeof globalData.existsSync === "function" && globalData.existsSync(STORAGE_KEY)) return;
  if (typeof globalData.create !== "function") {
    // Certains anciens adaptateurs exposent get/set seulement; get est essayé ensuite.
    return;
  }
  try {
    await globalData.create(STORAGE_KEY, { data: { version: 1, enabled: false, users: {} } });
  } catch (error) {
    if (error && (error.name === "KEY_EXISTS" || error.code === "KEY_EXISTS")) return;
    throw error;
  }
}

async function readState(globalData, force = false) {
  const now = Date.now();
  if (!force && cachedState && now - cachedAt < STATE_CACHE_MS) return normalizeState(cachedState);
  await ensureStorageKey(globalData);
  const raw = await globalData.get(STORAGE_KEY, "data", { version: 1, enabled: false, users: {} });
  cachedState = normalizeState(raw);
  cachedAt = now;
  return normalizeState(cachedState);
}

async function writeState(globalData, state) {
  if (!globalData || typeof globalData.set !== "function") {
    throw new Error("Le stockage global du bot n’est pas disponible.");
  }
  const normalized = normalizeState(state);
  await ensureStorageKey(globalData);
  await globalData.set(STORAGE_KEY, normalized, "data");
  cachedState = normalized;
  cachedAt = Date.now();
  return normalizeState(normalized);
}

function enqueueMutation(task) {
  const operation = stateMutationQueue.then(task, task);
  stateMutationQueue = operation.catch(() => {});
  return operation;
}

function getCommandAction(context = {}) {
  const args = Array.isArray(context.args) ? context.args : [];
  if (args.length) return normalizeText(args.join(" "));

  const body = String(context.event && (context.event.body || context.event.message) || "").trim();
  if (!body) return "";
  return normalizeText(body.replace(/^\S+\s*/, ""));
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes} min ${String(remainder).padStart(2, "0")} s`;
}

function getWindow(record) {
  if (!record || typeof record !== "object") return null;
  const activeUntil = Number(record.activeUntil) || 0;
  const waitUntil = Number(record.waitUntil) || 0;
  if (!activeUntil || waitUntil <= activeUntil) return null;
  return { activeUntil, waitUntil, lastNoticeAt: Number(record.lastNoticeAt) || 0 };
}

function trimUsers(users, now) {
  for (const [userID, value] of Object.entries(users)) {
    const window = getWindow(value);
    if (!window || window.waitUntil + 24 * 60 * 60 * 1000 < now) delete users[userID];
  }
  const ids = Object.keys(users);
  if (ids.length > MAX_USERS_IN_STATE) {
    ids.sort((a, b) => (Number(users[a].activeUntil) || 0) - (Number(users[b].activeUntil) || 0));
    for (const userID of ids.slice(0, ids.length - MAX_USERS_IN_STATE)) delete users[userID];
  }
}

async function setLimitMode(globalData, enabled) {
  return enqueueMutation(async () => {
    const state = await readState(globalData, true);
    state.enabled = enabled === true;
    // Chaque activation repart sur un cycle neuf; désactiver efface également les compteurs.
    state.users = {};
    return writeState(globalData, state);
  });
}

async function checkUsage(context = {}, options = {}) {
  const userID = getUserIDFromContext(context);
  if (!userID || isOwner(context.event)) return { allowed: true, reason: "owner-or-no-id" };

  const commandName = String(context.commandName || "").toLowerCase();
  if (commandName === "limite") return { allowed: true, reason: "control-command" };

  return enqueueMutation(async () => {
    const globalData = context.globalData;
    const state = await readState(globalData);
    if (!state.enabled) return { allowed: true, reason: "disabled" };

    const now = Number.isFinite(options.now) ? options.now : Date.now();
    trimUsers(state.users, now);
    const previous = getWindow(state.users[userID]);

    // Une commande explicite démarre un créneau de 10 minutes si aucun créneau n’est en cours.
    // Les hooks passifs n’ouvrent pas de créneau, mais respectent les pauses déjà actives.
    if (!previous || now >= previous.waitUntil) {
      if (options.startIfMissing === false) return { allowed: true, reason: "no-command-session" };
      const record = {
        activeUntil: now + ACTIVE_DURATION_MS,
        waitUntil: now + ACTIVE_DURATION_MS + COOLDOWN_DURATION_MS,
        lastNoticeAt: now
      };
      state.users[userID] = record;
      await writeState(globalData, state);
      const notice = `⏱️ Ta période d’utilisation du bot commence maintenant : tu as 10 minutes. Après ces 10 minutes, l’accès sera en pause pendant 10 minutes, puis tu pourras recommencer.`;
      return { allowed: true, reason: "new-session", notice, activeUntil: record.activeUntil };
    }

    if (now < previous.activeUntil) return { allowed: true, reason: "active", activeUntil: previous.activeUntil };

    const remaining = previous.waitUntil - now;
    const notice = `⏳ Ta période d’utilisation est terminée. Attends encore ${formatDuration(remaining)} avant d’utiliser à nouveau les commandes du bot.`;
    return { allowed: false, reason: "cooldown", notice, retryAt: previous.waitUntil };
  });
}

async function guardHook(command, hookName, originalHook, args) {
  const context = args[0] || {};
  try {
    const result = await checkUsage(context, {
      startIfMissing: hookName === "onStart" || hookName === "onReply"
    });
    if (!result.allowed) {
      if (result.notice) await send(context, result.notice);
      return undefined;
    }
    if (result.notice) await send(context, result.notice);
  } catch (error) {
    console.error(`[Commande limite] Contrôle impossible pour ${command.config.name} :`, error && (error.stack || error.message) || error);
    if (String(command.config.name).toLowerCase() !== "limite") {
      await send(context, "⚠️ Le contrôle de limite est temporairement indisponible. Réessaie dans un instant.").catch(() => {});
      return undefined;
    }
  }
  return originalHook.apply(command, args);
}

function wrapCommand(command) {
  if (!command || !command.config || WRAPPED_COMMANDS.has(command)) return command;
  WRAPPED_COMMANDS.add(command);
  for (const hookName of GUARDED_HOOKS) {
    const originalHook = command[hookName];
    if (typeof originalHook !== "function") continue;
    command[hookName] = function (...args) {
      return guardHook(command, hookName, originalHook, args);
    };
  }
  return command;
}

function patchCommandMap(commandMap) {
  if (!commandMap || typeof commandMap.set !== "function" || PATCHED_MAPS.has(commandMap)) return;
  PATCHED_MAPS.add(commandMap);
  for (const command of commandMap.values()) wrapCommand(command);
  const originalSet = commandMap.set.bind(commandMap);
  commandMap.set = function (key, command) {
    wrapCommand(command);
    return originalSet(key, command);
  };
}

async function installGuard(context = {}) {
  const goatBot = global.GoatBot;
  if (!goatBot) return;
  patchCommandMap(goatBot.commands);
  patchCommandMap(goatBot.eventCommands);
  try {
    await readState(context.globalData, true);
  } catch (error) {
    // Un défaut de stockage ne doit pas empêcher le bot de charger; les commandes
    // ordinaires échoueront de façon contrôlée tant que le contrôle est indisponible.
    console.error("[Commande limite] Initialisation du stockage impossible :", error && (error.message || error));
  }
}

async function onStart(context = {}) {
  const { api, message, event, globalData } = context;
  const prefix = getPrefix(context);
  if (!isOwner(event)) {
    return send({ api, message, event }, "⛔ Seul le propriétaire du bot peut modifier la limite d’utilisation.");
  }

  const action = getCommandAction(context).split(/\s+/)[0];
  if (["active", "activer", "oui", "on"].includes(action)) {
    try {
      await setLimitMode(globalData, true);
      return send({ api, message, event }, "✅ Limite activée. Chaque utilisateur (sauf le propriétaire) aura 10 minutes d’accès, puis une pause de 10 minutes. Le temps commence à sa première commande.");
    } catch (error) {
      console.error("[Commande limite] Activation impossible :", error && (error.stack || error.message) || error);
      return send({ api, message, event }, "❌ Impossible d’activer la limite : le stockage persistant du bot est indisponible.");
    }
  }

  if (["desactive", "desactiver", "non", "off"].includes(action)) {
    try {
      await setLimitMode(globalData, false);
      return send({ api, message, event }, "✅ Limite désactivée. Toutes les commandes sont de nouveau disponibles sans restriction.");
    } catch (error) {
      console.error("[Commande limite] Désactivation impossible :", error && (error.stack || error.message) || error);
      return send({ api, message, event }, "❌ Impossible de désactiver la limite : le stockage persistant du bot est indisponible.");
    }
  }

  let enabled = false;
  try { enabled = (await readState(globalData, true)).enabled; }
  catch (error) {
    console.error("[Commande limite] Lecture impossible :", error && (error.message || error));
    return send({ api, message, event }, `❌ Statut indisponible. Utilisation : ${prefix}limite activé ou ${prefix}limite désactivé.`);
  }
  return send(
    { api, message, event },
    `⚙️ Limite actuellement ${enabled ? "✅ activée" : "❌ désactivée"}.\n` +
    `Activation : ${prefix}limite activé\nDésactivation : ${prefix}limite désactivé`
  );
}

module.exports = {
  config: {
    name: "limite",
    version: "1.0.0",
    author: "Diwate",
    description: "Limite l’accès des utilisateurs à des périodes de 10 minutes, suivies d’une pause de 10 minutes",
    category: "Administration",
    usages: "limite activé | limite désactivé",
    role: 0
  },
  onLoad: installGuard,
  onStart,
  // Fonctions exportées pour les tests; elles ne créent aucune autre commande/fichier runtime.
  _checkUsage: checkUsage,
  _setLimitMode: setLimitMode,
  _isOwner: isOwner,
  _getOwnerIDs: getOwnerIDs,
  _resetForTests() {
    cachedState = null;
    cachedAt = 0;
    stateMutationQueue = Promise.resolve();
  }
};

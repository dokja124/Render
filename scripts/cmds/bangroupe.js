"use strict";

const { send } = require("./lib/messenger");

const STORAGE_KEY = "goatBotGroupCommandBlocks";
const CACHE_TTL_MS = 3000;
const DEDUPE_WINDOW_MS = 120 * 1000;
const MAX_RECENT_EVENTS = 3000;
const GUARDED_HOOKS = ["onStart", "onChat", "onReply", "onEvent", "onAnyEvent", "onFirstChat", "onReaction"];

let cachedGroups = null;
let cacheUpdatedAt = 0;
let mutationQueue = Promise.resolve();
const wrappedCommands = new WeakSet();
const patchedMaps = new WeakSet();
const recentOwnerDispatches = new Map();
const recentBlockNotices = new Map();

function normalizeID(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    return String(value.id || value.userID || value.userId || value.senderID || "").trim();
  }
  return String(value).trim();
}

function getSenderID(event) {
  return normalizeID(event && (event.senderID || event.senderId || event.userID || event.userId || event.author));
}

function getThreadID(event) {
  return normalizeID(event && (event.threadID || event.threadId));
}

function cleanGroups(value) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? (value.groups && typeof value.groups === "object" && !Array.isArray(value.groups) ? value.groups : value)
    : {};
  const groups = {};
  for (const [threadID, record] of Object.entries(source)) {
    if (!threadID || !record || typeof record !== "object" || record.blocked !== true) continue;
    groups[threadID] = {
      blocked: true,
      changedAt: Number(record.changedAt) || 0,
      changedBy: normalizeID(record.changedBy)
    };
  }
  return groups;
}

function copyGroups(groups) {
  return Object.fromEntries(Object.entries(groups).map(([id, record]) => [id, { ...record }]));
}

function getOwnerIDs() {
  const configuredOwner = String(process.env.BOT_OWNER_ID || process.env.RAPHAEL_OWNER_ID || "").trim();
  if (configuredOwner) return [configuredOwner];
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  const explicitOwner = normalizeID(config.ownerID || config.ownerId);
  if (explicitOwner) return [explicitOwner];
  const configuredAdmins = Array.isArray(config.adminBot) ? config.adminBot : config.adminBot ? [config.adminBot] : [];
  const primaryOwner = configuredAdmins.map(normalizeID).find(Boolean);
  return primaryOwner ? [primaryOwner] : [];
}

function isOwner(event) {
  const senderID = getSenderID(event);
  return Boolean(senderID && getOwnerIDs().includes(senderID));
}

function getPrefixes(context = {}) {
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  const prefixes = [];
  for (const candidate of [context.prefix, config.prefix]) {
    for (const value of Array.isArray(candidate) ? candidate : [candidate]) {
      const prefix = String(value || "").trim();
      if (prefix && !prefixes.includes(prefix)) prefixes.push(prefix);
    }
  }
  if (!prefixes.length) prefixes.push("!");
  return prefixes.sort((a, b) => b.length - a.length);
}

function getAction(context = {}) {
  const event = context.event || {};
  const body = String(event.body || event.message || "").trim();
  if (body) {
    const firstToken = body.split(/\s+/)[0] || "";
    const prefix = getPrefixes(context).find(candidate => firstToken.startsWith(candidate));
    if (prefix) {
      const token = firstToken.slice(prefix.length).toLocaleLowerCase("fr-FR");
      if (token === "bangroupe") return "ban";
      if (token === "debangroupe") return "unban";
      return null;
    }
  }
  const invokedName = String(context.commandName || "").trim().toLocaleLowerCase("fr-FR");
  if (invokedName === "bangroupe") return "ban";
  if (invokedName === "debangroupe") return "unban";
  return null;
}

async function readGroupsFromStore(globalData) {
  if (!globalData || typeof globalData.get !== "function") {
    throw new Error("Le stockage persistant du bot est indisponible.");
  }
  return cleanGroups(await globalData.get(STORAGE_KEY, "data", {}));
}

async function getGroups(globalData, forceRefresh = false) {
  if (!forceRefresh && cachedGroups && Date.now() - cacheUpdatedAt < CACHE_TTL_MS) {
    return copyGroups(cachedGroups);
  }
  const groups = await readGroupsFromStore(globalData);
  cachedGroups = groups;
  cacheUpdatedAt = Date.now();
  return copyGroups(groups);
}

async function setGroupMode(globalData, threadID, blocked, changedBy) {
  if (!threadID) throw new Error("Identifiant de groupe manquant.");
  const run = async () => {
    if (!globalData || typeof globalData.set !== "function") {
      throw new Error("Le stockage persistant du bot est indisponible.");
    }
    const current = await readGroupsFromStore(globalData);
    const wasBlocked = Boolean(current[threadID] && current[threadID].blocked);
    if (wasBlocked === blocked) {
      cachedGroups = current;
      cacheUpdatedAt = Date.now();
      return { changed: false, blocked, groups: copyGroups(current) };
    }

    const next = copyGroups(current);
    if (blocked) {
      next[threadID] = { blocked: true, changedAt: Date.now(), changedBy: normalizeID(changedBy) };
    } else {
      delete next[threadID];
    }
    await globalData.set(STORAGE_KEY, next, "data");
    cachedGroups = next;
    cacheUpdatedAt = Date.now();
    return { changed: true, blocked, groups: copyGroups(next) };
  };
  const pending = mutationQueue.then(run, run);
  mutationQueue = pending.catch(() => {});
  return pending;
}

function rememberOnce(map, key, now = Date.now()) {
  const previous = map.get(key);
  if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) return false;
  map.delete(key);
  map.set(key, now);
  if (map.size > MAX_RECENT_EVENTS) {
    for (const [oldKey, timestamp] of map) {
      if (now - timestamp >= DEDUPE_WINDOW_MS || map.size > MAX_RECENT_EVENTS) map.delete(oldKey);
      if (map.size <= MAX_RECENT_EVENTS) break;
    }
  }
  return true;
}

function isDuplicateOwnerDispatch(context) {
  const event = context && context.event;
  const messageID = event && (event.messageID || event.messageId || event.mid);
  if (messageID == null || String(messageID).trim() === "") return false;
  const key = [getThreadID(event), getSenderID(event), String(messageID), getAction(context)].join(":");
  return !rememberOnce(recentOwnerDispatches, key);
}

async function isGroupThread(api, threadID) {
  if (!api || typeof api.getThreadInfo !== "function") {
    throw new Error("L’API ne permet pas de vérifier qu’il s’agit d’un groupe.");
  }
  const info = await api.getThreadInfo(threadID);
  return Boolean(info && info.isGroup === true);
}

async function handleBangroupe(context = {}) {
  const { api, event, globalData } = context;
  const action = getAction(context);
  const prefix = String(context.prefix || getPrefixes(context)[0]);
  if (!action) {
    return send(context, `❌ Utilise ${prefix}bangroupe ou ${prefix}debangroupe dans le groupe concerné.`);
  }
  if (!isOwner(event)) {
    return send(context, "⛔ Seul le propriétaire du bot peut activer ou désactiver le blocage d’un groupe.");
  }
  if (isDuplicateOwnerDispatch(context)) return undefined;

  const threadID = getThreadID(event);
  if (!threadID) {
    return send(context, "❌ Je ne peux pas identifier ce groupe.");
  }
  try {
    if (!(await isGroupThread(api, threadID))) {
      return send(context, "⛔ Cette commande fonctionne uniquement dans un groupe Messenger.");
    }
  } catch (error) {
    console.error("[Commande bangroupe] Vérification du groupe impossible :", error.message || error);
    return send(context, "❌ Je n’ai pas pu vérifier le groupe; aucun changement n’a été effectué.");
  }

  try {
    const result = await setGroupMode(globalData, threadID, action === "ban", getSenderID(event));
    if (action === "ban") {
      if (!result.changed) return send(context, "ℹ️ Les commandes du bot sont déjà bloquées dans ce groupe.");
      return send(context, `🔒 Mode groupe activé : les membres et administrateurs ne peuvent plus utiliser les commandes du bot. Le propriétaire reste autorisé. Pour réactiver les commandes ici, écris ${prefix}debangroupe.`);
    }
    if (!result.changed) return send(context, "ℹ️ Les commandes du bot sont déjà autorisées dans ce groupe.");
    return send(context, "🔓 Mode groupe désactivé : les membres et administrateurs peuvent à nouveau utiliser les commandes du bot.");
  } catch (error) {
    console.error("[Commande bangroupe] Échec du changement d’état :", error.stack || error);
    return send(context, "❌ Impossible d’enregistrer le changement. Vérifie le stockage persistant du bot, puis réessaie.");
  }
}

function wrapCommand(command, globalData) {
  if (!command || !command.config || wrappedCommands.has(command)) return command;
  wrappedCommands.add(command);
  const commandName = String(command.config.name || "commande inconnue").toLowerCase();

  for (const hookName of GUARDED_HOOKS) {
    const originalHook = command[hookName];
    if (typeof originalHook !== "function") continue;
    command[hookName] = async function (...args) {
      const context = args[0] || {};
      const event = context.event || {};
      const threadID = getThreadID(event);
      if (!threadID) return originalHook.apply(this, args);

      let blocked = false;
      try {
        const groups = await getGroups(context.globalData || globalData);
        blocked = Boolean(groups[threadID] && groups[threadID].blocked);
      } catch (error) {
        console.error(`[Commande bangroupe] Lecture du blocage impossible (${commandName}) :`, error.message || error);
        return originalHook.apply(this, args);
      }
      if (!blocked || isOwner(event)) return originalHook.apply(this, args);

      if (hookName === "onStart") {
        const messageID = event.messageID || event.messageId || event.mid || `${getSenderID(event)}:${String(event.body || "")}`;
        const noticeKey = `${threadID}:${getSenderID(event)}:${String(messageID)}`;
        if (rememberOnce(recentBlockNotices, noticeKey)) {
          try {
            await send(context, "🔒 Les commandes du bot sont temporairement bloquées dans ce groupe par son propriétaire.");
          } catch (error) {
            console.error("[Commande bangroupe] Envoi du refus impossible :", error.message || error);
          }
        }
      }
      return undefined;
    };
  }
  return command;
}

function patchCommandMap(commandMap, globalData) {
  if (!commandMap || typeof commandMap.set !== "function" || patchedMaps.has(commandMap)) return;
  patchedMaps.add(commandMap);
  for (const command of commandMap.values()) wrapCommand(command, globalData);
  const originalSet = commandMap.set.bind(commandMap);
  commandMap.set = function (key, command) {
    wrapCommand(command, globalData);
    return originalSet(key, command);
  };
}

async function installGroupGuard(context = {}) {
  const goatBot = global.GoatBot;
  if (!goatBot) return;
  patchCommandMap(goatBot.commands, context.globalData);
  patchCommandMap(goatBot.eventCommands, context.globalData);
}

module.exports = {
  config: {
    name: "bangroupe",
    aliases: ["debangroupe"],
    version: "1.0.0",
    author: "Diwate",
    description: "Bloque ou réactive les commandes du bot dans le groupe actuel (propriétaire uniquement)",
    category: "Administration",
    usages: "bangroupe | debangroupe",
    role: 0
  },
  STORAGE_KEY,
  getAction,
  cleanGroups,
  getOwnerIDs,
  isOwner,
  getGroups,
  setGroupMode,
  isDuplicateOwnerDispatch,
  installGroupGuard,
  onLoad: installGroupGuard,
  onStart: handleBangroupe,
  _resetForTests() {
    cachedGroups = null;
    cacheUpdatedAt = 0;
    mutationQueue = Promise.resolve();
    recentOwnerDispatches.clear();
    recentBlockNotices.clear();
  }
};

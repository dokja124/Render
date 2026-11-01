"use strict";

const { send } = require("./lib/messenger");

const STORAGE_KEY = "goatBotCommandBans";
const CACHE_TTL_MS = 5000;
const GUARDED_HOOKS = ["onStart", "onChat", "onReply", "onEvent", "onAnyEvent", "onFirstChat", "onReaction"];

let cachedRecords = [];
let cacheReady = false;
let cacheUpdatedAt = 0;
let cacheLoadPromise = null;
let mutationQueue = Promise.resolve();
const wrappedCommands = new WeakSet();
const patchedMaps = new WeakSet();

function normalizeID(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    return String(value.id || value.userID || value.userId || value.senderID || "").trim();
  }
  return String(value).trim();
}

function cleanName(value, fallback = "") {
  const name = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!name) return fallback;
  return name.length <= 60 ? name : `${name.slice(0, 59).trimEnd()}…`;
}

function normalizeRecords(value) {
  const source = Array.isArray(value)
    ? value
    : value && Array.isArray(value.users)
      ? value.users
      : [];
  const byID = new Map();

  for (const item of source) {
    const userID = normalizeID(item);
    if (!userID) continue;
    const record = typeof item === "object" && item !== null ? item : {};
    byID.set(userID, {
      userID,
      name: cleanName(record.name, "Membre") || "Membre",
      bannedBy: normalizeID(record.bannedBy),
      bannedAt: String(record.bannedAt || "")
    });
  }
  return Array.from(byID.values());
}

function getSenderID(event) {
  return normalizeID(event && (event.senderID || event.senderId || event.userID || event.author));
}

function getOwnerIDs() {
  const configuredOwner = String(process.env.BOT_OWNER_ID || "").trim();
  if (configuredOwner) return [configuredOwner];
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  const ids = Array.isArray(config.adminBot) ? config.adminBot : config.adminBot ? [config.adminBot] : [];
  return ids.map(normalizeID).filter(Boolean);
}

function isOwner(event) {
  const senderID = getSenderID(event);
  return Boolean(senderID && getOwnerIDs().includes(senderID));
}

function getReplyTarget(event) {
  const reply = event && (event.messageReply || event.repliedMessage || event.replyToMessage);
  if (!reply) return null;
  const id = normalizeID(reply.senderID || reply.senderId || reply.userID || reply.userId || reply.author || (reply.sender && reply.sender.id));
  if (!id) return null;
  return {
    id,
    name: cleanName(reply.senderName || reply.name || (reply.sender && reply.sender.name))
  };
}

function getPrefixes(context = {}) {
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  const candidates = [context.prefix, config.prefix];
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

function getAction(context = {}) {
  const event = context.event || {};
  const body = String(event.body || event.message || "").trim();
  if (body) {
    const firstToken = body.split(/\s+/)[0] || "";
    const prefix = getPrefixes(context).find(candidate => firstToken.startsWith(candidate));
    if (!prefix) return null;
    const token = firstToken.slice(prefix.length).toLocaleLowerCase("fr-FR");
    if (token === "deban") return "deban";
    if (token === "ban") return "ban";
    return null;
  }

  const invokedName = String(context.commandName || "").toLocaleLowerCase("fr-FR");
  if (invokedName === "deban") return "deban";
  if (invokedName === "ban") return "ban";
  return null;
}

async function readRecords(globalData) {
  if (!globalData || typeof globalData.get !== "function") {
    throw new Error("Le stockage global du bot est indisponible.");
  }
  const stored = await globalData.get(STORAGE_KEY, "data", []);
  return normalizeRecords(stored);
}

async function refreshCache(globalData) {
  if (cacheLoadPromise) return cacheLoadPromise;
  cacheLoadPromise = (async () => {
    const records = await readRecords(globalData);
    cachedRecords = records;
    cacheReady = true;
    cacheUpdatedAt = Date.now();
    return records;
  })();
  try {
    return await cacheLoadPromise;
  } finally {
    cacheLoadPromise = null;
  }
}

async function ensureCache(globalData) {
  if (cacheReady && Date.now() - cacheUpdatedAt < CACHE_TTL_MS) return cachedRecords;
  try {
    return await refreshCache(globalData);
  } catch (error) {
    console.error("[Commande ban] Lecture des bannissements impossible :", error.message || error);
    return cacheReady ? cachedRecords : [];
  }
}

async function mutateRecords(globalData, mutate) {
  const run = async () => {
    if (!globalData || typeof globalData.get !== "function" || typeof globalData.set !== "function") {
      throw new Error("Le stockage global du bot est indisponible.");
    }
    const current = await readRecords(globalData);
    const result = mutate(current);
    if (result.changed) {
      await globalData.set(STORAGE_KEY, result.records, "data");
    }
    cachedRecords = result.records;
    cacheReady = true;
    cacheUpdatedAt = Date.now();
    return result;
  };

  const pending = mutationQueue.then(run, run);
  mutationQueue = pending.catch(() => {});
  return pending;
}

async function getTargetName(target, context) {
  if (target.name) return target.name;
  const usersData = context && context.usersData;
  if (usersData && typeof usersData.getName === "function") {
    try {
      const name = cleanName(await usersData.getName(target.id));
      if (name && name !== target.id) return name;
    } catch (_) {}
  }
  return "ce membre";
}

function wrapCommand(command, globalData) {
  if (!command || !command.config || wrappedCommands.has(command)) return command;
  wrappedCommands.add(command);
  const commandName = String(command.config.name || "").toLowerCase();

  for (const hookName of GUARDED_HOOKS) {
    const originalHook = command[hookName];
    if (typeof originalHook !== "function") continue;
    command[hookName] = async function (...args) {
      const context = args[0] || {};
      const event = context.event || {};
      const senderID = getSenderID(event);
      if (senderID && !isOwner(event)) {
        const records = await ensureCache(context.globalData || globalData);
        const record = records.find(item => item.userID === senderID);
        if (record) {
          if (hookName === "onStart") {
            const rejection = record.name && record.name !== "Membre"
              ? `⛔ ${record.name}, tu ne peux plus utiliser les commandes de ce bot. Contacte son propriétaire pour être débanni.`
              : "⛔ Tu ne peux plus utiliser les commandes de ce bot. Contacte son propriétaire pour être débanni.";
            try {
              await send(context, rejection);
            } catch (error) {
              console.error(`[Commande ban] Réponse de blocage impossible (${commandName}) :`, error.message || error);
            }
          }
          return undefined;
        }
      }
      return originalHook.apply(this, args);
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

async function installBanGuard(context) {
  const globalData = context && context.globalData;
  await ensureCache(globalData);
  const goatBot = global.GoatBot;
  if (!goatBot) return;
  patchCommandMap(goatBot.commands, globalData);
  patchCommandMap(goatBot.eventCommands, globalData);
}

async function handleBan(context = {}) {
  const { api, event, globalData } = context;
  const action = getAction(context);
  if (!action) {
    const prefix = context.prefix || getPrefixes(context)[0];
    return send(context, `❌ Commande invalide. Réponds au message avec ${prefix}ban ou ${prefix}deban.`);
  }
  if (!isOwner(event)) {
    return send(context, "⛔ Seul le propriétaire du bot peut bannir ou débannir une personne des commandes.");
  }

  const target = getReplyTarget(event);
  if (!target) {
    const prefix = context.prefix || "!";
    return send(context, `↩️ Réponds au message du membre, puis écris ${prefix}${action}.`);
  }

  const ownerIDs = getOwnerIDs();
  const botID = api && typeof api.getCurrentUserID === "function" ? normalizeID(api.getCurrentUserID()) : "";
  if (ownerIDs.includes(target.id) || (botID && botID === target.id)) {
    return send(context, "⛔ Pour éviter de bloquer le propriétaire ou le bot, cette personne ne peut pas être bannie des commandes.");
  }

  const name = await getTargetName(target, context);
  try {
    const result = await mutateRecords(globalData, records => {
      const exists = records.some(record => record.userID === target.id);
      if (action === "deban") {
        if (!exists) return { changed: false, records, wasBanned: false };
        return { changed: true, records: records.filter(record => record.userID !== target.id), wasBanned: true };
      }
      if (exists) return { changed: false, records, wasBanned: true };
      const next = records.concat({
        userID: target.id,
        name: name === "ce membre" ? "Membre" : name,
        bannedBy: getSenderID(event),
        bannedAt: new Date().toISOString()
      });
      return { changed: true, records: next, wasBanned: false };
    });

    if (action === "deban") {
      if (!result.wasBanned) return send(context, `ℹ️ ${name} n’a pas de restriction active sur les commandes.`);
      return send(context, `✅ L’accès aux commandes du bot est rétabli pour ${name}.`);
    }
    if (result.wasBanned) return send(context, `ℹ️ ${name} a déjà une restriction active sur les commandes du bot.`);
    return send(context, `🚫 ${name} n’a plus accès aux commandes du bot. Seul le propriétaire peut rétablir son accès avec ${(context.prefix || "!")}deban.`);
  } catch (error) {
    console.error("[Commande ban] Échec de mise à jour du bannissement :", error.stack || error);
    return send(context, "❌ Impossible d’enregistrer le bannissement. Vérifie le stockage persistant du bot, puis réessaie.");
  }
}

module.exports = {
  config: {
    name: "ban",
    aliases: ["deban"],
    version: "1.0.0",
    author: "Diwate",
    description: "Interdit ou rend l’accès aux commandes du bot en répondant au message d’un membre",
    category: "Administration",
    usages: "Réponds au message d’un membre avec le préfixe actuel suivi de ban ou deban",
    role: 0
  },
  STORAGE_KEY,
  getAction,
  getReplyTarget,
  normalizeRecords,
  isOwner,
  installBanGuard,

  onLoad: installBanGuard,
  onStart: handleBan
};

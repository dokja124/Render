"use strict";

const fs = require("fs");
const path = require("path");
const { send } = require("./lib/messenger");

const RAPHAEL_PREFIX = "raphaelConversation:";
const RANG_FILE = path.join(__dirname, "../../database/rang.json");
const CONFIRMATION_TTL_MS = 2 * 60 * 1000;
const DRAIN_TIMEOUT_MS = 8000;
const GUARDED_HOOKS = ["onStart", "onReply", "onChat", "onEvent", "onAnyEvent", "onFirstChat", "onReaction"];
const WRAPPED_COMMANDS = new WeakSet();
const PATCHED_MAPS = new WeakSet();
const pendingConfirmations = new Map();

let cleanupInProgress = false;
let activeCommandHooks = 0;

// Liste blanche stricte : aucun enregistrement inconnu, profil utilisateur,
// paramètre essentiel ou donnée de session Messenger n’est effacé.
const COMMAND_SCOPES = {
  animequizz: {
    aliases: ["animequiz", "reponse", "réponse", "next", "animestats", "annule", "annulé", "annuler", "cancel"],
    keys: ["animeQuizSessionsV3", "animeQuizQuestionHistoryV3"],
    memory: "animequizz"
  },
  ban: { aliases: ["deban"], keys: ["goatBotCommandBans"], memory: "ban" },
  bangroupe: { aliases: ["debangroupe"], keys: ["goatBotGroupCommandBlocks"], memory: "bangroupe" },
  defi: { aliases: ["défi"], keys: ["messengerArenaGames"], memory: "defi" },
  hentai: { aliases: [], memory: "hentai" },
  limite: { aliases: [], keys: ["userCommandUsageLimitsV1"], memory: "limite" },
  message: { aliases: ["msg", "dm", "voir", "messages", "inbox", "choisir", "select", "destinataire"], keys: ["privateMessagesV5", "privateMessagesUsersV5", "privateMessagesActivityV5"], memory: "message" },
  off: { aliases: ["on"], keys: ["goatBotMaintenanceMode"], memory: "off" },
  raphael: { aliases: ["raphaël", "sage"], dynamicPrefix: RAPHAEL_PREFIX, memory: "raphael" },
  rang: { aliases: ["rank"], file: RANG_FILE, memory: "rang" },
  "anti-spam": { aliases: ["antispam"], threadPath: "data.antiSpam", memory: "anti-spam" },
  animelist: { aliases: [], memory: "animelist" },
  sondage: { aliases: ["vote"], keys: ["messengerPolls"], memory: "polls" }
};

const GLOBAL_KEY_DEFAULTS = {
  animeQuizSessionsV3: {},
  animeQuizQuestionHistoryV3: {},
  goatBotCommandBans: [],
  goatBotGroupCommandBlocks: {},
  messengerArenaGames: {},
  userCommandUsageLimitsV1: { version: 1, enabled: false, users: {} },
  privateMessagesV5: {},
  privateMessagesUsersV5: {},
  privateMessagesActivityV5: {},
  goatBotMaintenanceMode: { off: false, changedAt: 0, changedBy: "nettoie" },
  messengerPolls: {}
};

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function normalizeCommandName(value) {
  return normalize(String(value || "").replace(/\.js$/i, "")).replace(/[^a-z0-9-]/g, "");
}
function normalizeID(value) {
  if (value == null) return "";
  if (typeof value === "object") return String(value.id || value.userID || value.userId || value.senderID || value.author || "").trim();
  return String(value).trim();
}
function getOwnerIDs() {
  const envOwner = String(process.env.BOT_OWNER_ID || "").trim();
  if (envOwner) return [envOwner];
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  const explicitOwner = normalizeID(config.ownerID || config.ownerId || config.botOwnerID);
  if (explicitOwner) return [explicitOwner];
  const admins = Array.isArray(config.adminBot) ? config.adminBot : config.adminBot ? [config.adminBot] : [];
  const first = admins.map(normalizeID).find(Boolean);
  return first ? [first] : [];
}
function getSenderID(event) {
  return normalizeID(event && (event.senderID || event.senderId || event.userID || event.author));
}
function isOwner(event) {
  const id = getSenderID(event);
  return Boolean(id && getOwnerIDs().includes(id));
}
function getPrefix(context = {}) {
  if (context.prefix) return String(context.prefix);
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  const prefix = config.prefix;
  return Array.isArray(prefix) ? String(prefix[0] || "!") : String(prefix || "!");
}
function getAction(context = {}) {
  const args = Array.isArray(context.args) ? context.args : [];
  if (args.length) return args.map(value => String(value || "")).join(" ").trim();
  const body = String(context.event && (context.event.body || context.event.message) || "").trim();
  return body.replace(/^\S+\s*/, "").trim();
}
function getGlobalRows(globalData) {
  if (!globalData || typeof globalData.getAll !== "function") throw new Error("L’inventaire global des données n’est pas disponible.");
  return Promise.resolve(globalData.getAll()).then(rows => Array.isArray(rows) ? rows : []);
}
function countEntries(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return value == null ? 0 : 1;
}
async function readRankSummary() {
  try {
    const [text, stat] = await Promise.all([fs.promises.readFile(RANG_FILE, "utf8"), fs.promises.stat(RANG_FILE)]);
    const parsed = JSON.parse(text);
    const users = parsed && parsed.users && typeof parsed.users === "object" && !Array.isArray(parsed.users) ? parsed.users : {};
    return { exists: true, users: Object.keys(users).length, mtimeMs: stat.mtimeMs };
  } catch (error) {
    if (error && error.code === "ENOENT") return { exists: false, users: 0, mtimeMs: 0 };
    throw new Error(`Le fichier de rang ne peut pas être lu sans risque : ${error.message || error}`);
  }
}
async function readAntiSpamThreads(threadsData) {
  if (!threadsData || typeof threadsData.getAll !== "function") throw new Error("L’inventaire des conversations n’est pas disponible pour nettoyer les options anti-spam.");
  const rows = await threadsData.getAll();
  if (!Array.isArray(rows)) throw new Error("La liste des conversations est invalide; aucun nettoyage n’a été exécuté.");
  return rows
    .filter(row => row && row.data && typeof row.data === "object" && Object.prototype.hasOwnProperty.call(row.data, "antiSpam"))
    .map(row => normalizeID(row.threadID || row.threadId || row.id))
    .filter(Boolean)
    .sort();
}
function commandExists(commandName) {
  const goatBot = global.GoatBot;
  for (const map of [goatBot && goatBot.commands, goatBot && goatBot.eventCommands]) {
    if (!map || typeof map.values !== "function") continue;
    for (const command of map.values()) {
      const name = normalizeCommandName(command && command.config && command.config.name);
      const aliases = Array.isArray(command && command.config && command.config.aliases) ? command.config.aliases.map(normalizeCommandName) : [];
      if (name === commandName || aliases.includes(commandName)) return true;
    }
  }
  return false;
}
function resolveScope(input) {
  const normalized = normalizeCommandName(input);
  for (const [name, scope] of Object.entries(COMMAND_SCOPES)) {
    if (normalizeCommandName(name) === normalized || (scope.aliases || []).some(alias => normalizeCommandName(alias) === normalized)) {
      return { name, scope };
    }
  }
  return null;
}
function getLoadedCommand(name) {
  const goatBot = global.GoatBot || {};
  for (const map of [goatBot.commands, goatBot.eventCommands]) {
    if (!map || typeof map.values !== "function") continue;
    for (const command of map.values()) {
      if (normalizeCommandName(command && command.config && command.config.name) === normalizeCommandName(name)) return command;
    }
  }
  const file = path.join(__dirname, `${name}.js`);
  if (fs.existsSync(file)) {
    try { return require(file); } catch (error) { console.warn(`[nettoie] Impossible de charger le module ${name} pour purger son cache :`, error.message || error); }
  }
  return null;
}
function getStorageKeys(rows) {
  return new Set(rows.map(row => String(row && row.key || "")).filter(Boolean));
}
async function buildTargetPlan(scopeName, scope, context) {
  const rows = (scope.keys || scope.dynamicPrefix) ? await getGlobalRows(context.globalData) : [];
  const existingKeys = getStorageKeys(rows);
  const keys = (scope.keys || []).filter(key => existingKeys.has(key)).sort();
  const dynamicKeys = scope.dynamicPrefix ? Array.from(existingKeys).filter(key => key.startsWith(scope.dynamicPrefix)).sort() : [];
  const antiSpamThreads = scope.threadPath ? await readAntiSpamThreads(context.threadsData) : [];
  const rank = scope.file ? await readRankSummary() : { exists: false, users: 0, mtimeMs: 0 };
  return { scopeName, keys, dynamicKeys, antiSpamThreads, rank };
}
async function buildGlobalPlan(context) {
  const rows = await getGlobalRows(context.globalData);
  const existingKeys = getStorageKeys(rows);
  const knownKeys = Object.keys(GLOBAL_KEY_DEFAULTS).filter(key => existingKeys.has(key)).sort();
  const dynamicKeys = Array.from(existingKeys).filter(key => key.startsWith(RAPHAEL_PREFIX)).sort();
  const antiSpamThreads = await readAntiSpamThreads(context.threadsData);
  const rank = await readRankSummary();
  const counts = Object.fromEntries(rows.filter(row => row && row.key).map(row => [String(row.key), countEntries(row.data)]));
  return { knownKeys, dynamicKeys, antiSpamThreads, rank, counts };
}
function getPlanFingerprint(plan) {
  return JSON.stringify({
    knownKeys: plan.knownKeys,
    dynamicKeys: plan.dynamicKeys,
    antiSpamThreads: plan.antiSpamThreads,
    rank: plan.rank
  });
}
function describeGlobalPlan(plan, prefix) {
  const categories = [];
  if (plan.knownKeys.includes("goatBotCommandBans")) categories.push("restrictions individuelles (ban/deban)");
  if (plan.knownKeys.includes("goatBotGroupCommandBlocks")) categories.push("blocages de commandes par groupe");
  if (plan.knownKeys.includes("goatBotMaintenanceMode")) categories.push("mode maintenance (remis sur actif)");
  if (plan.knownKeys.includes("userCommandUsageLimitsV1")) categories.push("limites d’utilisation (désactivées et compteurs remis à zéro)");
  if (plan.knownKeys.some(key => key.startsWith("animeQuiz"))) categories.push("quiz et historique des questions");
  if (plan.knownKeys.includes("messengerArenaGames")) categories.push("parties de défi");
  if (plan.knownKeys.some(key => key.startsWith("privateMessages"))) categories.push("boîtes de réception et index de destinataires");
  if (plan.knownKeys.includes("messengerPolls")) categories.push("sondages et votes");
  if (plan.dynamicKeys.length) categories.push("mémoires Raphaël par conversation");
  if (plan.antiSpamThreads.length) categories.push("options anti-spam de groupe");
  if (plan.rank.exists) categories.push("classements de rang");
  categories.push("caches temporaires hentai et rotation animelist");
  return [
    "🧹 **Aperçu du nettoyage global (portée commandes uniquement)**",
    `• ${plan.knownKeys.length + plan.dynamicKeys.length} enregistrement(s) global(aux) identifiable(s)`,
    `• ${plan.antiSpamThreads.length} conversation(s) avec réglage anti-spam`,
    `• ${plan.rank.users} profil(s) de rang dans database/rang.json`,
    `• Cibles : ${categories.join("; ")}.`,
    "",
    "Les profils utilisateur, les autres paramètres de groupe, les clés globales inconnues, la configuration, le compte/session Messenger et les fichiers médias seront conservés.",
    `Pour confirmer dans les 2 minutes : \`${prefix}nettoie confirmer\`. Pour annuler : \`${prefix}nettoie annuler\`.`
  ].join("\n");
}
async function clearAntiSpamSettings(threadsData, threadIDs) {
  if (!threadIDs.length) return 0;
  if (!threadsData || typeof threadsData.deleteKey !== "function") throw new Error("L’API de suppression ciblée des options anti-spam n’est pas disponible.");
  let cleared = 0;
  for (const threadID of threadIDs) {
    await threadsData.deleteKey(threadID, "data.antiSpam");
    cleared++;
  }
  return cleared;
}
function emptyValueForKey(key, ownerID) {
  if (Object.prototype.hasOwnProperty.call(GLOBAL_KEY_DEFAULTS, key)) {
    if (key === "goatBotMaintenanceMode") return { off: false, changedAt: Date.now(), changedBy: String(ownerID || "nettoie") };
    return GLOBAL_KEY_DEFAULTS[key];
  }
  if (key.startsWith(RAPHAEL_PREFIX)) return { version: 1, messages: [], participants: {}, updatedAt: null };
  return undefined;
}
async function clearPersistentKeys(globalData, keys, ownerID) {
  if (!keys.length) return 0;
  if (!globalData || typeof globalData.set !== "function") throw new Error("L’API d’écriture globalData n’est pas disponible.");
  let cleared = 0;
  for (const key of keys) {
    const value = emptyValueForKey(key, ownerID);
    if (value === undefined) continue;
    await globalData.set(key, value, "data");
    cleared++;
  }
  return cleared;
}
async function resetMemoryForScope(name, context) {
  const command = getLoadedCommand(name);
  if (!command) return 0;
  let cleared = 0;
  const invoke = async method => {
    if (typeof command[method] === "function") {
      await command[method]();
      cleared++;
    }
  };
  switch (name) {
    case "animequizz": await invoke("clearAllQuestionTimers"); break;
    case "ban": await invoke("_clearCache"); break;
    case "bangroupe": await invoke("_clearCache"); break;
    case "defi": await invoke("_clearMemory"); break;
    case "hentai": await invoke("_clearUsage"); break;
    case "limite": await invoke("_resetForTests"); break;
    case "message": await invoke("_clearMemory"); break;
    case "off": await invoke("_clearCache"); break;
    case "raphael": await invoke("_clearMemory"); break;
    case "rang": break; // Le reset séquencé du fichier est effectué une seule fois par clearTarget/clearGlobal.
    case "anti-spam": await invoke("_clearMemory"); break;
    case "animelist": await invoke("_clearRotation"); break;
    case "sondage": {
      const polls = require("./lib/polls");
      if (typeof polls.clearMemory === "function") { await polls.clearMemory(); cleared++; }
      break;
    }
  }
  return cleared;
}
async function clearTarget(scopeName, scope, plan, context) {
  const globalKeys = [...plan.keys, ...plan.dynamicKeys];
  const ownerID = getSenderID(context.event);
  let keysCleared = await clearPersistentKeys(context.globalData, globalKeys, ownerID);
  let threadsCleared = 0;
  if (scope.threadPath) threadsCleared = await clearAntiSpamSettings(context.threadsData, plan.antiSpamThreads);
  let fileRecordsCleared = 0;
  if (scope.file && plan.rank.exists) {
    const command = getLoadedCommand("rang");
    if (!command || typeof command.clearRankData !== "function") throw new Error("La fonction de reset sécurisé de rang n’est pas disponible.");
    fileRecordsCleared = await command.clearRankData();
  }
  const memoryCachesCleared = await resetMemoryForScope(scopeName, context);
  return { keysCleared, threadsCleared, fileRecordsCleared, memoryCachesCleared };
}
async function clearGlobal(plan, context) {
  cleanupInProgress = true;
  try {
    // Arrête immédiatement les minuteurs susceptibles de réécrire des états de quiz.
    const animequizz = getLoadedCommand("animequizz");
    if (animequizz && typeof animequizz.clearAllQuestionTimers === "function") await animequizz.clearAllQuestionTimers();
    await waitForActiveHooks();

    const stablePlan = await buildGlobalPlan(context);
    if (getPlanFingerprint(stablePlan) !== getPlanFingerprint(plan)) {
      throw new Error("Les données ont changé pendant le verrouillage. Aucun reset n’a été appliqué; relance l’aperçu puis confirme à nouveau.");
    }

    const ownerID = getSenderID(context.event);
    const allGlobalKeys = [...stablePlan.knownKeys, ...stablePlan.dynamicKeys];
    const keysCleared = await clearPersistentKeys(context.globalData, allGlobalKeys, ownerID);
    const threadsCleared = await clearAntiSpamSettings(context.threadsData, stablePlan.antiSpamThreads);

    const rang = getLoadedCommand("rang");
    const fileRecordsCleared = rang && typeof rang.clearRankData === "function" ? await rang.clearRankData() : 0;

    let memoryCachesCleared = 0;
    for (const name of Object.keys(COMMAND_SCOPES)) {
      memoryCachesCleared += await resetMemoryForScope(name, context);
    }
    return { keysCleared, threadsCleared, fileRecordsCleared, memoryCachesCleared };
  } finally {
    cleanupInProgress = false;
  }
}
function waitForActiveHooks() {
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (activeCommandHooks === 0) return resolve();
      if (Date.now() >= deadline) return reject(new Error("Des commandes sont encore en cours; aucun nettoyage n’a été effectué. Réessaie dans quelques secondes."));
      setTimeout(poll, 50);
    };
    poll();
  });
}
async function runTarget(scopeName, scope, context) {
  cleanupInProgress = true;
  try {
    if (scopeName === "animequizz") {
      const command = getLoadedCommand(scopeName);
      if (command && typeof command.clearAllQuestionTimers === "function") await command.clearAllQuestionTimers();
    }
    await waitForActiveHooks();
    const plan = await buildTargetPlan(scopeName, scope, context);
    return await clearTarget(scopeName, scope, plan, context);
  } finally {
    cleanupInProgress = false;
  }
}
function wrapCommand(command) {
  if (!command || !command.config || WRAPPED_COMMANDS.has(command)) return command;
  WRAPPED_COMMANDS.add(command);
  const commandName = normalizeCommandName(command.config.name);
  for (const hookName of GUARDED_HOOKS) {
    const original = command[hookName];
    if (typeof original !== "function") continue;
    command[hookName] = async function (...args) {
      const context = args[0] || {};
      if (cleanupInProgress && commandName !== "nettoie") {
        if (hookName === "onStart" || hookName === "onReply") {
          try { await send(context, "🧹 Nettoyage en cours. Réessaie dans quelques secondes."); } catch (_) {}
        }
        return undefined;
      }
      const counted = commandName !== "nettoie";
      if (counted) activeCommandHooks++;
      try {
        const result = await original.apply(this, args);
        if (typeof result !== "function") return result;
        const callback = result;
        return async function (...callbackArgs) {
          if (cleanupInProgress && commandName !== "nettoie") {
            return undefined;
          }
          const callbackCounted = commandName !== "nettoie";
          if (callbackCounted) activeCommandHooks++;
          try { return await callback.apply(this, callbackArgs); }
          finally { if (callbackCounted) activeCommandHooks = Math.max(0, activeCommandHooks - 1); }
        };
      }
      finally { if (counted) activeCommandHooks = Math.max(0, activeCommandHooks - 1); }
    };
  }
  return command;
}
function patchCommandMap(map) {
  if (!map || typeof map.set !== "function" || PATCHED_MAPS.has(map)) return;
  PATCHED_MAPS.add(map);
  for (const command of map.values()) wrapCommand(command);
  const originalSet = map.set.bind(map);
  map.set = function (key, command) {
    wrapCommand(command);
    return originalSet(key, command);
  };
}
async function installGuard() {
  const goatBot = global.GoatBot;
  if (!goatBot) return;
  patchCommandMap(goatBot.commands);
  patchCommandMap(goatBot.eventCommands);
}
function formatResult(result) {
  return `✅ Nettoyage terminé.\n• ${result.keysCleared} enregistrement(s) global(aux) réinitialisé(s)\n• ${result.threadsCleared} réglage(s) anti-spam supprimé(s)\n• ${result.fileRecordsCleared} profil(s) de rang remis à zéro\n• ${result.memoryCachesCleared} cache(s) mémoire vidé(s).`;
}
async function onStart(context = {}) {
  const { api, message, event } = context;
  if (!isOwner(event)) return send({ api, message, event }, "⛔ Seul le propriétaire du bot peut nettoyer ses données de commandes.");

  const prefix = getPrefix(context);
  const raw = getAction(context);
  const args = raw.split(/\s+/).filter(Boolean);
  const action = normalizeCommandName(args[0] || "");
  const ownerID = getSenderID(event);

  if (action === "annuler" || action === "cancel") {
    pendingConfirmations.delete(ownerID);
    return send({ api, message, event }, "✅ Nettoyage global annulé. Aucune donnée n’a été modifiée.");
  }

  if (action === "confirmer" || action === "confirm") {
    const pending = pendingConfirmations.get(ownerID);
    if (!pending || Date.now() > pending.expiresAt) {
      pendingConfirmations.delete(ownerID);
      return send({ api, message, event }, `ℹ️ Aucun nettoyage global en attente. Écris \`${prefix}nettoie\` pour afficher l’aperçu.`);
    }
    let currentPlan;
    try { currentPlan = await buildGlobalPlan(context); }
    catch (error) { return send({ api, message, event }, `❌ Impossible de revérifier les données : ${String(error.message || error).slice(0, 180)}. Aucune suppression lancée.`); }
    if (getPlanFingerprint(currentPlan) !== pending.fingerprint) {
      pendingConfirmations.delete(ownerID);
      return send({ api, message, event }, `⚠️ Les données ont changé depuis l’aperçu. Rien n’a été effacé. Écris \`${prefix}nettoie\` pour recalculer le plan.`);
    }
    pendingConfirmations.delete(ownerID);
    try {
      const result = await clearGlobal(currentPlan, context);
      return send({ api, message, event }, `${formatResult(result)}\n\nLes profils, paramètres non attribués aux commandes, clés inconnues, configuration et session Messenger ont été conservés.`);
    } catch (error) {
      console.error("[Commande nettoie] Reset global partiel ou interrompu :", error && (error.stack || error.message) || error);
      return send({ api, message, event }, `⚠️ Le nettoyage global n’a pas pu être terminé intégralement : ${String(error.message || error).slice(0, 200)}. Vérifie le stockage avant de relancer.`);
    }
  }

  if (!args.length || action === "tout" || action === "tous" || action === "global") {
    try {
      const plan = await buildGlobalPlan(context);
      pendingConfirmations.set(ownerID, { fingerprint: getPlanFingerprint(plan), expiresAt: Date.now() + CONFIRMATION_TTL_MS });
      return send({ api, message, event }, describeGlobalPlan(plan, prefix));
    } catch (error) {
      console.error("[Commande nettoie] Aperçu impossible :", error && (error.stack || error.message) || error);
      return send({ api, message, event }, `❌ Impossible de préparer le nettoyage sans risque : ${String(error.message || error).slice(0, 200)}. Aucune donnée n’a été modifiée.`);
    }
  }

  if (args.length > 1) return send({ api, message, event }, `❌ Utilisation : \`${prefix}nettoie <commande>\` (nettoyage ciblé) ou \`${prefix}nettoie\` (aperçu global).`);
  const resolved = resolveScope(args[0]);
  if (!resolved) {
    const requested = normalizeCommandName(args[0]);
    const known = commandExists(requested);
    return send(
      { api, message, event },
      known
        ? `ℹ️ La commande \`${args[0]}\` n’a pas de données persistantes attribuables dans la liste sûre. Rien n’a été modifié.`
        : `❌ Commande inconnue : \`${args[0]}\`. Indique le nom d’une commande installée.`
    );
  }

  try {
    const result = await runTarget(resolved.name, resolved.scope, context);
    return send({ api, message, event }, `🧹 Données de \`${resolved.name}\` réinitialisées.\n${formatResult(result)}\nLes profils et paramètres non attribués à cette commande ont été conservés.`);
  } catch (error) {
    console.error(`[Commande nettoie] Reset ciblé ${resolved.name} interrompu :`, error && (error.stack || error.message) || error);
    return send({ api, message, event }, `❌ Impossible de terminer le nettoyage ciblé de \`${resolved.name}\` : ${String(error.message || error).slice(0, 200)}.`);
  }
}

module.exports = {
  config: {
    name: "nettoie",
    version: "1.0.0",
    author: "Diwate",
    description: "Réinitialise uniquement les données de commandes attribuables, avec confirmation avant le reset global",
    category: "Administration",
    usages: "nettoie | nettoie confirmer | nettoie annuler | nettoie <commande>",
    role: 0
  },
  onLoad: installGuard,
  onStart,
  _buildGlobalPlan: buildGlobalPlan,
  _buildTargetPlan: buildTargetPlan,
  _resolveScope: resolveScope,
  _resetForTests() {
    cleanupInProgress = false;
    activeCommandHooks = 0;
    pendingConfirmations.clear();
  }
};

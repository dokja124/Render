const { send } = require("./lib/messenger");

const STORAGE_KEY = "goatBotMaintenanceMode";
const HOOKS_TO_GUARD = ["onStart", "onChat", "onReply", "onEvent", "onAnyEvent", "onFirstChat", "onReaction"];
let cachedState = null;
const wrappedCommands = new WeakSet();
const patchedMaps = new WeakSet();

function normalizeState(value) {
  if (typeof value === "boolean") return { off: value, changedAt: 0, changedBy: "" };
  if (!value || typeof value !== "object") return { off: false, changedAt: 0, changedBy: "" };
  return { off: value.off === true, changedAt: Number(value.changedAt) || 0, changedBy: String(value.changedBy || "") };
}

async function getState(globalData) {
  if (cachedState) return { ...cachedState };
  if (!globalData || typeof globalData.get !== "function") {
    cachedState = normalizeState(null);
    return { ...cachedState };
  }
  try {
    // Un fallback truthy crée la clé dans le contrôleur Goat-Bot. Avec null,
    // get() renvoie undefined sans créer l’enregistrement, puis set() échoue.
    cachedState = normalizeState(await globalData.get(STORAGE_KEY, "data", {}));
  } catch (error) {
    console.error("[Commande off] Lecture du mode impossible :", error.message);
    cachedState = normalizeState(null);
  }
  return { ...cachedState };
}

async function setMode(globalData, off, changedBy) {
  if (!globalData || typeof globalData.set !== "function") throw new Error("Le stockage global du bot est indisponible.");
  const state = { off: off === true, changedAt: Date.now(), changedBy: String(changedBy || "") };
  await globalData.set(STORAGE_KEY, state, "data");
  cachedState = state;
  return { ...state };
}

function isOwner(event) {
  const senderID = String(event && (event.senderID || event.userID || event.author) || "");
  if (!senderID) return false;
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  const configuredOwner = String(process.env.BOT_OWNER_ID || config.ownerID || config.ownerId || "").trim();
  const ownerIDs = configuredOwner ? [configuredOwner] : (Array.isArray(config.adminBot) ? config.adminBot.map(String) : []);
  return ownerIDs.includes(senderID);
}

function wrapCommand(command, globalData) {
  if (!command || !command.config || wrappedCommands.has(command)) return command;
  wrappedCommands.add(command);
  const commandName = String(command.config.name || "").toLowerCase();
  if (commandName === "off" || commandName === "on") return command;

  for (const hookName of HOOKS_TO_GUARD) {
    const originalHook = command[hookName];
    if (typeof originalHook !== "function") continue;
    command[hookName] = async function (...args) {
      const context = args[0] || {};
      const state = await getState(context.globalData || globalData);
      if (state.off) {
        if (hookName === "onStart") {
          await send(context, "🔴 Le bot est en mode maintenance. Seul son propriétaire peut le réactiver avec !on.");
        }
        return undefined;
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

async function installGuard(context) {
  const globalData = context && context.globalData;
  await getState(globalData);
  const goatBot = global.GoatBot;
  if (!goatBot) return;
  patchCommandMap(goatBot.commands, globalData);
  patchCommandMap(goatBot.eventCommands, globalData);
}

module.exports = {
  config: {
    name: "off",
    version: "1.0.0",
    author: "Diwate",
    description: "Active le mode maintenance et bloque les commandes ordinaires",
    category: "Administration",
    usages: "off",
    role: 0
  },

  onLoad: installGuard,

  onStart: async function ({ api, message, event, globalData }) {
    if (!isOwner(event)) return send({ api, message, event }, "⛔ Seul le propriétaire du bot peut utiliser cette commande.");
    try {
      const current = await getState(globalData);
      if (current.off) return send({ api, message, event }, "ℹ️ Le bot est déjà en mode maintenance. Écris !on pour le réactiver.");
      await setMode(globalData, true, event.senderID || event.userID || event.author);
      return send({ api, message, event }, "🔴 Mode maintenance activé : les commandes ordinaires sont bloquées. Écris !on pour les réactiver.");
    } catch (error) {
      console.error("[Commande off] Échec :", error.stack || error);
      return send({ api, message, event }, "❌ Impossible d’activer le mode maintenance : le stockage persistant du bot est indisponible.");
    }
  },

  // Partagé directement avec on.js; aucun module helper supplémentaire n’est requis.
  _getMode: getState,
  _setMode: setMode,
  _isOwner: isOwner,
  _installGuard: installGuard,
  _resetForTests() { cachedState = null; }
};
  

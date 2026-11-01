"use strict";

const { send } = require("./lib/messenger");

function normalizePrefix(value) {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) {
    const firstPrefix = value.find(item => typeof item === "string" && item.trim());
    if (firstPrefix) return firstPrefix;
  }
  return null;
}

function getCurrentPrefix(context = {}) {
  const conversationPrefix = normalizePrefix(context.prefix);
  if (conversationPrefix !== null) return conversationPrefix;

  const configuredPrefix = normalizePrefix(
    global.GoatBot && global.GoatBot.config && global.GoatBot.config.prefix
  );
  return configuredPrefix || "!";
}

function formatPrefixMessage(prefix) {
  const currentPrefix = normalizePrefix(prefix) || "!";
  return `✨ Le préfixe actuel est : ${currentPrefix}\n🌸 Exemple : ${currentPrefix}menu`;
}

function isBarePrefixRequest(event) {
  return String(event && event.body || "").trim().toLocaleLowerCase("fr-FR") === "prefix";
}

async function replyWithPrefix(context = {}) {
  const prefix = getCurrentPrefix(context);
  return send(
    { api: context.api, message: context.message, event: context.event },
    formatPrefixMessage(prefix)
  );
}

module.exports = {
  config: {
    name: "prefix",
    version: "1.0.0",
    author: "Diwate",
    description: "Affiche le préfixe actuellement utilisé dans cette conversation",
    category: "Général",
    usages: "prefix",
    role: 0
  },
  getCurrentPrefix,
  formatPrefixMessage,
  isBarePrefixRequest,
  normalizePrefix,
  replyWithPrefix,

  // Autorise l’utilisateur qui ignore le préfixe à envoyer simplement « prefix ».
  onChat: async function (context = {}) {
    if (!isBarePrefixRequest(context.event)) return false;
    try {
      await replyWithPrefix(context);
      return true;
    } catch (error) {
      console.error("[Commande prefix] Impossible d’envoyer le préfixe :", error.stack || error);
      return false;
    }
  },

  onStart: async function (context = {}) {
    return replyWithPrefix(context);
  }
};

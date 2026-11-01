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
  return configuredPrefix || "~";
}

function formatPrefixMessage(prefix) {
  const currentPrefix = normalizePrefix(prefix) || "~";
  return `✨ Le préfixe actuel est : ${currentPrefix}\n🌸 Exemple : ${currentPrefix}menu`;
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
    description: "Affiche le préfixe actuel avec ou sans préfixe de commande",
    category: "Général",
    usages: "prefix",
    prefix: false,
    role: 0
  },
  getCurrentPrefix,
  formatPrefixMessage,
  normalizePrefix,
  replyWithPrefix,

  onStart: async function (context = {}) {
    return replyWithPrefix(context);
  }
};

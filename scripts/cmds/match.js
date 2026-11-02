"use strict";

const { send } = require("./lib/messenger");

const STORAGE_KEY = "goatBotMatchData";
const CACHE_TTL_MS = 3000;

let cachedData = null;
let cacheUpdatedAt = 0;
let cacheLoadPromise = null;
let mutationQueue = Promise.resolve();

function normalizeID(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    return String(value.id || value.userID || value.userId || value.senderID || "").trim();
  }
  return String(value).trim();
}

function ensureStorage(globalData) {
  if (!globalData || typeof globalData.get !== "function" || typeof globalData.set !== "function") {
    throw new Error("Le stockage global du bot est indisponible.");
  }
}

async function readMatchData(globalData) {
  ensureStorage(globalData);
  const stored = await globalData.get(STORAGE_KEY, "data", {});
  if (stored && typeof stored === "object" && !Array.isArray(stored)) return { ...stored };
  return {};
}

async function refreshCache(globalData) {
  if (cacheLoadPromise) return cacheLoadPromise;
  cacheLoadPromise = (async () => {
    const data = await readMatchData(globalData);
    cachedData = data;
    cacheUpdatedAt = Date.now();
    return data;
  })();
  try {
    return await cacheLoadPromise;
  } finally {
    cacheLoadPromise = null;
  }
}

async function ensureCache(globalData) {
  if (cachedData && Date.now() - cacheUpdatedAt < CACHE_TTL_MS) return cachedData;
  try {
    return await refreshCache(globalData);
  } catch (error) {
    console.error("[Match] Lecture impossible :", error.message || error);
    return cachedData || {};
  }
}

async function mutateMatchData(globalData, mutate) {
  const run = async () => {
    ensureStorage(globalData);
    const current = await readMatchData(globalData);
    const result = mutate(current);
    if (result && result.changed) {
      await globalData.set(STORAGE_KEY, result.data, "data");
    }
    cachedData = result.data;
    cacheUpdatedAt = Date.now();
    return result;
  };
  const pending = mutationQueue.then(run, run);
  mutationQueue = pending.catch(() => {});
  return pending;
}

function getPairKey(a, b) {
  return [a, b].sort().join("_");
}

function getProgressBar(percentage) {
  const totalBlocks = 10;
  const filled = Math.round((percentage / 100) * totalBlocks);
  return "🟩".repeat(filled) + "⬛".repeat(totalBlocks - filled);
}

function getComment(percentage) {
  if (percentage === 100) return "💍 Âmes sœurs absolues ! Le mariage est pour demain !";
  if (percentage >= 80) return "🔥 Une alchimie explosive ! Ça étincelle fort !";
  if (percentage >= 60) return "✨ Belle complicité ! Un grand potentiel ensemble.";
  if (percentage >= 40) return "🙂 Pas mal du tout ! Une bonne base d’amitié.";
  if (percentage >= 20) return "🧊 Un peu froid… Il va falloir faire des efforts.";
  return "💔 Incompatibilité totale. Mieux vaut rester à distance !";
}

function getSenderID(event) {
  return normalizeID(event && (event.senderID || event.senderId || event.userID || event.author));
}

function getReplyTarget(event) {
  const reply = event && (event.messageReply || event.repliedMessage || event.replyToMessage);
  if (!reply) return null;
  const id = normalizeID(reply.senderID || reply.senderId || reply.userID || reply.userId || reply.author);
  if (!id) return null;
  const name = String(reply.senderName || reply.name || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "ce membre";
  return { id, name };
}

function getPrefix(context = {}) {
  if (context.prefix) return String(context.prefix);
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  return String(config.prefix || "!");
}

async function handleMatch(context = {}) {
  const { event, globalData } = context;
  const senderID = getSenderID(event);
  if (!senderID) return send(context, "❌ Impossible d’identifier l’auteur de la commande.");

  const prefix = getPrefix(context);
  const target = getReplyTarget(event);
  if (!target) {
    return send(
      context,
      `⚠️ Réponds au message de la personne avec qui tu veux tester la compatibilité, puis écris ${prefix}match.`
    );
  }
  if (target.id === senderID) {
    return send(context, "😳 Tu essaies de matcher avec toi-même ? L’amour-propre c’est bien, mais essaie avec quelqu’un d’autre !");
  }

  const key = getPairKey(senderID, target.id);
  try {
    const result = await mutateMatchData(globalData, data => {
      if (data[key] !== undefined) {
        return { changed: false, data, percentage: Number(data[key]) || 0, isNew: false };
      }
      const percentage = Math.floor(Math.random() * 101);
      data[key] = percentage;
      return { changed: true, data, percentage, isNew: true };
    });

    return send(
      context,
      `💘 Test de compatibilité amoureuse 💘\n\n` +
      `Entre toi et ${target.name} :\n` +
      `📊 ${result.percentage}%\n${getProgressBar(result.percentage)}\n\n` +
      `${getComment(result.percentage)}\n\n` +
      `_${result.isNew ? "💾 Nouveau score enregistré !" : "📖 Score récupéré depuis la sauvegarde."}_`
    );
  } catch (error) {
    console.error("[Match] Calcul impossible :", error.message || error);
    return send(context, "❌ Impossible de calculer la compatibilité. Vérifie le stockage persistant du bot.");
  }
}

module.exports = {
  config: {
    name: "match",
    aliases: ["amour", "compat"],
    version: "2.0.0",
    author: "Diwate",
    description: "Calcule le pourcentage de compatibilité amoureuse avec la personne dont tu cites le message",
    category: "Divertissement",
    usages: "match (en répondant au message d’un membre)",
    role: 0
  },
  STORAGE_KEY,
  getPairKey,
  handleMatch,
  onStart: async function (context) {
    return handleMatch(context);
  }
};
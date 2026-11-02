"use strict";

const bank = require("./bank.js");
const { send } = require("./lib/messenger");

const STORAGE_KEY = "claimCooldownsV1";
const CLAIM_AMOUNT = 1000;
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 h
const MAX_ENTRIES = 5000;

let cache = {};
let cacheLoaded = false;
let cacheLoadPromise = null;
let mutationQueue = Promise.resolve();
const inProgress = new Set();

function normalizeID(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    return String(value.id || value.userID || value.userId || value.senderID || "").trim();
  }
  return String(value).trim();
}

function getSenderID(event) {
  return normalizeID(event && (event.senderID || event.senderId || event.userID || event.author));
}

function getPrefix(context = {}) {
  if (context.prefix) return String(context.prefix);
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  return String(config.prefix || "!");
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours} h`);
  if (minutes > 0) parts.push(`${minutes} min`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds} s`);
  return parts.join(" ");
}

async function loadCache(globalData) {
  if (cacheLoaded) return cache;
  if (cacheLoadPromise) return cacheLoadPromise;
  cacheLoadPromise = (async () => {
    if (globalData && typeof globalData.get === "function") {
      try {
        const stored = await globalData.get(STORAGE_KEY, "data", {});
        if (stored && typeof stored === "object" && !Array.isArray(stored)) {
          cache = { ...stored };
        }
      } catch (error) {
        console.warn("[Claim] Lecture impossible :", error.message || error);
      }
    }
    cacheLoaded = true;
    return cache;
  })();
  try {
    return await cacheLoadPromise;
  } finally {
    cacheLoadPromise = null;
  }
}

async function saveCache(globalData) {
  const entries = Object.entries(cache);
  if (entries.length > MAX_ENTRIES) {
    entries
      .sort((a, b) => (Number(a[1]) || 0) - (Number(b[1]) || 0))
      .slice(0, entries.length - MAX_ENTRIES)
      .forEach(([key]) => delete cache[key]);
  }
  if (globalData && typeof globalData.set === "function") {
    try {
      await globalData.set(STORAGE_KEY, cache, "data");
    } catch (error) {
      console.warn("[Claim] Sauvegarde impossible :", error.message || error);
    }
  }
}

async function mutateCache(globalData, mutate) {
  const run = async () => {
    await loadCache(globalData);
    const result = mutate(cache);
    if (result && result.changed) await saveCache(globalData);
    return result;
  };
  const pending = mutationQueue.then(run, run);
  mutationQueue = pending.catch(() => {});
  return pending;
}

async function handleClaim(context = {}) {
  const { api, message, event, globalData } = context;
  const userID = getSenderID(event);
  const prefix = getPrefix(context);

  if (!userID) {
    return send({ api, message, event }, "❌ Impossible d’identifier ton compte.");
  }
  if (!globalData || typeof globalData.get !== "function") {
    return send({ api, message, event }, "❌ Le stockage persistant du bot est indisponible. Réessaie plus tard.");
  }

  if (inProgress.has(userID)) {
    return send({ api, message, event }, "⏳ Ta réclamation est déjà en cours de traitement…");
  }
  inProgress.add(userID);

  try {
    const now = Date.now();
    const check = await mutateCache(globalData, (store) => {
      const last = Number(store[userID]) || 0;
      const elapsed = now - last;
      if (elapsed < COOLDOWN_MS) {
        return { changed: false, allowed: false, remaining: COOLDOWN_MS - elapsed, last };
      }
      store[userID] = now;
      return { changed: true, allowed: true, remaining: 0, last };
    });

    if (!check.allowed) {
      return send(
        { api, message, event },
        `⏳ Tu as déjà réclamé tes ${CLAIM_AMOUNT.toLocaleString("fr-FR")} 💵.\n` +
        `Reviens dans **${formatDuration(check.remaining)}**.\n\n` +
        `💡 Astuce : reviens chaque jour avec \`${prefix}claim\` pour accumuler.`
      );
    }

    let newBalance;
    try {
      newBalance = await bank.addMoney(globalData, userID, CLAIM_AMOUNT);
    } catch (error) {
      console.error("[Claim] Crédit banque impossible :", error.message || error);
      await mutateCache(globalData, (store) => {
        if (store[userID] === now) delete store[userID];
        return { changed: true };
      });
      return send({ api, message, event }, "❌ Impossible de créditer ton compte. Réessaie dans un instant.");
    }

    const balance = newBalance != null ? newBalance : await bank.getBalance(globalData, userID);

    return send(
      { api, message, event },
      `🎁 **Claim réussi !**\n\n` +
      `💰 Tu as reçu **${CLAIM_AMOUNT.toLocaleString("fr-FR")} 💵**.\n` +
      `🏦 Nouveau solde : **${Number(balance).toLocaleString("fr-FR")} 💵**.\n\n` +
      `⏳ Prochaine réclamation dans **24 h**.\n` +
      `💡 Utilise \`${prefix}bank\` pour voir ton solde, ou \`${prefix}casino\` pour tenter de gagner plus.`
    );
  } catch (error) {
    console.error("[Claim] Échec :", error.stack || error);
    return send({ api, message, event }, "❌ Une erreur est survenue. Réessaie plus tard.");
  } finally {
    inProgress.delete(userID);
  }
}

module.exports = {
  config: {
    name: "claim",
    aliases: ["reclaim", "recompense", "daily"],
    version: "1.0.0",
    author: "Diwate",
    description: "Réclame 1000 💵 toutes les 24 h",
    category: "Économie",
    usages: "claim",
    role: 0
  },
  STORAGE_KEY,
  CLAIM_AMOUNT,
  COOLDOWN_MS,
  handleClaim,
  onStart: async function (context) {
    return handleClaim(context);
  }
};
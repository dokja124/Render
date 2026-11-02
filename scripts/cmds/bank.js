"use strict";

const { send } = require("./lib/messenger");

const STORAGE_KEY = "goatBotBankData";
const STARTING_BALANCE = 1000;
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

async function readBankData(globalData) {
  ensureStorage(globalData);
  const stored = await globalData.get(STORAGE_KEY, "data", {});
  if (stored && typeof stored === "object" && !Array.isArray(stored)) return { ...stored };
  return {};
}

async function refreshCache(globalData) {
  if (cacheLoadPromise) return cacheLoadPromise;
  cacheLoadPromise = (async () => {
    const data = await readBankData(globalData);
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
    console.error("[Banque] Lecture impossible :", error.message || error);
    return cachedData || {};
  }
}

async function mutateBankData(globalData, mutate) {
  const run = async () => {
    ensureStorage(globalData);
    const current = await readBankData(globalData);
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

async function getBalance(globalData, userId) {
  const id = normalizeID(userId);
  if (!id) return STARTING_BALANCE;
  const data = await ensureCache(globalData);
  return data[id] !== undefined ? Number(data[id]) || 0 : STARTING_BALANCE;
}

async function addMoney(globalData, userId, amount) {
  const id = normalizeID(userId);
  const delta = Number(amount);
  if (!id || !Number.isFinite(delta) || delta <= 0) return null;
  const result = await mutateBankData(globalData, data => {
    const current = data[id] !== undefined ? Number(data[id]) || 0 : STARTING_BALANCE;
    data[id] = current + delta;
    return { changed: true, data, balance: data[id] };
  });
  return result.balance;
}

async function removeMoney(globalData, userId, amount) {
  const id = normalizeID(userId);
  const delta = Number(amount);
  if (!id || !Number.isFinite(delta) || delta <= 0) return false;
  const result = await mutateBankData(globalData, data => {
    const current = data[id] !== undefined ? Number(data[id]) || 0 : STARTING_BALANCE;
    if (current < delta) return { changed: false, data, success: false };
    data[id] = current - delta;
    return { changed: true, data, success: true };
  });
  return result.success;
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

async function handleBank(context = {}) {
  const { event, globalData } = context;
  const senderID = getSenderID(event);
  if (!senderID) return send(context, "❌ Impossible d’identifier l’auteur de la commande.");

  const args = Array.isArray(context.args)
    ? context.args
    : String(event && (event.body || event.message || "")).trim().split(/\s+/).slice(1);
  const subCommand = (args[0] || "balance").toLowerCase();
  const prefix = getPrefix(context);

  // Solde
  if (["balance", "solde", ""].includes(subCommand)) {
    const target = getReplyTarget(event);
    const userId = target ? target.id : senderID;
    const label = target ? target.name : "toi";
    try {
      const balance = await getBalance(globalData, userId);
      return send(
        context,
        `🏦 Solde de ${label} : ${balance.toLocaleString("fr-FR")} 💵\n💡 Joue avec ${prefix}casino pour gagner plus !`
      );
    } catch (error) {
      console.error("[Banque] Lecture solde impossible :", error.message || error);
      return send(context, "❌ Impossible de lire le solde. Vérifie le stockage persistant du bot.");
    }
  }

  // Transfert
  if (["pay", "transfer", "donner"].includes(subCommand)) {
    const target = getReplyTarget(event);
    if (!target) {
      return send(context, `⚠️ Réponds au message du membre à payer, puis écris ${prefix}bank pay <montant>.`);
    }
    if (target.id === senderID) {
      return send(context, "😳 Tu ne peux pas t’envoyer de l’argent à toi-même !");
    }
    const amount = parseInt(args[1] || args[2], 10);
    if (isNaN(amount) || amount <= 0) {
      return send(context, `⚠️ Montant invalide. Exemple : ${prefix}bank pay 500 (en répondant au message du destinataire).`);
    }

    try {
      const success = await removeMoney(globalData, senderID, amount);
      if (!success) {
        const current = await getBalance(globalData, senderID);
        return send(context, `❌ Solde insuffisant ! Tu as ${current.toLocaleString("fr-FR")} 💵.`);
      }
      await addMoney(globalData, target.id, amount);
      const [myBalance, targetBalance] = await Promise.all([
        getBalance(globalData, senderID),
        getBalance(globalData, target.id)
      ]);
      return send(
        context,
        `💸 Transfert réussi !\n${target.name} a reçu ${amount.toLocaleString("fr-FR")} 💵 de ta part.\n\n` +
        `• Ton solde : ${myBalance.toLocaleString("fr-FR")} 💵\n` +
        `• Solde de ${target.name} : ${targetBalance.toLocaleString("fr-FR")} 💵`
      );
    } catch (error) {
      console.error("[Banque] Transfert impossible :", error.message || error);
      return send(context, "❌ Impossible d’effectuer le transfert. Vérifie le stockage persistant du bot.");
    }
  }

  return send(
    context,
    `💡 Commandes banque :\n• ${prefix}bank — voir ton solde\n• ${prefix}bank pay <montant> — (en répondant au message) envoyer de l’argent`
  );
}

module.exports = {
  config: {
    name: "bank",
    aliases: ["banque", "solde"],
    version: "2.0.0",
    author: "Diwate",
    description: "Gère le solde, les transferts et l’économie locale du bot (stockage persistant)",
    category: "Économie",
    usages: "bank | bank pay <montant> (en répondant au message)",
    role: 0
  },
  STORAGE_KEY,
  STARTING_BALANCE,
  getBalance,
  addMoney,
  removeMoney,
  handleBank,
  onStart: async function (context) {
    return handleBank(context);
  }
};
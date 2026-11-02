"use strict";

const bank = require("./bank.js");
const { send } = require("./lib/messenger");

const BASE_REWARD = 5000;

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

async function handleCasino(context = {}) {
  const { event, globalData } = context;
  const userId = getSenderID(event);
  if (!userId) return send(context, "❌ Impossible d’identifier l’auteur de la commande.");
  if (!globalData || typeof globalData.get !== "function") {
    return send(context, "❌ Le stockage persistant du bot est indisponible.");
  }

  const args = Array.isArray(context.args)
    ? context.args
    : String(event && (event.body || event.message || "")).trim().split(/\s+/).slice(1);
  const subCommand = (args[0] || "help").toLowerCase();
  const prefix = getPrefix(context);

  let balance;
  try {
    balance = await bank.getBalance(globalData, userId);
  } catch (error) {
    console.error("[Casino] Lecture solde impossible :", error.message || error);
    return send(context, "❌ Impossible de lire ton solde. Vérifie le stockage persistant du bot.");
  }

  // Menu
  if (subCommand === "help" || !args[0]) {
    return send(
      context,
      `🎰 Bienvenue au Casino !\nSolde actuel : ${balance.toLocaleString("fr-FR")} 💵\n\n` +
      `• ${prefix}casino slots <mise> — Machine à sous\n` +
      `• ${prefix}casino roulette <rouge|noir|0-36> <mise>\n` +
      `• ${prefix}casino blackjack <mise>\n` +
      `• ${prefix}casino coinflip <pile|face> <mise>\n\n` +
      `💡 Utilise ${prefix}bank pay pour envoyer de l’argent.`
    );
  }

  // Machine à sous
  if (["slots", "slot"].includes(subCommand)) {
    const bet = parseInt(args[1], 10) || 500;
    if (bet <= 0) return send(context, "⚠️ Mise invalide.");
    try {
      const ok = await bank.removeMoney(globalData, userId, bet);
      if (!ok) return send(context, `❌ Solde insuffisant ! Tu as ${balance.toLocaleString("fr-FR")} 💵.`);
      const items = ["🍒", "🍋", "🍇", "🍉", "🔔", "⭐️", "💎", "7️⃣"];
      const s1 = items[Math.floor(Math.random() * items.length)];
      const s2 = items[Math.floor(Math.random() * items.length)];
      const s3 = items[Math.floor(Math.random() * items.length)];
      let winAmount = 0;
      let resultText = "";
      if (s1 === s2 && s2 === s3) {
        winAmount = BASE_REWARD + bet * 5;
        resultText = `🎉 JACKPOT ! 3x ${s1} ! Tu gagnes ${winAmount.toLocaleString("fr-FR")} 💵 !`;
      } else if (s1 === s2 || s2 === s3 || s1 === s3) {
        winAmount = Math.floor(bet * 1.5) + 1000;
        resultText = `✨ Bien joué ! 2 symboles identiques. Tu gagnes ${winAmount.toLocaleString("fr-FR")} 💵 !`;
      } else {
        resultText = `💔 Perdu ! Tu perds ta mise de ${bet.toLocaleString("fr-FR")} 💵.`;
      }
      if (winAmount > 0) await bank.addMoney(globalData, userId, winAmount);
      const newBalance = await bank.getBalance(globalData, userId);
      return send(
        context,
        `🎰 [ ${s1} | ${s2} | ${s3} ]\n\n${resultText}\n\n💰 Nouveau solde : ${newBalance.toLocaleString("fr-FR")} 💵`
      );
    } catch (error) {
      console.error("[Casino] Slots impossible :", error.message || error);
      return send(context, "❌ Erreur lors du jeu. Vérifie le stockage persistant du bot.");
    }
  }

  // Roulette
  if (subCommand === "roulette") {
    const choice = args[1] ? args[1].toLowerCase() : null;
    const bet = parseInt(args[2], 10);
    if (!choice || isNaN(bet) || bet <= 0) {
      return send(context, `⚠️ Usage : ${prefix}casino roulette <rouge|noir|0-36> <mise>`);
    }
    try {
      const ok = await bank.removeMoney(globalData, userId, bet);
      if (!ok) return send(context, `❌ Solde insuffisant (${balance.toLocaleString("fr-FR")} 💵).`);
      const winNum = Math.floor(Math.random() * 37);
      const reds = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
      const winColor = winNum === 0 ? "vert" : reds.includes(winNum) ? "rouge" : "noir";
      let winAmount = 0;
      let success = false;
      if (choice === winColor) {
        winAmount = bet * 2 + 2000;
        success = true;
      } else if (!isNaN(parseInt(choice, 10)) && parseInt(choice, 10) === winNum) {
        winAmount = bet * 36 + BASE_REWARD;
        success = true;
      }
      if (success) await bank.addMoney(globalData, userId, winAmount);
      const newBalance = await bank.getBalance(globalData, userId);
      return send(
        context,
        `🎲 Le numéro gagnant est ${winNum} (${winColor.toUpperCase()}) !\n\n` +
        (success
          ? `🎉 GAGNÉ ! +${winAmount.toLocaleString("fr-FR")} 💵`
          : `💔 PERDU ! -${bet.toLocaleString("fr-FR")} 💵`) +
        `\n\n💰 Nouveau solde : ${newBalance.toLocaleString("fr-FR")} 💵`
      );
    } catch (error) {
      console.error("[Casino] Roulette impossible :", error.message || error);
      return send(context, "❌ Erreur lors du jeu. Vérifie le stockage persistant du bot.");
    }
  }

  // Blackjack
  if (["blackjack", "bj"].includes(subCommand)) {
    const bet = parseInt(args[1], 10) || 1000;
    if (bet <= 0) return send(context, "⚠️ Mise invalide.");
    try {
      const ok = await bank.removeMoney(globalData, userId, bet);
      if (!ok) return send(context, "⚠️ Solde insuffisant.");
      const pTotal = (Math.floor(Math.random() * 10) + 1) + (Math.floor(Math.random() * 10) + 1);
      const dTotal = Math.floor(Math.random() * 12) + 12;
      let winAmount = 0;
      let msg = "";
      if (pTotal <= 21 && (pTotal > dTotal || dTotal > 21)) {
        winAmount = BASE_REWARD + bet * 2;
        await bank.addMoney(globalData, userId, winAmount);
        msg = `🎉 Victoire ! Tu remportes ${winAmount.toLocaleString("fr-FR")} 💵 !`;
      } else if (pTotal === dTotal) {
        await bank.addMoney(globalData, userId, bet);
        msg = `⚖️ Égalité ! Ta mise t’est rendue.`;
      } else {
        msg = `💔 Défaite ! La banque l’emporte.`;
      }
      const newBalance = await bank.getBalance(globalData, userId);
      return send(
        context,
        `🃏 Blackjack\n• Tes cartes : ${pTotal}\n• Banque : ${dTotal}\n\n${msg}\n\n💰 Nouveau solde : ${newBalance.toLocaleString("fr-FR")} 💵`
      );
    } catch (error) {
      console.error("[Casino] Blackjack impossible :", error.message || error);
      return send(context, "❌ Erreur lors du jeu. Vérifie le stockage persistant du bot.");
    }
  }

  // Pile ou Face
  if (["coinflip", "cf"].includes(subCommand)) {
    const choice = args[1] ? args[1].toLowerCase() : null;
    const bet = parseInt(args[2], 10);
    if (!["pile", "face"].includes(choice) || isNaN(bet) || bet <= 0) {
      return send(context, `⚠️ Usage : ${prefix}casino coinflip <pile|face> <mise>`);
    }
    try {
      const ok = await bank.removeMoney(globalData, userId, bet);
      if (!ok) return send(context, "❌ Solde insuffisant.");
      const coin = Math.random() < 0.5 ? "pile" : "face";
      const won = choice === coin;
      let winAmount = 0;
      if (won) {
        winAmount = bet * 2 + 500;
        await bank.addMoney(globalData, userId, winAmount);
      }
      const newBalance = await bank.getBalance(globalData, userId);
      return send(
        context,
        `🪙 La pièce est tombée sur ${coin.toUpperCase()} !\n\n` +
        (won
          ? `🎉 GAGNÉ ! +${winAmount.toLocaleString("fr-FR")} 💵`
          : `💔 PERDU ! -${bet.toLocaleString("fr-FR")} 💵`) +
        `\n\n💰 Nouveau solde : ${newBalance.toLocaleString("fr-FR")} 💵`
      );
    } catch (error) {
      console.error("[Casino] Coinflip impossible :", error.message || error);
      return send(context, "❌ Erreur lors du jeu. Vérifie le stockage persistant du bot.");
    }
  }

  return send(context, `💡 Usage : ${prefix}casino help`);
}

module.exports = {
  config: {
    name: "casino",
    aliases: ["bet", "jeux"],
    version: "2.0.0",
    author: "Diwate",
    description: "Joue au casino avec tes 💵 (stockage persistant)",
    category: "Économie",
    usages: "casino <slots|roulette|blackjack|coinflip> ...",
    role: 0
  },
  BASE_REWARD,
  handleCasino,
  onStart: async function (context) {
    return handleCasino(context);
  }
};
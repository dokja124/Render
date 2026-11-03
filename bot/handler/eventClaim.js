"use strict";

/**
 * Anti-doublon ENTRE processus.
 *
 * Quand deux instances du bot tournent en même temps sur le même compte Facebook
 * (déploiement Render qui se chevauche, ancienne instance encore vivante...), chacune
 * reçoit le même message et répond. Un cache en mémoire ne peut rien contre ça.
 *
 * Ici, chaque instance tente d'insérer l'identifiant du message dans MongoDB (index
 * unique). Une seule insertion réussit : cette instance traite le message, les autres
 * l'ignorent. Les entrées expirent toutes seules (index TTL).
 *
 * Sécurité : en cas de problème (base non Mongo, connexion coupée, timeout, erreur),
 * on traite le message normalement. Cette protection ne doit jamais bloquer le bot.
 */

const COLLECTION = "event_claims";
const TTL_SECONDS = 300;
const CLAIM_TIMEOUT_MS = 4000;
const CLAIMED_TYPES = new Set(["message", "message_reply", "message_reaction", "message_unsend"]);

let indexPromise = null;
let warnedIndex = false;

function getClaimKey(botID, event) {
  if (!event || !CLAIMED_TYPES.has(event.type) || !event.messageID) return null;
  return [
    botID || "bot",              // sépare deux comptes bot présents dans le même groupe
    event.type,
    event.threadID || "",
    event.messageID,
    event.reaction || "",
    event.userID || event.senderID || ""
  ].join("|");
}

function getCollection() {
  const config = global.GoatBot && global.GoatBot.config;
  if (!config || !config.database || config.database.type !== "mongodb") return null;
  let mongoose;
  try { mongoose = require("mongoose"); } catch (_) { return null; }
  const connection = mongoose && mongoose.connection;
  if (!connection || connection.readyState !== 1) return null;
  return connection.collection(COLLECTION);
}

function ensureIndexes(collection) {
  if (!indexPromise) {
    indexPromise = Promise.all([
      collection.createIndex({ key: 1 }, { unique: true }),
      collection.createIndex({ at: 1 }, { expireAfterSeconds: TTL_SECONDS })
    ]).catch(error => {
      indexPromise = null;
      throw error;
    });
  }
  return indexPromise;
}

async function tryClaim(collection, key) {
  await ensureIndexes(collection);
  try {
    await collection.insertOne({ key, at: new Date(), pid: process.pid });
    return true;
  } catch (error) {
    if (error && (error.code === 11000 || /E11000/.test(String(error.message)))) return false;
    throw error;
  }
}

// true = cette instance doit traiter l'événement ; false = une autre l'a déjà pris.
async function claimEvent(api, event) {
  try {
    const botID = api && typeof api.getCurrentUserID === "function" ? api.getCurrentUserID() : "";
    const key = getClaimKey(botID, event);
    if (!key) return true;
    const collection = getCollection();
    if (!collection) return true;

    let timer;
    const timeout = new Promise(resolve => { timer = setTimeout(() => resolve("timeout"), CLAIM_TIMEOUT_MS); });
    const result = await Promise.race([tryClaim(collection, key), timeout]);
    clearTimeout(timer);
    return result === "timeout" ? true : result;
  } catch (error) {
    if (!warnedIndex) {
      warnedIndex = true;
      console.warn("[eventClaim] Protection anti-doublon inactive :", error && error.message || error);
    }
    return true;
  }
}

module.exports = claimEvent;
module.exports.getClaimKey = getClaimKey;

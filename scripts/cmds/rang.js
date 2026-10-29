const { send } = require("./lib/messenger");
const fs = require("fs");
const path = require("path");

const RANG_FILE = path.join(__dirname, "../../database/rang.json");
const MAX_RECENT_IDS = 50;
const XP_PER_ACTIVE_MINUTE = 5;
const MESSAGES_PER_LEVEL = 100;
let writeQueue = Promise.resolve();

function emptyStore() {
  return { version: 1, users: {} };
}

async function readStore() {
  try {
    const raw = await fs.promises.readFile(RANG_FILE, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || !data.users || typeof data.users !== "object" || Array.isArray(data.users)) {
      throw new Error("Structure de database/rang.json invalide.");
    }
    return { version: 1, users: data.users };
  } catch (error) {
    if (error.code === "ENOENT") return emptyStore();
    throw error;
  }
}

async function writeStore(store) {
  await fs.promises.mkdir(path.dirname(RANG_FILE), { recursive: true });
  const temporaryPath = `${RANG_FILE}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await fs.promises.writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
    await fs.promises.rename(temporaryPath, RANG_FILE);
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

function enqueueWrite(task) {
  const operation = writeQueue.catch(() => {}).then(task);
  writeQueue = operation;
  return operation;
}

function normalizeRankRecord(record) {
  const value = record && typeof record === "object" ? record : {};
  return {
    messages: Math.max(0, Number(value.messages) || 0),
    lastMessageAt: value.lastMessageAt || null,
    lastMessageID: value.lastMessageID ? String(value.lastMessageID) : null,
    recentMessageIDs: Array.isArray(value.recentMessageIDs) ? value.recentMessageIDs.map(String).slice(-MAX_RECENT_IDS) : [],
    lastXpAt: Math.max(0, Number(value.lastXpAt) || 0)
  };
}

async function incrementMessage(userID, messageID, now = Date.now()) {
  const id = String(userID || "");
  const message = String(messageID || "");
  if (!id || !message) throw new Error("userID et messageID sont nécessaires pour compter un message.");

  return enqueueWrite(async () => {
    const store = await readStore();
    const record = normalizeRankRecord(store.users[id]);
    if (record.recentMessageIDs.includes(message)) {
      return { ...record, duplicate: true, awardXP: false };
    }

    const awardXP = now - record.lastXpAt >= 60 * 1000;
    record.messages += 1;
    record.lastMessageAt = new Date(now).toISOString();
    record.lastMessageID = message;
    record.recentMessageIDs = [...record.recentMessageIDs, message].slice(-MAX_RECENT_IDS);
    if (awardXP) record.lastXpAt = now;

    store.users[id] = record;
    await writeStore(store);
    return { ...record, duplicate: false, awardXP };
  });
}

async function getStoredRankStats(userID) {
  await writeQueue.catch(() => {});
  const store = await readStore();
  return normalizeRankRecord(store.users[String(userID || "")]);
}

function getMentionTarget(event) {
  const mentions = event && event.mentions;
  if (!mentions || typeof mentions !== "object") return null;
  const id = Object.keys(mentions)[0];
  if (!id) return null;
  const raw = mentions[id];
  return {
    id: String(id),
    name: typeof raw === "string" ? raw : raw && (raw.name || raw.fullName) || null
  };
}

function getLevel(messages) {
  return Math.floor(Math.max(0, Number(messages) || 0) / MESSAGES_PER_LEVEL);
}

function getTitle(level) {
  if (level >= 30) return "🏆 Légende";
  if (level >= 20) return "🔥 Maître d’élite";
  if (level >= 10) return "🛡️ Jōnin";
  if (level >= 5) return "⚔️ Chūnin";
  if (level >= 2) return "🌀 Genin confirmé";
  if (level >= 1) return "🥷 Genin";
  return "🌱 Recrue";
}

function progressBar(current, required, size = 10) {
  const ratio = required > 0 ? Math.max(0, Math.min(1, current / required)) : 0;
  const filled = Math.round(ratio * size);
  return `${"█".repeat(filled)}${"░".repeat(size - filled)} ${Math.floor(ratio * 100)}%`;
}

function getRankStats(rankRecord) {
  const rank = rankRecord && typeof rankRecord === "object" ? rankRecord : {};
  return {
    messages: Math.max(0, Number(rank.messages) || 0),
    lastMessageAt: rank.lastMessageAt || null
  };
}

function rankInGroup(allUsers, participantIDs, targetID) {
  if (!participantIDs || !participantIDs.length) return null;
  const byID = new Map(allUsers.map(user => [String(user.userID), user]));
  const memberIDs = Array.from(new Set([...participantIDs.map(String), String(targetID)]));
  const members = memberIDs.map(userID => {
    const user = byID.get(userID);
    return { userID, xp: Math.max(0, Number(user && user.exp) || 0) };
  }).sort((a, b) => b.xp - a.xp || a.userID.localeCompare(b.userID));
  const position = members.findIndex(member => member.userID === String(targetID));
  return position < 0 ? null : { position: position + 1, total: members.length };
}

function getMessageIdentity(event) {
  if (!event) return null;
  const userID = event.userID || event.senderID || event.author;
  const threadID = event.threadID;
  const messageID = event.messageID || event.messageId;
  if (!userID || !threadID || !messageID) return null;

  const type = String(event.type || "").toLowerCase();
  if (type === "message" || type === "message_reply") return { userID: String(userID), messageID: String(messageID) };
  if (type && type !== "event") return null;
  if (event.logMessageType || event.logMessageData) return null;
  if (typeof event.body === "string" || Array.isArray(event.attachments)) {
    return { userID: String(userID), messageID: String(messageID) };
  }
  return null;
}

async function countMessage({ event, usersData }) {
  const identity = getMessageIdentity(event);
  if (!identity) return;
  try {
    const result = await incrementMessage(identity.userID, identity.messageID);
    if (result.duplicate || !result.awardXP || !usersData || typeof usersData.get !== "function" || typeof usersData.set !== "function") return;
    const currentXP = Math.max(0, Number(await usersData.get(identity.userID, "exp", 0)) || 0);
    await usersData.set(identity.userID, currentXP + XP_PER_ACTIVE_MINUTE, "exp");
  } catch (error) {
    console.error("[Rang] Impossible de mettre à jour les statistiques :", error.stack || error);
  }
}

module.exports = {
  config: {
    name: "rang",
    version: "4.1.0",
    author: "Diwate",
    description: "Affiche le titre, le niveau et la progression fondée sur les messages",
    category: "Général",
    usages: "rang [@mention]",
    role: 0
  },
  incrementMessage,
  getStoredRankStats,
  getLevel,
  getTitle,
  MESSAGES_PER_LEVEL,
  progressBar,
  getRankStats,
  rankInGroup,
  getMessageIdentity,
  countMessage,
  onEvent: countMessage,
  onAnyEvent: countMessage,

  onStart: async function ({ api, message, event, usersData }) {
    try {
      // Repli fiable : compte aussi le message !rang lui-même si le hook d’événement est retardé.
      // incrementMessage déduplique le même message reçu via onEvent/onAnyEvent.
      await countMessage({ event, usersData });
      const mention = getMentionTarget(event);
      const targetID = mention && mention.id || String(event && (event.senderID || event.userID || event.author) || "");
      if (!targetID) return send({ api, message, event }, "❌ Impossible d’identifier ce membre.");
      if (!usersData || typeof usersData.get !== "function") {
        return send({ api, message, event }, "❌ Les données utilisateur ne sont pas disponibles.");
      }

      let allUsers = [];
      if (typeof usersData.getAll === "function") allUsers = await usersData.getAll();
      if (!Array.isArray(allUsers)) allUsers = [];
      let target = allUsers.find(user => String(user.userID) === targetID);
      if (!target) target = await usersData.get(targetID);
      if (!target) return send({ api, message, event }, "❌ Le profil de ce membre n’a pas pu être chargé.");

      const targetName = target.name || (mention && mention.name)
        || (String(event && (event.senderID || event.userID || event.author)) === targetID && event.senderName)
        || "Membre";
      const activity = getRankStats(await getStoredRankStats(targetID));
      const level = getLevel(activity.messages);
      const title = getTitle(level);
      const messagesInLevel = activity.messages % MESSAGES_PER_LEVEL;
      const messagesRemaining = MESSAGES_PER_LEVEL - messagesInLevel;

      const lines = [
        "╭━━━━━━〔 🏅 RANG 〕━━━━━━╮",
        `👤 ${targetName}`,
        "├────────────────────────",
        `🏷️ Titre : ${title}`,
        `🔰 Niveau : ${level}`,
        `📈 Progression : ${progressBar(messagesInLevel, MESSAGES_PER_LEVEL)} (${messagesInLevel}/${MESSAGES_PER_LEVEL} messages)`,
        `💬 Messages comptés : ${activity.messages}`,
        `📨 Messages à envoyer pour le niveau ${level + 1} : ${messagesRemaining}`,
        "╰━━━━━━━━━━━━━━━━━━━━━━━━╯"
      ];
      return send({ api, message, event }, lines.join("\n"));
    } catch (error) {
      console.error("[Commande rang]", error.stack || error);
      return send({ api, message, event }, "❌ Le profil n’a pas pu être chargé. Vérifie la base de données et database/rang.json.");
    }
  }
};

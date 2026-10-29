const { send } = require("./lib/messenger");
const fs = require("fs");
const path = require("path");

const RANG_FILE = path.join(__dirname, "../../database/rang.json");
const MAX_RECENT_IDS = 50;
const XP_PER_ACTIVE_MINUTE = 5;
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

function getLevel(xp) {
  return Math.floor(Math.max(0, Number(xp) || 0) / 100);
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
    description: "Affiche le nombre de messages, le titre, le niveau, l’XP et le rang",
    category: "Général",
    usages: "rang [@mention]",
    role: 0
  },
  incrementMessage,
  getStoredRankStats,
  getLevel,
  getTitle,
  progressBar,
  getRankStats,
  rankInGroup,
  getMessageIdentity,
  countMessage,
  onEvent: countMessage,

  onStart: async function ({ api, message, event, usersData }) {
    try {
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
      const xp = Math.max(0, Number(target.exp) || 0);
      const level = getLevel(xp);
      const title = getTitle(level);
      const xpInLevel = xp % 100;
      const activity = getRankStats(await getStoredRankStats(targetID));

      let groupRank = null;
      if (event && event.threadID && api && typeof api.getThreadInfo === "function") {
        try {
          const info = await api.getThreadInfo(event.threadID);
          if (Array.isArray(info && info.participantIDs)) {
            groupRank = rankInGroup(allUsers, info.participantIDs, targetID);
          }
        } catch (threadError) {
          console.warn("[Commande rang] Classement de conversation indisponible :", threadError.message);
        }
      }

      const rankLine = groupRank
        ? `🏆 Rang dans cette conversation : ${groupRank.position}/${groupRank.total} (selon l’XP)`
        : "🏆 Rang de conversation : indisponible";
      const lastActivity = activity.lastMessageAt
        ? `🕒 Dernier message compté : ${new Date(activity.lastMessageAt).toLocaleString("fr-FR", { timeZone: "UTC" })} UTC`
        : "🕒 Dernier message compté : aucun pour le moment";

      const lines = [
        "╭━━━━━━〔 🏅 PROFIL & RANG 〕━━━━━━╮",
        `👤 ${targetName}`,
        `🆔 ${targetID}`,
        "├────────────────────────",
        `🏷️ Titre : ${title}`,
        `🔰 Niveau : ${level}`,
        `✨ XP : ${xp} / ${(level + 1) * 100} vers le niveau ${level + 1}`,
        `📈 Progression : ${progressBar(xpInLevel, 100)} (${xpInLevel}/100 XP)`,
        `💬 Messages comptés : ${activity.messages}`,
        rankLine,
        lastActivity,
        "├────────────────────────",
        "ℹ️ Les compteurs et IDs récents sont stockés dans database/rang.json. Gain d’XP : +5 par minute active.",
        "╰━━━━━━━━━━━━━━━━━━━━━━━━╯"
      ];
      return send({ api, message, event }, lines.join("\n"));
    } catch (error) {
      console.error("[Commande rang]", error.stack || error);
      return send({ api, message, event }, "❌ Le profil n’a pas pu être chargé. Vérifie la base de données et database/rang.json.");
    }
  }
};

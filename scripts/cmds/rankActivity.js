const queuesByUser = new Map();
const recentMessageIDs = new Set();
const MAX_RECENT_MESSAGE_IDS = 20000;
const XP_PER_ACTIVE_MINUTE = 5;
const XP_COOLDOWN_MS = 60 * 1000;

function isChatMessage(event) {
  const senderID = event && (event.senderID || event.userID || event.author);
  if (!event || !senderID || !event.threadID || !event.messageID) return false;
  const type = String(event.type || "").toLowerCase();
  if (type) return type === "message" || type === "message_reply";
  if (event.logMessageType || event.logMessageData) return false;
  return typeof event.body === "string" || Array.isArray(event.attachments);
}

function rememberMessage(messageID) {
  recentMessageIDs.add(messageID);
  if (recentMessageIDs.size > MAX_RECENT_MESSAGE_IDS) {
    const oldest = recentMessageIDs.values().next().value;
    recentMessageIDs.delete(oldest);
  }
}

async function serializeUser(userID, task) {
  const previous = queuesByUser.get(userID) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  queuesByUser.set(userID, current);
  try {
    return await current;
  } finally {
    if (queuesByUser.get(userID) === current) queuesByUser.delete(userID);
  }
}

async function trackMessage({ event, usersData }) {
  if (!isChatMessage(event) || !usersData || typeof usersData.get !== "function" || typeof usersData.set !== "function") return;
  const userID = String(event.senderID || event.userID || event.author);
  const messageID = String(event.messageID);
  if (recentMessageIDs.has(messageID)) return;

  try {
    await serializeUser(userID, async () => {
      if (recentMessageIDs.has(messageID)) return;
      const user = await usersData.get(userID);
      if (!user) return;
      const existingData = user.data && typeof user.data === "object" && !Array.isArray(user.data) ? user.data : {};
      const currentRank = existingData.rank && typeof existingData.rank === "object" ? existingData.rank : {};
      if (String(currentRank.lastMessageID || "") === messageID) {
        rememberMessage(messageID);
        return;
      }

      const now = Date.now();
      const lastXpAt = Number(currentRank.lastXpAt) || 0;
      const awardXP = now - lastXpAt >= XP_COOLDOWN_MS;
      const currentXP = Math.max(0, Number(user.exp) || 0);
      const newRank = {
        ...currentRank,
        messages: Math.max(0, Number(currentRank.messages) || 0) + 1,
        lastMessageAt: new Date(now).toISOString(),
        lastMessageID: messageID
      };
      if (awardXP) newRank.lastXpAt = now;

      // Une seule mise à jour conserve les autres données du profil et écrit XP + compteur ensemble.
      await usersData.set(userID, {
        exp: currentXP + (awardXP ? XP_PER_ACTIVE_MINUTE : 0),
        data: { ...existingData, rank: newRank }
      });
      rememberMessage(messageID);
    });
  } catch (error) {
    console.error("[rankActivity] Impossible d’enregistrer l’activité :", error.message || error);
  }
}

module.exports = {
  config: {
    name: "rankActivity",
    version: "1.0.0",
    author: "Diwate",
    description: "Compteur persistant des messages et attribution d’XP pour le rang",
    category: "events"
  },
  // GoatBot appelle ce callback dédié une fois pour chaque événement entrant.
  onEvent: trackMessage,
  // Requis par le chargeur d’événements; aucun comptage ici, pour éviter les doublons.
  onStart: async function () {}
};

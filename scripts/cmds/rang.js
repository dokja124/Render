const { send } = require("./lib/messenger");

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

function getRankStats(user) {
  const data = user && user.data && typeof user.data === "object" ? user.data : {};
  const rank = data.rank && typeof data.rank === "object" ? data.rank : {};
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

module.exports = {
  config: {
    name: "rang",
    version: "3.0.0",
    author: "Diwate",
    description: "Affiche les messages comptés, le titre, le niveau, l’XP et le rang",
    category: "Général",
    usages: "rang [@mention]",
    role: 0
  },
  getLevel,
  getTitle,
  progressBar,
  getRankStats,
  rankInGroup,

  onStart: async function ({ api, message, event, usersData }) {
    try {
      const mention = getMentionTarget(event);
      const targetID = mention && mention.id || String(event && event.senderID || "");
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
        || (String(event && event.senderID) === targetID && event.senderName)
        || "Membre";
      const xp = Math.max(0, Number(target.exp) || 0);
      const level = getLevel(xp);
      const title = getTitle(level);
      const xpInLevel = xp % 100;
      const xpToNextLevel = 100 - xpInLevel;
      const activity = getRankStats(target);

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
        "ℹ️ Les messages sont comptés automatiquement. Gain d’XP : +5 par minute active.",
        "╰━━━━━━━━━━━━━━━━━━━━━━━━╯"
      ];
      return send({ api, message, event }, lines.join("\n"));
    } catch (error) {
      console.error("[Commande rang]", error.stack || error);
      return send({ api, message, event }, "❌ Le profil n’a pas pu être chargé. Vérifie la connexion à la base de données.");
    }
  }
};

const { send } = require("./lib/messenger");

function getMentionTarget(event) {
  const mentions = event && event.mentions;
  if (!mentions || typeof mentions !== "object") return null;
  const ids = Object.keys(mentions);
  return ids.length ? ids[0] : null;
}

module.exports = {
  config: {
    name: "rang",
    version: "2.0.0",
    author: "Diwate",
    description: "Affiche ton XP et ton rang dans cette conversation",
    category: "Général",
    usages: "rang [@mention]",
    role: 0
  },

  onStart: async function ({ api, message, event, usersData }) {
    try {
      const targetID = getMentionTarget(event) || String(event && event.senderID || "");
      if (!targetID) return send({ api, message, event }, "❌ Impossible d’identifier ce membre.");

      let allUsers = [];
      if (usersData && typeof usersData.getAll === "function") {
        allUsers = await usersData.getAll();
      }
      const target = allUsers.find(user => String(user.userID) === String(targetID))
        || (usersData && typeof usersData.get === "function" ? await usersData.get(targetID) : null);
      const targetName = (event && event.mentions && event.mentions[targetID])
        || (target && target.name)
        || (String(event && event.senderID) === String(targetID) && event.senderName)
        || "Membre";
      const xp = Number(target && target.exp) || 0;

      let participantIDs = [targetID];
      try {
        const threadInfo = await api.getThreadInfo(event.threadID);
        if (Array.isArray(threadInfo && threadInfo.participantIDs) && threadInfo.participantIDs.length) {
          participantIDs = threadInfo.participantIDs.map(String);
        }
      } catch (threadError) {
        console.warn("[Commande rang] Classement de groupe indisponible :", threadError.message);
      }

      const memberSet = new Set(participantIDs);
      const rankedMembers = allUsers
        .filter(user => memberSet.has(String(user.userID)))
        .map(user => ({ userID: String(user.userID), exp: Number(user.exp) || 0 }))
        .sort((a, b) => b.exp - a.exp || a.userID.localeCompare(b.userID));
      const position = rankedMembers.findIndex(user => user.userID === String(targetID));
      const rankText = position >= 0
        ? `🏆 Rang dans cette conversation : ${position + 1}/${rankedMembers.length}`
        : "🏆 Rang : pas encore calculable (aucune activité enregistrée)";

      return send(
        { api, message, event },
        `🏅 PROFIL & RANG\n👤 ${targetName}\n🆔 ${targetID}\n✨ XP enregistrée : ${xp}\n${rankText}`
      );
    } catch (error) {
      console.error("[Commande rang]", error);
      return send({ api, message, event }, "❌ Le profil n’a pas pu être chargé. Vérifie la connexion à la base de données.");
    }
  }
};

const QUESTIONS = [
  { question: "Quel est le rêve de Naruto ?", answers: ["Devenir Hokage", "Devenir pirate", "Devenir alchimiste"], correct: 0 },
  { question: "Dans quel anime trouve-t-on Monkey D. Luffy ?", answers: ["Bleach", "One Piece", "Fairy Tail"], correct: 1 },
  { question: "Quel est le prénom de l’Elric alchimiste d’État ?", answers: ["Edward", "Alphonse", "Roy"], correct: 0 },
  { question: "Quel sport est au centre de Blue Lock ?", answers: ["Basket", "Football", "Volley"], correct: 1 },
  { question: "Qui est le capitaine des Chapeaux de paille ?", answers: ["Zoro", "Sanji", "Luffy"], correct: 2 },
  { question: "Dans Demon Slayer, quelle est la sœur de Tanjiro ?", answers: ["Mikasa", "Nezuko", "Sakura"], correct: 1 },
  { question: "Quel est le nom du village de Naruto ?", answers: ["Konoha", "Suna", "Ame"], correct: 0 },
  { question: "Dans Death Note, quel est le nom du shinigami de Light ?", answers: ["Rem", "Ryuk", "Rai"], correct: 1 }
];

const STATS_KEY = "animeQuizStats";
const pending = new Map();
let memoryStats = { totalAnswers: 0, correctAnswers: 0, players: {} };

function sessionKey(threadID, userID) {
  return `${threadID || "private"}:${userID || "unknown"}`;
}

function normalizeStats(stats) {
  const value = stats && typeof stats === "object" ? stats : {};
  const players = value.players && typeof value.players === "object" ? value.players : {};
  return {
    totalAnswers: Number.isFinite(Number(value.totalAnswers)) ? Number(value.totalAnswers) : 0,
    correctAnswers: Number.isFinite(Number(value.correctAnswers)) ? Number(value.correctAnswers) : 0,
    players
  };
}

async function getStats(globalData) {
  if (!globalData || typeof globalData.get !== "function") return normalizeStats(memoryStats);
  const stats = await globalData.get(STATS_KEY, "data", {
    totalAnswers: 0,
    correctAnswers: 0,
    players: {}
  });
  return normalizeStats(stats);
}

async function saveStats(globalData, stats) {
  const cleanStats = normalizeStats(stats);
  memoryStats = cleanStats;
  if (globalData && typeof globalData.get === "function" && typeof globalData.set === "function") {
    await globalData.get(STATS_KEY, "data", cleanStats);
    await globalData.set(STATS_KEY, cleanStats, "data");
  }
  return cleanStats;
}

async function recordAnswer(globalData, userID, wasCorrect) {
  const stats = await getStats(globalData);
  stats.totalAnswers += 1;
  if (wasCorrect) stats.correctAnswers += 1;
  const key = String(userID || "unknown");
  const player = stats.players[key] || { answers: 0, correct: 0 };
  player.answers += 1;
  if (wasCorrect) player.correct += 1;
  stats.players[key] = player;
  return saveStats(globalData, stats);
}

module.exports = {
  QUESTIONS,
  STATS_KEY,
  pending,
  sessionKey,
  normalizeStats,
  getStats,
  saveStats,
  recordAnswer
};

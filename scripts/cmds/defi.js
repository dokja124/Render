const { send } = require("./lib/messenger");
const CHALLENGES = [
  "Fais un compliment sincère à quelqu’un.",
  "Cite trois anime que tu recommandes.",
  "Écris une phrase sans utiliser la lettre A.",
  "Raconte un moment drôle en une phrase.",
  "Donne ton personnage d’anime préféré et explique pourquoi.",
  "Dessine un personnage d’anime en moins d’une minute."
];

module.exports = {
  config: {
    name: "defi", version: "2.0.0", author: "Diwate",
    description: "Propose un défi aléatoire",
    category: "Divertissement", usages: "defi", role: 0
  },
  onStart: async function ({ api, message, event }) {
    const challenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
    return send({ api, message, event }, `🎯 Défi du jour : ${challenge}`);
  }
};

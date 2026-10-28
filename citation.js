const { send } = require("./lib/messenger");
const QUOTES = [
  "Le succès est la somme de petits efforts répétés chaque jour.",
  "Même le plus long voyage commence par un premier pas.",
  "La connaissance parle, mais la sagesse écoute.",
  "Ne laisse pas la peur décider à ta place.",
  "Chaque jour est une nouvelle occasion d’apprendre.",
  "On ne voit bien qu’avec le cœur ; l’essentiel est invisible pour les yeux."
];

module.exports = {
  config: {
    name: "citation", version: "2.0.0", author: "Diwate",
    description: "Affiche une citation inspirante",
    category: "Divertissement", usages: "citation", role: 0
  },
  onStart: async function ({ api, message, event }) {
    const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    return send({ api, message, event }, `💬 « ${quote} »`);
  }
};

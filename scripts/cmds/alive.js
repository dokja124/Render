const { send } = require("./lib/messenger");

module.exports = {
  config: {
    name: "alive", version: "2.0.0", author: "Diwate",
    description: "Affiche le temps de fonctionnement du bot",
    category: "Général", usages: "alive", role: 0
  },
  onStart: async function ({ api, message, event }) {
    const total = Math.floor(process.uptime());
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const uptime = `${days ? `${days} j ` : ""}${hours} h ${minutes} min ${seconds} s`;
    return send({ api, message, event }, `💚 Le bot est en ligne.\n⏳ Temps de fonctionnement : ${uptime}`);
  }
};

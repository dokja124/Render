const packageInfo = require("../../package.json");
const { send } = require("./lib/messenger");

module.exports = {
  config: {
    name: "dev", version: "2.0.0", author: "Diwate",
    description: "Affiche les informations techniques du bot",
    category: "Général", usages: "dev", role: 0
  },
  onStart: async function ({ api, message, event }) {
    const commandCount = global.GoatBot && global.GoatBot.commands instanceof Map
      ? global.GoatBot.commands.size
      : "indisponible";
    const uptimeSeconds = Math.floor(process.uptime());
    return send(
      { api, message, event },
      `👨‍💻 INFORMATIONS DU BOT\n📦 Projet : ${packageInfo.name || "Bot Messenger"}\n🏷️ Version : ${packageInfo.version || "inconnue"}\n🟢 Node.js : ${process.version}\n🧩 Commandes chargées : ${commandCount}\n⏱️ Uptime : ${uptimeSeconds} s`
    );
  }
};

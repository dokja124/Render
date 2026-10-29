const { send } = require("./lib/messenger");

const PROFILE = {
  name: "Mr Diwate",
  role: "Développeur et mainteneur du bot Messenger",
  facebook: "https://facebook.com/61571138559424"
};

module.exports = {
  config: {
    name: "dev",
    version: "4.0.0",
    author: PROFILE.name,
    description: "Affiche le profil Facebook du développeur du bot",
    category: "Général",
    usages: "dev",
    role: 0
  },

  PROFILE,

  onStart: async function ({ api, message, event }) {
    const card = [
      "╭━━━〔 🌸✨ PROFIL DU DÉVELOPPEUR ✨🌸 〕━━━╮",
      "",
      `💫 Mon développeur est ${PROFILE.name} 💞`,
      `👨‍💻 ${PROFILE.role}`,
      "",
      "🔗 Son profil Facebook :",
      PROFILE.facebook,
      "",
      "╰━━━━━━〔 Merci d’utiliser le bot ! 〕━━━━━━╯"
    ].join("\n");
    return send({ api, message, event }, card);
  }
};

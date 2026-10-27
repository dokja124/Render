module.exports = {
  config: {
    name: "defi",
    version: "1.0.0-messenger",
    author: "Diwate",
    description: "Défi aléatoire",
    category: "Divertissement",
    usages: "defi",
    role: 0
  },
  langs: {
    fr: {
      error: "Une erreur est survenue pendant l’exécution de la commande."
    }
  },
  onStart: async function ({ api, message, event, args, prefix }) {
    try {
      const defis = ["Fais un compliment sincère à quelqu’un.","Cite trois anime que tu recommandes.","Écris une phrase sans utiliser la lettre A.","Raconte un moment drôle en une phrase.","Donne ton personnage d’anime préféré et explique pourquoi."];
    return message.reply(`🎯 Défi : ${defis[Math.floor(Math.random()*defis.length)]}`);
    } catch (error) {
      console.error("[Commande defi]", error);
      return message.reply("❌ Une erreur est survenue. Réessaie plus tard.");
    }
  }
};

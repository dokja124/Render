module.exports = {
  config: {
    name: "citation",
    version: "1.0.0-messenger",
    author: "Diwate",
    description: "Affiche une citation",
    category: "Divertissement",
    usages: "citation",
    role: 0
  },
  langs: {
    fr: {
      error: "Une erreur est survenue pendant l’exécution de la commande."
    }
  },
  onStart: async function ({ api, message, event, args, prefix }) {
    try {
      const quotes = ["Le succès est la somme de petits efforts répétés chaque jour.","Même le plus long voyage commence par un premier pas.","La connaissance parle, mais la sagesse écoute.","Ne laisse pas la peur décider à ta place.","Chaque jour est une nouvelle occasion d'apprendre."];
    return message.reply(`💬 « ${quotes[Math.floor(Math.random() * quotes.length)]} »`);
    } catch (error) {
      console.error("[Commande citation]", error);
      return message.reply("❌ Une erreur est survenue. Réessaie plus tard.");
    }
  }
};

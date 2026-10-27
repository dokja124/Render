module.exports = {
  config: {
    name: "add",
    version: "1.0.0-messenger",
    author: "Diwate",
    description: "Ajoute un propriétaire secondaire",
    category: "Administration",
    usages: "add",
    role: 0
  },
  langs: {
    fr: {
      error: "Une erreur est survenue pendant l’exécution de la commande."
    }
  },
  onStart: async function ({ api, message, event, args, prefix }) {
    try {
      return message.reply("🔐 La gestion des seconds propriétaires de l’ancienne version utilise les identifiants WhatsApp. Elle doit être reliée aux rôles Messenger avant d’être activée.");
    } catch (error) {
      console.error("[Commande add]", error);
      return message.reply("❌ Une erreur est survenue. Réessaie plus tard.");
    }
  }
};

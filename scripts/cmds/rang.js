module.exports = {
  config: {
    name: "rang",
    version: "1.0.0-messenger",
    author: "Diwate",
    description: "Affiche le profil et le rang",
    category: "Général",
    usages: "rang",
    role: 0
  },
  langs: {
    fr: {
      error: "Une erreur est survenue pendant l’exécution de la commande."
    }
  },
  onStart: async function ({ api, message, event, args, prefix }) {
    try {
      const sender = event.senderID || "inconnu";
    const name = event.senderName || "Membre";
    return message.reply(`🏅 Profil\n👤 ${name}\n🆔 ${sender}\nℹ️ Le système de rang et d’XP du bot WhatsApp n’est pas encore connecté à la base de données Messenger.`);
    } catch (error) {
      console.error("[Commande rang]", error);
      return message.reply("❌ Une erreur est survenue. Réessaie plus tard.");
    }
  }
};

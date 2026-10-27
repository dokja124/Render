module.exports = {
  config: {
    name: "traduit",
    version: "1.0.0-messenger",
    author: "Diwate",
    description: "Traduit un texte",
    category: "Outils",
    usages: "traduit",
    role: 0
  },
  langs: {
    fr: {
      error: "Une erreur est survenue pendant l’exécution de la commande."
    }
  },
  onStart: async function ({ api, message, event, args, prefix }) {
    try {
      const raw = args.join(" ").trim();
    if (!raw) return message.reply(`🌐 ${prefix}traduit <texte> | <langue cible>\nExemple : ${prefix}traduit Bonjour | anglais`);
    const parts = raw.split("|");
    const text = (parts[0] || "").trim();
    const lang = (parts[1] || "fr").trim().toLowerCase();
    const map = {fr:"fr", français:"fr", anglais:"en", english:"en", japonais:"ja", japonais:"ja", espagnol:"es", espagnol:"es", arabe:"ar", allemand:"de", italien:"it", portugais:"pt", indonésien:"id"};
    const target = map[lang] || lang;
    const { data } = await require("axios").get("https://api.mymemory.translated.net/get", { params: { q: text, langpair: `fr|${target}` }, timeout: 12000 });
    const result = data?.responseData?.translatedText;
    if (!result) return message.reply("La traduction n’a pas abouti. Vérifie le texte ou la langue cible.");
    return message.reply(`🌐 Traduction (${target}) :\n${result}`);
    } catch (error) {
      console.error("[Commande traduit]", error);
      return message.reply("❌ Une erreur est survenue. Réessaie plus tard.");
    }
  }
};

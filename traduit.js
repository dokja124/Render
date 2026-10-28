const axios = require("axios");
const { send } = require("./lib/messenger");

const LANGUAGE_CODES = {
  français: "fr", francais: "fr", french: "fr",
  anglais: "en", english: "en", japonais: "ja", japanese: "ja",
  espagnol: "es", spanish: "es", arabe: "ar", arabic: "ar",
  allemand: "de", german: "de", italien: "it", italian: "it",
  portugais: "pt", portuguese: "pt", indonésien: "id", indonesien: "id",
  chinois: "zh", chinois_simplifié: "zh-CN", chinois_traditionnel: "zh-TW",
  russe: "ru", russe_: "ru", coréen: "ko", coreen: "ko"
};

function normalizeLanguage(language) {
  const normalized = String(language || "").trim().toLowerCase();
  return LANGUAGE_CODES[normalized] || normalized;
}

module.exports = {
  config: {
    name: "traduit", version: "2.0.0", author: "Diwate",
    description: "Traduit un texte français vers une autre langue",
    category: "Outils", usages: "traduit <texte> | <langue cible>", role: 0
  },
  normalizeLanguage,
  onStart: async function ({ api, message, event, args, prefix }) {
    try {
      const raw = args.join(" ").trim();
      if (!raw) return send({ api, message, event }, `🌐 Utilisation : ${prefix || "!"}traduit <texte> | <langue cible>\nExemple : ${prefix || "!"}traduit Bonjour | anglais`);
      const separator = raw.lastIndexOf("|");
      const text = (separator < 0 ? raw : raw.slice(0, separator)).trim();
      const languageInput = separator < 0 ? "anglais" : raw.slice(separator + 1).trim();
      const target = normalizeLanguage(languageInput);
      if (!text) return send({ api, message, event }, "✍️ Le texte à traduire est vide.");
      if (text.length > 4500) return send({ api, message, event }, "⚠️ Le texte est trop long. Limite : 4 500 caractères.");
      if (!/^[a-z]{2,3}(?:-[a-z]{2,4})?$/i.test(target)) {
        return send({ api, message, event }, "🌐 Langue invalide. Utilise un nom comme anglais, japonais ou un code ISO comme en, ja.");
      }
      const { data } = await axios.get("https://api.mymemory.translated.net/get", {
        params: { q: text, langpair: `fr|${target}` }, timeout: 15000
      });
      const translated = data && data.responseData && data.responseData.translatedText;
      if (!translated || Number(data.responseStatus) >= 400) {
        return send({ api, message, event }, "❌ Le service n’a pas renvoyé de traduction. Vérifie la langue cible et réessaie.");
      }
      return send({ api, message, event }, `🌐 Traduction français → ${target}\n${translated}`);
    } catch (error) {
      console.error("[Commande traduit]", error.message);
      return send({ api, message, event }, "❌ Le service de traduction est temporairement indisponible.");
    }
  }
};

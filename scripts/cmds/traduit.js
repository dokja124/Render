"use strict";

const { send } = require("./lib/messenger");

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";
const MAX_INPUT_LENGTH = 2000;
const MAX_OUTPUT_LENGTH = 1500;

// Langues supportées : code -> nom affiché + nom pour Gemini
const LANGUAGES = {
  fr: { label: "Français", gemini: "French" },
  en: { label: "Anglais", gemini: "English" },
  es: { label: "Espagnol", gemini: "Spanish" },
  de: { label: "Allemand", gemini: "German" },
  it: { label: "Italien", gemini: "Italian" },
  pt: { label: "Portugais", gemini: "Portuguese" },
  ru: { label: "Russe", gemini: "Russian" },
  ar: { label: "Arabe", gemini: "Arabic" },
  zh: { label: "Chinois (simplifié)", gemini: "Simplified Chinese" },
  ko: { label: "Coréen", gemini: "Korean" },
  ja: { label: "Japonais (avec romaji)", gemini: "Japanese, and also provide the romaji (Latin transliteration) of the Japanese text in parentheses" },
  ja_kanji: { label: "Japonais (avec kanji)", gemini: "Japanese" }
};

// Alias français/anglais -> code
const LANGUAGE_ALIASES = {
  fr: "fr", français: "fr", francais: "fr", french: "fr",
  en: "en", anglais: "en", english: "en",
  es: "es", espagnol: "es", espanol: "es", spanish: "es",
  de: "de", allemand: "de", german: "de",
  it: "it", italien: "it", italian: "it",
  pt: "pt", portugais: "pt", portuguese: "pt",
  ru: "ru", russe: "ru", russian: "ru",
  ar: "ar", arabe: "ar", arabic: "ar",
  zh: "zh", chinois: "zh", chinese: "zh",
  ko: "ko", coréen: "ko", coreen: "ko", korean: "ko",
  ja: "ja", japonais: "ja", japanese: "ja", romaji: "ja",
  kanji: "ja_kanji"
};

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function getPrefix(context = {}) {
  if (context.prefix) return String(context.prefix);
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  return String(config.prefix || "!");
}

function getReplyTarget(event) {
  const reply = event && (event.messageReply || event.repliedMessage || event.replyToMessage);
  if (!reply) return null;
  const text = String(reply.body || reply.message || reply.text || "").trim();
  if (!text) return null;
  const senderName = String(reply.senderName || reply.name || "").trim().slice(0, 60) || "cette personne";
  return { text, senderName };
}

function getLanguageCode(arg) {
  const key = normalize(arg);
  if (!key) return null;
  if (LANGUAGE_ALIASES[key]) return LANGUAGE_ALIASES[key];
  // Essayer aussi avec le code direct en minuscules
  if (LANGUAGES[key]) return key;
  return null;
}

function helpText(prefix) {
  const codes = Object.entries(LANGUAGES)
    .map(([code, info]) => `• ${code} (${info.label})`)
    .join("\n");
  return [
    `🌐 Utilisation : ${prefix}traduit <langue> (en répondant au message à traduire)`,
    `Exemple : ${prefix}traduit fr`,
    "",
    "Langues disponibles :",
    codes,
    "",
    `💡 Tu peux aussi utiliser le nom français : ${prefix}traduit anglais, ${prefix}traduit japonais, etc.`
  ].join("\n");
}

async function askGemini(text, targetLanguage) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error("GEMINI_API_KEY is not configured");
    error.code = "GEMINI_KEY_MISSING";
    throw error;
  }

  const lang = LANGUAGES[targetLanguage] || LANGUAGES.fr;
  const prompt = `Translate the following text into ${lang.gemini}. Only return the translation, no explanations, no quotes, no extra text.\n\nText to translate:\n${text}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  let data;
  try {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048
        }
      }),
      signal: controller.signal
    });

    data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(`Gemini API HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
  } finally {
    clearTimeout(timeout);
  }

  // Extraire le texte de la réponse Gemini
  const candidates = data && Array.isArray(data.candidates) ? data.candidates : [];
  const parts = candidates[0] && candidates[0].content && Array.isArray(candidates[0].content.parts)
    ? candidates[0].content.parts
    : [];
  const answer = parts.map(p => p && p.text || "").join("").trim();
  if (!answer) throw new Error("Gemini returned no text");
  return answer.slice(0, MAX_OUTPUT_LENGTH);
}

async function handleTraduit(context = {}) {
  const { api, message, event } = context;
  const prefix = getPrefix(context);
  const args = Array.isArray(context.args) ? context.args : [];

  const targetLanguage = args[0] ? getLanguageCode(args[0]) : null;

  // Pas de langue → aide
  if (!targetLanguage) {
    return send({ api, message, event }, helpText(prefix));
  }

  // Vérifier qu'un message est cité
  const reply = getReplyTarget(event);
  if (!reply) {
    return send({ api, message, event }, `↩️ Réponds au message que tu veux traduire, puis écris ${prefix}traduit ${args[0] || "fr"}.`);
  }

  // Vérifier la longueur
  if (reply.text.length > MAX_INPUT_LENGTH) {
    return send({ api, message, event }, `❌ Le message est trop long (${reply.text.length} caractères). Limite : ${MAX_INPUT_LENGTH}.`);
  }

  const langInfo = LANGUAGES[targetLanguage];
  const langLabel = langInfo ? langInfo.label : targetLanguage;

  try {
    const translation = await askGemini(reply.text, targetLanguage);
    const header = `🌐 Traduction en ${langLabel}`;
    const source = `📝 Message de ${reply.senderName} :\n${reply.text.slice(0, 300)}${reply.text.length > 300 ? "…" : ""}`;
    const result = `✅ Traduction :\n${translation}`;
    return send({ api, message, event }, `${header}\n\n${source}\n\n${result}`);
  } catch (error) {
    if (error.code === "GEMINI_KEY_MISSING") {
      return send({ api, message, event }, "❌ La clé Gemini n’est pas configurée. Le propriétaire doit ajouter GEMINI_API_KEY dans les variables d’environnement (Render).");
    }
    const status = error.status || (error.response && error.response.status);
    console.warn("[Commande traduit] Échec Gemini :", status || error.code || error.message);
    if (status === 429) {
      return send({ api, message, event }, "⏳ Trop de requêtes vers Gemini. Attends quelques secondes et réessaie.");
    }
    if (status === 403) {
      return send({ api, message, event }, "❌ La clé Gemini est invalide ou n’a pas les droits nécessaires. Vérifie GEMINI_API_KEY sur Render.");
    }
    return send({ api, message, event }, "❌ La traduction a échoué. Vérifie la clé GEMINI_API_KEY et les logs Render, puis réessaie.");
  }
}

module.exports = {
  config: {
    name: "traduit",
    aliases: ["traduire", "translate", "trad"],
    version: "1.0.0",
    author: "Diwate",
    description: "Traduit le message cité dans la langue choisie via Gemini",
    category: "Outils",
    usages: "traduit <langue> (en répondant au message)",
    role: 0
  },
  LANGUAGES,
  askGemini,
  handleTraduit,
  onStart: async function (context) {
    return handleTraduit(context);
  }
};
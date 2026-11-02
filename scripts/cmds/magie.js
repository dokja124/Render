"use strict";

const { send } = require("./lib/messenger");

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const STORAGE_KEY = "magieSessionsV1";
const COOLDOWN_MS = 20_000;
const SESSION_TIMEOUT_MS = 180_000; // 3 minutes par session interactive
const MAX_SESSIONS = 200;

const lastTrickAt = new Map();
const sessionCache = {};       // miroir mémoire (fallback si globalData absent)
let cacheLoaded = false;

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------
function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function getSenderID(event) {
  return String(event && (event.senderID || event.senderId || event.userID || event.author) || "").trim();
}

function getThreadID(event) {
  return String(event && (event.threadID || event.threadId) || "").trim();
}

function getPrefix(context = {}) {
  if (context.prefix) return String(context.prefix);
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  return String(config.prefix || "!");
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function loadSessions(globalData) {
  if (cacheLoaded) return sessionCache;
  if (globalData && typeof globalData.get === "function") {
    try {
      const stored = await globalData.get(STORAGE_KEY, "data", {});
      Object.assign(sessionCache, stored && typeof stored === "object" ? stored : {});
    } catch (error) {
      console.warn("[Magie] Lecture sessions impossible :", error.message || error);
    }
  }
  cacheLoaded = true;
  return sessionCache;
}

async function saveSessions(globalData) {
  // Purge des sessions expirées
  const now = Date.now();
  for (const [key, session] of Object.entries(sessionCache)) {
    if (!session || now - (session.updatedAt || 0) > SESSION_TIMEOUT_MS) delete sessionCache[key];
  }
  // Limite de taille
  const keys = Object.keys(sessionCache);
  if (keys.length > MAX_SESSIONS) {
    keys
      .sort((a, b) => (sessionCache[a].updatedAt || 0) - (sessionCache[b].updatedAt || 0))
      .slice(0, keys.length - MAX_SESSIONS)
      .forEach(k => delete sessionCache[k]);
  }
  if (globalData && typeof globalData.set === "function") {
    try {
      await globalData.set(STORAGE_KEY, sessionCache, "data");
    } catch (error) {
      console.warn("[Magie] Sauvegarde sessions impossible :", error.message || error);
    }
  }
}

function getSessionKey(threadID, userID) {
  return `${threadID}:${userID}`;
}

// ---------------------------------------------------------------------------
// Tour 1 : Prédiction secrète
// ---------------------------------------------------------------------------
const PREDICTION_TRICKS = [
  { result: 3, steps: ["Choisis un nombre entre 1 et 10.", "Multiplie-le par 2.", "Ajoute 6.", "Divise le total par 2.", "Retire ton nombre de départ."] },
  { result: 4, steps: ["Choisis un nombre entre 1 et 20.", "Multiplie-le par 2.", "Ajoute 8.", "Divise par 2.", "Retire ton nombre de départ."] },
  { result: 5, steps: ["Pense à un nombre entre 1 et 50.", "Double-le.", "Ajoute 10.", "Divise par 2.", "Soustrais ton nombre de départ."] },
  { result: 6, steps: ["Choisis un entier entre 1 et 100.", "Multiplie-le par 3.", "Ajoute 18.", "Divise par 3.", "Retire ton nombre de départ."] }
];

async function trickPrediction(context) {
  const { api, message, event } = context;
  const trick = pick(PREDICTION_TRICKS);
  await send({ api, message, event }, "🎩✨ **Le Grand Sage va lire dans ton esprit.**\n\nJe vais d’abord écrire ma prédiction. **Ne la lis pas avant d’avoir fait le calcul !**");
  await wait(1200);
  await send({ api, message, event }, `🔮 **MA PRÉDICTION EST : ${trick.result}** 🔮\n\n(Maintenant, fais le calcul ci-dessous…)`);
  await wait(1200);
  const steps = trick.steps.map((s, i) => `${i + 1}️⃣ ${s}`).join("\n");
  return send({ api, message, event }, `🧮 **Le calcul :**\n${steps}\n\n📌 Regarde maintenant ma prédiction. Surprise ? 😏`);
}

// ---------------------------------------------------------------------------
// Tour 2 : Devinette de nombre binaire (1 à 31)
// ---------------------------------------------------------------------------
async function trickGuessNumber(context) {
  const { api, message, event, globalData } = context;
  const threadID = getThreadID(event);
  const userID = getSenderID(event);
  const secret = Math.floor(Math.random() * 31) + 1;
  const session = { type: "guessNumber", secret, low: 1, high: 31, step: 0, updatedAt: Date.now() };
  sessionCache[getSessionKey(threadID, userID)] = session;
  await saveSessions(globalData);
  return send({ api, message, event }, "🔢 **J’ai choisi un nombre entre 1 et 31.**\n\nRéponds `oui` ou `non` à mes questions.\n\n1️⃣ Ton nombre est-il **strictement supérieur à 16** ?");
}

// ---------------------------------------------------------------------------
// Tour 3 : Carte devinée (1 à 52)
// ---------------------------------------------------------------------------
const CARD_QUESTIONS = [
  { q: "Ta carte est-elle **rouge** (cœur ou carreau) ?", bit: 32 },
  { q: "Ta carte est-elle une **figure** (valet, dame, roi) ?", bit: 16 },
  { q: "Ta carte est-elle de **valeur paire** (2,4,6,8,10,D) ?", bit: 8 },
  { q: "Ta carte est-elle **supérieure à 8** ?", bit: 4 },
  { q: "Ta carte est-elle de **couleur cœur** ?", bit: 2 },
  { q: "Ta carte est-elle une **dame** ?", bit: 1 }
];

async function trickGuessCard(context) {
  const { api, message, event, globalData } = context;
  const threadID = getThreadID(event);
  const userID = getSenderID(event);
  const secret = Math.floor(Math.random() * 52) + 1; // 1..52
  const session = { type: "guessCard", secret, step: 0, answers: [], updatedAt: Date.now() };
  sessionCache[getSessionKey(threadID, userID)] = session;
  await saveSessions(globalData);
  return send({ api, message, event }, `🃏 **J’ai pioché une carte.**\n\nRéponds \`oui\` ou \`non\` à chacune de mes questions.\n\n1️⃣ ${CARD_QUESTIONS[0].q}`);
}

// ---------------------------------------------------------------------------
// Tour 4 : Anniversaire deviné
// ---------------------------------------------------------------------------
async function trickGuessBirthday(context) {
  const { api, message, event, globalData } = context;
  const threadID = getThreadID(event);
  const userID = getSenderID(event);
  const day = Math.floor(Math.random() * 31) + 1;
  const month = Math.floor(Math.random() * 12) + 1;
  const session = { type: "guessBirthday", day, month, step: 0, answers: [], updatedAt: Date.now() };
  sessionCache[getSessionKey(threadID, userID)] = session;
  await send({ api, message, event }, "🎂 **Je vais deviner ton anniversaire.**\n\nRéponds `oui` ou `non` à mes 4 questions.\n\n1️⃣ Es-tu né(e) au cours du **premier trimestre** (janvier–mars) ?");
  return saveSessions(globalData);
}

// ---------------------------------------------------------------------------
// Tour 5 : Le chiffre 1089
// ---------------------------------------------------------------------------
async function trick1089(context) {
  const { api, message, event } = context;
  const n = Math.floor(Math.random() * 9) + 1;   // 1..9
  const m = Math.floor(Math.random() * 9);       // 0..8
  const k = Math.floor(Math.random() * 9) + 1;   // 1..9
  const number = n * 100 + m * 10 + k;
  const reversed = k * 100 + m * 10 + n;
  const diff = Math.abs(number - reversed);
  const revDiff = parseInt(String(diff).padStart(3, "0").split("").reverse().join(""), 10);
  const total = diff + revDiff;
  await send({ api, message, event }, "🔢 **Le tour du 1089.**\n\nSuis mes instructions, je vais prédire le résultat final.");
  await wait(1200);
  await send({ api, message, event }, `1️⃣ Écris un nombre à 3 chiffres dont le premier et le dernier sont différents.\n2️⃣ Inverse ses chiffres.\n3️⃣ Soustrais le plus petit du plus grand.\n4️⃣ Inverse le résultat.\n5️⃣ Additionne les deux derniers nombres.`);
  await wait(1500);
  return send({ api, message, event }, `🔮 **Ta prédiction est : 1089**\n\n(Exemple avec ${number} : ${number} − ${reversed} = ${diff} ; ${diff} + ${revDiff} = ${total}.)\n\nSurprise ? 😏 Tous les chemins mènent à 1089.`);
}

// ---------------------------------------------------------------------------
// Tour 6 : Mot lu dans la tête
// ---------------------------------------------------------------------------
async function trickReadWord(context) {
  const { api, message, event, globalData } = context;
  const threadID = getThreadID(event);
  const userID = getSenderID(event);
  const session = { type: "readWord", step: 0, answers: [], updatedAt: Date.now() };
  sessionCache[getSessionKey(threadID, userID)] = session;
  await send({ api, message, event }, "🔤 **Pense à un mot de 4 lettres.**\n\nJe vais te demander ses lettres une par une. Réponds à chaque fois par **une lettre**.\n\n1️⃣ Quelle est la **1ère lettre** de ton mot ?");
  return saveSessions(globalData);
}

// ---------------------------------------------------------------------------
// Tour 7 : Couleur pensée
// ---------------------------------------------------------------------------
async function trickGuessColor(context) {
  const { api, message, event, globalData } = context;
  const threadID = getThreadID(event);
  const userID = getSenderID(event);
  const palette = ["rouge", "bleu", "vert", "jaune", "violet", "orange", "noir", "blanc"];
  const secret = pick(palette);
  const session = { type: "guessColor", secret, step: 0, answers: [], updatedAt: Date.now() };
  sessionCache[getSessionKey(threadID, userID)] = session;
  await send({ api, message, event }, `🎨 **J’ai choisi une couleur secrète parmi :**\n${palette.join(", ")}\n\nJe vais te poser 3 questions.\n\n1️⃣ La couleur contient-elle la lettre **« o »** ?`);
  return saveSessions(globalData);
}

// ---------------------------------------------------------------------------
// Dispatch des tours
// ---------------------------------------------------------------------------
const TRICKS = [
  { id: "prediction", label: "Prédiction secrète", run: trickPrediction },
  { id: "guessNumber", label: "Devinette de nombre", run: trickGuessNumber },
  { id: "guessCard", label: "Carte devinée", run: trickGuessCard },
  { id: "guessBirthday", label: "Anniversaire deviné", run: trickGuessBirthday },
  { id: "1089", label: "Le chiffre 1089", run: trick1089 },
  { id: "readWord", label: "Mot lu dans la tête", run: trickReadWord },
  { id: "guessColor", label: "Couleur pensée", run: trickGuessColor }
];

// ---------------------------------------------------------------------------
// Gestion des réponses (tours interactifs)
// ---------------------------------------------------------------------------
function isYes(value) {
  const v = normalize(value);
  return ["oui", "yes", "y", "o", "1", "vrai", "true"].includes(v);
}

function isNo(value) {
  const v = normalize(value);
  return ["non", "no", "n", "0", "faux", "false"].includes(v);
}

async function handleInteractiveAnswer(context, session) {
  const { api, message, event, globalData } = context;
  const args = Array.isArray(context.args) ? context.args : [];
  const reply = String(args[0] || "").trim();

  // === Devinette de nombre ===
  if (session.type === "guessNumber") {
    if (!isYes(reply) && !isNo(reply)) {
      return send({ api, message, event }, "❓ Réponds uniquement par `oui` ou `non`.");
    }
    const mid = Math.floor((session.low + session.high) / 2);
    if (isYes(reply)) session.low = mid + 1;
    else session.high = mid;
    session.step++;
    session.updatedAt = Date.now();

    if (session.low >= session.high) {
      const guess = session.low;
      delete sessionCache[getSessionKey(getThreadID(event), getSenderID(event))];
      await saveSessions(globalData);
      return send({ api, message, event }, `🔮 **Ton nombre est… ${guess} !**\n\nJ’ai trouvé en ${session.step} question(s). Rejoue avec \`!magie\`.`);
    }
    await saveSessions(globalData);
    const nextQ = session.step + 1;
    return send({ api, message, event }, `${nextQ}️⃣ Ton nombre est-il **strictement supérieur à ${mid}** ? (Il te reste une fourchette entre ${session.low} et ${session.high}.)`);
  }

  // === Carte devinée ===
  if (session.type === "guessCard") {
    if (!isYes(reply) && !isNo(reply)) {
      return send({ api, message, event }, "❓ Réponds uniquement par `oui` ou `non`.");
    }
    session.answers.push(isYes(reply) ? 1 : 0);
    session.step++;
    session.updatedAt = Date.now();
    if (session.step >= CARD_QUESTIONS.length) {
      // Recomposer une carte plausible à partir des réponses
      let value = session.answers.reduce((acc, bit, i) => acc + (bit ? CARD_QUESTIONS[i].bit : 0), 0);
      value = ((value - 1 + 52) % 52) + 1;
      const card = decodeCard(value);
      delete sessionCache[getSessionKey(getThreadID(event), getSenderID(event))];
      await saveSessions(globalData);
      return send({ api, message, event }, `🃏 **Ta carte est : ${card} !**\n\nRejoue avec \`!magie\`.`);
    }
    await saveSessions(globalData);
    return send({ api, message, event }, `${session.step + 1}️⃣ ${CARD_QUESTIONS[session.step].q}`);
  }

  // === Anniversaire ===
  if (session.type === "guessBirthday") {
    if (!isYes(reply) && !isNo(reply)) {
      return send({ api, message, event }, "❓ Réponds uniquement par `oui` ou `non`.");
    }
    session.answers.push(isYes(reply) ? 1 : 0);
    session.step++;
    session.updatedAt = Date.now();
    const QUESTIONS = [
      "Es-tu né(e) au cours du **premier trimestre** (janvier–mars) ?",
      "Es-tu né(e) au cours du **deuxième trimestre** (avril–juin) ?",
      "Es-tu né(e) au cours du **troisième trimestre** (juillet–septembre) ?",
      "Es-tu né(e) au cours du **quatrième trimestre** (octobre–décembre) ?"
    ];
    if (session.step >= 4) {
      const quarter = session.answers.findIndex(a => a === 1);
      const month = quarter >= 0 ? quarter * 3 + Math.floor(Math.random() * 3) + 1 : Math.floor(Math.random() * 12) + 1;
      delete sessionCache[getSessionKey(getThreadID(event), getSenderID(event))];
      await saveSessions(globalData);
      return send({ api, message, event }, `🎂 **Tu es né(e) au mois de ${monthName(month)} !**\n\nRejoue avec \`!magie\`.`);
    }
    await saveSessions(globalData);
    return send({ api, message, event }, `${session.step + 1}️⃣ ${QUESTIONS[session.step]}`);
  }

  // === Mot lu dans la tête ===
  if (session.type === "readWord") {
    const letter = String(reply || "").slice(0, 1).toLowerCase();
    if (!/[a-zà-ÿ]/.test(letter)) {
      return send({ api, message, event }, "❓ Réponds par une seule lettre (a–z).");
    }
    session.answers.push(letter);
    session.step++;
    session.updatedAt = Date.now();
    if (session.step >= 4) {
      const word = session.answers.join("");
      delete sessionCache[getSessionKey(getThreadID(event), getSenderID(event))];
      await saveSessions(globalData);
      return send({ api, message, event }, `🔮 **Ton mot était : « ${word} »**\n\nRejoue avec \`!magie\`.`);
    }
    await saveSessions(globalData);
    return send({ api, message, event }, `${session.step + 1}️⃣ Quelle est la **${ordinal(session.step + 1)} lettre** de ton mot ?`);
  }

  // === Couleur pensée ===
  if (session.type === "guessColor") {
    if (!isYes(reply) && !isNo(reply)) {
      return send({ api, message, event }, "❓ Réponds uniquement par `oui` ou `non`.");
    }
    session.answers.push(isYes(reply) ? 1 : 0);
    session.step++;
    session.updatedAt = Date.now();
    const QUESTIONS = [
      "La couleur contient-elle la lettre **« o »** ?",
      "La couleur contient-elle la lettre **« e »** ?",
      "La couleur commence-t-elle par une consonne ?"
    ];
    if (session.step >= 3) {
      const guess = session.secret;
      delete sessionCache[getSessionKey(getThreadID(event), getSenderID(event))];
      await saveSessions(globalData);
      return send({ api, message, event }, `🎨 **Ta couleur est : ${guess.toUpperCase()} !**\n\nRejoue avec \`!magie\`.`);
    }
    await saveSessions(globalData);
    return send({ api, message, event }, `${session.step + 1}️⃣ ${QUESTIONS[session.step]}`);
  }

  // Inconnu : on nettoie
  delete sessionCache[getSessionKey(getThreadID(event), getSenderID(event))];
  await saveSessions(globalData);
  return send({ api, message, event }, "🔮 Je ne reconnais pas cette session. Relance un tour avec `!magie`.");
}

function ordinal(n) {
  return n === 1 ? "1ère" : `${n}e`;
}

function decodeCard(value) {
  // value entre 1 et 52
  const suits = ["♠ Pique", "♥ Cœur", "♦ Carreau", "♣ Trèfle"];
  const values = ["As", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Valet", "Dame", "Roi"];
  const idx = ((value - 1) % 52 + 52) % 52;
  return `${values[idx % 13]} de ${suits[Math.floor(idx / 13)]}`;
}

function monthName(month) {
  const names = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  return names[(month - 1) % 12] || "janvier";
}

// ---------------------------------------------------------------------------
// Commande principale
// ---------------------------------------------------------------------------
async function handleMagie(context = {}) {
  const { api, message, event, globalData } = context;
  const threadID = getThreadID(event);
  const userID = getSenderID(event);
  const prefix = getPrefix(context);
  const args = Array.isArray(context.args) ? context.args : [];
  const now = Date.now();

  if (!threadID || !userID) {
    return send({ api, message, event }, "❌ Conversation ou joueur impossible à identifier.");
  }

  await loadSessions(globalData);
  const sessionKey = getSessionKey(threadID, userID);
  const existing = sessionCache[sessionKey];

  // Une session interactive est en cours → router les réponses
  if (existing && existing.type !== "idle" && now - (existing.updatedAt || 0) < SESSION_TIMEOUT_MS) {
    // Commande "stop" pour annuler
    if (["stop", "annule", "annuler", "cancel"].includes(normalize(args[0]))) {
      delete sessionCache[sessionKey];
      await saveSessions(globalData);
      return send({ api, message, event }, "🛑 Tour annulé.");
    }
    if (args.length === 0) {
      return send({ api, message, event }, "⏳ Une partie est en cours. Réponds à ma question, ou écris `!magie stop` pour annuler.");
    }
    return handleInteractiveAnswer(context, existing);
  }

  // Session expirée → on nettoie
  if (existing && now - (existing.updatedAt || 0) >= SESSION_TIMEOUT_MS) {
    delete sessionCache[sessionKey];
    await saveSessions(globalData);
  }

  // Cooldown
  const last = lastTrickAt.get(userID) || 0;
  if (now - last < COOLDOWN_MS) {
    const seconds = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
    return send({ api, message, event }, `🎩 Patience… Attends encore ${seconds} seconde(s) avant ton prochain tour.`);
  }
  lastTrickAt.set(userID, now);
  if (lastTrickAt.size > 500) {
    [...lastTrickAt.entries()].sort((a, b) => a[1] - b[1]).slice(0, 100).forEach(([k]) => lastTrickAt.delete(k));
  }

  // Choix du tour : aléatoire, ou nommé
  const requested = args[0] ? normalize(args[0]) : "";
  let trick;
  if (requested) {
    trick = TRICKS.find(t => normalize(t.id) === requested || normalize(t.label).includes(requested));
    if (!trick) {
      return send({ api, message, event }, `🎩 Tours disponibles :\n${TRICKS.map(t => `• \`${prefix}magie ${t.id}\``).join("\n")}\n\nOu écris simplement \`${prefix}magie\` pour un tour aléatoire.`);
    }
  } else {
    trick = pick(TRICKS);
  }

  return trick.run(context);
}

module.exports = {
  config: {
    name: "magie",
    aliases: ["tour", "trick", "prestidigitation"],
    version: "2.0.0",
    author: "Diwate",
    description: "Le bot réalise un tour de magie aléatoire parmi 7 tours",
    category: "Divertissement",
    usages: "magie | magie <id> | magie stop",
    role: 0
  },
  TRICKS,
  STORAGE_KEY,
  handleMagie,
  onStart: async function (context) {
    try {
      return await handleMagie(context);
    } catch (error) {
      console.error("[Commande magie]", error.stack || error);
      return send({ api: context.api, message: context.message, event: context.event }, "❌ Le tour de magie a échoué. Réessaie.");
    }
  }
};
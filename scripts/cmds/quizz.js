"use strict";

const { send } = require("./lib/messenger");

const SESSION_KEY = "quizCultureSessions";
const HISTORY_KEY = "quizCultureQuestionHistory";
const QUESTIONS_PER_GAME = 10;
const QUESTION_DURATION_MS = 20_000;
const WARNING_AFTER_MS = 10_000;
const ANSWER_LETTERS = ["A", "B", "C", "D"];
let memorySessions = {};
let memoryHistory = {};
const activeQuestionTimers = new Map();

function q(id, theme, text, answers, correct) {
  return { id, series: theme, text, answers, correct };
}

// Banque locale de CULTURE GÉNÉRALE : les questions et les quatre propositions
// sont remélangées à chaque partie. « series » = thème pour compatibilité.
const QUESTION_BANK = [
  // ---- Géographie : capitales ----
  q("geo-cap-01", "Géographie — Capitales", "Quelle est la capitale de la France ?", ["Lyon", "Paris", "Marseille", "Bordeaux"], 1),
  q("geo-cap-02", "Géographie — Capitales", "Quelle est la capitale du Japon ?", ["Tokyo", "Kyoto", "Osaka", "Sapporo"], 0),
  q("geo-cap-03", "Géographie — Capitales", "Quelle est la capitale du Canada ?", ["Toronto", "Montréal", "Ottawa", "Vancouver"], 2),
  q("geo-cap-04", "Géographie — Capitales", "Quelle est la capitale de l’Australie ?", ["Sydney", "Melbourne", "Perth", "Canberra"], 3),
  q("geo-cap-05", "Géographie — Capitales", "Quelle est la capitale de l’Espagne ?", ["Barcelone", "Madrid", "Séville", "Valence"], 1),
  q("geo-cap-06", "Géographie — Capitales", "Quelle est la capitale de l’Italie ?", ["Milan", "Naples", "Rome", "Turin"], 2),
  q("geo-cap-07", "Géographie — Capitales", "Quelle est la capitale de l’Égypte ?", ["Le Caire", "Alexandrie", "Louxor", "Assouan"], 0),
  q("geo-cap-08", "Géographie — Capitales", "Quelle est la capitale du Sénégal ?", ["Dakar", "Thiès", "Saint-Louis", "Touba"], 0),

  // ---- Géographie : nature ----
  q("geo-nat-01", "Géographie — Nature", "Quel est le plus long fleuve d’Afrique ?", ["Le Congo", "Le Nil", "Le Niger", "Le Zambèze"], 1),
  q("geo-nat-02", "Géographie — Nature", "Quel est le plus haut sommet du monde ?", ["Le K2", "Le mont Blanc", "L’Everest", "Le Kilimandjaro"], 2),
  q("geo-nat-03", "Géographie — Nature", "Quel est le plus grand océan du monde ?", ["L’Atlantique", "L’Indien", "L’Arctique", "Le Pacifique"], 3),
  q("geo-nat-04", "Géographie — Nature", "Quel désert est le plus grand désert chaud du monde ?", ["Le Sahara", "Le Gobi", "Le Kalahari", "L’Atacama"], 0),
  q("geo-nat-05", "Géographie — Nature", "Sur quel continent se trouve le fleuve Amazone ?", ["L’Afrique", "L’Amérique du Sud", "L’Asie", "L’Océanie"], 1),
  q("geo-nat-06", "Géographie — Nature", "Quel pays a la plus grande population au monde (2024) ?", ["La Chine", "Les États-Unis", "L’Inde", "L’Indonésie"], 2),
  q("geo-nat-07", "Géographie — Nature", "Quel est le plus petit pays du monde ?", ["Monaco", "Nauru", "Saint-Marin", "Le Vatican"], 3),

  // ---- Histoire ----
  q("hist-01", "Histoire", "En quelle année a eu lieu la Révolution française ?", ["1789", "1815", "1914", "1945"], 0),
  q("hist-02", "Histoire", "Qui était le premier président des États-Unis ?", ["Abraham Lincoln", "George Washington", "Thomas Jefferson", "John Adams"], 1),
  q("hist-03", "Histoire", "Quelle civilisation a construit les pyramides de Gizeh ?", ["Les Romains", "Les Grecs", "Les Égyptiens", "Les Mayas"], 2),
  q("hist-04", "Histoire", "Quand a pris fin la Seconde Guerre mondiale en Europe ?", ["1918", "1939", "1943", "1945"], 3),
  q("hist-05", "Histoire", "Qui a dirigé l’Empire français après la Révolution et s’est proclamé empereur en 1804 ?", ["Napoléon Bonaparte", "Louis XVI", "Robespierre", "Charles de Gaulle"], 0),
  q("hist-06", "Histoire", "Quel mur est tombé en 1989 ?", ["Le mur d’Hadrien", "Le mur de Berlin", "La Grande Muraille", "Le mur des Lamentations"], 1),
  q("hist-07", "Histoire", "Quelle reine d’Égypte est célèbre pour sa relation avec Jules César et Marc Antoine ?", ["Néfertiti", "Hatchepsout", "Cléopâtre", "Néfertari"], 2),
  q("hist-08", "Histoire", "Quel navire a coulé lors de son voyage inaugural en 1912 ?", ["Le Titanic", "Le Lusitania", "Le Britannic", "Le Queen Mary"], 0),

  // ---- Sciences : physique ----
  q("sci-phy-01", "Sciences — Physique", "Quel est le symbole chimique de l’eau ?", ["CO2", "O2", "H2O", "NaCl"], 2),
  q("sci-phy-02", "Sciences — Physique", "Quelle est l’unité de mesure de la force ?", ["Le watt", "Le joule", "Le pascal", "Le newton"], 3),
  q("sci-phy-03", "Sciences — Physique", "Quelle planète est la plus proche du Soleil ?", ["Mercure", "Vénus", "La Terre", "Mars"], 0),
  q("sci-phy-04", "Sciences — Physique", "Quel gaz est le plus abondant dans l’atmosphère terrestre ?", ["L’oxygène", "L’azote", "Le dioxyde de carbone", "L’hydrogène"], 1),
  q("sci-phy-05", "Sciences — Physique", "Quel est le symbole chimique du fer ?", ["F", "Fr", "Fe", "I"], 2),

  // ---- Sciences : biologie ----
  q("sci-bio-01", "Sciences — Biologie", "Combien de dents un adulte a-t-il en moyenne (dents de sagesse incluses) ?", ["28", "30", "32", "36"], 2),
  q("sci-bio-02", "Sciences — Biologie", "Quel organe pompe le sang dans le corps humain ?", ["Le foie", "Le cerveau", "Les poumons", "Le cœur"], 3),
  q("sci-bio-03", "Sciences — Biologie", "Quel est le plus grand mammifère du monde ?", ["La baleine bleue", "L’éléphant d’Afrique", "La girafe", "L’orque"], 0),
  q("sci-bio-04", "Sciences — Biologie", "Quel organe produit l’insuline ?", ["Le foie", "Le pancréas", "Les reins", "La thyroïde"], 1),
  q("sci-bio-05", "Sciences — Biologie", "Combien de chromosomes possède l’être humain ?", ["23", "44", "46", "48"], 2),

  // ---- Sciences : espace ----
  q("sci-esp-01", "Sciences — Espace", "Combien de planètes compte le système solaire ?", ["6", "7", "8", "9"], 2),
  q("sci-esp-02", "Sciences — Espace", "Quelle planète est surnommée la « planète rouge » ?", ["Jupiter", "Saturne", "Vénus", "Mars"], 3),
  q("sci-esp-03", "Sciences — Espace", "Quelle est l’étoile la plus proche de la Terre ?", ["Le Soleil", "Sirius", "Proxima du Centaure", "L’étoile Polaire"], 0),
  q("sci-esp-04", "Sciences — Espace", "Quel est le satellite naturel de la Terre ?", ["Phobos", "La Lune", "Titan", "Europe"], 1),
  q("sci-esp-05", "Sciences — Espace", "Qui a été le premier homme à marcher sur la Lune ?", ["Yuri Gagarine", "Buzz Aldrin", "Neil Armstrong", "Michael Collins"], 2),

  // ---- Arts & Culture ----
  q("arts-01", "Arts & Culture", "Qui a peint la Joconde ?", ["Vincent van Gogh", "Léonard de Vinci", "Pablo Picasso", "Claude Monet"], 1),
  q("arts-02", "Arts & Culture", "Qui a écrit « Les Misérables » ?", ["Victor Hugo", "Émile Zola", "Gustave Flaubert", "Marcel Proust"], 0),
  q("arts-03", "Arts & Culture", "Qui a composé la « Neuvième Symphonie » avec l’« Ode à la joie » ?", ["Mozart", "Bach", "Beethoven", "Chopin"], 2),
  q("arts-04", "Arts & Culture", "Quel peintre a fondé le cubisme avec Georges Braque ?", ["Salvador Dalí", "Henri Matisse", "Marc Chagall", "Pablo Picasso"], 3),
  q("arts-05", "Arts & Culture", "Quel auteur a écrit « Le Petit Prince » ?", ["Antoine de Saint-Exupéry", "Jules Verne", "Romain Rolland", "Albert Camus"], 0),
  q("arts-06", "Arts & Culture", "Qui a sculpté « Le Penseur » ?", ["Michel-Ange", "Auguste Rodin", "Camille Claudel", "Gian Lorenzo Bernini"], 1),

  // ---- Sport ----
  q("sport-01", "Sport", "Combien de joueurs compose une équipe de football sur le terrain ?", ["9", "10", "11", "12"], 2),
  q("sport-02", "Sport", "Tous les combien d’années ont lieu les Jeux olympiques d’été ?", ["1 an", "2 ans", "3 ans", "4 ans"], 3),
  q("sport-03", "Sport", "Quel pays a remporté le plus de Coupes du monde de football ?", ["Le Brésil", "L’Allemagne", "L’Italie", "L’Argentine"], 0),
  q("sport-04", "Sport", "Dans quel sport utilise-t-on un « shuttlecock » ?", ["Le tennis", "Le badminton", "Le squash", "Le ping-pong"], 1),
  q("sport-05", "Sport", "Combien de points vaut un panier à trois points au basket ?", ["1", "2", "3", "4"], 2),

  // ---- Vie quotidienne ----
  q("vie-01", "Vie quotidienne", "Combien de minutes y a-t-il dans une heure ?", ["30", "45", "60", "90"], 2),
  q("vie-02", "Vie quotidienne", "Combien de jours compte une année bissextile ?", ["364", "365", "366", "367"], 2),
  q("vie-03", "Vie quotidienne", "Combien de côtés a un hexagone ?", ["4", "5", "6", "8"], 2),
  q("vie-04", "Vie quotidienne", "Quel est le mois le plus court de l’année ?", ["Janvier", "Février", "Mars", "Novembre"], 1),
  q("vie-05", "Vie quotidienne", "Que signifie « SOS » en communication d’urgence ?", ["Save Our Souls", "Un signal de détresse international", "Service d’ordre sanitaire", "Système opérationnel de secours"], 1),
  q("vie-06", "Vie quotidienne", "Combien de secondes y a-t-il dans une minute ?", ["30", "45", "60", "90"], 2),
  q("vie-07", "Vie quotidienne", "Quel appareil mesure la température ?", ["Un baromètre", "Un thermomètre", "Un hygromètre", "Un anémomètre"], 1),

  // ---- Inventions & Technologie ----
  q("tech-01", "Inventions & Technologie", "Qui est considéré comme l’inventeur de l’ampoule électrique pratique ?", ["Thomas Edison", "Nikola Tesla", "Alexander Graham Bell", "James Watt"], 0),
  q("tech-02", "Inventions & Technologie", "Qui a inventé le téléphone ?", ["Thomas Edison", "Alexander Graham Bell", "Guglielmo Marconi", "Samuel Morse"], 1),
  q("tech-03", "Inventions & Technologie", "Quel est le langage de programmation le plus utilisé pour le web côté client ?", ["Python", "C++", "JavaScript", "Java"], 2),
  q("tech-04", "Inventions & Technologie", "Que signifie « HTTP » ?", ["HyperText Transfer Protocol", "High Tech Transfer Program", "Home Tool Text Page", "Hyper Transfer Text Process"], 0),
  q("tech-05", "Inventions & Technologie", "Qui a créé le World Wide Web ?", ["Bill Gates", "Steve Jobs", "Tim Berners-Lee", "Linus Torvalds"], 2),
  q("tech-06", "Inventions & Technologie", "Quel est le symbole du « bit » en informatique ?", ["b", "B", "bi", "bt"], 0),
  q("tech-07", "Inventions & Technologie", "Quel système d’exploitation est open source et basé sur Linux ?", ["Windows", "macOS", "Android", "iOS"], 2),

  // ---- Nature & Animaux ----
  q("nat-01", "Nature & Animaux", "Quel est l’animal terrestre le plus rapide ?", ["Le lion", "Le guépard", "Le cheval", "L’antilope"], 1),
  q("nat-02", "Nature & Animaux", "Combien de pattes a une araignée ?", ["6", "8", "10", "12"], 1),
  q("nat-03", "Nature & Animaux", "Quel oiseau est capable de voler en arrière ?", ["L’aigle", "Le colibri", "Le faucon", "Le corbeau"], 1),
  q("nat-04", "Nature & Animaux", "Quel animal est le plus grand oiseau du monde ?", ["L’autruche", "L’albatros", "Le condor", "L’émeu"], 0),
  q("nat-05", "Nature & Animaux", "Que produit une abeille ?", ["Du lait", "De la soie", "Du miel", "De la cire uniquement"], 2),
  q("nat-06", "Nature & Animaux", "Quel animal est le plus grand poisson du monde ?", ["Le grand requin blanc", "Le requin-baleine", "L’espadon", "Le thon rouge"], 1),

  // ---- Gastronomie & Monde ----
  q("gas-01", "Gastronomie & Monde", "De quel pays vient la pizza ?", ["La Grèce", "L’Espagne", "L’Italie", "Le Portugal"], 2),
  q("gas-02", "Gastronomie & Monde", "De quel pays vient le sushi ?", ["La Chine", "Le Japon", "La Corée", "La Thaïlande"], 1),
  q("gas-03", "Gastronomie & Monde", "Quel pays est célèbre pour le couscous ?", ["Le Maroc", "Le Sénégal", "Le Liban", "L’Égypte"], 0),
  q("gas-04", "Gastronomie & Monde", "Quel ingrédient principal compose le guacamole ?", ["La tomate", "L’avocat", "Le concombre", "Le poivron"], 1),

  // ---- Langues & Mots ----
  q("lang-01", "Langues & Mots", "Que signifie « hello » en anglais ?", ["Au revoir", "Bonjour", "Merci", "Pardon"], 1),
  q("lang-02", "Langues & Mots", "Combien de lettres compte l’alphabet français ?", ["24", "25", "26", "27"], 2),
  q("lang-03", "Langues & Mots", "Que signifie « gracias » en espagnol ?", ["Bonjour", "Merci", "Au revoir", "S’il te plaît"], 1),
  q("lang-04", "Langues & Mots", "Quel est le contraire de « chaud » ?", ["Tiède", "Froid", "Glacé", "Brûlant"], 1),

  // ---- Mathématiques ----
  q("math-01", "Mathématiques", "Combien font 7 × 8 ?", ["54", "56", "58", "64"], 1),
  q("math-02", "Mathématiques", "Quelle est la racine carrée de 81 ?", ["7", "8", "9", "10"], 2),
  q("math-03", "Mathématiques", "Combien font 15 % de 200 ?", ["15", "20", "30", "40"], 2),
  q("math-04", "Mathématiques", "Quel est le résultat de 2³ ?", ["6", "8", "9", "12"], 1),

  // ---- Monde & Institutions ----
  q("monde-01", "Monde & Institutions", "Quelle est la monnaie officielle du Japon ?", ["Le won", "Le yuan", "Le yen", "Le baht"], 2),
  q("monde-02", "Monde & Institutions", "Quelle est la monnaie officielle des États-Unis ?", ["Le dollar", "L’euro", "La livre", "Le peso"], 0),
  q("monde-03", "Monde & Institutions", "Combien d’États compte l’Union européenne (2024) ?", ["25", "27", "28", "30"], 1),
  q("monde-04", "Monde & Institutions", "Quel organisme international siège à New York et regroupe presque tous les pays ?", ["L’OTAN", "L’UNESCO", "L’ONU", "L’OMS"], 2),

  // ---- Cinéma & Musique ----
  q("cine-01", "Cinéma & Musique", "Quel réalisateur a créé « Titanic » et « Avatar » ?", ["Steven Spielberg", "James Cameron", "Christopher Nolan", "Ridley Scott"], 1),
  q("cine-02", "Cinéma & Musique", "Quel groupe britannique a interprété « Hey Jude » ?", ["Les Rolling Stones", "Les Beatles", "Queen", "Pink Floyd"], 1),
  q("cine-03", "Cinéma & Musique", "Quel instrument possède 88 touches ?", ["Le violon", "La guitare", "Le piano", "La harpe"], 2),
  q("cine-04", "Cinéma & Musique", "Qui a réalisé « Inception » et « Interstellar » ?", ["Christopher Nolan", "Denis Villeneuve", "Martin Scorsese", "Quentin Tarantino"], 0)
];

const QUESTION_BY_ID = new Map(QUESTION_BANK.map(question => [question.id, question]));
const threadQueue = new Map();

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function shuffle(items) {
  const result = items.slice();
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function prepareQuestion(question) {
  const options = shuffle(question.answers.map((text, index) => ({ text, correct: index === question.correct })));
  return {
    id: question.id,
    series: question.series,
    text: question.text,
    answers: options.map(option => option.text),
    correctIndex: options.findIndex(option => option.correct),
    correctUsers: [],
    wrongUsers: [],
    answerRecords: {},
    questionStartedAt: 0,
    questionEndsAt: 0,
    warningSent: false
  };
}

async function loadSessions(globalData) {
  if (!globalData || typeof globalData.get !== "function") return memorySessions;
  const value = await globalData.get(SESSION_KEY, "data", {});
  memorySessions = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return memorySessions;
}

async function saveSessions(globalData, sessions) {
  memorySessions = sessions && typeof sessions === "object" ? sessions : {};
  if (globalData && typeof globalData.get === "function" && typeof globalData.set === "function") {
    await globalData.get(SESSION_KEY, "data", memorySessions);
    await globalData.set(SESSION_KEY, memorySessions, "data");
  }
  return memorySessions;
}

async function loadHistory(globalData) {
  if (!globalData || typeof globalData.get !== "function") return memoryHistory;
  const value = await globalData.get(HISTORY_KEY, "data", {});
  memoryHistory = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return memoryHistory;
}

async function saveHistory(globalData, history) {
  memoryHistory = history && typeof history === "object" ? history : {};
  if (globalData && typeof globalData.get === "function" && typeof globalData.set === "function") {
    await globalData.get(HISTORY_KEY, "data", memoryHistory);
    await globalData.set(HISTORY_KEY, memoryHistory, "data");
  }
  return memoryHistory;
}

async function getSession(threadID, globalData) {
  const sessions = await loadSessions(globalData);
  return sessions[String(threadID || "")] || null;
}

async function selectQuestionIDs(threadID, globalData) {
  const history = await loadHistory(globalData);
  const key = String(threadID);
  const record = history[key] && typeof history[key] === "object" ? history[key] : {};
  let used = new Set(Array.isArray(record.usedQuestionIds) ? record.usedQuestionIds.map(String) : []);
  let available = QUESTION_BANK.filter(question => !used.has(question.id));
  if (available.length < QUESTIONS_PER_GAME) {
    used = new Set();
    available = QUESTION_BANK.slice();
  }
  const selected = shuffle(available).slice(0, QUESTIONS_PER_GAME).map(question => question.id);
  history[key] = { usedQuestionIds: [...used, ...selected], lastGameQuestionIds: selected, updatedAt: Date.now() };
  await saveHistory(globalData, history);
  return selected;
}

function questionLabel(session) {
  return `Question ${session.currentIndex + 1}/${QUESTIONS_PER_GAME}`;
}

function renderQuestion(session, prefix = "!") {
  const question = session.current;
  return [
    `🧠 QUIZ CULTURE GÉNÉRALE — ${questionLabel(session)}`,
    `📚 ${question.series}`,
    "",
    question.text,
    "",
    ...question.answers.map((answer, index) => `${ANSWER_LETTERS[index]}. ${answer}`),
    "",
    `Réponds avec ${prefix}quizz A, B, C ou D.`,
    "⏱️ Tu as 20 secondes. Un avertissement sera envoyé après 10 secondes.",
    "🏆 Barème : 1er correct +3 pts · 2e +2 pts · 3e +1 pt · suivants +0 pt (réponse enregistrée).",
    "🔒 Une seule réponse par joueur pour cette question, même si elle est incorrecte : aucun changement possible.",
    `⏭️ À la fermeture, les résultats s’affichent; écris ${prefix}quizz next pour continuer.`,
    `🛑 Pour annuler la partie à tout moment : ${prefix}quizz annule.`
  ].join("\n");
}

function leaderboard(session, title = "🏆 CLASSEMENT") {
  const scores = session && session.scores && typeof session.scores === "object" ? session.scores : {};
  const order = Array.isArray(session.scoreOrder) ? session.scoreOrder : [];
  const rows = Object.entries(scores).map(([userID, player]) => ({ userID, ...player }))
    .sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0)
      || order.indexOf(a.userID) - order.indexOf(b.userID)
      || String(a.userID).localeCompare(String(b.userID)));
  if (!rows.length) return `${title}\nAucun point marqué pour le moment.`;
  return `${title}\n${rows.map((player, index) => `${index + 1}. ${player.name || "Joueur"} — ${player.points} pts (${player.correctAnswers} bonne(s) réponse(s))`).join("\n")}`;
}

function ensureQuestionState(question) {
  if (!Array.isArray(question.correctUsers)) question.correctUsers = [];
  if (!Array.isArray(question.wrongUsers)) question.wrongUsers = [];
  if (!question.answerRecords || typeof question.answerRecords !== "object" || Array.isArray(question.answerRecords)) question.answerRecords = {};
  for (const userID of [...question.correctUsers, ...question.wrongUsers]) {
    if (!question.answerRecords[String(userID)]) {
      question.answerRecords[String(userID)] = { choice: null, correct: question.correctUsers.includes(userID), points: 0, answeredAt: 0, name: "Joueur" };
    }
  }
  return question;
}

function answerSummary(question) {
  const records = Object.entries(ensureQuestionState(question).answerRecords)
    .sort((a, b) => (Number(a[1].answeredAt) || 0) - (Number(b[1].answeredAt) || 0) || a[0].localeCompare(b[0]));
  if (!records.length) return "📝 Aucune réponse n’a été reçue.";
  const lines = records.map(([, record]) => {
    const choice = Number.isInteger(record.choice) && record.choice >= 0 && record.choice < ANSWER_LETTERS.length
      ? `${ANSWER_LETTERS[record.choice]}. ${question.answers[record.choice]}`
      : "réponse antérieure";
    const result = record.correct ? `correcte, +${Number(record.points) || 0} pt(s)` : "incorrecte, 0 pt";
    return `• ${record.name || "Joueur"} — ${choice} · ${result}`;
  });
  return `📝 Réponses enregistrées :\n${lines.join("\n")}`;
}

function closeCurrentQuestion(session, prefix = "!") {
  if (session.phase === "closed") return "🔒 Cette question est déjà fermée.";
  session.phase = "closed";
  session.current.closedAt = Date.now();
  const question = session.current;
  const correctLetter = ANSWER_LETTERS[question.correctIndex];
  return [
    `🔒 Réponses fermées — ${questionLabel(session)}.`,
    `✅ Bonne réponse : ${correctLetter}. ${question.answers[question.correctIndex]}`,
    answerSummary(question),
    `⏭️ Écris ${prefix}quizz next pour passer à la suite.`,
    leaderboard(session, "🏆 Classement après cette question")
  ].join("\n");
}

function finishGame(session) {
  session.status = "finished";
  session.finishedAt = Date.now();
  return leaderboard(session, "🏆 CLASSEMENT FINAL — QUIZ TERMINÉ");
}

async function startGame({ api, message, event, prefix, globalData }) {
  const threadID = String(event.threadID);
  const sessions = await loadSessions(globalData);
  const old = sessions[threadID];
  if (old && old.status === "active") {
    if (old.phase === "open") {
      ensureQuestionState(old.current);
      if (!Number(old.current.questionStartedAt) || !Number(old.current.questionEndsAt)) {
        startQuestionClock(old);
        await saveSessions(globalData, sessions);
      }
      scheduleQuestionTimers({ api, message, event, prefix, globalData }, old);
      const remaining = Math.max(0, Math.ceil((Number(old.current.questionEndsAt) - Date.now()) / 1000));
      return send({ api, message, event }, `⏳ Une partie est déjà en cours. Réponds à la question; elle se fermera automatiquement dans ${remaining} seconde(s). Ensuite, écris ${prefix}quizz next.`);
    }
    return send({ api, message, event }, `⏳ La question est terminée. Écris ${prefix}quizz next pour continuer.`);
  }

  clearQuestionTimers(threadID);
  const questionIds = await selectQuestionIDs(threadID, globalData);
  const firstQuestion = QUESTION_BY_ID.get(questionIds[0]);
  const session = {
    status: "active",
    startedAt: Date.now(),
    startedBy: String(event.senderID || ""),
    questionIds,
    currentIndex: 0,
    current: prepareQuestion(firstQuestion),
    phase: "open",
    scores: {},
    scoreOrder: []
  };
  sessions[threadID] = session;
  await saveSessions(globalData, sessions);
  const response = await send({ api, message, event }, `🎉 Nouvelle partie : 10 questions de culture générale, quatre choix par question, et des questions renouvelées d’une partie à l’autre.\n\n${renderQuestion(session, prefix)}`);
  startQuestionClock(session);
  await saveSessions(globalData, sessions);
  scheduleQuestionTimers({ api, message, event, prefix, globalData }, session);
  return response;
}

function parseChoice(value) {
  const text = String(value || "").trim().toUpperCase();
  if (/^[1-4]$/.test(text)) return Number(text) - 1;
  return ANSWER_LETTERS.indexOf(text);
}

function usableDisplayName(value, userID) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name || name === String(userID) || /^\d{6,}$/.test(name)) return null;
  return name.slice(0, 50);
}

async function resolveDisplayName(context, userID) {
  const id = String(userID || "");
  const event = context && context.event;
  if (event && String(event.senderID || "") === id) {
    const eventName = usableDisplayName(event.senderName, id);
    if (eventName) return eventName;
  }

  const usersData = context && context.usersData;
  if (usersData && typeof usersData.get === "function") {
    try {
      const profile = await usersData.get(id);
      const cachedName = typeof profile === "string"
        ? profile
        : profile && (profile.name || profile.fullName || profile.nickname || profile.firstName);
      const validName = usableDisplayName(cachedName, id);
      if (validName) return validName;
    } catch (error) {
      console.warn("[Commande quizz] Pseudo du profil local indisponible :", error.message);
    }
  }

  const api = context && context.api;
  if (api && typeof api.getUserInfo === "function") {
    try {
      const profiles = await api.getUserInfo([id]);
      const profile = profiles && (profiles[id] || profiles[Number(id)]);
      const apiName = usableDisplayName(profile && (profile.name || profile.firstName), id);
      if (apiName) return apiName;
    } catch (error) {
      console.warn("[Commande quizz] Pseudo Facebook indisponible :", error.message);
    }
  }
  return null;
}

function nextQuestion(session) {
  session.currentIndex += 1;
  if (session.currentIndex >= QUESTIONS_PER_GAME) return false;
  const question = QUESTION_BY_ID.get(session.questionIds[session.currentIndex]);
  if (!question) throw new Error(`Question absente de la banque : ${session.questionIds[session.currentIndex]}`);
  session.current = prepareQuestion(question);
  session.phase = "open";
  return true;
}

async function submitAnswer(context, answerValue) {
  const { api, message, event, args, prefix, globalData } = context;
  const threadID = String(event.threadID);
  const userID = String(event.senderID || "");
  const sessions = await loadSessions(globalData);
  const session = sessions[threadID];
  if (!session) return send({ api, message, event }, `❓ Aucune partie en cours. Lance-en une avec ${prefix}quizz.`);
  if (session.status === "finished") return send({ api, message, event }, `🏁 Cette partie est terminée. Lance une nouvelle partie avec ${prefix}quizz.`);
  if (session.phase === "open") {
    ensureQuestionState(session.current);
    if (!Number(session.current.questionStartedAt) || !Number(session.current.questionEndsAt)) {
      startQuestionClock(session);
      await saveSessions(globalData, sessions);
    }
    scheduleQuestionTimers(context, session);
    if (Date.now() >= Number(session.current.questionEndsAt)) {
      const result = closeCurrentQuestion(session, prefix);
      clearQuestionTimers(threadID, session.current.id);
      await saveSessions(globalData, sessions);
      return send({ api, message, event }, `${result}\n⌛ Le délai de 20 secondes est écoulé; aucune réponse tardive n’est acceptée.`);
    }
  }
  if (session.phase !== "open") return send({ api, message, event }, `🔒 Les réponses sont fermées pour cette question. Écris ${prefix}quizz next pour continuer.`);
  if (!userID) return send({ api, message, event }, "❌ Impossible d’identifier le participant.");
  if (Object.prototype.hasOwnProperty.call(session.current.answerRecords, userID)) {
    return send({ api, message, event }, "🔒 Ta première réponse est déjà enregistrée pour cette question. Tu ne peux pas la modifier.");
  }

  const choice = parseChoice(answerValue || args && args[0]);
  if (choice < 0 || choice > 3) return send({ api, message, event }, `🔢 Choisis A, B, C ou D avec ${prefix}quizz A-D.`);
  const playerName = await resolveDisplayName(context, userID);
  session.scores = session.scores && typeof session.scores === "object" ? session.scores : {};
  session.scoreOrder = Array.isArray(session.scoreOrder) ? session.scoreOrder : [];
  if (!session.scores[userID]) {
    session.scores[userID] = { name: playerName || "Joueur", points: 0, correctAnswers: 0 };
    session.scoreOrder.push(userID);
  }
  session.scores[userID].name = playerName || session.scores[userID].name || "Joueur";
  const correct = choice === session.current.correctIndex;
  let place = 0;
  let points = 0;
  if (correct) {
    place = session.current.correctUsers.length + 1;
    points = [3, 2, 1][place - 1] || 0;
    session.current.correctUsers.push(userID);
    session.scores[userID].points += points;
    session.scores[userID].correctAnswers += 1;
  } else {
    session.current.wrongUsers.push(userID);
  }
  session.current.answerRecords[userID] = {
    choice,
    correct,
    points,
    answeredAt: Date.now(),
    name: session.scores[userID].name
  };
  await saveSessions(globalData, sessions);
  if (!correct) {
    return send({ api, message, event }, "❌ Réponse incorrecte, mais elle est enregistrée. Tu ne peux pas la modifier pendant cette question; le résultat sera affiché à la fermeture.");
  }
  const ordinal = place === 1 ? "1er/1re" : `${place}e`;
  const pointsText = points ? `+${points} point(s)` : "0 point (places à points déjà attribuées)";
  return send({ api, message, event }, `✅ Bonne réponse, ${session.scores[userID].name} ! Tu es ${ordinal} parmi les bonnes réponses : ${pointsText}. Le chrono continue jusqu’à 20 secondes; chaque joueur ne peut répondre qu’une fois à cette question.`);
}

async function advanceGame({ api, message, event, prefix, globalData }) {
  const threadID = String(event.threadID);
  const sessions = await loadSessions(globalData);
  const session = sessions[threadID];
  if (!session) return send({ api, message, event }, `❓ Aucune partie en cours. Lance-en une avec ${prefix}quizz.`);
  if (session.status === "finished") return send({ api, message, event }, leaderboard(session, "🏆 CLASSEMENT FINAL — QUIZ TERMINÉ"));

  if (session.phase === "open") {
    ensureQuestionState(session.current);
    if (!Number(session.current.questionStartedAt) || !Number(session.current.questionEndsAt)) {
      startQuestionClock(session);
      await saveSessions(globalData, sessions);
    }
    scheduleQuestionTimers({ api, message, event, prefix, globalData }, session);
    const remaining = Number(session.current.questionEndsAt) - Date.now();
    if (remaining > 0) {
      return send({ api, message, event }, `⏳ Il reste ${Math.ceil(remaining / 1000)} seconde(s). La question reste ouverte jusqu’à la fin du chrono; tu pourras écrire ${prefix}quizz next après l’affichage des résultats.`);
    }
    const result = closeCurrentQuestion(session, prefix);
    clearQuestionTimers(threadID, session.current.id);
    await saveSessions(globalData, sessions);
    return send({ api, message, event }, result);
  }

  if (session.currentIndex >= QUESTIONS_PER_GAME - 1) {
    const finalResult = finishGame(session);
    clearQuestionTimers(threadID);
    await saveSessions(globalData, sessions);
    return send({ api, message, event }, finalResult);
  }

  clearQuestionTimers(threadID);
  nextQuestion(session);
  await saveSessions(globalData, sessions);
  const response = await send({ api, message, event }, renderQuestion(session, prefix));
  startQuestionClock(session);
  await saveSessions(globalData, sessions);
  scheduleQuestionTimers({ api, message, event, prefix, globalData }, session);
  return response;
}

async function showStats({ api, message, event, args, globalData, prefix }) {
  const sessions = await loadSessions(globalData);
  const session = sessions[String(event.threadID || "")];
  if (!session) return send({ api, message, event }, `📊 Aucune partie à afficher. Lance-en une avec ${prefix}quizz.`);
  if (session.status === "active" && session.phase === "open") {
    if (!Number(session.current.questionStartedAt) || !Number(session.current.questionEndsAt)) {
      startQuestionClock(session);
      await saveSessions(globalData, sessions);
    }
    scheduleQuestionTimers({ api, message, event, prefix, globalData }, session);
  }
  const own = normalize(args && args[0]) === "moi";
  if (own) {
    const player = session.scores[String(event.senderID)] || { points: 0, correctAnswers: 0 };
    return send({ api, message, event }, `📊 Tes résultats dans cette partie\n⭐ Points : ${player.points}\n✅ Bonnes réponses : ${player.correctAnswers}\n🧩 Questions : ${Math.min(session.currentIndex + (session.status === "finished" ? 1 : 0), QUESTIONS_PER_GAME)}/${QUESTIONS_PER_GAME}`);
  }
  const timeLeft = session.status === "active" && session.phase === "open"
    ? ` (${Math.max(0, Math.ceil((Number(session.current.questionEndsAt) - Date.now()) / 1000))} s restantes)`
    : "";
  const state = session.status === "finished" ? "Partie terminée" : `${questionLabel(session)} — ${session.phase === "open" ? `réponses ouvertes${timeLeft}` : "réponses fermées"}`;
  return send({ api, message, event }, `📊 QUIZ CULTURE GÉNÉRALE — ${state}\n${leaderboard(session)}`);
}

async function cancelGame(context) {
  const { api, message, event, globalData } = context;
  const threadID = String(event && event.threadID || "");
  if (!threadID) return send({ api, message, event }, "❌ Conversation impossible à identifier.");
  const sessions = await loadSessions(globalData);
  const session = sessions[threadID];
  if (!session || session.status !== "active") {
    return send({ api, message, event }, "ℹ️ Aucune partie de quiz active à annuler dans cette conversation.");
  }
  const actor = await resolveDisplayName(context, event.senderID) || "Un joueur";
  const finalScore = leaderboard(session, "🏁 SCORE AU MOMENT DE L’ANNULATION");
  delete sessions[threadID];
  clearQuestionTimers(threadID);
  await saveSessions(globalData, sessions);
  return send({ api, message, event }, `🛑 Partie annulée par ${actor}.\n\n${finalScore}`);
}

// Retourne la sous-commande à partir de la 2e partie du message
// Ex: "!quizz next" → args = ["next"] ; "!quizz A" → args = ["A"]
function getArgs(context) {
  if (Array.isArray(context.args) && context.args.length) return context.args;
  const body = String(context.event && context.event.body || "").trim();
  return body.split(/\s+/).slice(1);
}

async function handleCommand(context) {
  const { api, message, event, prefix = "!", globalData } = context;
  const threadID = String(event && event.threadID || "");
  if (!threadID || !event || !event.senderID) {
    return send({ api, message, event }, "❌ Conversation ou participant impossible à identifier.");
  }

  const args = getArgs(context);
  const firstArg = normalize(args[0] || "");

  // Sous-commandes
  if (["annule", "annuler", "cancel"].includes(firstArg)) return cancelGame(context);
  if (["next", "suivant"].includes(firstArg)) {
    return advanceGame({ api, message, event, prefix, globalData });
  }
  if (["stats", "stat"].includes(firstArg)) {
    return showStats({ api, message, event, args: args.slice(1), globalData, prefix });
  }
  if (["start", "commencer", "demarrer", "démarrer"].includes(firstArg)) {
    return startGame({ api, message, event, prefix, globalData });
  }

  // Réponse A/B/C/D (ou 1/2/3/4) directement : "!quizz A"
  if (parseChoice(args[0]) >= 0 || ["a", "b", "c", "d", "1", "2", "3", "4"].includes(firstArg)) {
    return submitAnswer(context, args[0]);
  }

  // Aucun argument → démarre une nouvelle partie (ou rappelle la question en cours)
  if (!args.length) {
    const sessions = await loadSessions(globalData);
    const existing = sessions[threadID];
    if (existing && existing.status === "active") {
      if (existing.phase === "open") {
        if (!Number(existing.current.questionStartedAt) || !Number(existing.current.questionEndsAt)) {
          startQuestionClock(existing);
          await saveSessions(globalData, sessions);
        }
        scheduleQuestionTimers({ ...context, prefix }, existing);
      }
      const prompt = existing.phase === "open"
        ? `⏳ Une partie est déjà en cours. Réponds avec ${prefix}quizz A-D; la question se ferme automatiquement après 20 secondes. Écris ${prefix}quizz next après les résultats.`
        : `⏳ Cette question est terminée. Écris ${prefix}quizz next pour continuer.`;
      return send({ api, message, event }, prompt);
    }
    return startGame({ api, message, event, prefix, globalData });
  }

  // Argument inconnu → aide
  return send(
    { api, message, event },
    `💡 Utilisation :\n• ${prefix}quizz — lancer une partie\n• ${prefix}quizz A/B/C/D — répondre à la question en cours\n• ${prefix}quizz next — passer à la question suivante (après fermeture)\n• ${prefix}quizz stats [moi] — voir le classement ou tes points\n• ${prefix}quizz annule — annuler la partie`
  );
}

function serializeByThread(threadID, task) {
  const key = String(threadID || "private");
  const previous = threadQueue.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  threadQueue.set(key, current);
  return current.finally(() => {
    if (threadQueue.get(key) === current) threadQueue.delete(key);
  });
}

function clearQuestionTimers(threadID, questionID) {
  const key = String(threadID || "");
  const timers = activeQuestionTimers.get(key);
  if (!timers || (questionID && timers.questionID !== questionID)) return;
  clearTimeout(timers.warningTimer);
  clearTimeout(timers.closeTimer);
  activeQuestionTimers.delete(key);
}

function startQuestionClock(session, now = Date.now()) {
  ensureQuestionState(session.current);
  session.current.questionStartedAt = now;
  session.current.questionEndsAt = now + QUESTION_DURATION_MS;
  session.current.warningSent = false;
  return session.current.questionEndsAt;
}

async function sendQuestionWarning(context, questionID) {
  const { api, message, event, globalData, prefix = "!" } = context;
  const threadID = String(event && event.threadID || "");
  const sessions = await loadSessions(globalData);
  const session = sessions[threadID];
  if (!session || session.status !== "active" || session.phase !== "open" || session.current.id !== questionID) return false;
  ensureQuestionState(session.current);
  if (session.current.warningSent || Date.now() >= Number(session.current.questionEndsAt)) return false;
  const secondsLeft = Math.max(1, Math.ceil((Number(session.current.questionEndsAt) - Date.now()) / 1000));
  session.current.warningSent = true;
  await saveSessions(globalData, sessions);
  await send({ api, message, event }, `⏳ Il reste ${secondsLeft} seconde(s) pour répondre à ${questionLabel(session)} ! Ta réponse est verrouillée dès le premier envoi. Après la fermeture, écris ${prefix}quizz next.`);
  return true;
}

async function closeTimedQuestion(context, questionID) {
  const { api, message, event, globalData, prefix = "!" } = context;
  const threadID = String(event && event.threadID || "");
  const sessions = await loadSessions(globalData);
  const session = sessions[threadID];
  if (!session || session.status !== "active" || session.phase !== "open" || session.current.id !== questionID) {
    clearQuestionTimers(threadID, questionID);
    return false;
  }
  ensureQuestionState(session.current);
  if (Date.now() < Number(session.current.questionEndsAt)) {
    clearQuestionTimers(threadID, questionID);
    scheduleQuestionTimers(context, session);
    return false;
  }
  const result = closeCurrentQuestion(session, prefix);
  clearQuestionTimers(threadID, questionID);
  await saveSessions(globalData, sessions);
  await send({ api, message, event }, result);
  return true;
}

function scheduleQuestionTimers(context, session) {
  const event = context && context.event;
  const threadID = String(event && event.threadID || "");
  if (!threadID || !session || session.status !== "active" || session.phase !== "open") return false;
  ensureQuestionState(session.current);
  if (!Number(session.current.questionStartedAt) || !Number(session.current.questionEndsAt)) startQuestionClock(session);
  const questionID = String(session.current.id || "");
  const existing = activeQuestionTimers.get(threadID);
  if (existing && existing.questionID === questionID) return true;
  clearQuestionTimers(threadID);

  const now = Date.now();
  const warnAt = Number(session.current.questionStartedAt) + WARNING_AFTER_MS;
  const endAt = Number(session.current.questionEndsAt);
  const makeTimer = (callback, delay) => {
    const timer = setTimeout(() => {
      const task = callback();
      if (task && typeof task.catch === "function") {
        task.catch(error => console.error("[Quiz timer]", error.message));
        return task;
      }
      return task;
    }, Math.max(0, delay));
    if (timer && typeof timer.unref === "function") timer.unref();
    return timer;
  };

  const warningTimer = !session.current.warningSent && now < endAt
    ? makeTimer(() => serializeByThread(threadID, () => sendQuestionWarning(context, questionID)), warnAt - now)
    : null;
  const closeTimer = makeTimer(() => serializeByThread(threadID, () => closeTimedQuestion(context, questionID)), endAt - now);
  activeQuestionTimers.set(threadID, { questionID, warningTimer, closeTimer });
  return true;
}

module.exports = {
  config: {
    name: "quizz",
    aliases: ["quiz", "qcm"],
    version: "5.0.0",
    author: "Diwate",
    description: "Quiz de culture générale chronométré en 10 questions avec réponses verrouillées et classement",
    category: "Culture",
    usages: "quizz | quizz A-D | quizz next | quizz stats [moi] | quizz annule",
    role: 0
  },
  QUESTION_BANK,
  SESSION_KEY,
  HISTORY_KEY,
  QUESTIONS_PER_GAME,
  QUESTION_DURATION_MS,
  WARNING_AFTER_MS,
  parseChoice,
  prepareQuestion,
  renderQuestion,
  ensureQuestionState,
  answerSummary,
  closeCurrentQuestion,
  leaderboard,
  getSession,
  startGame,
  submitAnswer,
  advanceGame,
  showStats,
  scheduleQuestionTimers,
  sendQuestionWarning,
  closeTimedQuestion,
  clearQuestionTimers,
  resolveDisplayName,
  cancelGame,

  onStart: async function (context) {
    try {
      return await serializeByThread(context.event && context.event.threadID, () => handleCommand(context));
    } catch (error) {
      console.error("[Commande quizz]", error.stack || error);
      return send({ api: context.api, message: context.message, event: context.event }, "❌ Le quiz n’a pas pu être traité. Réessaie.");
    }
  }
};
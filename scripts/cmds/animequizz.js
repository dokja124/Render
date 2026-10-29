const { send } = require("./lib/messenger");

const SESSION_KEY = "animeQuizSessionsV3";
const HISTORY_KEY = "animeQuizQuestionHistoryV3";
const QUESTIONS_PER_GAME = 10;
const ANSWER_LETTERS = ["A", "B", "C", "D"];
let memorySessions = {};
let memoryHistory = {};
let commandQueue = Promise.resolve();

function q(id, series, text, answers, correct) {
  return { id, series, text, answers, correct };
}

// Banque locale : les questions et les quatre propositions sont remélangées à chaque partie.
const QUESTION_BANK = [
  q("naruto-01", "Naruto", "Quel est le rêve de Naruto Uzumaki ?", ["Devenir Hokage", "Devenir pirate", "Devenir capitaine de la Soul Society", "Devenir Hunter"], 0),
  q("naruto-02", "Naruto", "Qui est le professeur de l’équipe 7 au début de la série ?", ["Jiraiya", "Kakashi Hatake", "Iruka Umino", "Orochimaru"], 1),
  q("naruto-03", "Naruto", "Quel démon à queues est scellé en Naruto ?", ["Shukaku", "Gyūki", "Kurama", "Matatabi"], 2),
  q("naruto-04", "Naruto", "Quel est le nom du village caché de Naruto ?", ["Sunagakure", "Kirigakure", "Iwagakure", "Konohagakure"], 3),
  q("naruto-05", "Naruto", "Comment s’appelle le frère aîné de Sasuke ?", ["Itachi", "Shisui", "Madara", "Obito"], 0),
  q("onepiece-01", "One Piece", "Qui est le capitaine des Chapeaux de paille ?", ["Roronoa Zoro", "Monkey D. Luffy", "Sanji", "Usopp"], 1),
  q("onepiece-02", "One Piece", "Quel est le rôle principal de Nami dans l’équipage ?", ["Médecin", "Charpentière", "Navigatrice", "Archéologue"], 2),
  q("onepiece-03", "One Piece", "Quel membre de l’équipage est un renne et médecin ?", ["Franky", "Brook", "Jinbe", "Tony Tony Chopper"], 3),
  q("onepiece-04", "One Piece", "Quel est le rêve de Zoro ?", ["Devenir le meilleur sabreur du monde", "Trouver All Blue", "Dessiner une carte du monde", "Devenir Roi des pirates"], 0),
  q("onepiece-05", "One Piece", "Quel trésor Luffy cherche-t-il ?", ["Le Dragon Ball", "Le One Piece", "Le Death Note", "Le Saint Graal"], 1),
  q("dragonball-01", "Dragon Ball", "À quelle race appartient Son Goku ?", ["Namek", "Terrien", "Saiyan", "Majin"], 2),
  q("dragonball-02", "Dragon Ball", "Quelle attaque est emblématique de Goku ?", ["Getsuga Tenshō", "Rasengan", "Detroit Smash", "Kamehameha"], 3),
  q("dragonball-03", "Dragon Ball", "Comment s’appelle la planète d’origine des Saiyans ?", ["Planète Vegeta", "Namek", "Terre", "Yardrat"], 0),
  q("dragonball-04", "Dragon Ball", "Quel dragon est généralement invoqué avec les Dragon Balls de la Terre ?", ["Porunga", "Shenron", "Appule", "Beerus"], 1),
  q("dragonball-05", "Dragon Ball", "La fusion Metamoru de Goku et Vegeta donne quel personnage ?", ["Vegetto", "Gotenks", "Gogeta", "Broly"], 2),
  q("demonslayer-01", "Demon Slayer", "Comment s’appelle la sœur de Tanjiro ?", ["Kanao", "Mitsuri", "Aoi", "Nezuko"], 3),
  q("demonslayer-02", "Demon Slayer", "Quel pilier est associé à la Flamme ?", ["Kyojuro Rengoku", "Giyu Tomioka", "Tengen Uzui", "Muichiro Tokito"], 0),
  q("demonslayer-03", "Demon Slayer", "Quel est l’objectif principal de Tanjiro au début de l’histoire ?", ["Devenir Hokage", "Rendre son humanité à Nezuko", "Trouver le One Piece", "Devenir un pilier du son"], 1),
  q("demonslayer-04", "Demon Slayer", "Quel groupe combat les démons ?", ["Les Pourfendeurs de démons", "Les Chasseurs de primes", "Les Alchimistes d’État", "Les Exorcistes de Tokyo"], 0),
  q("demonslayer-05", "Demon Slayer", "Qui est le principal démon recherché par les pourfendeurs ?", ["Akaza", "Dōma", "Muzan Kibutsuji", "Kokushibo"], 2),
  q("jjk-01", "Jujutsu Kaisen", "Quel doigt Yuji Itadori avale-t-il au début de l’histoire ?", ["Un doigt de Gojo", "Un doigt de Sukuna", "Un doigt de Mahito", "Un doigt de Geto"], 1),
  q("jjk-02", "Jujutsu Kaisen", "Quel est le nom de famille de Satoru ?", ["Fushiguro", "Kugisaki", "Okkotsu", "Gojo"], 3),
  q("jjk-03", "Jujutsu Kaisen", "Dans quelle ville se trouve l’école d’exorcisme fréquentée par Yuji ?", ["Tokyo", "Kyoto", "Osaka", "Nagoya"], 0),
  q("jjk-04", "Jujutsu Kaisen", "Quel titre est associé à Ryomen Sukuna ?", ["Roi des pirates", "Roi des fléaux", "Roi des Saiyans", "Roi des alchimistes"], 1),
  q("jjk-05", "Jujutsu Kaisen", "Quelle arme Nobara Kugisaki utilise-t-elle souvent avec sa technique ?", ["Un arc", "Une lance", "Un marteau et des clous", "Une faux"], 2),
  q("mha-01", "My Hero Academia", "Quel surnom héroïque est associé à Izuku Midoriya ?", ["Deku", "Kacchan", "Red Riot", "Ingenium"], 0),
  q("mha-02", "My Hero Academia", "Quel Alter All Might transmet-il à Izuku ?", ["Explosion", "One For All", "Half-Cold Half-Hot", "Erasure"], 1),
  q("mha-03", "My Hero Academia", "Comment s’appelle l’académie de héros fréquentée par Izuku ?", ["Konoha", "Shiketsu seulement", "U.A.", "Tokyo Jujutsu High"], 2),
  q("mha-04", "My Hero Academia", "Quel Alter possède Shoto Todoroki ?", ["Création", "Explosion", "Zéro gravité", "Mi-froid mi-chaud"], 3),
  q("mha-05", "My Hero Academia", "Quel est le vrai nom d’All Might ?", ["Toshinori Yagi", "Shota Aizawa", "Endeavor Todoroki", "Hizashi Yamada"], 0),
  q("aot-01", "L’Attaque des Titans", "Quel corps d’armée mène les expéditions hors des murs ?", ["La Police militaire", "Le Bataillon d’exploration", "La Garnison uniquement", "Les Pourfendeurs"], 1),
  q("aot-02", "L’Attaque des Titans", "Quel quartier est associé à la maison d’enfance d’Eren ?", ["Trost", "Stohess", "Shiganshina", "Utgard"], 2),
  q("aot-03", "L’Attaque des Titans", "Quel est le prénom de la sœur adoptive d’Eren ?", ["Historia", "Sasha", "Annie", "Mikasa"], 3),
  q("aot-04", "L’Attaque des Titans", "Quel est le nom de famille de Levi ?", ["Ackerman", "Yeager", "Arlert", "Braun"], 0),
  q("deathnote-01", "Death Note", "Quel Shinigami laisse tomber le Death Note dans le monde humain ?", ["Rem", "Ryuk", "Sidoh", "Gelus"], 1),
  q("deathnote-02", "Death Note", "Quel nom porte le célèbre détective qui enquête sur Kira ?", ["Near", "Mello", "L", "Watari"], 2),
  q("deathnote-03", "Death Note", "Que doit principalement écrire l’utilisateur dans le carnet pour provoquer une mort ?", ["Le nom d’une personne", "Une formule magique", "Un numéro de téléphone", "Un lieu"], 0),
  q("deathnote-04", "Death Note", "Quel est le nom complet de Kira au début de l’histoire ?", ["Light Yagami", "L Lawliet", "Teru Mikami", "Soichiro Yagami"], 0),
  q("fma-01", "Fullmetal Alchemist", "Comment s’appelle le frère cadet d’Edward Elric ?", ["Roy Mustang", "Alphonse Elric", "Ling Yao", "Scar"], 1),
  q("fma-02", "Fullmetal Alchemist", "Quel membre Edward remplace-t-il par un automail ?", ["La jambe droite", "Les deux jambes", "Le bras droit", "Le bras gauche"], 2),
  q("fma-03", "Fullmetal Alchemist", "Quel principe résume souvent l’alchimie dans la série ?", ["L’infini sans échange", "La loi du plus fort", "La magie des dragons", "L’échange équivalent"], 3),
  q("fma-04", "Fullmetal Alchemist", "Quel surnom Edward reçoit-il comme alchimiste d’État ?", ["L’Alchimiste de flamme", "L’Alchimiste d’acier", "L’Alchimiste écarlate", "L’Alchimiste cristallin"], 1),
  q("hxh-01", "Hunter x Hunter", "Qui Gon Freecss cherche-t-il à retrouver ?", ["Hisoka", "Leorio", "Son père Ging", "Kurapika"], 2),
  q("hxh-02", "Hunter x Hunter", "À quelle famille appartient Killua ?", ["Zoldyck", "Kurta", "Freecss", "Nostrade"], 0),
  q("hxh-03", "Hunter x Hunter", "Quel examen Gon passe-t-il au début de son aventure ?", ["L’examen de ninja", "L’examen de Hunter", "L’examen d’alchimiste", "L’examen de pilote"], 1),
  q("hxh-04", "Hunter x Hunter", "Quel est le prénom du médecin en formation qui accompagne Gon ?", ["Kurapika", "Hisoka", "Illumi", "Leorio"], 3),
  q("bleach-01", "Bleach", "Comment s’appelle le Zanpakutō d’Ichigo ?", ["Zangetsu", "Senbonzakura", "Zabimaru", "Hyōrinmaru"], 0),
  q("bleach-02", "Bleach", "Qui donne à Ichigo ses pouvoirs de Shinigami au début ?", ["Orihime Inoue", "Rukia Kuchiki", "Yoruichi Shihōin", "Rangiku Matsumoto"], 1),
  q("bleach-03", "Bleach", "Quel type d’ennemi les Shinigami combattent-ils souvent dans le monde humain ?", ["Les Titans", "Les Homonculus", "Les Hollows", "Les Fléaux"], 2),
  q("bleach-04", "Bleach", "Quel magasin Kisuke Urahara tient-il ?", ["La boutique de bonbons", "Le magasin de katanas", "La librairie du Seireitei", "La boutique Urahara"], 3),
  q("pokemon-01", "Pokémon", "Quel est le type de Pikachu ?", ["Électrik", "Feu", "Eau", "Plante"], 0),
  q("pokemon-02", "Pokémon", "Quel Pokémon accompagne principalement Sacha au début de son voyage ?", ["Carapuce", "Pikachu", "Salamèche", "Bulbizarre"], 1),
  q("pokemon-03", "Pokémon", "Quel professeur remet souvent leur premier Pokémon aux jeunes dresseurs de Kanto ?", ["Professeur Chen", "Professeur Orme", "Professeur Sorbier", "Professeure Magnolia"], 0),
  q("pokemon-04", "Pokémon", "Quel objet sert couramment à capturer un Pokémon ?", ["Une capsule de chakra", "Un Poké Ball", "Un carnet noir", "Une sphère de Nen"], 1),
  q("haikyuu-01", "Haikyuu!!", "Quel sport est au centre de l’histoire ?", ["Le basket", "Le football", "Le volley-ball", "Le tennis"], 2),
  q("haikyuu-02", "Haikyuu!!", "Quel lycée forme l’équipe principale de Shōyō Hinata ?", ["Aoba Jōsai", "Nekoma", "Fukurōdani", "Karasuno"], 3),
  q("haikyuu-03", "Haikyuu!!", "Quel est le prénom du passeur surnommé le Roi du terrain ?", ["Tobio", "Kei", "Daichi", "Kōshi"], 0),
  q("bluelock-01", "Blue Lock", "Quel sport les joueurs de Blue Lock pratiquent-ils ?", ["Le volley", "Le football", "Le baseball", "Le rugby"], 1),
  q("bluelock-02", "Blue Lock", "Quel est le prénom du protagoniste Yoichi ?", ["Bachira", "Nagi", "Isagi", "Rin"], 2),
  q("spyfamily-01", "Spy x Family", "Quel pouvoir Anya possède-t-elle ?", ["La téléportation", "La télékinésie", "L’invisibilité", "La télépathie"], 3),
  q("spyfamily-02", "Spy x Family", "Quel est le nom de code de Loid Forger ?", ["Twilight", "Nightfall", "Thorn Princess", "Handler"], 0),
  q("spyfamily-03", "Spy x Family", "Quel est le métier secret de Yor ?", ["Espionne", "Assassin", "Détective", "Pilote"], 1),
  q("jojo-01", "JoJo’s Bizarre Adventure", "Comment appelle-t-on souvent les manifestations de pouvoir dans les parties ultérieures ?", ["Quirks", "Nen", "Stands", "Alters"], 2),
  q("jojo-02", "JoJo’s Bizarre Adventure", "Quel est le nom de famille de Jotaro ?", ["Brando", "Higashikata", "Zeppeli", "Kujo"], 3),
  q("onepunch-01", "One-Punch Man", "Quel est le nom du héros chauve capable de vaincre ses adversaires d’un seul coup ?", ["Saitama", "Genos", "Bang", "King"], 0),
  q("onepunch-02", "One-Punch Man", "Quel personnage est le cyborg disciple de Saitama ?", ["Mumen Rider", "Genos", "Garou", "Sonic"], 1),
  q("fairytail-01", "Fairy Tail", "Comment s’appelle la guilde de Natsu et Lucy ?", ["Blue Pegasus", "Sabertooth", "Fairy Tail", "Lamia Scale"], 2),
  q("fairytail-02", "Fairy Tail", "Quel est le type de magie de Natsu ?", ["Magie de glace", "Magie céleste", "Magie d’ombre", "Magie de chasseur de dragons de feu"], 3),
  q("blackclover-01", "Black Clover", "Quel est le trait inhabituel d’Asta au début de l’histoire ?", ["Il n’a pas de magie", "Il ne peut pas parler", "Il est déjà Roi-Mage", "Il ne peut pas tenir une épée"], 0),
  q("blackclover-02", "Black Clover", "Quel titre Asta rêve-t-il d’obtenir ?", ["Hokage", "Roi-Mage", "Roi des pirates", "Hunter professionnel"], 1),
  q("drstone-01", "Dr. Stone", "Quel est le prénom du jeune scientifique qui veut reconstruire la civilisation ?", ["Taiju", "Chrome", "Senku", "Tsukasa"], 2),
  q("drstone-02", "Dr. Stone", "Quelle discipline Senku utilise-t-il surtout pour rebâtir le monde ?", ["La magie", "La peinture", "La musique", "La science"], 3),
  q("tokyoghoul-01", "Tokyo Ghoul", "Quel est le nom du protagoniste qui devient un hybride humain-goule ?", ["Ken Kaneki", "Hide Nagachika", "Kishō Arima", "Nishiki Nishio"], 0),
  q("sailormoon-01", "Sailor Moon", "Quel est le nom civil de Sailor Moon ?", ["Rei Hino", "Usagi Tsukino", "Ami Mizuno", "Makoto Kino"], 1),
  q("vinland-01", "Vinland Saga", "Comment s’appelle le jeune protagoniste de la saga ?", ["Canute", "Thors", "Thorfinn", "Askeladd"], 2),
  q("conan-01", "Détective Conan", "Quel est le vrai nom de Conan Edogawa ?", ["Heiji Hattori", "Kogoro Mouri", "Ran Mouri", "Shinichi Kudo"], 3),
  q("doraemon-01", "Doraemon", "Qu’est-ce que Doraemon ?", ["Un chat-robot venu du futur", "Un dragon de feu", "Un détective miniature", "Un extraterrestre de Namek"], 0),
  q("sao-01", "Sword Art Online", "Comment s’appelle le monde virtuel principal du premier arc ?", ["Amestris", "Aincrad", "Shiganshina", "Greed Island"], 1),
  q("chainsawman-01", "Chainsaw Man", "Comment s’appelle le petit démon-tronçonneuse lié à Denji ?", ["Power", "Aki", "Pochita", "Beam"], 2),
  q("mobpsycho-01", "Mob Psycho 100", "Quel est le surnom de Shigeo Kageyama ?", ["Reigen", "Teru", "Dimple", "Mob"], 3),
  q("rezero-01", "Re:Zero", "Quel phénomène permet à Subaru de revenir après sa mort ?", ["Retour par la mort", "Le Nen", "L’échange équivalent", "Le pouvoir du Titan"], 0),
  q("kuroko-01", "Kuroko’s Basketball", "Quel sport joue l’équipe de Tetsuya Kuroko ?", ["Le volley", "Le basket-ball", "Le handball", "Le baseball"], 1),
  q("promised-01", "The Promised Neverland", "Comment s’appelle l’orphelinat où vivent Emma, Norman et Ray ?", ["Amestris", "Karasuno", "Grace Field House", "Fairy Tail"], 2)
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
    wrongUsers: []
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
  return sessions[String(threadID || "") ] || null;
}

function runInThreadQueue(threadID, task) {
  const id = String(threadID || "private");
  const previous = threadQueue.get(id) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  threadQueue.set(id, current);
  return current.finally(() => {
    if (threadQueue.get(id) === current) threadQueue.delete(id);
  });
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
    `🎌 QUIZ ANIME — ${questionLabel(session)}`,
    `📺 ${question.series}`,
    "",
    question.text,
    "",
    ...question.answers.map((answer, index) => `${ANSWER_LETTERS[index]}. ${answer}`),
    "",
    `Réponds avec ${prefix}reponse A, B, C ou D (ou ${prefix}animequiz A-D).`,
    `🏆 Les deux premiers gagnent des points : 3 pts puis 2 pts. Après deux bonnes réponses, il faudra écrire ${prefix}next.`
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
  return `${title}\n${rows.map((player, index) => `${index + 1}. ${player.name || player.userID} — ${player.points} pts (${player.correctAnswers} bonne(s) réponse(s))`).join("\n")}`;
}

function closeCurrentQuestion(session) {
  session.phase = "closed";
  const question = session.current;
  const correctLetter = ANSWER_LETTERS[question.correctIndex];
  return [
    `🔒 Réponses fermées — ${questionLabel(session)}.`,
    `✅ Bonne réponse : ${correctLetter}. ${question.answers[question.correctIndex]}`,
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
      return send({ api, message, event }, `⏳ Une partie est déjà en cours. Réponds à la question ou écris ${prefix}next pour la fermer et passer à la suite.`);
    }
    return send({ api, message, event }, `⏳ La question est terminée. Écris ${prefix}next pour continuer.`);
  }

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
  return send({ api, message, even

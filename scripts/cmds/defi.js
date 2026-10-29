const { send } = require("./lib/messenger");

const STORAGE_KEY = "messengerArenaGames";
const PENDING_TIMEOUT = 15 * 60 * 1000;
const MAX_HP = 100;
const MAX_CHAKRA = 100;
const MAX_DAMAGE = 100;
let memoryGames = {};
let commandQueue = Promise.resolve();

const FIGHTERS = [
  { name: "Naruto", jutsu: "Rasengan", ultimate: "Rasenshuriken", power: 4 },
  { name: "Sasuke", jutsu: "Chidori", ultimate: "Flèche d’Indra", power: 5 },
  { name: "Sakura", jutsu: "Frappe chakra", ultimate: "Force des cent sceaux", power: 4 },
  { name: "Kakashi", jutsu: "Raikiri", ultimate: "Kamui", power: 5 },
  { name: "Gaara", jutsu: "Tombeau du désert", ultimate: "Grande cascade de sable", power: 3 },
  { name: "Rock Lee", jutsu: "Lotus recto-verso", ultimate: "Portes intérieures", power: 5 },
  { name: "Hinata", jutsu: "Paume des Hakke", ultimate: "Soixante-quatre paumes", power: 3 },
  { name: "Shikamaru", jutsu: "Possession des ombres", ultimate: "Stratégie de l’ombre", power: 3 }
];

const COMBAT_ACTIONS = ["attaquer", "attaque", "jutsu", "technique", "ultime", "ultimate", "charger", "chakra", "esquiver", "esquive", "defendre", "defense", "garde", "soin", "heal", "statut", "abandonner"];

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function randomInt(min, max) {
  const lower = Math.ceil(Number(min));
  const upper = Math.floor(Number(max));
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper < lower) return 0;
  return lower + Math.floor(Math.random() * (upper - lower + 1));
}

function pickFighter(excludeName) {
  const options = FIGHTERS.filter(fighter => fighter.name !== excludeName);
  const pool = options.length ? options : FIGHTERS;
  const selected = pool[randomInt(0, pool.length - 1)];
  return { ...selected };
}

function createPlayer(id, name, excludeFighter) {
  const fighter = pickFighter(excludeFighter);
  return {
    id: String(id),
    name: String(name || "Ninja").slice(0, 40),
    fighter: fighter.name,
    jutsu: fighter.jutsu,
    ultimate: fighter.ultimate,
    power: fighter.power,
    hp: MAX_HP,
    chakra: 30,
    guarding: false,
    dodging: false,
    healUsed: false
  };
}

function normalizePlayer(player) {
  const value = player && typeof player === "object" ? player : {};
  const fighter = FIGHTERS.find(item => item.name === value.fighter) || FIGHTERS[0];
  const dodging = Boolean(value.dodging);
  return {
    id: String(value.id || ""),
    name: String(value.name || "Ninja").slice(0, 40),
    fighter: fighter.name,
    jutsu: fighter.jutsu,
    ultimate: fighter.ultimate,
    // La puissance provient toujours de la fiche du combattant, jamais d’une valeur libre en base.
    power: clampInt(fighter.power, 3, 5, 3),
    hp: clampInt(value.hp, 0, MAX_HP, MAX_HP),
    chakra: clampInt(value.chakra, 0, MAX_CHAKRA, 30),
    dodging,
    guarding: Boolean(value.guarding) && !dodging,
    healUsed: Boolean(value.healUsed)
  };
}

function normalizeGame(game) {
  if (!game || typeof game !== "object" || !Array.isArray(game.players) || game.players.length !== 2) return null;
  if (!["pending", "active", "finished"].includes(game.status)) return null;
  const players = game.players.map(player => {
    if (!player || !player.id) return null;
    if (game.status === "pending") {
      return { id: String(player.id), name: String(player.name || "Ninja").slice(0, 40) };
    }
    return normalizePlayer(player);
  });
  if (players.some(player => !player)) return null;

  const normalized = {
    ...game,
    players,
    createdAt: clampInt(game.createdAt, 0, Number.MAX_SAFE_INTEGER, Date.now())
  };
  if (game.status === "active") {
    normalized.turn = clampInt(game.turn, 0, 1, 0);
    normalized.round = clampInt(game.round, 1, Number.MAX_SAFE_INTEGER, 1);
  }
  if (game.status === "finished" && game.winner != null) normalized.winner = String(game.winner);
  return normalized;
}

function sanitizeGames(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const clean = {};
  for (const [threadID, game] of Object.entries(value)) {
    const normalized = normalizeGame(game);
    if (normalized) clean[String(threadID)] = normalized;
  }
  return clean;
}

async function getGames(globalData) {
  if (!globalData || typeof globalData.get !== "function") {
    memoryGames = sanitizeGames(memoryGames);
    return memoryGames;
  }
  const saved = await globalData.get(STORAGE_KEY, "data", {});
  memoryGames = sanitizeGames(saved);
  return memoryGames;
}

async function saveGames(globalData, games) {
  memoryGames = sanitizeGames(games);
  if (globalData && typeof globalData.get === "function" && typeof globalData.set === "function") {
    await globalData.get(STORAGE_KEY, "data", memoryGames);
    await globalData.set(STORAGE_KEY, memoryGames, "data");
  }
  return memoryGames;
}

function healthBar(hp) {
  const safeHP = clampInt(hp, 0, MAX_HP, 0);
  const filled = Math.ceil(safeHP / 10);
  return "🟩".repeat(filled) + "⬛".repeat(10 - filled) + ` ${safeHP}/${MAX_HP} PV`;
}

function battleStatus(game) {
  if (!game || !Array.isArray(game.players) || game.players.length !== 2) return "Aucun combat actif.";
  game.players = game.players.map(normalizePlayer);
  const [a, b] = game.players;
  const turn = clampInt(game.turn, 0, 1, 0);
  return [
    `🥷 ${a.fighter} — ${a.name}`,
    `${healthBar(a.hp)} | 🔵 Chakra ${a.chakra}/${MAX_CHAKRA} | 💥 Puissance +${a.power}`,
    "",
    `🥷 ${b.fighter} — ${b.name}`,
    `${healthBar(b.hp)} | 🔵 Chakra ${b.chakra}/${MAX_CHAKRA} | 💥 Puissance +${b.power}`,
    "",
    game.status === "active" ? `⚡ Tour de ${game.players[turn].name} — Manche ${clampInt(game.round, 1, Number.MAX_SAFE_INTEGER, 1)}` : "🏁 Combat terminé"
  ].join("\n");
}

function applyDamage(attacker, defender, baseDamage) {
  if (!defender || typeof defender !== "object") return { rawDamage: 0, damage: 0, result: "" };
  defender.hp = clampInt(defender.hp, 0, MAX_HP, MAX_HP);
  defender.chakra = clampInt(defender.chakra, 0, MAX_CHAKRA, 30);
  const rawDamage = clampInt(baseDamage, 0, MAX_DAMAGE, 0);
  let damage = rawDamage;
  let result = "";

  // Esquive et garde sont mutuellement exclusives; un seul effet s’applique par coup reçu.
  if (defender.dodging) {
    defender.dodging = false;
    defender.guarding = false;
    if (Math.random() < 0.45) {
      damage = 0;
      result = `💨 ${defender.name} esquive complètement !`;
    } else {
      damage = Math.ceil(damage * 0.6);
      result = `💨 L’esquive de ${defender.name} réduit les dégâts à 60 %.`;
    }
  } else if (defender.guarding) {
    defender.guarding = false;
    damage = Math.ceil(damage * 0.5);
    result = `🛡️ La garde de ${defender.name} réduit les dégâts de moitié.`;
  }

  damage = clampInt(damage, 0, MAX_DAMAGE, 0);
  defender.hp = clampInt(defender.hp - damage, 0, MAX_HP, 0);
  return { rawDamage, damage, result };
}

function rulesText(prefix = "!") {
  return [
    "╭━━━〔 🥷 RÈGLES — ARENA NINJA 〕━━━╮",
    "⚔️ Un combat oppose deux joueurs. Chacun joue à son tour; une action valide consomme le tour.",
    `❤️ Départ : ${MAX_HP} PV et 30/100 chakra. Les PV et le chakra restent toujours entre 0 et ${MAX_HP}.`,
    "💥 Puissance : bonus fixe du combattant (+3 à +5) ajouté aux dégâts de ses attaques.",
    "👊 Attaquer : 12–18 dégâts de base + puissance; rend jusqu’à 15 chakra (plafond 100).",
    "✨ Jutsu : coûte 30 chakra; inflige 26–34 dégâts de base + puissance.",
    "🌪️ Ultime : coûte 70 chakra; inflige 50–62 dégâts de base + puissance.",
    "🔵 Charger : récupère jusqu’à 35 chakra, sans dépasser 100.",
    "🛡️ Défendre : réduit de moitié le prochain coup reçu; effet consommé après ce coup.",
    "💨 Esquiver : 45 % de chance d’annuler le prochain coup; sinon il est réduit à 60 %.",
    "🩹 Soin : une seule fois par combat, coûte 35 chakra et rend jusqu’à 30 PV (maximum 100).",
    "🏆 Victoire : faire tomber les PV adverses à 0, ou gagner si l’adversaire abandonne.",
    "🚫 Une action refusée (pas assez de chakra, mauvaise commande, mauvais tour) ne consomme rien.",
    "",
    `⚔️ Défier : ${prefix}defi @mention | ✅ Accepter : ${prefix}defi accepter | 🚫 Refuser : ${prefix}defi refuser`,
    `🎮 Actions : ${prefix}defi attaquer / jutsu / ultime / charger / defendre / esquiver / soin / statut / abandonner`,
    "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯"
  ].join("\n");
}

function firstMention(event) {
  const mentions = event && event.mentions;
  if (!mentions || typeof mentions !== "object") return null;
  const id = Object.keys(mentions)[0];
  if (!id) return null;
  const raw = mentions[id];
  const name = typeof raw === "string" ? raw : raw && (raw.name || raw.fullName);
  return { id: String(id), name: name || "Ninja adverse" };
}

function playerIndex(game, id) {
  return game.players.findIndex(player => player.id === String(id));
}

function statusMessage(game) {
  return `🏟️ ARENA NINJA\n${battleStatus(game)}`;
}

function challengeMessage(event, mention, prefix) {
  const sender = String(event.senderName || "Un ninja").slice(0, 40);
  return `${rulesText(prefix)}\n\n⚔️ ${sender} défie ${mention.name} !\n⏳ Le défi expire dans 15 minutes.\n✅ ${mention.name}, écris ${prefix}defi accepter pour choisir ton combattant, ou ${prefix}defi refuser.`;
}

module.exports = {
  config: {
    name: "defi",
    version: "5.0.0",
    author: "Diwate",
    description: "Combat ninja au tour par tour avec règles et statistiques contrôlées",
    category: "Divertissement",
    usages: "defi [@mention | accepter | action]",
    role: 0
  },
  STORAGE_KEY,
  FIGHTERS,
  MAX_HP,
  MAX_CHAKRA,
  normalize,
  clampInt,
  randomInt,
  createPlayer,
  normalizePlayer,
  normalizeGame,
  getGames,
  saveGames,
  healthBar,
  battleStatus,
  applyDamage,
  rulesText,

  onStart: async function ({ api, message, event, args, prefix, globalData }) {
    const previous = commandQueue.catch(() => {});
    let release;
    commandQueue = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      const threadID = String(event && event.threadID || "");
      const userID = String(event && event.senderID || "");
      if (!threadID || !userID) return send({ api, message, event }, "❌ Conversation ou joueur impossible à identifier.");
      const commandPrefix = prefix || "!";
      const words = Array.isArray(args) ? args : [];
      const action = normalize(words[0] || "");
      const mention = firstMention(event);
      const games = await getGames(globalData);
      let game = games[threadID];

      if (game && game.status === "pending" && Date.now() - game.createdAt > PENDING_TIMEOUT) {
        delete games[threadID];
        await saveGames(globalData, games);
        game = null;
      }

      if (["aide", "help", "regle", "regles", "rules"].includes(action) || action === "" && !mention) {
        return send({ api, message, event }, rulesText(commandPrefix));
      }

      if (["accepter", "accept", "oui"].includes(action)) {
        if (!game || game.status !== "pending") return send({ api, message, event }, "ℹ️ Aucun défi en attente dans cette conversation.");
        if (game.players[1].id !== userID) return send({ api, message, event }, "⛔ Seule la personne défiée peut accepter ce combat.");
        if (Date.now() - game.createdAt > PENDING_TIMEOUT) {
          delete games[threadID];
          await saveGames(globalData, games);
          return send({ api, message, event }, `⌛ Ce défi a expiré. Lance-en un nouveau avec ${commandPrefix}defi @mention.`);
        }
        const first = createPlayer(game.players[0].id, game.players[0].name);
        const second = createPlayer(game.players[1].id, game.players[1].name, first.fighter);
        game.players = [first, second];
        game.status = "active";
        game.turn = 0;
        game.round = 1;
        await saveGames(globalData, games);
        return send({ api, message, event }, `🔥 LE COMBAT COMMENCE !\n🥷 ${first.name} choisit ${first.fighter} (${first.jutsu}).\n🥷 ${second.name} choisit ${second.fighter} (${second.jutsu}).\n\n${statusMessage(game)}\n\n🎮 Premier tour : ${first.name}. Une action valide par tour; les PV et le chakra ne peuvent pas sortir de leurs limites.`);
      }

      if (["refuser", "refuse", "annuler"].includes(action)) {
        if (!game || game.status !== "pending") return send({ api, message, event }, "ℹ️ Aucun défi en attente à refuser.");
        if (action !== "annuler" && game.players[1].id !== userID) return send({ api, message, event }, "⛔ Seule la personne défiée peut refuser le défi.");
        if (action === "annuler" && game.players[0].id !== userID) return send({ api, message, event }, "⛔ Seule la personne qui a lancé le défi peut l’annuler.");
        delete games[threadID];
        await saveGames(globalData, games);
        return send({ api, message, event }, "🚫 Le défi a été refusé/annulé.");
      }

      if (mention && !COMBAT_ACTIONS.includes(action)) {
        if (mention.id === userID) return send({ api, message, event }, "😅 Tu ne peux pas te défier toi-même.");
        if (game && ["pending", "active"].includes(game.status)) return send({ api, message, event }, "⚔️ Un défi ou un combat est déjà en cours dans cette conversation.");
        const targetName = String(mention.name || "Ninja adverse").slice(0, 40);
        games[threadID] = {
          status: "pending",
          createdAt: Date.now(),
          players: [
            { id: userID, name: String(event.senderName || "Ninja").slice(0, 40) },
            { id: mention.id, name: targetName }
          ]
        };
        await saveGames(globalData, games);
        return send({ api, message, event }, challengeMessage(event, { ...mention, name: targetName }, commandPrefix));
      }

      if (!game) return send({ api, message, event }, `${rulesText(commandPrefix)}\n\n🥷 Pour lancer un combat, utilise ${commandPrefix}defi @mention.`);
      if (game.status === "pending") return send({ api, message, event }, `⏳ Défi en attente de ${game.players[1].name}. Relis les règles avec ${commandPrefix}defi règles; la personne défiée peut accepter ou refuser.`);
      if (game.status !== "active") {
        if (action === "statut") return send({ api, message, event }, statusMessage(game));
        return send({ api, message, event }, `🏁 Ce combat est terminé. Lance un nouveau défi avec ${commandPrefix}defi @mention.`);
      }

      const currentIndex = playerIndex(game, userID);
      if (currentIndex === -1) return send({ api, message, event }, "⛔ Tu ne participes pas au combat actif de cette conversation.");
      if (action === "statut") return send({ api, message, event }, statusMessage(game));
      if (action === "abandonner") {
        game.status = "finished";
        game.winner = game.players[1 - currentIndex].id;
        await saveGames(globalData, games);
        return send({ api, message, event }, `🏳️ ${game.players[currentIndex].name} abandonne.\n🏆 ${game.players[1 - currentIndex].name} remporte le combat !`);
      }
      if (currentIndex !== game.turn) return send({ api, message, event }, `⏳ Ce n’est pas ton tour. Attends ${game.players[game.turn].name}.`);

      const fighter = game.players[currentIndex];
      const opponent = game.players[1 - currentIndex];
      fighter.hp = clampInt(fighter.hp, 0, MAX_HP, MAX_HP);
      fighter.chakra = clampInt(fighter.chakra, 0, MAX_CHAKRA, 30);
      let actionText = "";
      let damageInfo = null;

      if (["attaquer", "attaque"].includes(action)) {
        const base = randomInt(12, 18);
        damageInfo = applyDamage(fighter, opponent, base + fighter.power);
        const oldChakra = fighter.chakra;
        fighter.chakra = clampInt(fighter.chakra + 15, 0, MAX_CHAKRA, MAX_CHAKRA);
        const gained = fighter.chakra - oldChakra;
        actionText = `👊 ${fighter.name} (${fighter.fighter}) frappe : ${base} base + ${fighter.power} puissance = ${base + fighter.power} avant défense; ${damageInfo.damage} dégâts infligés. 🔵 Chakra +${gained} (${fighter.chakra}/${MAX_CHAKRA}).`;
      } else if (["charger", "chakra"].includes(action)) {
        if (fighter.chakra >= MAX_CHAKRA) return send({ api, message, event }, "🔵 Ton chakra est déjà au maximum (100/100). Aucun tour n’est consommé.");
        const gained = Math.min(35, MAX_CHAKRA - fighter.chakra);
        fighter.chakra = clampInt(fighter.chakra + gained, 0, MAX_CHAKRA, MAX_CHAKRA);
        actionText = `🔵 ${fighter.name} concentre son chakra : +${gained}, maintenant ${fighter.chakra}/${MAX_CHAKRA}.`;
      } else if (["esquiver", "esquive"].includes(action)) {
        fighter.dodging = true;
        fighter.guarding = false;
        actionText = `💨 ${fighter.name} prépare une esquive pour le prochain coup reçu.`;
      } else if (["defendre", "defense", "garde"].includes(action)) {
        fighter.guarding = true;
        fighter.dodging = false;
        actionText = `🛡️ ${fighter.name} se met en garde : le prochain coup reçu sera réduit de moitié.`;
      } else if (["jutsu", "technique"].includes(action)) {
        if (fighter.chakra < 30) return send({ api, message, event }, `🔵 Chakra insuffisant : ${fighter.chakra}/30. Aucune ressource ni tour n’est consommé. Utilise ${commandPrefix}defi charger.`);
        const base = randomInt(26, 34);
        fighter.chakra = clampInt(fighter.chakra - 30, 0, MAX_CHAKRA, 0);
        damageInfo = applyDamage(fighter, opponent, base + fighter.power);
        actionText = `✨ ${fighter.name} lance ${fighter.jutsu} : ${base} base + ${fighter.power} puissance = ${base + fighter.power} avant défense; ${damageInfo.damage} dégâts. 🔵 Chakra −30 (${fighter.chakra}/${MAX_CHAKRA}).`;
      } else if (["ultime", "ultimate"].includes(action)) {
        if (fighter.chakra < 70) return send({ api, message, event }, `🌪️ Chakra insuffisant : ${fighter.chakra}/70. Aucune ressource ni tour n’est consommé. Utilise ${commandPrefix}defi charger.`);
        const base = randomInt(50, 62);
        fighter.chakra = clampInt(fighter.chakra - 70, 0, MAX_CHAKRA, 0);
        damageInfo = applyDamage(fighter, opponent, base + fighter.power);
        actionText = `🌪️ ULTIME ${fighter.ultimate} ! ${base} base + ${fighter.power} puissance = ${base + fighter.power} avant défense; ${damageInfo.damage} dégâts. 🔵 Chakra −70 (${fighter.chakra}/${MAX_CHAKRA}).`;
      } else if (["soin", "heal"].includes(action)) {
        if (fighter.healUsed) return send({ api, message, event }, "🩹 Soin déjà utilisé. Aucune ressource ni tour n’est consommé.");
        if (fighter.chakra < 35) return send({ api, message, event }, `🩹 Chakra insuffisant : ${fighter.chakra}/35. Aucune ressource ni tour n’est consommé.`);
        if (fighter.hp >= MAX_HP) return send({ api, message, event }, "❤️ Tes PV sont déjà au maximum. Le soin n’est pas consommé et tu gardes ton tour.");
        const before = fighter.hp;
        const restored = Math.min(30, MAX_HP - fighter.hp);
        fighter.chakra = clampInt(fighter.chakra - 35, 0, MAX_CHAKRA, 0);
        fighter.hp = clampInt(fighter.hp + restored, 0, MAX_HP, MAX_HP);
        fighter.healUsed = true;
        actionText = `🩹 ${fighter.name} récupère ${fighter.hp - before} PV (${fighter.hp}/${MAX_HP}); chakra −35 (${fighter.chakra}/${MAX_CHAKRA}).`;
      } else {
        return send({ api, message, event }, `🎮 Action inconnue. Écris ${commandPrefix}defi pour lire les règles et les actions.`);
      }

      if (damageInfo && damageInfo.result) actionText += `\n${damageInfo.result}`;
      if (opponent.hp <= 0) {
        game.status = "finished";
        game.winner = fighter.id;
        await saveGames(globalData, games);
        return send({ api, message, event }, `💥 ${actionT

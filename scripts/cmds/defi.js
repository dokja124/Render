const { send } = require("./lib/messenger");

const STORAGE_KEY = "messengerArenaGames";
const PENDING_TIMEOUT = 15 * 60 * 1000;
const MAX_HP = 300;
const MAX_CHAKRA = 200;
const STARTING_CHAKRA = 100;
const MAX_DAMAGE = 220;
let memoryGames = {};
let commandQueue = Promise.resolve();
const displayNameCache = new Map();

const FIGHTERS = [
  { name: "Naruto", aliases: ["naruto uzumaki"], jutsu: "Rasengan", ultimate: "Rasenshuriken", power: 10 },
  { name: "Sasuke", aliases: ["sasuke uchiha"], jutsu: "Chidori", ultimate: "Flèche d’Indra", power: 12 },
  { name: "Sakura", aliases: ["sakura haruno"], jutsu: "Frappe chakra", ultimate: "Force des cent sceaux", power: 9 },
  { name: "Kakashi", aliases: ["kakashi hatake"], jutsu: "Raikiri", ultimate: "Kamui", power: 12 },
  { name: "Gaara", jutsu: "Tombeau du désert", ultimate: "Grande cascade de sable", power: 8 },
  { name: "Rock Lee", aliases: ["lee"], jutsu: "Lotus recto-verso", ultimate: "Huit portes intérieures", power: 12 },
  { name: "Hinata", aliases: ["hinata hyuga"], jutsu: "Paume des Hakke", ultimate: "Soixante-quatre paumes", power: 8 },
  { name: "Shikamaru", aliases: ["shikamaru nara"], jutsu: "Possession des ombres", ultimate: "Stratégie de l’ombre", power: 8 },
  { name: "Itachi", aliases: ["itachi uchiha"], jutsu: "Tsukuyomi", ultimate: "Amaterasu", power: 12 },
  { name: "Minato", aliases: ["minato namikaze"], jutsu: "Dieu du Tonnerre volant", ultimate: "Rasengan éclair", power: 10 },
  { name: "Madara", aliases: ["madara uchiha"], jutsu: "Art du feu", ultimate: "Susanoo parfait", power: 12 },
  { name: "Obito", aliases: ["obito uchiha", "tobi"], jutsu: "Kamui", ultimate: "Jinchûriki du Jûbi", power: 10 },
  { name: "Pain", aliases: ["nagato", "pain tendo"], jutsu: "Shinra Tensei", ultimate: "Chibaku Tensei", power: 12 },
  { name: "Jiraiya", jutsu: "Rasengan", ultimate: "Mode ermite", power: 10 }
];

const COMBAT_ACTIONS = ["attaquer", "attaque", "jutsu", "technique", "ultime", "ultimate", "charger", "chakra", "esquiver", "esquive", "defendre", "defense", "garde", "soin", "heal", "statut", "abandonner"];
const LIST_ACTIONS = ["personnages", "liste", "combattants", "fighters", "roster"];
const PICK_ACTIONS = ["choisir", "personnage", "perso", "pick", "select", "selectionner"];

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

function findFighter(value) {
  const target = normalize(value);
  if (!target) return null;
  return FIGHTERS.find(fighter => normalize(fighter.name) === target || (fighter.aliases || []).some(alias => normalize(alias) === target)) || null;
}

function pickFighter(excludeName) {
  const excluded = findFighter(excludeName);
  const options = FIGHTERS.filter(fighter => !excluded || fighter.name !== excluded.name);
  const pool = options.length ? options : FIGHTERS;
  const selected = pool[randomInt(0, pool.length - 1)];
  return { ...selected };
}

function createPlayer(id, name, fighterName, excludeFighter) {
  const fighter = findFighter(fighterName) || pickFighter(excludeFighter);
  return {
    id: String(id),
    name: String(name || "Ninja").slice(0, 40),
    fighter: fighter.name,
    jutsu: fighter.jutsu,
    ultimate: fighter.ultimate,
    power: fighter.power,
    hp: MAX_HP,
    chakra: STARTING_CHAKRA,
    guarding: false,
    dodging: false,
    healUsed: false
  };
}

function normalizePlayer(player) {
  const value = player && typeof player === "object" ? player : {};
  const fighter = findFighter(value.fighter) || FIGHTERS[0];
  const dodging = Boolean(value.dodging);
  return {
    id: String(value.id || ""),
    name: validDisplayName(value.name, value.id) || "Ninja",
    fighter: fighter.name,
    jutsu: fighter.jutsu,
    ultimate: fighter.ultimate,
    // La puissance provient toujours de la fiche du combattant, jamais d’une valeur libre en base.
    power: clampInt(fighter.power, 8, 12, 8),
    hp: clampInt(value.hp, 0, MAX_HP, MAX_HP),
    chakra: clampInt(value.chakra, 0, MAX_CHAKRA, STARTING_CHAKRA),
    dodging,
    guarding: Boolean(value.guarding) && !dodging,
    healUsed: Boolean(value.healUsed)
  };
}

function normalizeGame(game) {
  if (!game || typeof game !== "object" || !Array.isArray(game.players) || game.players.length !== 2) return null;
  if (!["pending", "selecting", "active", "finished"].includes(game.status)) return null;
  const players = game.players.map(player => {
    if (!player || !player.id) return null;
    if (game.status === "pending") {
      return { id: String(player.id), name: validDisplayName(player.name, player.id) || "Ninja" };
    }
    if (game.status === "selecting") {
      const fighter = findFighter(player.fighter);
      return {
        id: String(player.id),
        name: validDisplayName(player.name, player.id) || "Ninja",
        fighter: fighter ? fighter.name : null
      };
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
  const filled = Math.ceil((safeHP / MAX_HP) * 10);
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
  defender.chakra = clampInt(defender.chakra, 0, MAX_CHAKRA, STARTING_CHAKRA);
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
    `❤️ Départ : ${MAX_HP} PV et ${STARTING_CHAKRA}/${MAX_CHAKRA} chakra. Limites : 0–${MAX_HP} PV et 0–${MAX_CHAKRA} chakra.`,
    `💥 Puissance : bonus fixe du combattant (+8 à +12) ajouté aux dégâts; maximum brut ${MAX_DAMAGE} dégâts par coup.`,
    `👊 Attaquer : 40–55 dégâts de base + puissance; rend jusqu’à 25 chakra (plafond ${MAX_CHAKRA}).`,
    `✨ Jutsu : coûte 50 chakra; inflige 70–90 dégâts de base + puissance.`,
    `🌪️ Ultime : coûte 120 chakra; inflige 145–175 dégâts de base + puissance.`,
    `🔵 Charger : récupère jusqu’à 70 chakra, sans dépasser ${MAX_CHAKRA}.`,
    "🛡️ Défendre : réduit de moitié le prochain coup reçu; effet consommé après ce coup.",
    "💨 Esquiver : 45 % de chance d’annuler le prochain coup; sinon il est réduit à 60 %.",
    `🩹 Soin : une seule fois par combat, coûte 60 chakra et rend jusqu’à 80 PV (maximum ${MAX_HP}).`,
    "🏆 Victoire : faire tomber les PV adverses à 0, ou gagner si l’adversaire abandonne.",
    "🚫 Une action refusée (pas assez de chakra, mauvaise commande, mauvais tour) ne consomme rien.",
    `🎭 Après acceptation, chacun choisit son personnage : ${prefix}defi personnages puis ${prefix}defi choisir Naruto. Le combat commence après les deux choix.`,
    "",
    `⚔️ Défier : ${prefix}defi @mention | ✅ Accepter : ${prefix}defi accepter | 🚫 Refuser : ${prefix}defi refuser`,
    `🎮 Actions : ${prefix}defi attaquer / jutsu / ultime / charger / defendre / esquiver / soin / statut / abandonner`,
    "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯"
  ].join("\n");
}

function firstMention(event) {
  const mentions = event && event.mentions;
  if (mentions && typeof mentions === "object") {
    const id = Object.keys(mentions)[0];
    if (id) {
      const raw = mentions[id];
      const name = typeof raw === "string" ? raw : raw && (raw.name || raw.fullName || raw.tag);
      return { id: String(id), name: name || "Ninja adverse" };
    }
  }

  const reply = event && (event.messageReply || event.replyTo || event.repliedMessage);
  const replyID = reply && (reply.senderID || reply.senderId || reply.userID || reply.userFbId);
  if (replyID && String(replyID) !== String(event.senderID || "")) {
    return { id: String(replyID), name: String(reply.senderName || reply.name || reply.fullName || "Ninja adverse") };
  }
  return null;
}

function playerIndex(game, id) {
  return game.players.findIndex(player => player.id === String(id));
}

function combatCommandsText(prefix = "!") {
  return `🎮 COMMANDES : ${prefix}defi attaquer | ${prefix}defi jutsu | ${prefix}defi ultime | ${prefix}defi charger | ${prefix}defi defendre | ${prefix}defi esquiver | ${prefix}defi soin | ${prefix}defi statut | ${prefix}defi abandonner`;
}

function statusMessage(game, prefix = "!") {
  const reminder = game && game.status === "active" ? `\n\n${combatCommandsText(prefix)}` : "";
  return `🏟️ ARENA NINJA\n${battleStatus(game)}${reminder}`;
}

function validDisplayName(value, userID) {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  if (!name || name === String(userID || "") || /^\d{6,}$/.test(name)) return null;
  return name.slice(0, 40);
}

function isGenericDisplayName(value) {
  const name = normalize(value);
  return /^(?:ninja|un ninja|ninja defieur|ninja defie|ninja defiee|ninja adverse|joueur(?: \d+)?|membre messenger)$/.test(name);
}

async function resolveDisplayName(context, userID, preferredName, fallback = "Ninja") {
  const id = String(userID || "");
  const preferred = validDisplayName(preferredName, id);
  if (preferred && !isGenericDisplayName(preferred)) {
    displayNameCache.set(id, preferred);
    if (displayNameCache.size > 1000) displayNameCache.delete(displayNameCache.keys().next().value);
    return preferred;
  }
  if (displayNameCache.has(id) && !isGenericDisplayName(displayNameCache.get(id))) return displayNameCache.get(id);
  let resolved = null;

  const usersData = context && context.usersData;
  if (!resolved && usersData && typeof usersData.getName === "function") {
    try {
      const cachedName = validDisplayName(await usersData.getName(id), id);
      if (cachedName && !isGenericDisplayName(cachedName)) resolved = cachedName;
    } catch (error) {
      console.warn("[Commande défi] Pseudo local indisponible :", error.message);
    }
  }
  if (!resolved && usersData && typeof usersData.get === "function") {
    try {
      const profile = await usersData.get(id);
      const storedName = validDisplayName(profile && (profile.name || profile.nickname || profile.fullName || profile.firstName), id);
      if (storedName && !isGenericDisplayName(storedName)) resolved = storedName;
    } catch (error) {
      console.warn("[Commande défi] Profil utilisateur local indisponible :", error.message);
    }
  }

  const api = context && context.api;
  if (!resolved && api && typeof api.getUserInfo === "function") {
    try {
      const profiles = await api.getUserInfo(id);
      const profile = profiles && (profiles[id] || profiles[Number(id)] || profiles);
      const apiName = validDisplayName(profile && (profile.name || profile.firstName), id);
      if (apiName && !isGenericDisplayName(apiName)) resolved = apiName;
    } catch (error) {
      console.warn("[Commande défi] Pseudo Facebook indisponible :", error.message);
    }
  }
  if (resolved) {
    displayNameCache.set(id, resolved);
    if (displayNameCache.size > 1000) displayNameCache.delete(displayNameCache.keys().next().value);
    return resolved;
  }
  return validDisplayName(fallback, id) || "Joueur";
}

function fighterListText(prefix = "!") {
  const roster = FIGHTERS.map((fighter, index) => `${index + 1}. ${fighter.name} · puissance +${fighter.power}\n   ✨ ${fighter.jutsu} | 🌪️ ${fighter.ultimate}`).join("\n");
  return `╭━━━〔 🎴 CHOISIS TON PERSONNAGE 〕━━━╮\n${roster}\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\nTape ${prefix}defi choisir <nom> — exemple : ${prefix}defi choisir Naruto.`;
}

function selectionStatus(game, prefix = "!") {
  const players = game.players.map(player => `🥷 ${player.name} — ${player.fighter ? `✅ ${player.fighter}` : "⏳ personnage à choisir"}`).join("\n");
  return `🎭 SÉLECTION DES PERSONNAGES\n${players}\n\n📜 Liste : ${prefix}defi personnages\n🎴 Choisir : ${prefix}defi choisir <nom> (exemple : ${prefix}defi choisir Naruto).\nLe combat commence après le choix des deux joueurs.`;
}

function challengeMessage(challengerName, opponentName, prefix) {
  return `⚔️ ${challengerName} défie ${opponentName} !\n⏳ Le défi expire dans 15 minutes.\n✅ ${opponentName}, écris ${prefix}defi accepter pour accepter puis choisir ton personnage.\n🚫 Pour refuser : ${prefix}defi refuser.`;
}

function openChallengeMessage(challengerName, prefix) {
  return `⚔️ ${challengerName} ouvre un défi dans cette conversation !\n✅ Un autre membre peut rejoindre le combat en écrivant ${prefix}defi accepter (ou ${prefix}defi accepté).\n⏳ Le défi expire dans 15 minutes.`;
}

module.exports = {
  config: {
    name: "defi",
    aliases: ["défi"],
    version: "6.2.0",
    author: "Diwate",
    description: "Combat ninja avec pseudos, personnages sélectionnables et statistiques renforcées",
    category: "Divertissement",
    usages: "defi [@mention | accepter | personnages | choisir <nom> | action]",
    role: 0
  },
  STORAGE_KEY,
  FIGHTERS,
  MAX_HP,
  MAX_CHAKRA,
  STARTING_CHAKRA,
  MAX_DAMAGE,
  normalize,
  clampInt,
  randomInt,
  findFighter,
  createPlayer,
  normalizePlayer,
  normalizeGame,
  getGames,
  saveGames,
  healthBar,
  battleStatus,
  combatCommandsText,
  applyDamage,
  rulesText,
  fighterListText,
  selectionStatus,
  resolveDisplayName,

  onStart: async function ({ api, message, event, args, prefix, globalData, usersData }) {
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
      const context = { api, usersData };
      const games = await getGames(globalData);
      let game = games[threadID];

      if (game) {
        let namesUpdated = false;
        for (let index = 0; index < game.players.length; index++) {
          const player = game.players[index];
          if (player.id !== "*") {
            const preferredName = player.id === userID ? event.senderName : null;
            const resolvedName = await resolveDisplayName(context, player.id, preferredName, player.name || `Joueur ${index + 1}`);
            if (resolvedName !== player.name) {
              player.name = resolvedName;
              namesUpdated = true;
            }
          }
        }
        if (namesUpdated) await saveGames(globalData, games);
      }

      if (game && ["pending", "selecting"].includes(game.status) && Date.now() - game.createdAt > PENDING_TIMEOUT) {
        delete games[threadID];
        await saveGames(globalData, games);
        game = null;
      }

      if (["aide", "help", "regle", "regles", "rules"].includes(action)) {
        return send({ api, message, event }, rulesText(commandPrefix));
      }
      if (LIST_ACTIONS.includes(action) && words.length === 1) {
        return send({ api, message, event }, fighterListText(commandPrefix));
      }

      if (["accepter", "accepte", "acceptee", "accept", "accepted", "oui"].includes(action)) {
        if (!game || game.status !== "pending") return send({ api, message, event }, "ℹ️ Aucun défi en attente dans cette conversation.");
        if (game.players[0].id === userID) return send({ api, message, event }, "😅 La personne qui a lancé le défi ne peut pas l’accepter à sa place.");
        if (game.players[1].id !== "*" && game.players[1].id !== userID) return send({ api, message, event }, "⛔ Seule la personne défiée peut accepter ce combat.");
        if (Date.now() - game.createdAt > PENDING_TIMEOUT) {
          delete games[threadID];
          await saveGames(globalData, games);
          return send({ api, message, event }, `⌛ Ce défi a expiré. Lance-en un nouveau avec ${commandPrefix}defi @mention.`);
        }
        const acceptedName = await resolveDisplayName(context, userID, event.senderName, game.players[1].id === "*" ? "Ninja défié" : game.players[1].name);
        const challengerName = validDisplayName(game.players[0].name, game.players[0].id) || "Ninja défieur";
        game.players = [
          { id: String(game.players[0].id), name: challengerName, fighter: null },
          { id: userID, name: acceptedName, fighter: null }
        ];
        game.status = "selecting";
        game.createdAt = Date.now();
        await saveGames(globalData, games);
        await send({ api, message, event }, `✅ ${acceptedName} accepte le défi de ${challengerName} !\n\n${selectionStatus(game, commandPrefix)}`);
        return send({ api, message, event }, fighterListText(commandPrefix));
      }

      if (["refuser", "refuse", "annuler"].includes(action)) {
        if (!game || !["pending", "selecting"].includes(game.status)) return send({ api, message, event }, "ℹ️ Aucun défi en attente à refuser.");
        if (action !== "annuler") {
          const mayRefuse = game.status === "pending" ? game.players[1].id === userID : playerIndex(game, userID) !== -1;
          if (!mayRefuse) return send({ api, message, event }, "⛔ Seule la personne défiée ou un joueur accepté peut refuser le défi.");
        }
        if (action === "annuler" && game.players[0].id !== userID) return send({ api, message, event }, "⛔ Seule la personne qui a lancé le défi peut l’annuler.");
        delete games[threadID];
        await saveGames(globalData, games);
        return send({ api, message, event }, "🚫 Le défi a été refusé/annulé.");
      }

      if (action === "" && !mention) {
        if (game && game.status === "pending") {
          const pendingText = game.players[1].id === "*"
            ? `⏳ Défi ouvert de ${game.players[0].name} en attente. Un autre membre peut écrire ${commandPrefix}defi accepter ou ${commandPrefix}defi accepté.`
            : `⏳ Défi en attente de ${game.players[1].name}. Relis les règles avec ${commandPrefix}defi règles.`;
          await send({ api, message, event }, rulesText(commandPrefix));
          return send({ api, message, event }, pendingText);
        }
        if (game && game.status === "selecting") {
          await send({ api, message, event }, selectionStatus(game, commandPrefix));
          return send({ api, message, event }, fighterListText(commandPrefix));
        }
        if (game && game.status === "active") return send({ api, message, event }, statusMessage(game, commandPrefix));
        const challengerName = await resolveDisplayName(context, userID, event.senderName, "Un ninja");
        games[threadID] = {
          status: "pending",
          createdAt: Date.now(),
          players: [
            { id: userID, name: challengerName },
            { id: "*", name: "Un autre membre" }
          ]
        };
        await saveGames(globalData, games);
        await send({ api, message, event }, rulesText(commandPrefix));
        return send({ api, message, event }, openChallengeMessage(challengerName, commandPrefix));
      }

      const isFighterRequest = Boolean(findFighter(words.join(" ")));
      if (mention && !COMBAT_ACTIONS.includes(action) && !LIST_ACTIONS.includes(action) && !PICK_ACTIONS.includes(action) && !isFighterRequest) {
        if (mention.id === userID) return send({ api, message, event }, "😅 Tu ne peux pas te défier toi-même.");
        if (game && ["pending", "selecting", "active"].includes(game.status)) return send({ api, message, event }, "⚔️ Un défi ou un combat est déjà en cours dans cette conversation.");
        const challengerName = await resolveDisplayName(context, userID, event.senderName, "Ninja défieur");
        const targetName = await resolveDisplayName(context, mention.id, mention.name, "Ninja défié");
        games[threadID] = {
          status: "pending",
          createdAt: Date.now(),
          players: [
            { id: userID, name: challengerName },
            { id: mention.id, name: targetName }
          ]
        };
        await saveGames(globalData, games);
        await send({ api, message, event }, rulesText(commandPrefix));
        return send({ api, message, event }, challengeMessage(challengerName, targetName, commandPrefix));
      }

      if (!game) {
        await send({ api, message, event }, rulesText(commandPrefix));
        return send({ api, message, event }, `🥷 Pour lancer un combat, utilise ${commandPrefix}defi @mention ou écris ${commandPrefix}defi pour ouvrir un défi au groupe.`);
      }
      if (game.status === "pending") return send({ api, message, event }, `⏳ Défi en attente de ${game.players[1].name}. Relis les règles avec ${commandPrefix}defi règles; la personne défiée peut accepter ou refuser.`);
      if (game.status === "selecting") {
        const currentIndex = playerIndex(game, userID);
        if (currentIndex === -1) return send({ api, message, event }, "⛔ Tu ne participes pas à la sélection des personnages.");
        if (action === "statut" || action === "") {
          await send({ api, message, event }, selectionStatus(game, commandPrefix));
          return send({ api, message, event }, fighterListText(commandPrefix));
        }

        const requestedName = PICK_ACTIONS.includes(action)
          ? words.slice(1).join(" ").trim()
          : words.join(" ").trim();
        const selectedFighter = findFighter(requestedName);
        if (!selectedFighter) {
          const hint = requestedName ? `❓ Personnage inconnu : « ${requestedName} ».` : "❓ Indique le nom du personnage à choisir.";
          return send({ api, message, event }, `${hint}\n${selectionStatus(game, commandPrefix)}\n\n${fighterListText(commandPrefix)}`);
        }

        const player = game.players[currentIndex];
        const previousFighter = player.fighter;
        player.fighter = selectedFighter.name;
        if (game.players.every(item => Boolean(findFighter(item.fighter)))) {
          game.players = game.players.map(item => createPlayer(item.id, item.name, item.fighter));
          game.status = "active";
          game.turn = 0;
          game.round = 1;
          await saveGames(globalData, games);
          const [first, second] = game.players;
          return send({ api, message, event }, `🔥 LES DEUX NINJAS SONT PRÊTS !\n🥷 ${first.name} choisit ${first.fighter} — ✨ ${first.jutsu}, 🌪️ ${first.ultimate}.\n🥷 ${second.name} choisit ${second.fighter} — ✨ ${second.jutsu}, 🌪️ ${second.ultimate}.\n\n${statusMessage(game, commandPrefix)}\n\n🎮 Premier tour : ${first.name}. Une action valide par tour; limites : ${MAX_HP} PV et ${MAX_CHAKRA} chakra.`);
        }

        await saveGames(globalData, games);
        const otherPlayer = game.players[1 - currentIndex];
        const changeText = previousFighter ? ` (remplace ${previousFighter})` : "";
        return send({ api, message, event }, `✅ ${player.name} choisit ${selectedFighter.name}${changeText} — ✨ ${selectedFighter.jutsu}, 🌪️ ${selectedFighter.ultimate}.\n⏳ En attente du choix de ${otherPlayer.name}.\n\n${selectionStatus(game, commandPrefix)}`);
      }
      if (game.status !== "active") {
        if (action === "statut") return send({ api, message, event }, statusMessage(game, commandPrefix));
        return send({ api, message, event }, `🏁 Ce combat est terminé. Lance un nouveau défi avec ${commandPrefix}defi @mention.`);
      }

      const currentIndex = playerIndex(game, userID);
      if (currentIndex === -1) return send({ api, message, event }, "⛔ Tu ne participes pas au combat actif de cette conversation.");
      if (action === "statut") return send({ api, message, event }, statusMessage(game, commandPrefix));
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
      fighter.chakra = clampInt(fighter.chakra, 0, MAX_CHAKRA, STARTING_CHAKRA);
      let actionText = "";
      let damageInfo = null;

      if (["attaquer", "attaque"].includes(action)) {
        const base = randomInt(40, 55);
        damageInfo = applyDamage(fighter, opponent, base + fighter.power);
        const oldChakra = fighter.chakra;
        fighter.chakra = clampInt(fighter.chakra + 25, 0, MAX_CHAKRA, MAX_CHAKRA);
        const gained = fighter.chakra - oldChakra;
        actionText = `👊 ${fighter.name} (${fighter.fighter}) frappe : ${base} base + ${fighter.power} puissance = ${base + fighter.power} avant défense; ${damageInfo.damage} dégâts infligés. 🔵 Chakra +${gained} (${fighter.chakra}/${MAX_CHAKRA}).`;
      } else if (["charger", "chakra"].includes(action)) {
        if (fighter.chakra >= MAX_CHAKRA) return send({ api, message, event }, `🔵 Ton chakra est déjà au maximum (${MAX_CHAKRA}/${MAX_CHAKRA}). Aucun tour n’est consommé.`);
        const gained = Math.min(70, MAX_CHAKRA - fighter.chakra);
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
        if (fighter.chakra < 50) return send({ api, message, event }, `🔵 Chakra insuffisant : ${fighter.chakra}/50. Aucune ressource ni tour n’est consommé. Utilise ${commandPrefix}defi charger.`);
        const base = randomInt(70, 90);
        fighter.chakra = clampInt(fighter.chakra - 50, 0, MAX_CHAKRA, 0);
        damageInfo = applyDamage(fighter, opponent, base + fighter.power);
        actionText = `✨ ${fighter.name} lance ${fighter.jutsu} : ${base} base + ${fighter.power} puissance = ${base + fighter.power} avant défense; ${damageInfo.damage} dégâts. 🔵 Chakra −50 (${fighter.chakra}/${MAX_CHAKRA}).`;
      } else if (["ultime", "ultimate"].includes(action)) {
        if (fighter.chakra < 120) return send({ api, message, event }, `🌪️ Chakra insuffisant : ${fighter.chakra}/120. Aucune ressource ni tour n’est consommé. Utilise ${commandPrefix}defi charger.`);
        const base = randomInt(145, 175);
        fighter.chakra = clampInt(fighter.chakra - 120, 0, MAX_CHAKRA, 0);
        damageInfo = applyDamage(fighter, opponent, base + fighter.power);
        actionText = `🌪️ ULTIME ${fighter.ultimate} ! ${base} base + ${fighter.power} puissance = ${base + fighter.power} avant défense; ${damageInfo.damage} dégâts. 🔵 Chakra −120 (${fighter.chakra}/${MAX_CHAKRA}).`;
      } else if (["soin", "heal"].includes(action)) {
        if (fighter.healUsed) return send({ api, message, event }, "🩹 Soin déjà utilisé. Aucune ressource ni tour n’est consommé.");
        if (fighter.chakra < 60) return send({ api, message, event }, `🩹 Chakra insuffisant : ${fighter.chakra}/60. Aucune ressource ni tour n’est consommé.`);
        if (fighter.hp >= MAX_HP) return send({ api, message, event }, "❤️ Tes PV sont déjà au maximum. Le soin n’est pas consommé et tu gardes ton tour.");
        const before = fighter.hp;
        const restored = Math.min(80, MAX_HP - fighter.hp);
        fighter.chakra = clampInt(fighter.chakra - 60, 0, MAX_CHAKRA, 0);
        fighter.hp = clampInt(fighter.hp + restored, 0, MAX_HP, MAX_HP);
        fighter.healUsed = true;
        actionText = `🩹 ${fighter.name} récupère ${fighter.hp - before} PV (${fighter.hp}/${MAX_HP}); chakra −60 (${fighter.chakra}/${MAX_CHAKRA}).`;
      } else {
        return send({ api, message, event }, `🎮 Action inconnue. Écris ${commandPrefix}defi pour lire les règles et les actions.`);
      }

      if (damageInfo && damageInfo.result) actionText += `\n${damageInfo.result}`;
      if (opponent.hp <= 0) {
        game.status = "finished";
        game.winner = fighter.id;
        await saveGames(globalData, games);
        return send({ api, message, event }, `💥 ${actionText}\n\n${statusMessage(game, commandPrefix)}\n\n🏆 ${fighter.name} remporte le combat !`);
      }

      game.turn = 1 - currentIndex;
      if (currentIndex === 1) game.round = clampInt(game.round + 1, 1, Number.MAX_SAFE_INTEGER, 1);
      await saveGames(globalData, games);
      return send({ api, message, event }, `${actionText}\n\n${statusMessage(game, commandPrefix)}\n\n🎮 À toi, ${opponent.name} !`);
    } catch (error) {
      console.error("[Commande défi]", error.stack || error);
      return send({ api, message, event }, "❌ Le combat a rencontré un problème. Les PV/chakra n’ont pas été modifiés par une action invalide; réessaie ou relance un défi.");
    } finally {
      release();
    }
  }
};

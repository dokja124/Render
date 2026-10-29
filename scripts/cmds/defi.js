const { send } = require("./lib/messenger");

const STORAGE_KEY = "messengerArenaGames";
const PENDING_TIMEOUT = 15 * 60 * 1000;
let memoryGames = {};

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

const HELP = [
  "🥷 ARENA NINJA — COMBAT AU TOUR PAR TOUR",
  "",
  "⚔️ Défier quelqu’un : !defi @mention",
  "✅ Répondre : !defi accepter  |  Refuser : !defi refuser",
  "🎮 À ton tour, choisis une action :",
  "• !defi attaquer — frappe et gagne un peu de chakra",
  "• !defi jutsu — technique spéciale (30 chakra)",
  "• !defi ultime — technique ultime (70 chakra)",
  "• !defi charger — récupère 35 chakra",
  "• !defi esquiver — tente d’éviter la prochaine attaque",
  "• !defi defendre — réduit les dégâts du prochain coup",
  "• !defi soin — récupère des PV une fois (35 chakra)",
  "• !defi statut — affiche PV, chakra et tour actuel",
  "• !defi abandonner — met fin au combat",
  "",
  "Chaque joueur joue à son tour. Les combats sont uniquement textuels dans Messenger."
].join("\n");

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
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

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickFighter() {
  return FIGHTERS[Math.floor(Math.random() * FIGHTERS.length)];
}

function createPlayer(id, name) {
  const fighter = pickFighter();
  return {
    id: String(id),
    name: String(name || "Ninja").slice(0, 40),
    fighter: fighter.name,
    jutsu: fighter.jutsu,
    ultimate: fighter.ultimate,
    power: fighter.power,
    hp: 100,
    chakra: 30,
    guarding: false,
    dodging: false,
    healUsed: false
  };
}

async function getGames(globalData) {
  if (!globalData || typeof globalData.get !== "function") return memoryGames;
  const saved = await globalData.get(STORAGE_KEY, "data", {});
  memoryGames = saved && typeof saved === "object" ? saved : {};
  return memoryGames;
}

async function saveGames(globalData, games) {
  memoryGames = games && typeof games === "object" ? games : {};
  if (globalData && typeof globalData.get === "function" && typeof globalData.set === "function") {
    await globalData.get(STORAGE_KEY, "data", memoryGames);
    await globalData.set(STORAGE_KEY, memoryGames, "data");
  }
  return memoryGames;
}

function healthBar(hp) {
  const filled = Math.max(0, Math.min(10, Math.ceil(hp / 10)));
  return "🟩".repeat(filled) + "⬛".repeat(10 - filled) + ` ${hp}/100 PV`;
}

function battleStatus(game) {
  if (!game || !Array.isArray(game.players)) return "Aucun combat actif.";
  const [a, b] = game.players;
  return [
    `🥷 ${a.fighter} — ${a.name}`,
    healthBar(a.hp) + ` | Chakra ${a.chakra}/100`,
    "",
    `🥷 ${b.fighter} — ${b.name}`,
    healthBar(b.hp) + ` | Chakra ${b.chakra}/100`,
    "",
    game.status === "active" ? `⚡ Tour de ${game.players[game.turn].name}` : "🏁 Combat terminé"
  ].join("\n");
}

function applyDamage(attacker, defender, baseDamage) {
  let damage = baseDamage;
  let result = "";
  if (defender.dodging) {
    if (Math.random() < 0.45) {
      damage = 0;
      result = `💨 ${defender.name} esquive complètement !`;
    } else {
      damage = Math.ceil(damage * 0.6);
      result = `💨 L’esquive de ${defender.name} réduit les dégâts.`;
    }
    defender.dodging = false;
  }
  if (damage > 0 && defender.guarding) {
    damage = Math.ceil(damage * 0.5);
    result = `🛡️ La défense de ${defender.name} bloque une partie du coup.`;
    defender.guarding = false;
  }
  defender.hp = Math.max(0, defender.hp - damage);
  return { damage, result };
}

function statusMessage(game) {
  return `🏟️ ARENA NINJA\n${battleStatus(game)}`;
}

module.exports = {
  config: {
    name: "defi",
    version: "4.0.0",
    author: "Diwate",
    description: "Défie un membre dans un combat ninja au tour par tour",
    category: "Divertissement",
    usages: "defi @mention | defi attaquer/jutsu/ultime/...",
    role: 0
  },
  STORAGE_KEY,
  FIGHTERS,
  normalize,
  firstMention,
  createPlayer,
  getGames,
  saveGames,
  healthBar,
  battleStatus,
  applyDamage,

  onStart: async function ({ api, message, event, args, prefix, globalData }) {
    try {
      const threadID = String(event && event.threadID || "");
      const userID = String(event && event.senderID || "");
      if (!threadID || !userID) return send({ api, message, event }, "❌ Conversation ou joueur impossible à identifier.");
      const words = Array.isArray(args) ? args : [];
      const action = normalize(words[0] || "");
      const mention = firstMention(event);
      const games = await getGames(globalData);
      let game = games[threadID];

      if (["aide", "help"].includes(action) || action === "" && !mention) {
        return send({ api, message, event }, HELP.replace(/!/g, prefix || "!"));
      }

      if (["accepter", "accept", "oui"].includes(action)) {
        if (!game || game.status !== "pending") return send({ api, message, event }, "ℹ️ Aucun défi en attente dans cette conversation.");
        if (game.players[1].id !== userID) return send({ api, message, event }, "⛔ Seule la personne défiée peut accepter ce combat.");
        if (Date.now() - game.createdAt > PENDING_TIMEOUT) {
          delete games[threadID];
          await saveGames(globalData, games);
          return send({ api, message, event }, "⌛ Ce défi a expiré. Lance-en un nouveau avec !defi @mention.");
        }
        game.players = [
          createPlayer(game.players[0].id, game.players[0].name),
          createPlayer(game.players[1].id, game.players[1].name)
        ];
        if (game.players[0].fighter === game.players[1].fighter) game.players[1] = createPlayer(game.players[1].id, game.players[1].name);
        game.status = "active";
        game.turn = 0;
        game.round = 1;
        await saveGames(globalData, games);
        return send({ api, message, event }, `🔥 LE COMBAT COMMENCE !\n🥷 ${game.players[0].name} choisit ${game.players[0].fighter} (${game.players[0].jutsu}).\n🥷 ${game.players[1].name} choisit ${game.players[1].fighter} (${game.players[1].jutsu}).\n\n${statusMessage(game)}\n\n🎮 Premier tour : ${game.players[0].name}.`);
      }

      if (["refuser", "refuse", "annuler"].includes(action)) {
        if (!game || game.status !== "pending") return send({ api, message, event }, "ℹ️ Aucun défi en attente à refuser.");
        if (action !== "annuler" && game.players[1].id !== userID) return send({ api, message, event }, "⛔ Seule la personne défiée peut refuser le défi.");
        if (action === "annuler" && game.players[0].id !== userID) return send({ api, message, event }, "⛔ Seule la personne qui a lancé le défi peut l’annuler.");
        delete games[threadID];
        await saveGames(globalData, games);
        return send({ api, message, event }, "🚫 Le défi a été refusé/annulé.");
      }

      if (mention && !["attaquer", "attaque", "jutsu", "ultime", "charger", "esquiver", "defendre", "soin", "statut", "abandonner"].includes(action)) {
        if (mention.id === userID) return send({ api, message, event }, "😅 Tu ne peux pas te défier toi-même.");
        if (game && ["pending", "active"].includes(game.status)) return send({ api, message, event }, "⚔️ Un défi ou un combat est déjà en cours dans cette conversation.");
        const targetName = mention.name || "Ninja adverse";
        games[threadID] = {
          status: "pending",
          createdAt: Date.now(),
          players: [
            { id: userID, name: String(event.senderName || "Ninja").slice(0, 40) },
            { id: mention.id, name: String(targetName).slice(0, 40) }
          ]
        };
        await saveGames(globalData, games);
        return send({ api, message, event }, `⚔️ ${event.senderName || "Un ninja"} défie ${targetName} !\n⏳ Le défi expire dans 15 minutes.\n✅ ${targetName}, écris ${prefix || "!"}defi accepter pour commencer, ou ${prefix || "!"}defi refuser.`);
      }

      if (!game) return send({ api, message, event }, `🥷 Aucun combat en cours. Défie un membre avec ${prefix || "!"}defi @mention.`);
      if (game.status === "pending") return send({ api, message, event }, `⏳ Défi en attente de ${game.players[1].name}. Écris ${prefix || "!"}defi statut pour l’aide.`);
      if (game.status !== "active") {
        if (action === "statut") return send({ api, message, event }, statusMessage(game));
        return send({ api, message, event }, `🏁 Ce combat est terminé. Lance un nouveau défi avec ${prefix || "!"}defi @mention.`);
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
      let actionText = "";
      let damageInfo = null;

      if (["attaquer", "attaque"].includes(action)) {
        damageInfo = applyDamage(fighter, opponent, randomInt(12, 18) + fighter.power);
        fighter.chakra = Math.min(100, fighter.chakra + 15);
        actionText = `👊 ${fighter.name} (${fighter.fighter}) frappe ! Dégâts : ${damageInfo.damage}. Chakra +15.`;
      } else if (["charger", "chakra"].includes(action)) {
        const gained = Math.min(35, 100 - fighter.chakra);
        fighter.chakra += gained;
        actionText = `🔵 ${fighter.name} concentre son chakra : +${gained} (maintenant ${fighter.chakra}/100).`;
      } else if (["esquiver", "esquive"].includes(action)) {
        fighter.dodging = true;
        actionText = `💨 ${fighter.name} se prépare à esquiver la prochaine attaque.`;
      } else if (["defendre", "defense", "garde"].includes(action)) {
        fighter.guarding = true;
        actionText = `🛡️ ${fighter.name} se met en garde. Le prochain coup subi sera réduit.`;
      } else if (["jutsu", "technique"].includes(action)) {
        if (fighter.chakra < 30) return send({ api, message, event }, `🔵 Chakra insuffisant : ${fighter.chakra}/30. Utilise ${prefix || "!"}defi charger.`);
        fighter.chakra -= 30;
        damageInfo = applyDamage(fighter, opponent, randomInt(26, 34) + fighter.power);
        actionText = `✨ ${fighter.name} lance ${fighter.jutsu} ! Dégâts : ${damageInfo.damage}.`;
      } else if (["ultime", "ultimate"].includes(action)) {
        if (fighter.chakra < 70) return send({ api, message, event }, `🌪️ Il faut 70 chakra pour l’ultime (${fighter.chakra}/70). Charge avec ${prefix || "!"}defi charger.`);
        fighter.chakra -= 70;
        damageInfo = applyDamage(fighter, opponent, randomInt(50, 62) + fighter.power);
        actionText = `🌪️ ATTAQUE ULTIME ! ${fighter.name} déclenche ${fighter.ultimate} ! Dégâts : ${damageInfo.damage}.`;
      } else if (["soin", "heal"].includes(action)) {
        if (fighter.healUsed) return send({ api, message, event }, "🩹 Tu as déjà utilisé ton soin dans ce combat.");
        if (fighter.chakra < 35) return send({ api, message, event }, `🩹 Il faut 35 chakra pour se soigner (${fighter.chakra}/35).`);
        const before = fighter.hp;
        fighter.chakra -= 35;
        fighter.hp = Math.min(100, fighter.hp + 30);
        fighter.healUsed = true;
        actionText = `🩹 ${fighter.name} récupère ${fighter.hp - before} PV.`;
      } else {
        return send({ api, message, event }, `🎮 Action inconnue. Écris ${prefix || "!"}defi pour voir les actions possibles.`);
      }

      if (damageInfo && damageInfo.result) actionText += `\n${damageInfo.result}`;
      if (opponent.hp <= 0) {
        game.status = "finished";
        game.winner = fighter.id;
        await saveGames(globalData, games);
        return send({ api, message, event }, `💥 ${actionText}\n\n${statusMessage(game)}\n\n🏆 ${fighter.name} remporte le combat !`);
      }

      game.turn = 1 - currentIndex;
      game.round = (game.round || 1) + 1;
      await saveGames(globalData, games);
      return send({ api, message, event }, `${actionText}\n\n${statusMessage(game)}\n\n🎮 À toi, ${opponent.name} !`);
    } catch (error) {
      console.error("[Commande défi]", error.stack || error);
      return send({ api, message, event }, "❌ Le combat a rencontré un problème. Réessaie ou relance un défi.");
    }
  }
};
    

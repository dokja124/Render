const STORAGE_KEY = "messengerArenaGames";
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

function pickFighter() {
  return FIGHTERS[Math.floor(Math.random() * FIGHTERS.length)];
}

function createPlayer(id, name) {
  const fighter = pickFighter();
  return {
    id: String(id), name: String(name || "Ninja").slice(0, 40),
    fighter: fighter.name, jutsu: fighter.jutsu, ultimate: fighter.ultimate, power: fighter.power,
    hp: 100, chakra: 30, guarding: false, dodging: false, healUsed: false
  };
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

module.exports = { STORAGE_KEY, FIGHTERS, getGames, saveGames, pickFighter, createPlayer, healthBar, battleStatus };

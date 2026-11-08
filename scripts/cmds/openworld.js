"use strict";

const { send } = require("./lib/messenger");
const fs = require("fs");
const path = require("path");

const DATA_KEY = "openWorldPlayersV1";
const MAX_STAMINA = 100;
const STAMINA_PER_EXPEDITION = 15;
const STAMINA_REGEN_MS = 2 * 60 * 1000;
const MAX_PETS = 3;
let commandQueue = Promise.resolve();
const IMAGE_DIR = path.join(__dirname, "assets", "openworld");
const IMAGE_FILES = {
  forest: "forest.jpg", coast: "coast.jpg", mountains: "mountains.jpg", desert: "desert.jpg", ruins: "ruins.jpg",
  combat: "combat.jpg", animal: "animal.jpg", treasure: "treasure.jpg", hazard: "hazard.jpg", resource: "resource.jpg", camp: "camp.jpg", quest: "quest.jpg"
};
const ZONE_IMAGES = { foret: "forest", rivages: "coast", montagnes: "mountains", desert: "desert", ruines: "ruins" };

const ZONES = [
  {
    id: "foret", name: "Forêt d’Émeraude", minLevel: 1,
    aliases: ["foret", "emeraude", "lisiere", "bois"],
    description: "Un sous-bois lumineux où rôdent des créatures sauvages.",
    weather: ["Brume légère", "Pluie fine", "Soleil filtré", "Vent doux"],
    enemies: ["loup", "sanglier", "bandit"], resources: ["herbe", "bois", "eau"]
  },
  {
    id: "rivages", name: "Côte des Brumes", minLevel: 3,
    aliases: ["cote", "rivage", "brumes", "plage"],
    description: "Des falaises salées, des grottes et des plages battues par les vagues.",
    weather: ["Embruns salés", "Ciel couvert", "Grande marée", "Brise marine"],
    enemies: ["crabe", "naga", "pirate"], resources: ["eau", "herbe", "cuir"]
  },
  {
    id: "montagnes", name: "Monts du Tonnerre", minLevel: 5,
    aliases: ["montagne", "monts", "tonnerre", "pics"],
    description: "Des cols escarpés où l’air se raréfie et les orages grondent.",
    weather: ["Orage lointain", "Neige sèche", "Vent violent", "Éclaircie"],
    enemies: ["ours", "golem", "rapace"], resources: ["minerai", "cristal", "eau"]
  },
  {
    id: "desert", name: "Désert des Cendres", minLevel: 8,
    aliases: ["desert", "cendres", "dunes"],
    description: "Un océan de dunes, de ruines ensevelies et de chaleur écrasante.",
    weather: ["Chaleur accablante", "Tempête de sable", "Nuit glaciale", "Soleil brûlant"],
    enemies: ["scorpion", "serpent", "garde"], resources: ["minerai", "cristal", "eau"]
  },
  {
    id: "ruines", name: "Ruines de l’Aube", minLevel: 12,
    aliases: ["ruine", "aube", "ancien temple", "temple"],
    description: "Une cité oubliée, envahie de racines et de magie ancienne.",
    weather: ["Poussière ancienne", "Lueurs bleues", "Silence étrange", "Pluie d’étoiles"],
    enemies: ["spectre", "sentinelle", "dragonnet"], resources: ["cristal", "minerai", "herbe"]
  }
];

const ENEMIES = {
  loup: { name: "Loup des bois", type: "bête", hp: 42, attack: 8, defense: 2, xp: 28, gold: 12, drops: ["viande", "cuir"] },
  sanglier: { name: "Sanglier furieux", type: "bête", hp: 54, attack: 10, defense: 3, xp: 34, gold: 15, drops: ["viande", "cuir"] },
  bandit: { name: "Éclaireur bandit", type: "humain", hp: 48, attack: 9, defense: 3, xp: 32, gold: 20, drops: ["eau", "cuir"] },
  crabe: { name: "Crabe cuirassé", type: "bête", hp: 62, attack: 11, defense: 5, xp: 42, gold: 18, drops: ["cuir", "eau"] },
  naga: { name: "Naga des marées", type: "créature", hp: 70, attack: 13, defense: 4, xp: 50, gold: 23, drops: ["eau", "cristal"] },
  pirate: { name: "Pilleur des côtes", type: "humain", hp: 65, attack: 12, defense: 4, xp: 47, gold: 30, drops: ["viande", "cuir"] },
  ours: { name: "Ours des cimes", type: "bête", hp: 88, attack: 16, defense: 6, xp: 66, gold: 30, drops: ["viande", "cuir"] },
  golem: { name: "Golem de schiste", type: "élémentaire", hp: 105, attack: 15, defense: 9, xp: 75, gold: 35, drops: ["minerai", "cristal"] },
  rapace: { name: "Rapace des neiges", type: "bête", hp: 78, attack: 18, defense: 4, xp: 68, gold: 32, drops: ["viande", "cuir"] },
  scorpion: { name: "Scorpion cendré", type: "bête", hp: 100, attack: 19, defense: 6, xp: 85, gold: 40, drops: ["minerai", "cuir"] },
  serpent: { name: "Serpent des dunes", type: "bête", hp: 92, attack: 20, defense: 5, xp: 82, gold: 42, drops: ["eau", "cristal"] },
  garde: { name: "Gardien des sables", type: "humain", hp: 112, attack: 18, defense: 8, xp: 92, gold: 55, drops: ["minerai", "eau"] },
  spectre: { name: "Spectre de l’Aube", type: "esprit", hp: 130, attack: 24, defense: 8, xp: 120, gold: 65, drops: ["cristal", "herbe"] },
  sentinelle: { name: "Sentinelle antique", type: "construct", hp: 155, attack: 22, defense: 12, xp: 135, gold: 75, drops: ["minerai", "cristal"] },
  dragonnet: { name: "Dragonnet des ruines", type: "dragon", hp: 145, attack: 27, defense: 9, xp: 150, gold: 90, drops: ["cristal", "viande"] }
};

const ITEMS = {
  potion: { name: "Potion de soin", emoji: "🧪" },
  herbe: { name: "Herbe médicinale", emoji: "🌿" },
  eau: { name: "Eau pure", emoji: "💧" },
  bois: { name: "Bois solide", emoji: "🪵" },
  minerai: { name: "Minerai", emoji: "⛏️" },
  cristal: { name: "Cristal ancien", emoji: "💎" },
  viande: { name: "Viande", emoji: "🍖" },
  cuir: { name: "Cuir", emoji: "🟫" }
};

const ANIMALS = {
  loup: { name: "Loup des brumes", emoji: "🐺", attack: 3, defense: 1, chance: 0.36 },
  renard: { name: "Renard roux", emoji: "🦊", attack: 2, defense: 1, chance: 0.48 },
  hibou: { name: "Hibou veilleur", emoji: "🦉", attack: 1, defense: 2, chance: 0.54 },
  tortue: { name: "Tortue des rochers", emoji: "🐢", attack: 1, defense: 3, chance: 0.44 },
  lynx: { name: "Lynx argenté", emoji: "🐈", attack: 4, defense: 1, chance: 0.28 }
};

const QUESTS = [
  { id: "explore3", title: "Cartographe en herbe", description: "Termine 3 explorations.", kind: "explore", target: "any", amount: 3, xp: 65, gold: 30 },
  { id: "hunt2", title: "La piste des bêtes", description: "Vaincs 2 créatures ou ennemis.", kind: "kill", target: "any", amount: 2, xp: 75, gold: 35 },
  { id: "herbs4", title: "Remède de voyage", description: "Récolte 4 herbes médicinales.", kind: "gather", target: "herbe", amount: 4, xp: 60, gold: 28 },
  { id: "treasure1", title: "Une rumeur dorée", description: "Découvre un trésor pendant une expédition.", kind: "treasure", target: "any", amount: 1, xp: 85, gold: 45 },
  { id: "ore3", title: "Les forges attendent", description: "Récolte 3 minerais.", kind: "gather", target: "minerai", amount: 3, xp: 70, gold: 38 },
  { id: "explore5", title: "Au-delà de l’horizon", description: "Termine 5 explorations.", kind: "explore", target: "any", amount: 5, xp: 120, gold: 65 }
];

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function boundedInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function sample(items, count) {
  const pool = items.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

function xpForNextLevel(level) {
  return 100 + Math.max(1, boundedInt(level, 1, 100, 1)) * 50;
}

function makeQuestOffers() {
  return sample(QUESTS, 3).map(quest => quest.id);
}

function createPlayer(userID, name, now = Date.now()) {
  return {
    version: 1,
    userID: String(userID),
    name: String(name || "Voyageur").slice(0, 40),
    level: 1,
    xp: 0,
    totalXp: 0,
    hp: 80,
    maxHp: 80,
    mana: 30,
    maxMana: 30,
    attack: 10,
    defense: 4,
    gold: 50,
    stamina: MAX_STAMINA,
    staminaUpdatedAt: now,
    location: "foret",
    inventory: { potion: 2, herbe: 0, eau: 0, bois: 0, minerai: 0, cristal: 0, viande: 0, cuir: 0 },
    pets: [],
    activePet: null,
    activeQuest: null,
    questOffers: makeQuestOffers(),
    animalEncounter: null,
    combat: null,
    stats: { explorations: 0, kills: 0, questsCompleted: 0, treasures: 0, deaths: 0, crafted: 0 },
    createdAt: now,
    updatedAt: now
  };
}

function normalizePlayer(raw, userID) {
  const source = raw && typeof raw === "object" ? raw : {};
  const inventory = {};
  for (const key of Object.keys(ITEMS)) inventory[key] = boundedInt(source.inventory && source.inventory[key], 0, 999999, 0);
  const pets = Array.isArray(source.pets) ? source.pets
    .filter(pet => pet && ANIMALS[pet.species] && typeof pet.id === "string")
    .slice(0, MAX_PETS)
    .map(pet => ({ id: pet.id.slice(0, 60), species: pet.species, name: ANIMALS[pet.species].name })) : [];
  const validPetIds = new Set(pets.map(pet => pet.id));
  const selectedPet = validPetIds.has(String(source.activePet || "")) ? String(source.activePet) : null;
  const knownQuest = quest => quest && QUESTS.some(item => item.id === quest.id);
  let activeQuest = null;
  if (knownQuest(source.activeQuest)) {
    const template = QUESTS.find(item => item.id === source.activeQuest.id);
    activeQuest = {
      id: template.id,
      title: template.title,
      description: template.description,
      kind: template.kind,
      target: template.target,
      amount: template.amount,
      progress: boundedInt(source.activeQuest.progress, 0, template.amount, 0),
      xp: template.xp,
      gold: template.gold
    };
  }
  const questOffers = Array.isArray(source.questOffers)
    ? Array.from(new Set(source.questOffers.filter(id => QUESTS.some(quest => quest.id === id)))).slice(0, 3)
    : makeQuestOffers();
  const stats = source.stats && typeof source.stats === "object" ? source.stats : {};
  const combat = source.combat && typeof source.combat === "object" && ENEMIES[source.combat.enemyId]
    ? {
      enemyId: source.combat.enemyId,
      hp: boundedInt(source.combat.hp, 0, 10000, ENEMIES[source.combat.enemyId].hp),
      zoneId: ZONES.some(zone => zone.id === source.combat.zoneId) ? source.combat.zoneId : "foret"
    }
    : null;
  const animalEncounter = source.animalEncounter && ANIMALS[source.animalEncounter.species]
    ? { species: source.animalEncounter.species, zoneId: ZONES.some(zone => zone.id === source.animalEncounter.zoneId) ? source.animalEncounter.zoneId : "foret" }
    : null;
  return {
    version: 1,
    userID: String(userID),
    name: String(source.name || "Voyageur").slice(0, 40),
    level: boundedInt(source.level, 1, 100, 1),
    xp: boundedInt(source.xp, 0, 1_000_000_000, 0),
    totalXp: boundedInt(source.totalXp, 0, 1_000_000_000, 0),
    hp: boundedInt(source.hp, 0, 10000, 80),
    maxHp: boundedInt(source.maxHp, 80, 10000, 80),
    mana: boundedInt(source.mana, 0, 10000, 30),
    maxMana: boundedInt(source.maxMana, 30, 10000, 30),
    attack: boundedInt(source.attack, 1, 1000, 10),
    defense: boundedInt(source.defense, 0, 1000, 4),
    gold: boundedInt(source.gold, 0, 1_000_000_000, 50),
    stamina: boundedInt(source.stamina, 0, MAX_STAMINA, MAX_STAMINA),
    staminaUpdatedAt: boundedInt(source.staminaUpdatedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
    location: ZONES.some(zone => zone.id === source.location) ? source.location : "foret",
    inventory,
    pets,
    activePet: selectedPet,
    activeQuest,
    questOffers: questOffers.length ? questOffers : makeQuestOffers(),
    animalEncounter,
    combat,
    stats: {
      explorations: boundedInt(stats.explorations, 0, 1_000_000_000, 0),
      kills: boundedInt(stats.kills, 0, 1_000_000_000, 0),
      questsCompleted: boundedInt(stats.questsCompleted, 0, 1_000_000_000, 0),
      treasures: boundedInt(stats.treasures, 0, 1_000_000_000, 0),
      deaths: boundedInt(stats.deaths, 0, 1_000_000_000, 0),
      crafted: boundedInt(stats.crafted, 0, 1_000_000_000, 0)
    },
    createdAt: boundedInt(source.createdAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
    updatedAt: boundedInt(source.updatedAt, 0, Number.MAX_SAFE_INTEGER, Date.now())
  };
}

function sanitizePlayers(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const [userID, player] of Object.entries(value)) {
    if (/^\d{3,30}$/.test(String(userID))) result[String(userID)] = normalizePlayer(player, userID);
  }
  return result;
}

async function loadPlayers(globalData) {
  if (!globalData || typeof globalData.get !== "function" || typeof globalData.set !== "function") {
    throw new Error("Le stockage global du bot n’est pas disponible.");
  }
  const saved = await globalData.get(DATA_KEY, "data", {});
  return sanitizePlayers(saved);
}

async function savePlayers(globalData, players) {
  await globalData.set(DATA_KEY, sanitizePlayers(players), "data");
}

function refreshStamina(player, now = Date.now()) {
  const previous = boundedInt(player.staminaUpdatedAt, 0, Number.MAX_SAFE_INTEGER, now);
  const elapsed = Math.max(0, now - previous);
  const gained = Math.floor(elapsed / STAMINA_REGEN_MS);
  if (gained > 0) {
    player.stamina = Math.min(MAX_STAMINA, player.stamina + gained);
    player.staminaUpdatedAt = player.stamina >= MAX_STAMINA ? now : previous + gained * STAMINA_REGEN_MS;
  }
  if (player.stamina >= MAX_STAMINA) player.staminaUpdatedAt = now;
}

function activeAnimal(player) {
  return player.pets.find(pet => pet.id === player.activePet) || null;
}

function effectiveStats(player) {
  const pet = activeAnimal(player);
  const bonus = pet ? ANIMALS[pet.species] : { attack: 0, defense: 0 };
  return {
    attack: player.attack + (bonus.attack || 0),
    defense: player.defense + (bonus.defense || 0),
    pet
  };
}

function zoneByName(value) {
  const target = normalize(value);
  if (!target) return null;
  return ZONES.find(zone => normalize(zone.id) === target || normalize(zone.name) === target || zone.aliases.some(alias => normalize(alias) === target)) || null;
}

function getPrefix() {
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  const raw = config.prefix;
  if (Array.isArray(raw)) return String(raw[0] || "~");
  return String(raw || "~");
}

function zoneImageId(zoneId) {
  return ZONE_IMAGES[zoneId] || "forest";
}

function localImagePath(key) {
  const filename = IMAGE_FILES[key];
  if (!filename) return null;
  const directory = path.resolve(IMAGE_DIR);
  const imagePath = path.resolve(directory, filename);
  if (!imagePath.startsWith(`${directory}${path.sep}`)) return null;
  try {
    const stat = fs.statSync(imagePath);
    return stat.isFile() && stat.size > 0 && stat.size <= 8 * 1024 * 1024 ? imagePath : null;
  } catch (_) {
    return null;
  }
}

async function sendGameResponse(context, text, imageKeys = []) {
  const { api, event = {} } = context || {};
  if (!api || typeof api.sendMessage !== "function" || !event.threadID) return send(context || {}, text);
  const paths = [...new Set(imageKeys)].slice(0, 2).map(localImagePath).filter(Boolean);
  if (!paths.length) return send(context, text);
  const streams = paths.map(imagePath => fs.createReadStream(imagePath));
  try {
    return await send(context, {
      body: text,
      attachment: streams.length === 1 ? streams[0] : streams
    });
  } catch (error) {
    console.error("[openworld] L’envoi d’une image a échoué; envoi du texte seul :", error && (error.message || error));
    return send(context, text);
  } finally {
    for (const stream of streams) {
      if (stream && typeof stream.destroy === "function" && !stream.destroyed) stream.destroy();
    }
  }
}

function progressBar(current, maximum, size = 10) {
  const ratio = maximum > 0 ? Math.max(0, Math.min(1, current / maximum)) : 0;
  const filled = Math.round(ratio * size);
  return `${"▰".repeat(filled)}${"▱".repeat(size - filled)}`;
}

function profileText(player) {
  const pet = activeAnimal(player);
  const xpRequired = xpForNextLevel(player.level);
  const stats = effectiveStats(player);
  return [
    `╭━━〔 🌍 AVENTURIER — ${player.name} 〕━━╮`,
    `⭐ Niveau ${player.level} | ✨ XP ${player.xp}/${xpRequired} ${progressBar(player.xp, xpRequired)}`,
    `❤️ PV ${player.hp}/${player.maxHp} | 🔮 Énergie ${player.mana}/${player.maxMana}`,
    `⚔️ Attaque ${stats.attack} | 🛡️ Défense ${stats.defense} | 🪙 ${player.gold} pièces`,
    `⚡ Endurance ${player.stamina}/${MAX_STAMINA} | 📍 ${ZONES.find(zone => zone.id === player.location).name}`,
    `🐾 Compagnon : ${pet ? `${ANIMALS[pet.species].emoji} ${pet.name}` : "aucun"}`,
    `📊 Expéditions ${player.stats.explorations} | Victoires ${player.stats.kills} | Quêtes ${player.stats.questsCompleted}`,
    "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯"
  ].join("\n");
}

function inventoryText(player) {
  const lines = Object.entries(ITEMS).map(([id, item]) => `${item.emoji} ${item.name} : ${player.inventory[id] || 0}`);
  return `🎒 SAC À DOS\n${lines.join("\n")}\n🪙 Or : ${player.gold}`;
}

function mapText(player) {
  return ["🗺️ CARTE DU MONDE", ...ZONES.map(zone => {
    const unlocked = player.level >= zone.minLevel;
    const current = player.location === zone.id ? " 📍" : "";
    return `${unlocked ? "✅" : "🔒"} ${zone.name} — niveau ${zone.minLevel}+${current}`;
  })].join("\n");
}

function partyText(player) {
  if (!player.pets.length) return "🐾 Ton équipe est vide. Explore le monde et utilise `apprivoiser` lors d’une rencontre animale.";
  const lines = player.pets.map((pet, index) => {
    const data = ANIMALS[pet.species];
    return `${player.activePet === pet.id ? "⭐" : "▫️"} ${index + 1}. ${data.emoji} ${pet.name} — bonus ⚔️+${data.attack} / 🛡️+${data.defense}`;
  });
  return `🐾 TON ÉQUIPE\n${lines.join("\n")}\nChoisir : ${getPrefix()}openworld equipe choisir 1`;
}

function questBoardText(player) {
  if (player.activeQuest) {
    const quest = player.activeQuest;
    return `📜 QUÊTE EN COURS — ${quest.title}\n${quest.description}\nProgression : ${quest.progress}/${quest.amount}\nRécompense : ${quest.xp} XP et ${quest.gold} pièces\nAnnuler : ${getPrefix()}openworld quete abandonner`;
  }
  const offers = player.questOffers.map((id, index) => {
    const quest = QUESTS.find(item => item.id === id);
    return quest ? `${index + 1}. ${quest.title} — ${quest.description} Récompense : ${quest.xp} XP, ${quest.gold} pièces.` : null;
  }).filter(Boolean);
  return `📜 TABLEAU DES QUÊTES\n${offers.join("\n")}\nAccepter : ${getPrefix()}openworld quete accepter 1`;
}

function helpText() {
  const prefix = getPrefix();
  return [
    "╭━━〔 🌍 OPEN WORLD — GUIDE 〕━━╮",
    "Crée un aventurier persistant. Ta progression est liée à ton compte joueur, même si tu changes de groupe.",
    `🧭 ${prefix}openworld explorer [zone] — pars en expédition (15 endurance).`,
    `📊 ${prefix}openworld profil | inventaire | carte | equipe — consulte ton aventure.`,
    `⚔️ En combat : ${prefix}openworld combat, attaquer, special, potion, fuir ou abandonner.`,
    `📜 ${prefix}openworld quete — voir; quete accepter 1 — prendre une mission.`,
    `🐾 ${prefix}openworld apprivoiser — tenter de recruter un animal rencontré.`,
    `🧪 ${prefix}openworld fabriquer potion | acheter potion | repos.`,
    `🏆 ${prefix}openworld classement — meilleurs aventuriers.`,
    "Les zones se débloquent en montant de niveau. Les combats, récoltes et quêtes font progresser tes statistiques.",
    "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯"
  ].join("\n");
}

function grantXp(player, amount) {
  const gained = boundedInt(amount, 0, 1_000_000, 0);
  player.xp += gained;
  player.totalXp += gained;
  const notices = [`✨ +${gained} XP`];
  while (player.level < 100 && player.xp >= xpForNextLevel(player.level)) {
    player.xp -= xpForNextLevel(player.level);
    player.level += 1;
    player.maxHp += 12;
    player.maxMana += 4;
    player.attack += 2;
    player.defense += 1;
    player.hp = player.maxHp;
    player.mana = player.maxMana;
    notices.push(`🎉 Niveau ${player.level} atteint ! Tes PV, ton énergie et tes attributs augmentent.`);
    const unlocked = ZONES.find(zone => zone.minLevel === player.level);
    if (unlocked) notices.push(`🗺️ Nouvelle région débloquée : ${unlocked.name}.`);
  }
  return notices.join("\n");
}

function progressQuest(player, kind, target, amount = 1) {
  const quest = player.activeQuest;
  if (!quest || quest.kind !== kind || (quest.target !== "any" && quest.target !== target)) return [];
  quest.progress = Math.min(quest.amount, quest.progress + Math.max(1, boundedInt(amount, 1, 100, 1)));
  if (quest.progress < quest.amount) return [`📜 Quête « ${quest.title} » : ${quest.progress}/${quest.amount}.`];
  player.activeQuest = null;
  player.stats.questsCompleted += 1;
  const xpText = grantXp(player, quest.xp);
  player.gold += quest.gold;
  player.questOffers = makeQuestOffers();
  return [`🏆 Quête terminée : ${quest.title} !`, xpText, `🪙 +${quest.gold} pièces. Le tableau propose de nouvelles missions.`];
}

function createEnemy(enemyID, zone, playerLevel) {
  const base = ENEMIES[enemyID];
  const scale = Math.max(0, playerLevel - zone.minLevel);
  return {
    enemyId: enemyID,
    name: base.name,
    type: base.type,
    hp: base.hp + scale * 7,
    maxHp: base.hp + scale * 7,
    attack: base.attack + Math.floor(scale * 1.3),
    defense: base.defense + Math.floor(scale / 3),
    xp: base.xp + scale * 7,
    gold: base.gold + scale * 3,
    drops: base.drops.slice()
  };
}

function combatStatus(player) {
  if (!player.combat) return "Tu n’es pas en combat.";
  const enemyBase = ENEMIES[player.combat.enemyId];
  const enemy = createEnemy(player.combat.enemyId, ZONES.find(zone => zone.id === player.combat.zoneId), player.level);
  enemy.hp = player.combat.hp;
  return `⚔️ Combat contre ${enemyBase.name}\n❤️ Tes PV : ${player.hp}/${player.maxHp} | 🔮 Énergie : ${player.mana}/${player.maxMana}\n👹 PV adverses : ${enemy.hp}/${enemy.maxHp}\nActions : ${getPrefix()}openworld attaquer | special | potion | fuir`;
}

function addItem(player, itemID, quantity = 1) {
  if (!ITEMS[itemID]) return;
  player.inventory[itemID] = boundedInt(player.inventory[itemID], 0, 999999, 0) + boundedInt(quantity, 1, 999, 1);
}

function resolveEnemyVictory(player, enemy, output) {
  player.combat = null;
  player.stats.kills += 1;
  player.gold += enemy.gold;
  output.push(`🏅 Victoire ! ${enemy.name} est vaincu. 🪙 +${enemy.gold} pièces.`);
  output.push(grantXp(player, enemy.xp));
  const dropID = pick(enemy.drops);
  addItem(player, dropID, 1);
  output.push(`🎁 Butin : ${ITEMS[dropID].emoji} ${ITEMS[dropID].name}.`);
  output.push(...progressQuest(player, "kill", enemy.type));
}

function enemyTurn(player, enemy, output) {
  const stats = effectiveStats(player);
  const damage = Math.max(1, enemy.attack + randomInt(0, 5) - stats.defense);
  player.hp = Math.max(0, player.hp - damage);
  output.push(`👹 ${enemy.name} riposte : −${damage} PV.`);
  if (player.hp > 0) return;
  player.stats.deaths += 1;
  const lostGold = Math.floor(player.gold * 0.1);
  player.gold -= lostGold;
  player.hp = Math.ceil(player.maxHp * 0.5);
  player.mana = Math.max(0, Math.floor(player.maxMana * 0.25));
  player.combat = null;
  player.location = "foret";
  output.push(`💫 Tu es secouru au camp. Tu récupères ${player.hp} PV, mais perds ${lostGold} pièces. Aucun progrès ou objet gagné pendant ce combat n’est retiré.`);
}

function resolveName(context, userID) {
  const event = context.event || {};
  const sender = String(event.senderID || event.userID || event.author || userID);
  const fromEvent = String(event.senderName || event.name || "").trim();
  if (fromEvent && fromEvent !== sender && !/^\d{6,}$/.test(fromEvent)) return Promise.resolve(fromEvent.slice(0, 40));
  const usersData = context.usersData;
  if (usersData && typeof usersData.getName === "function") {
    return Promise.resolve(usersData.getName(sender)).then(name => {
      const clean = String(name || "").trim();
      return clean && clean !== sender && !/^\d{6,}$/.test(clean) ? clean.slice(0, 40) : "Voyageur";
    }).catch(() => "Voyageur");
  }
  return Promise.resolve("Voyageur");
}

function parseAction(args, event) {
  let parts = Array.isArray(args) ? args.map(String) : [];
  if (!parts.length && event && typeof event.body === "string") {
    const prefix = getPrefix();
    const body = event.body.trim();
    const commandTokens = ["openworld", "monde", "rpg"].map(name => `${prefix}${name}`);
    const commandToken = commandTokens.find(token => {
      const lowerBody = body.toLowerCase();
      const lowerToken = token.toLowerCase();
      return lowerBody === lowerToken || lowerBody.startsWith(`${lowerToken} `);
    });
    if (commandToken) parts = body.slice(commandToken.length).trim().split(/\s+/).filter(Boolean);
  }
  return { action: normalize(parts.shift() || ""), rest: parts.join(" ").trim() };
}

function runSerial(task) {
  const operation = commandQueue.catch(() => {}).then(task);
  commandQueue = operation.catch(() => {});
  return operation;
}

async function handleCommand(context) {
  const { globalData, event = {} } = context;
  const userID = String(event.senderID || event.userID || event.author || "");
  if (!/^\d{3,30}$/.test(userID)) return send(context, "❌ Je n’arrive pas à identifier ton compte Messenger.");
  if (!globalData || typeof globalData.get !== "function" || typeof globalData.set !== "function") {
    return send(context, "❌ La base de données persistante est indisponible : ta progression ne peut pas être enregistrée.");
  }

  const { action, rest } = parseAction(context.args, event);
  const players = await loadPlayers(globalData);
  let player = players[userID];
  let created = false;
  if (!player) {
    player = createPlayer(userID, await resolveName(context, userID));
    players[userID] = player;
    created = true;
  }
  player = normalizePlayer(player, userID);
  players[userID] = player;
  refreshStamina(player);
  player.updatedAt = Date.now();

  const normalizedAction = ["start", "commencer", "debut"].includes(action) ? "profil" : action;
  let output = [];
  const targetAction = normalizedAction || (created ? "profil" : "aide");
  let imageKeys = [];
  if (player.combat) imageKeys = ["combat"];
  else if (["explorer", "exploration", "voyager", "partir"].includes(targetAction)) {
    imageKeys = [zoneImageId(player.location)];
    if (player.animalEncounter) imageKeys.push("animal");
  } else if (["carte", "map", "zones"].includes(targetAction)) imageKeys = [zoneImageId(player.location)];
  else if (["equipe", "team", "compagnons", "compagnon", "apprivoiser", "dompter", "tamer"].includes(targetAction)) imageKeys = ["animal"];
  else if (["quete", "quetes", "mission", "missions", "quest"].includes(targetAction)) imageKeys = ["quest"];
  else if (["inventaire", "sac", "items", "classement", "top", "leaderboard"].includes(targetAction)) imageKeys = ["treasure"];
  else if (["fabriquer", "craft", "acheter", "buy", "repos", "dormir", "camp"].includes(targetAction)) imageKeys = ["camp"];

  if (["aide", "help", ""].includes(targetAction)) {
    output.push(helpText());
  } else if (["combat", "combattre"].includes(targetAction)) {
    output.push(combatStatus(player));
  } else if (["profil", "statut", "stats", "start", "commencer"].includes(targetAction)) {
    output.push(created ? `🌟 Bienvenue dans le monde ouvert, ${player.name} ! Ton aventure est créée et sauvegardée.\n` : "");
    output.push(targetAction === "statut" && player.combat ? combatStatus(player) : profileText(player));
  } else if (["carte", "map", "zones"].includes(targetAction)) {
    output.push(mapText(player));
  } else if (["inventaire", "sac", "items"].includes(targetAction)) {
    output.push(inventoryText(player));
  } else if (["equipe", "team", "compagnons", "compagnon"].includes(targetAction)) {
    const sub = normalize(rest);
    if (sub.startsWith("choisir ") || sub.startsWith("choisis ")) {
      const value = sub.replace(/^(choisir|choisis)\s+/, "");
      const pet = player.pets.find((item, index) => String(index + 1) === value || normalize(item.name) === value || normalize(item.species) === value);
      if (!pet) output.push(`❌ Compagnon inconnu.\n${partyText(player)}`);
      else {
        player.activePet = pet.id;
        output.push(`⭐ ${pet.name} rejoint ton équipe active.\n${partyText(player)}`);
      }
    } else output.push(partyText(player));
  } else if (["quete", "quetes", "mission", "missions", "quest"].includes(targetAction)) {
    const sub = normalize(rest);
    if (sub.startsWith("accepter ") || sub.startsWith("accepte ")) {
      if (player.activeQuest) output.push(`❌ Tu as déjà une quête active.\n${questBoardText(player)}`);
      else {
        const number = Number(sub.split(/\s+/)[1]);
        if (!Number.isInteger(number) || number < 1 || number > player.questOffers.length) output.push(`❌ Choisis une quête valide : ${getPrefix()}openworld quete accepter 1`);
        else {
          const quest = QUESTS.find(item => item.id === player.questOffers[number - 1]);
          if (!quest) output.push("❌ Cette quête n’est plus disponible. Réessaie `quete`.");
          else {
            player.activeQuest = { ...quest, progress: 0 };
            output.push(`✅ Quête acceptée : ${quest.title}.\n${quest.description}\n${questBoardText(player)}`);
          }
        }
      }
    } else if (["abandonner", "annuler", "annule"].includes(sub)) {
      if (!player.activeQuest) output.push("Tu n’as pas de quête à abandonner.");
      else {
        const oldQuest = player.activeQuest.title;
        player.activeQuest = null;
        output.push(`🚫 Quête « ${oldQuest} » abandonnée. Tes offres restent disponibles.\n${questBoardText(player)}`);
      }
    } else output.push(questBoardText(player));
  } else if (["explorer", "exploration", "voyager", "partir"].includes(targetAction)) {
    if (player.combat) output.push(`⚔️ Tu es déjà en combat.\n${combatStatus(player)}`);
    else if (player.animalEncounter) output.push(`🐾 Un animal attend encore ta décision. Utilise ${getPrefix()}openworld apprivoiser, ou reprends l’exploration après.`);
    else if (player.stamina < STAMINA_PER_EXPEDITION) {
      const minutes = Math.ceil(((STAMINA_PER_EXPEDITION - player.stamina) * STAMINA_REGEN_MS) / 60000);
      output.push(`😮‍💨 Il te faut ${STAMINA_PER_EXPEDITION} endurance pour partir. Tu en as ${player.stamina}/${MAX_STAMINA}. Réessaie dans environ ${minutes} min, ou utilise repos au camp.`);
    } else {
      const requestedZone = rest ? zoneByName(rest) : ZONES.find(zone => zone.id === player.location);
      if (!requestedZone) output.push(`❌ Région inconnue.\n${mapText(player)}`);
      else if (player.level < requestedZone.minLevel) output.push(`🔒 ${requestedZone.name} est accessible au niveau ${requestedZone.minLevel}. Tu es niveau ${player.level}.\n${mapText(player)}`);
      else {
        imageKeys = [zoneImageId(requestedZone.id)];
        player.stamina -= STAMINA_PER_EXPEDITION;
        player.location = requestedZone.id;
        player.stats.explorations += 1;
        const weather = pick(requestedZone.weather);
        output.push(`🧭 Expédition — ${requestedZone.name}\n${requestedZone.description}\n🌦️ Conditions : ${weather}. Endurance : ${player.stamina}/${MAX_STAMINA}.`);
        output.push(...progressQuest(player, "explore", "any"));
        const roll = Math.random();
        if (roll < 0.40) {
          const enemyID = pick(requestedZone.enemies);
          const enemy = createEnemy(enemyID, requestedZone, player.level);
          player.combat = { enemyId: enemyID, hp: enemy.hp, zoneId: requestedZone.id };
          imageKeys.push("combat");
          output.push(`🚨 Rencontre hostile : ${enemy.name} surgit !\n${combatStatus(player)}`);
        } else if (roll < 0.66) {
          const resource = pick(requestedZone.resources);
          const amount = randomInt(1, 3);
          addItem(player, resource, amount);
          imageKeys.push("resource");
          output.push(`⛏️ Récolte : ${ITEMS[resource].emoji} ${ITEMS[resource].name} ×${amount}.`);
          output.push(...progressQuest(player, "gather", resource, amount));
        } else if (roll < 0.80) {
          const species = pick(Object.keys(ANIMALS));
          player.animalEncounter = { species, zoneId: requestedZone.id };
          const animal = ANIMALS[species];
          imageKeys.push("animal");
          output.push(`${animal.emoji} Tu aperçois un ${animal.name}. Approche lentement et tente ${getPrefix()}openworld apprivoiser. Une portion de viande augmente tes chances.`);
        } else if (roll < 0.94) {
          imageKeys.push("treasure");
          const gold = randomInt(15, 40) + requestedZone.minLevel * 2;
          player.gold += gold;
          player.stats.treasures += 1;
          output.push(`🧰 Tu trouves une cache oubliée : 🪙 +${gold} pièces.`);
          if (Math.random() < 0.35) {
            const item = pick(["potion", ...requestedZone.resources]);
            addItem(player, item, 1);
            output.push(`🎁 À l’intérieur : ${ITEMS[item].emoji} ${ITEMS[item].name}.`);
          }
          output.push(...progressQuest(player, "treasure", "any"));
        } else {
          imageKeys.push("hazard");
          const stats = effectiveStats(player);
          const damage = Math.max(1, randomInt(5, 12) - Math.floor(stats.defense / 2));
          player.hp = Math.max(1, player.hp - damage);
          output.push(`🌪️ Un incident de terrain te blesse : −${damage} PV. L’armure et ton compagnon limitent les dégâts. PV : ${player.hp}/${player.maxHp}.`);
        }
      }
    }
  } else if (["attaquer", "attack", "frapper", "special", "competence", "potion", "soin", "fuir", "abandonner"].includes(targetAction)) {
    if (!player.combat) output.push("Tu n’es pas en combat. Pars explorer pour rencontrer des adversaires.");
    else if (targetAction === "abandonner") {
      player.combat = null;
      output.push("🏳️ Tu abandonnes le combat et t’éloignes. Aucun butin n’est gagné.");
    } else if (targetAction === "fuir") {
      if (Math.random() < 0.68) {
        player.combat = null;
        output.push("💨 Tu réussis à rompre le combat et à t’échapper.");
      } else {
        const enemy = createEnemy(player.combat.enemyId, ZONES.find(zone => zone.id === player.combat.zoneId), player.level);
        enemy.hp = player.combat.hp;
        output.push("❌ L’ennemi bloque ta fuite !");
        enemyTurn(player, enemy, output);
        if (player.combat) output.push(combatStatus(player));
      }
    } else {
      const enemy = createEnemy(player.combat.enemyId, ZONES.find(zone => zone.id === player.combat.zoneId), player.level);
      enemy.hp = player.combat.hp;
      if (["potion", "soin"].includes(targetAction)) {
        if (player.inventory.potion < 1) output.push("❌ Tu n’as plus de potion. Récolte, fabrique ou achète-en une.");
        else if (player.hp >= player.maxHp) output.push("❤️ Tes PV sont déjà au maximum.");
        else {
          player.inventory.potion -= 1;
          const healed = Math.min(player.maxHp - player.hp, 35 + player.level * 3);
          player.hp += healed;
          output.push(`🧪 Tu utilises une potion et récupères ${healed} PV.`);
          enemyTurn(player, enemy, output);
        }
      } else if (["special", "competence"].includes(targetAction)) {
        if (player.mana < 8) output.push(`🔮 Énergie insuffisante : il faut 8, tu en as ${player.mana}.`);
        else {
          player.mana -= 8;
          const stats = effectiveStats(player);
          const damage = Math.max(1, stats.attack * 2 + randomInt(8, 16) - enemy.defense);
          enemy.hp = Math.max(0, enemy.hp - damage);
          output.push(`✨ Technique spéciale ! ${enemy.name} subit ${damage} dégâts. 🔮 Énergie ${player.mana}/${player.maxMana}.`);
          if (enemy.hp <= 0) resolveEnemyVictory(player, enemy, output);
          else {
            player.combat.hp = enemy.hp;
            enemyTurn(player, enemy, output);
            if (player.combat) output.push(combatStatus(player));
          }
        }
      } else {
        const stats = effectiveStats(player);
        const critical = Math.random() < 0.12;
        const damage = Math.max(1, stats.attack + randomInt(0, 7) - enemy.defense + (critical ? stats.attack : 0));
        enemy.hp = Math.max(0, enemy.hp - damage);
        output.push(`⚔️ Tu frappes ${enemy.name} et infliges ${damage} dégâts${critical ? " — coup critique !" : ""}.`);
        if (enemy.hp <= 0) resolveEnemyVictory(player, enemy, output);
        else {
          player.combat.hp = enemy.hp;
          enemyTurn(player, enemy, output);
          if (player.combat) output.push(combatStatus(player));
        }
      }
    }
  } else if (["apprivoiser", "dompter", "tamer"].includes(targetAction)) {
    if (!player.animalEncounter) output.push("🐾 Aucun animal à apprivoiser pour le moment. Pars explorer.");
    else if (player.pets.length >= MAX_PETS) output.push(`🐾 Ton équipe est complète (${MAX_PETS} compagnons). Choisis un compagnon ou continue l’exploration.`);
    else {
      const species = player.animalEncounter.species;
      const animal = ANIMALS[species];
      const usedBait = player.inventory.viande > 0;
      if (usedBait) player.inventory.viande -= 1;
      const chance = Math.min(0.85, animal.chance + Math.min(0.18, (player.level - 1) * 0.015) + (usedBait ? 0.25 : 0));
      player.animalEncounter = null;
      if (Math.random() < chance) {
        const pet = { id: `${species}-${Date.now()}-${randomInt(100, 999)}`, species, name: animal.name };
        player.pets.push(pet);
        if (!player.activePet) player.activePet = pet.id;
        output.push(`🎉 ${animal.emoji} ${animal.name} te fait confiance et rejoint ton équipe !${usedBait ? " La viande a aidé à l’attirer." : ""}\n${partyText(player)}`);
      } else {
        output.push(`😿 ${animal.name} s’enfuit dans les broussailles.${usedBait ? " La viande a été consommée." : ""} Tu pourras en rencontrer un autre en explorant.`);
      }
    }
  } else if (["fabriquer", "craft"].includes(targetAction)) {
    if (!["potion", "soin", "potion de soin"].includes(normalize(rest))) output.push(`🧪 Recette : ${getPrefix()}openworld fabriquer potion — 3 herbes médicinales + 1 eau pure.`);
    else if (player.inventory.herbe < 3 || player.inventory.eau < 1) output.push(`❌ Ingrédients insuffisants : il faut 3 🌿 herbes et 1 💧 eau.\n${inventoryText(player)}`);
    else {
      player.inventory.herbe -= 3;
      player.inventory.eau -= 1;
      addItem(player, "potion", 1);
      player.stats.crafted += 1;
      output.push("🧪 Potion de soin fabriquée. Elle rend des PV pendant un combat.");
    }
  } else if (["acheter", "buy"].includes(targetAction)) {
    if (!["potion", "soin", "potion de soin"].includes(normalize(rest))) output.push(`La boutique du camp vend une potion : ${getPrefix()}openworld acheter potion (20 pièces).`);
    else if (player.gold < 20) output.push(`🪙 Il te faut 20 pièces; tu en as ${player.gold}.`);
    else {
      player.gold -= 20;
      addItem(player, "potion", 1);
      output.push("🛒 Potion achetée pour 20 pièces.");
    }
  } else if (["repos", "dormir", "camp"].includes(targetAction)) {
    if (player.combat) output.push("⛔ Tu ne peux pas te reposer pendant un combat.");
    else if (player.gold < 10) output.push(`🪙 Le repos au camp coûte 10 pièces. Tu en as ${player.gold}.`);
    else {
      player.gold -= 10;
      player.hp = player.maxHp;
      player.mana = player.maxMana;
      player.stamina = Math.min(MAX_STAMINA, player.stamina + 30);
      player.staminaUpdatedAt = Date.now();
      player.animalEncounter = null;
      output.push(`🏕️ Tu te reposes au camp : PV et énergie restaurés, +30 endurance. Il te reste ${player.gold} pièces.`);
    }
  } else if (["classement", "top", "leaderboard"].includes(targetAction)) {
    const leaders = Object.values(players).sort((a, b) => b.level - a.level || b.totalXp - a.totalXp || b.stats.kills - a.stats.kills).slice(0, 10);
    if (!leaders.length) output.push("🏆 Le classement est encore vide.");
    else output.push(`🏆 CLASSEMENT DES AVENTURIERS\n${leaders.map((entry, index) => `${index + 1}. ${entry.name} — niveau ${entry.level}, ${entry.totalXp} XP, ${entry.stats.kills} victoires`).join("\n")}`);
  } else {
    output.push(`❔ Action inconnue.\n${helpText()}`);
  }

  players[userID] = player;
  await savePlayers(globalData, players);
  const response = output.filter(Boolean).join("\n\n") || profileText(player);
  return sendGameResponse(context, response, imageKeys);
}

module.exports = {
  config: {
    name: "openworld",
    aliases: ["monde", "rpg"],
    version: "1.1.0",
    author: "Diwate",
    description: "RPG persistant illustré : exploration, quêtes, combats, régions et compagnons",
    category: "Jeux",
    role: 0,
    usages: "openworld [aide|explorer|profil|quete|inventaire|equipe|classement]"
  },
  onStart: async function (context) {
    return runSerial(async () => {
      try {
        return await handleCommand(context || {});
      } catch (error) {
        console.error("[openworld] Erreur de commande :", error && (error.stack || error));
        return send(context || {}, "❌ Le monde n’a pas pu être chargé ou sauvegardé. Vérifie la base de données et réessaie.");
      }
    });
  },
  // Exports purs pour les tests automatisés; le chargeur GoatBot ignore ces propriétés.
  _test: {
    DATA_KEY,
    ZONES,
    ENEMIES,
    QUESTS,
    createPlayer,
    normalizePlayer,
    sanitizePlayers,
    xpForNextLevel,
    grantXp,
    progressQuest,
    refreshStamina,
    zoneByName,
    parseAction,
    handleCommand
  }
};

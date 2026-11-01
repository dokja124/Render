"use strict";

const fs = require("fs");
const path = require("path");

const CATEGORY_EMOJI = {
  Administration: "🛡️",
  Anime: "🎌",
  Divertissement: "🎮",
  "Général": "✨",
  "Médias": "🖼️",
  "Outils": "🧰",
  Menu: "📚",
  Utilitaires: "⚙️",
  Sondages: "📊",
  Groupe: "👥",
  IA: "🔮",
  "18+ — réservé aux adultes": "🔞",
  Autres: "📂"
};

// Le fichier local doit être inclus dans scripts/cmds/assets lors du déploiement Render.
const VIDEO_URL = "https://files.catbox.moe/istabd.mp4";
const VIDEO_PATH = path.join(__dirname, "assets", "menu-video.mp4");
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const MAX_MESSAGE_BYTES = 1800;
const DESCRIPTION_MAX_CHARS = 96;

function cleanText(value, fallback = "") {
  if (value == null) return fallback;
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || fallback;
}

function shorten(value, maxChars, fallback = "") {
  const text = cleanText(value, fallback);
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  return `${chars.slice(0, Math.max(1, maxChars - 1)).join("").trimEnd()}…`;
}

function byteLength(value) {
  return Buffer.byteLength(String(value), "utf8");
}

function getCommandEntries(commands) {
  if (!(commands instanceof Map)) return [];
  const entries = [];

  for (const [registeredKey, command] of commands.entries()) {
    const config = command && command.config;
    if (!config || typeof config !== "object" || !cleanText(config.name)) continue;

    // Le chargeur enregistre la clé réelle en minuscules; elle est plus fiable que config.name pour l’invocation.
    const name = cleanText(registeredKey || config.name);
    if (!name) continue;

    const category = shorten(config.category || "Autres", 54, "Autres");
    const rawAliases = Array.isArray(config.aliases) ? config.aliases : [];
    const seen = new Set([name.toLocaleLowerCase("fr-FR")]);
    const aliases = rawAliases
      .map(alias => cleanText(alias))
      .filter(alias => {
        if (!alias) return false;
        const normalized = alias.toLocaleLowerCase("fr-FR");
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      });

    const description = shorten(
      config.description || config.shortDescription || config.usages,
      DESCRIPTION_MAX_CHARS,
      "Commande disponible"
    );
    entries.push({ name, aliases, category, description });
  }

  return entries;
}

function makeSections(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    if (!grouped.has(entry.category)) grouped.set(entry.category, []);
    grouped.get(entry.category).push(entry);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map(([category, commands]) => {
      const emoji = CATEGORY_EMOJI[category] || "📂";
      const names = commands
        .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }))
        .map(command => command.name);
      return { category, emoji, count: names.length, names };
    });
}

function buildMenuPages(commands, prefix = "!", maxBytes = MAX_MESSAGE_BYTES) {
  const safePrefix = cleanText(prefix, "!");
  const entries = getCommandEntries(commands);
  const sections = makeSections(entries);
  const categoryCount = sections.length;
  const header = [
    "╭━━━〔 ✨ MENU DES COMMANDES 〕━━━╮",
    `│ Préfixe : ${safePrefix}  •  ${entries.length} commandes  •  ${categoryCount} catégories`,
    "├──────────────────────────────────"
  ];
  const footer = [
    "├──────────────────────────────────",
    `│ 💡 Ajoute ${safePrefix} devant le nom d’une commande.`,
    "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯"
  ];

  const render = (showPrefix, compact) => {
    const lines = sections.map(section => {
      const label = compact
        ? `${section.emoji} ${section.category}`
        : `${section.emoji} ${section.category} (${section.count})`;
      const names = section.names.map(name => showPrefix ? `${safePrefix}${name}` : name);
      const separator = compact ? ", " : " · ";
      return `│ ${label} : ${names.join(separator)}`;
    });
    if (!sections.length) lines.push("│ 📭 Aucune commande n’est actuellement chargée.");
    return [...header, ...lines, ...footer].join("\n");
  };

  // Une seule page : si la liste est longue, on retire d’abord le préfixe répété
  // et les compteurs de catégorie; le préfixe reste clairement indiqué en haut.
  let page = render(true, false);
  if (byteLength(page) > maxBytes) page = render(false, false);
  if (byteLength(page) > maxBytes) page = render(false, true);
  if (byteLength(page) > maxBytes) {
    throw new Error(`Toutes les commandes ne tiennent pas sur une seule page de ${maxBytes} octets.`);
  }
  return [page];
}

async function sendMenu(context, dependencies = {}) {
  const { api, event } = context || {};
  const prefix = context && context.prefix || "!";
  if (!event || !event.threadID || !api || typeof api.sendMessage !== "function") {
    throw new Error("API Messenger ou identifiant de conversation indisponible.");
  }

  const commands = dependencies.commands || (global.GoatBot && global.GoatBot.commands);
  const pages = buildMenuPages(commands, prefix);
  let sentPageCount = 0;

  try {
    for (const page of pages) {
      await api.sendMessage(page, event.threadID);
      sentPageCount++;
    }
  } catch (error) {
    console.error("[Commande menu] Échec de l’envoi d’une page texte :", error.stack || error);
    try {
      await api.sendMessage(`⚠️ Le menu a été interrompu après ${sentPageCount}/${pages.length} page(s). Réessaie dans un instant.`, event.threadID);
    } catch (replyError) {
      console.error("[Commande menu] Impossible d’envoyer le diagnostic texte :", replyError.stack || replyError);
    }
    return false;
  }

  const fileSystem = dependencies.fs || fs;
  const videoPath = dependencies.videoPath || VIDEO_PATH;
  let videoStream;
  try {
    const stat = await fileSystem.promises.stat(videoPath);
    if (!stat.size || stat.size > MAX_VIDEO_BYTES) throw new Error(`Taille vidéo invalide (${stat.size} octets)`);

    const file = await fileSystem.promises.open(videoPath, "r");
    let header;
    try {
      header = Buffer.alloc(12);
      await file.read(header, 0, header.length, 0);
    } finally {
      await file.close();
    }
    if (header.toString("ascii", 4, 8) !== "ftyp") throw new Error("Le fichier embarqué n’est pas un MP4 valide");

    videoStream = fileSystem.createReadStream(videoPath);
    await api.sendMessage({ attachment: videoStream }, event.threadID);
    return true;
  } catch (error) {
    if (videoStream && !videoStream.destroyed) videoStream.destroy();
    console.error("[Commande menu] Échec upload vidéo locale :", error.stack || error);
    try {
      await api.sendMessage(`⚠️ Le menu (${sentPageCount} page(s)) est envoyé, mais la vidéo a échoué : ${String(error && error.message || error).slice(0, 140)}`, event.threadID);
    } catch (replyError) {
      console.error("[Commande menu] Impossible d’envoyer le diagnostic vidéo :", replyError.stack || replyError);
    }
    return false;
  }
}

module.exports = {
  config: {
    name: "menu",
    version: "6.1.0",
    author: "Diwate",
    description: "Affiche toutes les commandes par catégorie sur une page puis envoie la vidéo",
    category: "Menu",
    usages: "menu",
    role: 0
  },
  buildMenuPages,
  getCommandEntries,
  sendMenu,
  MAX_MESSAGE_BYTES,
  VIDEO_URL,
  VIDEO_PATH,

  onStart: async function (context) {
    return sendMenu(context);
  }
};

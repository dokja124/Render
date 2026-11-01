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
const VIDEO_PATH = path.join(__dirname, "assets", "menu-video.mp4");
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const MAX_MESSAGE_BYTES = 1800;
const PAGE_CONTENT_RESERVE_BYTES = 650;
const DESCRIPTION_MAX_CHARS = 96;
const MAX_VISIBLE_ALIASES = 3;

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

function makeSections(entries, prefix) {
  const grouped = new Map();
  for (const entry of entries) {
    if (!grouped.has(entry.category)) grouped.set(entry.category, []);
    grouped.get(entry.category).push(entry);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map(([category, commands]) => {
      const emoji = CATEGORY_EMOJI[category] || "📂";
      const heading = `╭─〔 ${emoji} ${category} · ${commands.length} commande${commands.length === 1 ? "" : "s"} 〕`;
      const blocks = commands
        .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }))
        .map(command => {
          const shownAliases = command.aliases.slice(0, MAX_VISIBLE_ALIASES);
          const extraAliases = command.aliases.length - shownAliases.length;
          const aliasLabel = shownAliases.length
            ? `│     ↳ Alias : ${shownAliases.map(alias => `${prefix}${alias}`).join(", ")}${extraAliases > 0 ? ` +${extraAliases}` : ""}`
            : "";
          return [
            `│  ✦ ${prefix}${command.name}`,
            `│     ${command.description}`,
            ...(aliasLabel ? [aliasLabel] : [])
          ];
        });
      return { heading, blocks };
    });
}

function buildMenuPages(commands, prefix = "!", maxBytes = MAX_MESSAGE_BYTES) {
  const safePrefix = cleanText(prefix, "!");
  const entries = getCommandEntries(commands);
  const sections = makeSections(entries, safePrefix);
  const contentBudget = Math.max(350, Number(maxBytes) - PAGE_CONTENT_RESERVE_BYTES);
  const contentPages = [];
  let current = [];

  const fits = lines => byteLength(lines.join("\n")) <= contentBudget;
  const flush = () => {
    if (current.length) contentPages.push(current);
    current = [];
  };

  for (const section of sections) {
    if (current.length && !fits([...current, section.heading, ...(section.blocks[0] || [])])) flush();
    current.push(section.heading);

    for (let index = 0; index < section.blocks.length; index++) {
      const block = section.blocks[index];
      if (current.length && !fits([...current, ...block])) {
        flush();
        current.push(`${section.heading} · suite`);
      }
      current.push(...block);
    }
  }

  flush();
  if (!contentPages.length) contentPages.push(["│  📭 Aucune commande n’est actuellement chargée."]);

  const totalPages = contentPages.length;
  const categoryCount = sections.length;
  return contentPages.map((lines, index) => {
    const header = [
      "╭━━━〔 ✨ MENU DES COMMANDES 〕━━━╮",
      `│ Préfixe : ${safePrefix}  •  ${entries.length} commande${entries.length === 1 ? "" : "s"}  •  ${categoryCount} catégorie${categoryCount === 1 ? "" : "s"}`,
      `│ Page ${index + 1}/${totalPages}`,
      "├──────────────────────────────────"
    ];
    const footer = [
      "├──────────────────────────────────",
      `│ 💡 Tape une commande avec le préfixe ${safePrefix}.`,
      "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯"
    ];
    const page = [...header, ...lines, ...footer].join("\n");
    if (byteLength(page) > maxBytes) {
      throw new Error(`Une page du menu dépasse la limite de ${maxBytes} octets.`);
    }
    return page;
  });
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
    version: "6.0.0",
    author: "Diwate",
    description: "Affiche les commandes classées par catégorie",
    category: "Menu",
    usages: "menu",
    role: 0
  },
  buildMenuPages,
  getCommandEntries,
  sendMenu,
  MAX_MESSAGE_BYTES,
  VIDEO_PATH,

  onStart: async function (context) {
    return sendMenu(context);
  }
};

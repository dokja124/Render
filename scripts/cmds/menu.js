const fs = require("fs");
const path = require("path");

const CATEGORY_EMOJI = {
  Administration: "🛡️",
  Anime: "🎌",
  Divertissement: "🎉",
  Général: "✨",
  Médias: "🖼️",
  Outils: "🧰",
  Menu: "📚",
  Utilitaires: "🧰",
  Sondages: "📊"
};
// Copie locale de la vidéo demandée : https://files.catbox.moe/istabd.mp4
// Elle évite que Render doive joindre Catbox à chaque commande !menu.
const VIDEO_URL = "https://files.catbox.moe/istabd.mp4";
const VIDEO_PATH = path.join(__dirname, "assets", "menu-video.mp4");
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

function buildMenu(commands, prefix) {
  const entries = commands instanceof Map ? Array.from(commands.entries()) : [];
  const grouped = new Map();
  for (const [key, command] of entries) {
    const config = command && command.config;
    if (!config || !config.name) continue;
    const category = config.category || "Autres";
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push({
      name: config.name || key,
      description: config.description || config.shortDescription || config.usages || "Commande disponible"
    });
  }

  const lines = ["╭━━━〔 🤖 MENU DU BOT 〕━━━╮", `│ Préfixe : ${prefix}`, "│ Commandes disponibles :", "├────────────────────"];
  for (const category of Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b, "fr"))) {
    lines.push(`│ ${CATEGORY_EMOJI[category] || "📂"} ${category}`);
    for (const command of grouped.get(category).sort((a, b) => a.name.localeCompare(b.name, "fr"))) {
      lines.push(`│   • ${prefix}${command.name} — ${command.description}`);
    }
  }
  lines.push("├────────────────────", `│ 💡 Exemple : ${prefix}ping`, "╰━━━━━━━━━━━━━━━━━━━━╯");
  let body = lines.join("\n");
  if (body.length > 16000) body = `${body.slice(0, 15900)}\n…\nListe raccourcie pour tenir dans un message Messenger.`;
  return body;
}

module.exports = {
  config: {
    name: "menu",
    version: "5.0.0",
    author: "Diwate",
    description: "Envoie la liste des commandes puis une vidéo jointe",
    category: "Menu",
    usages: "menu",
    role: 0
  },
  buildMenu,
  VIDEO_URL,
  VIDEO_PATH,

  onStart: async function ({ api, event, prefix }) {
    const body = buildMenu(global.GoatBot && global.GoatBot.commands, prefix || "!");
    if (!event || !event.threadID || !api || typeof api.sendMessage !== "function") {
      throw new Error("API Messenger ou identifiant de conversation indisponible.");
    }

    // Le menu et la vidéo sont envoyés dans deux messages distincts.
    await api.sendMessage(body, event.threadID);
    let videoStream;
    try {
      const stat = await fs.promises.stat(VIDEO_PATH);
      if (!stat.size || stat.size > MAX_VIDEO_BYTES) throw new Error(`Taille vidéo invalide (${stat.size} octets)`);
      const file = await fs.promises.open(VIDEO_PATH, "r");
      const header = Buffer.alloc(12);
      await file.read(header, 0, header.length, 0);
      await file.close();
      if (header.toString("ascii", 4, 8) !== "ftyp") throw new Error("Le fichier embarqué n’est pas un MP4 valide");

      videoStream = fs.createReadStream(VIDEO_PATH);
      await api.sendMessage({ attachment: videoStream }, event.threadID);
      return true;
    } catch (error) {
      if (videoStream && !videoStream.destroyed) videoStream.destroy();
      console.error("[Commande menu] Échec upload vidéo locale :", error.stack || error);
      try {
        return await api.sendMessage(`⚠️ Le menu est envoyé, mais l’envoi de la vidéo a échoué : ${String(error && error.message || error).slice(0, 160)}`, event.threadID);
      } catch (replyError) {
        console.error("[Commande menu] Impossible d’envoyer le diagnostic :", replyError.stack || replyError);
        return null;
      }
    }
  }
};
  

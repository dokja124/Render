const axios = require("axios");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pipeline } = require("stream/promises");

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
const VIDEO_URL = "https://files.catbox.moe/istabd.mp4";
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

function errorText(error) {
  const message = error && (error.error || error.message || error.code) || "erreur inconnue";
  return String(message).replace(/\s+/g, " ").slice(0, 160);
}

module.exports = {
  config: {
    name: "menu",
    version: "4.0.0",
    author: "Diwate",
    description: "Envoie la liste des commandes puis une vidéo jointe",
    category: "Menu",
    usages: "menu",
    role: 0
  },

  buildMenu,
  VIDEO_URL,

  onStart: async function ({ api, event, prefix }) {
    const body = buildMenu(global.GoatBot && global.GoatBot.commands, prefix || "!");
    if (!event || !event.threadID || !api || typeof api.sendMessage !== "function") {
      throw new Error("API Messenger ou identifiant de conversation indisponible.");
    }

    // Envoi 1 : le menu sous forme de message texte indépendant.
    await api.sendMessage(body, event.threadID);

    // Envoi 2 : téléchargement temporaire, puis upload d’un véritable flux fichier MP4.
    let tempDir;
    let sourceStream;
    let videoStream;
    try {
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "goat-menu-"));
      const videoPath = path.join(tempDir, "menu-video.mp4");
      const response = await axios.get(VIDEO_URL, {
        responseType: "stream",
        timeout: 30000,
        maxRedirects: 5,
        headers: { Accept: "video/mp4" }
      });
      if (response.status < 200 || response.status >= 300) throw new Error(`Catbox HTTP ${response.status}`);
      sourceStream = response.data;
      await pipeline(sourceStream, fs.createWriteStream(videoPath));

      const stat = await fs.promises.stat(videoPath);
      if (!stat.size || stat.size > MAX_VIDEO_BYTES) throw new Error(`Taille vidéo invalide (${stat.size} octets)`);
      const fileHandle = await fs.promises.open(videoPath, "r");
      const header = Buffer.alloc(12);
      await fileHandle.read(header, 0, header.length, 0);
      await fileHandle.close();
      if (header.toString("ascii", 4, 8) !== "ftyp") throw new Error("Le fichier téléchargé n’est pas un MP4 valide");

      videoStream = fs.createReadStream(videoPath);
      await api.sendMessage({ attachment: videoStream }, event.threadID);
      return true;
    } catch (error) {
      if (sourceStream && typeof sourceStream.destroy === "function" && !sourceStream.destroyed) sourceStream.destroy();
      if (videoStream && typeof videoStream.destroy === "function" && !videoStream.destroyed) videoStream.destroy();
      console.error("[Commande menu] Échec téléchargement/upload vidéo :", error.stack || error);
      try {
        return await api.sendMessage(`⚠️ Le menu est envoyé, mais l’envoi vidéo a échoué : ${errorText(error)}`, event.threadID);
      } catch (replyError) {
        console.error("[Commande menu] Impossible d’envoyer le message de diagnostic :", replyError.stack || replyError);
        return null;
      }
    } finally {
      if (tempDir) await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(error => console.error("[Commande menu] Nettoyage temporaire :", error.message));
    }
  }
};
  

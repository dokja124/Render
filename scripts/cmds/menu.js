const axios = require("axios");
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
    version: "3.0.0",
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

    // Envoi 2 : le fichier MP4 distant est transmis comme pièce jointe, pas comme URL texte.
    let videoStream;
    try {
      const response = await axios.get(VIDEO_URL, {
        responseType: "stream",
        timeout: 30000,
        maxRedirects: 5,
        headers: { Accept: "video/mp4" }
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Téléchargement vidéo HTTP ${response.status}`);
      }
      videoStream = response.data;
      videoStream.path = "menu-video.mp4";
      return await api.sendMessage({ attachment: videoStream }, event.threadID);
    } catch (error) {
      if (videoStream && typeof videoStream.destroy === "function" && !videoStream.destroyed) {
        videoStream.destroy();
      }
      console.error("[Commande menu] Échec de l’envoi de la vidéo jointe :", error.message);
      return api.sendMessage("⚠️ Le menu est envoyé, mais Messenger n’a pas accepté la vidéo. Consulte les logs du bot.", event.threadID);
    }
  }
};

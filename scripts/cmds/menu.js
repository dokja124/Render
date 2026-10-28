const VIDEO_URL = "https://files.catbox.moe/istabd.mp4";
const CATEGORY_EMOJI = {
  Administration: "🛡️",
  Anime: "🎌",
  Divertissement: "🎉",
  Général: "✨",
  Médias: "🖼️",
  Outils: "🧰",
  Menu: "📚"
};

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

  const categories = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b, "fr"));
  const lines = [
    "╭━━━〔 🤖 MENU DU BOT 〕━━━╮",
    `│ Préfixe : ${prefix}`,
    "│ Voici les commandes disponibles :",
    "├────────────────────"
  ];

  for (const category of categories) {
    const emoji = CATEGORY_EMOJI[category] || "📂";
    lines.push(`│ ${emoji} ${category}`);
    const items = grouped.get(category).sort((a, b) => a.name.localeCompare(b.name, "fr"));
    for (const item of items) {
      lines.push(`│   • ${prefix}${item.name} — ${item.description}`);
    }
  }

  lines.push("├────────────────────", `│ 💡 Exemple : ${prefix}ping`, "╰━━━━━━━━━━━━━━━━━━━━╯");
  let body = lines.join("\n");
  if (body.length > 16000) {
    body = `${body.slice(0, 15900)}\n…\nLa liste a été raccourcie pour tenir dans un message Messenger.`;
  }
  return body;
}

async function sendMessage({ api, message, event }, payload) {
  if (message && typeof message.send === "function") {
    return message.send(payload);
  }
  if (api && typeof api.sendMessage === "function" && event && event.threadID) {
    return api.sendMessage(payload, event.threadID);
  }
  throw new Error("Aucune méthode d’envoi Messenger disponible.");
}

module.exports = {
  config: {
    name: "menu",
    version: "1.0.0",
    author: "Diwate",
    description: "Affiche la liste des commandes avec une vidéo",
    category: "Menu",
    usages: "menu",
    role: 0
  },

  buildMenu,

  onStart: async function ({ api, message, event, prefix }) {
    const commands = global.GoatBot && global.GoatBot.commands;
    const body = buildMenu(commands, prefix || "!");
    let videoStream;

    try {
      const axios = require("axios");
      const response = await axios.get(VIDEO_URL, {
        responseType: "stream",
        timeout: 25000,
        maxRedirects: 5
      });
      videoStream = response.data;
      // The multipart uploader uses the stream path to infer a filename/MIME type.
      videoStream.path = "bot-menu.mp4";
      await sendMessage({ api, message, event }, { body, attachment: videoStream });
    } catch (error) {
      if (videoStream && typeof videoStream.destroy === "function" && !videoStream.destroyed) {
        videoStream.destroy();
      }
      console.error("[Commande menu] Impossible de joindre la vidéo :", error.message);
      await sendMessage(
        { api, message, event },
        { body: `${body}\n\n🎥 Vidéo : ${VIDEO_URL}` }
      );
    }
  }
};

const fs = require("fs");
const path = require("path");
const { send } = require("./lib/messenger");

function updateAdminList(config, action, userID) {
  if (!Array.isArray(config.adminBot)) config.adminBot = [];
  config.adminBot = [...new Set(config.adminBot.map(String))];
  const target = String(userID);

  if (action === "add") {
    if (config.adminBot.includes(target)) return { changed: false, list: config.adminBot };
    config.adminBot.push(target);
    return { changed: true, list: config.adminBot };
  }

  const index = config.adminBot.indexOf(target);
  if (index === -1) return { changed: false, list: config.adminBot };
  if (config.adminBot.length <= 1) return { changed: false, lastAdmin: true, list: config.adminBot };
  config.adminBot.splice(index, 1);
  return { changed: true, list: config.adminBot };
}

function getTargetID(args, event, action) {
  const mentions = event && event.mentions && typeof event.mentions === "object"
    ? Object.keys(event.mentions)
    : [];
  if (mentions.length) return mentions[0];
  const value = action === "add" ? args[0] : args[1];
  return /^\d{5,25}$/.test(String(value || "")) ? String(value) : null;
}

module.exports = {
  config: {
    name: "add",
    version: "2.0.0",
    author: "Diwate",
    description: "Ajoute ou retire un administrateur du bot",
    category: "Administration",
    usages: "add <@mention|UID> | add retirer <@mention|UID> | add liste",
    role: 2
  },

  updateAdminList,
  getTargetID,

  onStart: async function ({ api, message, event, args, prefix }) {
    try {
      const actionArg = String(args[0] || "").toLowerCase();
      if (["liste", "list", "voir"].includes(actionArg)) {
        const configPath = path.resolve(process.cwd(), process.env.NODE_ENV === "development" ? "config.dev.json" : "config.json");
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        const admins = Array.isArray(config.adminBot) ? config.adminBot.map(String) : [];
        return send({ api, message, event }, `👑 Administrateurs du bot (${admins.length}) :\n${admins.length ? admins.map((id, i) => `${i + 1}. ${id}`).join("\n") : "Aucun administrateur configuré."}`);
      }

      const action = ["retirer", "remove", "rm", "supprimer"].includes(actionArg) ? "remove" : "add";
      const userID = getTargetID(args, event, action);
      if (!userID) {
        return send(
          { api, message, event },
          `⚙️ Utilisation :\n• ${prefix || "!"}add @mention ou ${prefix || "!"}add <UID>\n• ${prefix || "!"}add retirer @mention ou ${prefix || "!"}add retirer <UID>\n• ${prefix || "!"}add liste`
        );
      }
      if (action === "remove" && String(event.senderID) === userID) {
        return send({ api, message, event }, "⛔ Tu ne peux pas retirer ton propre accès avec cette commande.");
      }

      const configPath = path.resolve(process.cwd(), process.env.NODE_ENV === "development" ? "config.dev.json" : "config.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const result = updateAdminList(config, action, userID);
      if (result.lastAdmin) {
        return send({ api, message, event }, "⛔ Impossible de retirer le dernier administrateur du bot.");
      }
      if (!result.changed) {
        return send({ api, message, event }, action === "add" ? `ℹ️ ${userID} est déjà administrateur.` : `ℹ️ ${userID} n’est pas dans la liste.`);
      }

      const temporaryPath = `${configPath}.${process.pid}.tmp`;
      fs.writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
      fs.renameSync(temporaryPath, configPath);

      // Keep any exposed runtime config in sync; a restart is still needed for cached permissions.
      for (const runtimeConfig of [global.config, global.GoatBot && global.GoatBot.config]) {
        if (runtimeConfig && typeof runtimeConfig === "object") runtimeConfig.adminBot = [...result.list];
      }

      const verb = action === "add" ? "ajouté à" : "retiré de";
      return send({ api, message, event }, `✅ ${userID} a été ${verb} la liste des administrateurs du bot. Redémarre le bot pour appliquer les droits partout.`);
    } catch (error) {
      console.error("[Commande add]", error);
      return send({ api, message, event }, "❌ Impossible de modifier la liste des administrateurs. Vérifie les permissions sur le fichier de configuration.");
    }
  }
};

"use strict";

const { send } = require("./lib/messenger");

const STORAGE_KEY = "limiteGlobalV1";
const WINDOW_MS = 10 * 60 * 1000;   // 10 minutes d'utilisation
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes de pause
const MAX_ENTRIES = 5000;

let state = { enabled: false, updatedAt: 0 };
let usage = {};           // { userId: { windowStart, lastCommandAt } }
let loaded = false;
let loadPromise = null;
let mutationQueue = Promise.resolve();

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function normalizeID(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    return String(value.id || value.userID || value.userId || value.senderID || value.author || "").trim();
  }
  return String(value).trim();
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function getSenderID(event) {
  return normalizeID(event && (event.senderID || event.senderId || event.userID || event.author));
}

function getPrefix(context = {}) {
  if (context.prefix) return String(context.prefix);
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  return String(config.prefix || "!");
}

function getOwnerIDs() {
  const configuredOwner = String(process.env.BOT_OWNER_ID || "").trim();
  if (configuredOwner) return [configuredOwner];
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  const ids = Array.isArray(config.adminBot) ? config.adminBot : config.adminBot ? [config.adminBot] : [];
  return ids.map(normalizeID).filter(Boolean);
}

function isOwner(userID) {
  return getOwnerIDs().includes(normalizeID(userID));
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes} min ${seconds} s`;
  return `${seconds} s`;
}

// ---------------------------------------------------------------------------
// Persistance
// ---------------------------------------------------------------------------

async function loadAll(globalData) {
  if (loaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    if (globalData && typeof globalData.get === "function") {
      try {
        const stored = await globalData.get(STORAGE_KEY, "data", {});
        if (stored && typeof stored === "object") {
          state = {
            enabled: Boolean(stored.enabled),
            updatedAt: Number(stored.updatedAt) || 0
          };
          usage = stored.usage && typeof stored.usage === "object" ? { ...stored.usage } : {};
        }
      } catch (error) {
        console.warn("[Limite] Lecture impossible :", error.message || error);
      }
    }
    loaded = true;
  })();
  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

async function saveAll(globalData) {
  // Purge des entrées anciennes
  const now = Date.now();
  const maxAge = WINDOW_MS + COOLDOWN_MS + 60 * 60 * 1000; // 1h de marge
  for (const [id, entry] of Object.entries(usage)) {
    if (!entry || now - (entry.lastCommandAt || 0) > maxAge) delete usage[id];
  }
  const keys = Object.keys(usage);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => (usage[a].lastCommandAt || 0) - (usage[b].lastCommandAt || 0))
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach(k => delete usage[k]);
  }

  if (globalData && typeof globalData.set === "function") {
    try {
      await globalData.set(STORAGE_KEY, { enabled: state.enabled, updatedAt: state.updatedAt, usage }, "data");
    } catch (error) {
      console.warn("[Limite] Sauvegarde impossible :", error.message || error);
    }
  }
}

async function mutate(globalData, fn) {
  const run = async () => {
    await loadAll(globalData);
    const result = fn();
    if (result && result.persist) await saveAll(globalData);
    return result;
  };
  const pending = mutationQueue.then(run, run);
  mutationQueue = pending.catch(() => {});
  return pending;
}

// ---------------------------------------------------------------------------
// API publique : vérification avant exécution d'une commande
// ---------------------------------------------------------------------------

/**
 * À appeler AVANT l'exécution de toute commande.
 * Retourne true si la commande peut s'exécuter, false sinon (message déjà envoyé).
 */
async function checkLimit(context = {}) {
  const { api, message, event, globalData } = context;
  const userID = getSenderID(event);
  const prefix = getPrefix(context);

  if (!userID) return true; // pas d'ID → on laisse passer, d'autres modules géreront
  await loadAll(globalData);
  if (!state.enabled) return true;      // mode désactivé
  if (isOwner(userID)) return true;     // owner toujours exempté

  const now = Date.now();
  const entry = usage[userID];

  // Première commande → ouvre la fenêtre
  if (!entry || !entry.windowStart) {
    await mutate(globalData, () => {
      usage[userID] = { windowStart: now, lastCommandAt: now };
      return { persist: true };
    });
    // Message informatif d'ouverture de fenêtre (une seule fois)
    try {
      await send(
        { api, message, event },
        `⏱️ **Fenêtre d’utilisation ouverte.**\n` +
        `Tu peux utiliser le bot pendant **10 minutes** à partir de maintenant.\n\n` +
        `À la fin de cette fenêtre, tu devras attendre 10 minutes avant de pouvoir recommencer.\n` +
        `💡 Le propriétaire peut désactiver cette limitation avec \`${prefix}limite désactivé\`.`
      );
    } catch (_) {}
    return true;
  }

  const elapsed = now - entry.windowStart;

  // Fenêtre active
  if (elapsed < WINDOW_MS) {
    await mutate(globalData, () => {
      usage[userID].lastCommandAt = now;
      return { persist: true };
    });
    return true;
  }

  // Fenêtre expirée → cooldown en cours
  const cooldownStart = entry.windowStart + WINDOW_MS;
  const cooldownElapsed = now - cooldownStart;

  if (cooldownElapsed < COOLDOWN_MS) {
    const remaining = COOLDOWN_MS - cooldownElapsed;
    await send(
      { api, message, event },
      `⛔ **Limite atteinte.**\n\n` +
      `Tu as utilisé tes **10 minutes** d’utilisation.\n` +
      `⏳ Reviens dans **${formatDuration(remaining)}** pour recommencer.\n\n` +
      `💡 Le propriétaire peut désactiver cette limitation avec \`${prefix}limite désactivé\`.`
    );
    return false;
  }

  // Cooldown terminé → nouvelle fenêtre
  await mutate(globalData, () => {
    usage[userID] = { windowStart: now, lastCommandAt: now };
    return { persist: true };
  });
  try {
    await send(
      { api, message, event },
      `✅ **Nouvelle fenêtre d’utilisation ouverte.**\n` +
      `Tu peux utiliser le bot pendant **10 minutes**.\n` +
      `💡 Le propriétaire peut désactiver cette limitation avec \`${prefix}limite désactivé\`.`
    );
  } catch (_) {}
  return true;
}

// ---------------------------------------------------------------------------
// Commande !limite (réservée au propriétaire)
// ---------------------------------------------------------------------------

async function handleLimite(context = {}) {
  const { api, message, event, globalData } = context;
  const prefix = getPrefix(context);
  const userID = getSenderID(event);

  if (!userID || !isOwner(userID)) {
    return send({ api, message, event }, "⛔ Seul le propriétaire du bot peut utiliser cette commande.");
  }

  const args = Array.isArray(context.args) ? context.args : [];
  const action = normalize(args[0] || "");

  await loadAll(globalData);

  // Afficher l'état
  if (!action || ["status", "etat", "state"].includes(action)) {
    const statusText = state.enabled ? "🟢 **ACTIVÉE**" : "🔴 **DÉSACTIVÉE**";
    const lastUpdate = state.updatedAt ? new Date(state.updatedAt).toLocaleString("fr-FR") : "jamais modifiée";
    return send(
      { api, message, event },
      `⏱️ **État de la limitation :** ${statusText}\n\n` +
      `🕒 Dernière modification : ${lastUpdate}\n\n` +
      `📖 **Utilisation :**\n` +
      `• \`${prefix}limite activé\` → active la limitation\n` +
      `• \`${prefix}limite désactivé\` → désactive la limitation\n` +
      `• \`${prefix}limite status\` → affiche cet état\n\n` +
      `⏳ **Effet quand activée :** chaque utilisateur (sauf le propriétaire) dispose de **10 minutes** d’utilisation, puis **10 minutes de pause** avant de recommencer.`
    );
  }

  // Activer
  if (["active", "activer", "actived", "activede", "on", "enabled", "oui", "true"].includes(action) || action === "activé") {
    if (state.enabled) {
      return send({ api, message, event }, "ℹ️ La limitation est déjà activée.");
    }
    await mutate(globalData, () => {
      state.enabled = true;
      state.updatedAt = Date.now();
      // On réinitialise toutes les fenêtres pour que la règle s'applique proprement
      usage = {};
      return { persist: true };
    });
    return send(
      { api, message, event },
      `✅ **Limitation activée.**\n\n` +
      `Chaque utilisateur (sauf toi) dispose désormais de **10 minutes** d’utilisation, puis **10 minutes de pause** avant de pouvoir recommencer.\n` +
      `💡 Pour désactiver : \`${prefix}limite désactivé\`.`
    );
  }

  // Désactiver
  if (["desactive", "désactive", "desactiver", "désactiver", "off", "disabled", "non", "false", "desactivee", "désactivé"].includes(action)) {
    if (!state.enabled) {
      return send({ api, message, event }, "ℹ️ La limitation est déjà désactivée.");
    }
    await mutate(globalData, () => {
      state.enabled = false;
      state.updatedAt = Date.now();
      usage = {}; // on remet tout à zéro pour être propre
      return { persist: true };
    });
    return send(
      { api, message, event },
      `✅ **Limitation désactivée.**\n\n` +
      `Tous les utilisateurs peuvent maintenant utiliser le bot sans restriction.\n` +
      `💡 Pour réactiver : \`${prefix}limite activé\`.`
    );
  }

  // Réinitialiser manuellement un utilisateur : !limite reset <id ou réponse>
  if (["reset", "reinitialiser", "réinitialiser"].includes(action)) {
    const reply = event && (event.messageReply || event.repliedMessage || event.replyToMessage);
    const replyId = reply && normalizeID(reply.senderID || reply.senderId || reply.userID || reply.author);
    const targetId = replyId || normalizeID(args[1]);
    if (!targetId) {
      return send({ api, message, event }, `❌ Réponds au message d’un utilisateur ou précise son ID : \`${prefix}limite reset <id>\`.`);
    }
    await mutate(globalData, () => {
      delete usage[targetId];
      return { persist: true };
    });
    return send({ api, message, event }, `✅ Fenêtre d’utilisation réinitialisée pour \`${targetId}\`.`);
  }

  // Argument inconnu → aide
  return send(
    { api, message, event },
    `❓ Argument inconnu.\n\n` +
    `• \`${prefix}limite activé\`\n` +
    `• \`${prefix}limite désactivé\`\n` +
    `• \`${prefix}limite status\`\n` +
    `• \`${prefix}limite reset <id ou réponse>\``
  );
}

// ---------------------------------------------------------------------------
// Détection de la commande invoquée
// ---------------------------------------------------------------------------

function invokedCommand(context) {
  const body = String(context.event && context.event.body || "").trim();
  const firstToken = body.split(/\s+/)[0] || "";
  const raw = normalize(firstToken.replace(/^[^A-Za-z0-9]+/, ""));
  if (raw === "limite" || raw === "limit" || raw === "limites") return "limite";
  return normalize(context.commandName || "");
}

module.exports = {
  config: {
    name: "limite",
    aliases: ["limit", "limites"],
    version: "1.0.0",
    author: "Diwate",
    description: "Active/désactive la limitation d’utilisation du bot (10 min d’usage / 10 min de pause)",
    category: "Administration",
    usages: "limite activé | limite désactivé | limite status | limite reset <id>",
    role: 0
  },
  STORAGE_KEY,
  WINDOW_MS,
  COOLDOWN_MS,
  isOwner,
  checkLimit,
  handleLimite,
  onStart: async function (context) {
    try {
      return await handleLimite(context);
    } catch (error) {
      console.error("[Commande limite]", error.stack || error);
      return send({ api: context.api, message: context.message, event: context.event }, "❌ La commande limite a échoué. Réessaie.");
    }
  }
};
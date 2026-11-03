"use strict";

const { send } = require("./lib/messenger");

const CONFIRM_TIMEOUT_MS = 60_000;

// Table commande -> clés
const COMMAND_KEYS = {
  bank: ["goatBotBankData"],
  claim: ["claimCooldownsV1"],
  ban: ["goatBotCommandBans"],
  match: ["goatBotMatchData"],
  quizz: [
    "quizCultureSessions",
    "quizCultureQuestionHistory",
    "animeQuizSessionsV3",
    "animeQuizQuestionHistoryV3"
  ],
  message: [
    "privateMessagesV3",
    "privateMessagesUsersV3",
    "privateMessagesActivityV3"
  ],
  limite: ["limiteGlobalV1"],
  magie: ["magieSessionsV1"],
  defi: ["messengerArenaGames"]
};

// Clés dynamiques (préfixes)
const PREFIX_KEYS = {
  raphael: ["raphaelConversation:"]
};

// Toutes les clés statiques (pour "tout")
const ALL_STATIC_KEYS = [...new Set(Object.values(COMMAND_KEYS).flat())];
// Tous les préfixes
const ALL_PREFIX_KEYS = [...new Set(Object.values(PREFIX_KEYS).flat())];

// Confirmations en attente : { userID: { expiresAt, scope, keys, prefixes } }
const pending = new Map();

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

function getSenderID(event) {
  return normalizeID(event && (event.senderID || event.senderId || event.userID || event.author));
}

function getPrefix(context = {}) {
  if (context.prefix) return String(context.prefix);
  const config = (global.GoatBot && global.GoatBot.config) || global.config || {};
  const p = config.prefix;
  if (Array.isArray(p)) return String(p[0] || "!");
  return String(p || "!");
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

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// ---------------------------------------------------------------------------
// Découverte
// ---------------------------------------------------------------------------

async function discoverForKeys(globalData, staticKeys, prefixes) {
  const found = [];
  if (!globalData || typeof globalData.get !== "function") return found;

  for (const key of staticKeys) {
    try {
      const value = await globalData.get(key, "data", null);
      if (value !== null && value !== undefined) found.push({ key, type: "static" });
    } catch (_) {}
  }

  if (prefixes.length === 0) return found;

  if (typeof globalData.keys === "function") {
    try {
      const all = await globalData.keys("data");
      if (Array.isArray(all)) {
        for (const key of all) {
          if (prefixes.some(p => String(key).startsWith(p))) {
            if (!found.some(f => f.key === key)) found.push({ key, type: "dynamic" });
          }
        }
      }
    } catch (_) {}
  } else if (typeof globalData.getAll === "function") {
    try {
      const all = await globalData.getAll("data");
      if (all && typeof all === "object") {
        for (const key of Object.keys(all)) {
          if (prefixes.some(p => key.startsWith(p))) {
            if (!found.some(f => f.key === key)) found.push({ key, type: "dynamic" });
          }
        }
      }
    } catch (_) {}
  }

  return found;
}

async function removeKey(globalData, key) {
  if (!globalData) return { ok: false, method: "no-storage" };
  if (typeof globalData.remove === "function") {
    try { await globalData.remove(key); return { ok: true, method: "remove" }; } catch (_) {}
  }
  if (typeof globalData.delete === "function") {
    try { await globalData.delete(key); return { ok: true, method: "delete" }; } catch (_) {}
  }
  if (typeof globalData.set === "function") {
    try { await globalData.set(key, null, "data"); return { ok: true, method: "set-null" }; } catch (_) {}
  }
  return { ok: false, method: "unsupported" };
}

// ---------------------------------------------------------------------------
// Résolution de la portée demandée
// ---------------------------------------------------------------------------

function resolveScope(action, subAction) {
  const a = normalize(action || "");
  const s = normalize(subAction || "");

  // !nettoie tout
  if (a === "tout" || a === "all" || a === "everything") {
    return { scope: "tout", staticKeys: ALL_STATIC_KEYS, prefixes: ALL_PREFIX_KEYS };
  }

  // !nettoie <commande>
  if (COMMAND_KEYS[a]) {
    return { scope: a, staticKeys: COMMAND_KEYS[a], prefixes: [] };
  }
  if (PREFIX_KEYS[a]) {
    return { scope: a, staticKeys: [], prefixes: PREFIX_KEYS[a] };
  }

  // Alias : "messages" -> message, "defis" -> defi, etc.
  const aliasMap = {
    banque: "bank", solde: "bank",
    quotidien: "claim", daily: "claim",
    bans: "ban",
    amour: "match", compat: "match",
    quiz: "quizz",
    msg: "message", dm: "message",
    limits: "limite", limit: "limite",
    magies: "magie", tour: "magie",
    defis: "defi", combat: "defi", arene: "defi", arène: "defi",
    rap: "raphael", grand: "raphael"
  };
  const mapped = aliasMap[a];
  if (mapped) {
    if (COMMAND_KEYS[mapped]) return { scope: mapped, staticKeys: COMMAND_KEYS[mapped], prefixes: [] };
    if (PREFIX_KEYS[mapped]) return { scope: mapped, staticKeys: [], prefixes: PREFIX_KEYS[mapped] };
  }
  return null;
}

function scopeLabel(scope) {
  if (scope === "tout") return "TOUT (toutes les commandes)";
  return scope;
}

// ---------------------------------------------------------------------------
// Affichage de l'aide
// ---------------------------------------------------------------------------

function buildHelpText(prefix) {
  const lines = Object.keys(COMMAND_KEYS).map(name => `• \`${prefix}nettoie ${name}\``).join("\n");
  const prefixLines = Object.keys(PREFIX_KEYS).map(name => `• \`${prefix}nettoie ${name}\``).join("\n");
  return [
    `🧹 **Commande nettoie** — réservée au propriétaire`,
    "",
    "**Effacer une commande spécifique :**",
    lines,
    prefixLines,
    "",
    `**Effacer TOUT :** \`${prefix}nettoie tout\``,
    `**Voir ce qui existe (sans rien effacer) :** \`${prefix}nettoie liste\``,
    "",
    "💡 Pour chaque suppression, une confirmation dans les 60 s est demandée :",
    `   \`${prefix}nettoie <commande>\` puis \`${prefix}nettoie confirmer\``
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------

async function handleList(globalData, context) {
  const { api, message, event } = context;
  const prefix = getPrefix(context);

  const found = await discoverForKeys(globalData, ALL_STATIC_KEYS, ALL_PREFIX_KEYS);

  if (found.length === 0) {
    return send({ api, message, event }, `ℹ️ Aucune donnée enregistrée actuellement.\n\n💡 Voir l’aide : \`${prefix}nettoie aide\``);
  }

  const lines = found.map(({ key, type }) => `• \`${key}\` ${type === "dynamic" ? "(dynamique)" : ""}`);
  return send(
    { api, message, event },
    `📋 **Données actuellement présentes (${found.length}) :**\n\n${lines.join("\n")}\n\n` +
    `🧹 Pour effacer tout : \`${prefix}nettoie tout\`\n` +
    `🧹 Pour effacer une partie : \`${prefix}nettoie <commande>\` (ex. \`${prefix}nettoie defi\`)`
  );
}

// ---------------------------------------------------------------------------
// Commande principale
// ---------------------------------------------------------------------------

async function handleNettoie(context = {}) {
  const { api, message, event, globalData } = context;
  const prefix = getPrefix(context);
  const userID = getSenderID(event);
  const args = Array.isArray(context.args) ? context.args : [];
  const action = normalize(args[0] || "");
  const subAction = normalize(args[1] || "");

  // Sécurité
  if (!userID || !isOwner(userID)) {
    return send({ api, message, event }, "⛔ Seul le propriétaire du bot peut utiliser cette commande.");
  }

  if (!globalData || typeof globalData.get !== "function") {
    return send({ api, message, event }, "❌ Le stockage persistant du bot est indisponible. Rien n’a été effacé.");
  }

  // ---- Aide ----
  if (["", "aide", "help"].includes(action)) {
    return send({ api, message, event }, buildHelpText(prefix));
  }

  // ---- Liste ----
  if (["liste", "list", "info", "status"].includes(action)) {
    return handleList(globalData, context);
  }

  // ---- Confirmation ----
  if (["confirmer", "confirm", "oui"].includes(action)) {
    const confirm = pending.get(userID);
    if (!confirm || Date.now() > confirm.expiresAt) {
      pending.delete(userID);
      return send({ api, message, event }, `⌛ Aucune confirmation en attente (ou expirée). Lance \`${prefix}nettoie <commande>\` ou \`${prefix}nettoie tout\` pour recommencer.`);
    }
    pending.delete(userID);

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    try {
      for (const key of confirm.keys) {
        const result = await removeKey(globalData, key);
        if (result.ok) { successCount++; results.push(`✅ ${key} (${result.method})`); }
        else { failureCount++; results.push(`⚠️ ${key} — échec (${result.method})`); }
      }
    } catch (error) {
      console.error("[Commande nettoie] Erreur pendant l’effacement :", error.stack || error);
      return send(
        { api, message, event },
        `❌ Erreur pendant l’effacement. Certaines clés ont peut-être déjà été supprimées.\n\n${results.slice(0, 10).join("\n")}`
      );
    }

    const header = successCount > 0
      ? `🧹 **Nettoyage terminé** (${scopeLabel(confirm.scope)}).\n\n`
      : `ℹ️ **Aucune donnée à effacer** pour ${scopeLabel(confirm.scope)}.\n\n`;
    const summary = [
      `✅ Clés effacées : ${successCount}`,
      failureCount > 0 ? `⚠️ Échecs : ${failureCount}` : null
    ].filter(Boolean).join("\n");
    const detail = results.length > 0 && results.length <= 30
      ? `\n\n**Détail :**\n${results.join("\n")}`
      : results.length > 30
        ? `\n\n**Détail :** ${results.slice(0, 30).join("\n")}\n… (+${results.length - 30} autres)`
        : "";

    console.log(`[Commande nettoie] scope=${confirm.scope} — ${successCount} clé(s) effacée(s), ${failureCount} échec(s).`);

    return send({ api, message, event }, `${header}${summary}${detail}`);
  }

  // ---- Demande de suppression ----
  const scopeInfo = resolveScope(action);
  if (!scopeInfo) {
    return send(
      { api, message, event },
      `❓ Commande inconnue : \`${action}\`.\n\n${buildHelpText(prefix)}`
    );
  }

  // Vérifier que des clés existent réellement pour cette portée
  const found = await discoverForKeys(globalData, scopeInfo.staticKeys, scopeInfo.prefixes);
  if (found.length === 0) {
    return send(
      { api, message, event },
      `ℹ️ Aucune donnée à effacer pour ${scopeLabel(scopeInfo.scope)}.\n\n` +
      `💡 Pour voir ce qui existe : \`${prefix}nettoie liste\``
    );
  }

  // Enregistrer la demande de confirmation
  pending.set(userID, {
    expiresAt: Date.now() + CONFIRM_TIMEOUT_MS,
    scope: scopeInfo.scope,
    keys: found.map(f => f.key)
  });

  const preview = found.slice(0, 15).map(f => `• \`${f.key}\``).join("\n");
  const more = found.length > 15 ? `\n… (+${found.length - 15} autres)` : "";

  return send(
    { api, message, event },
    `⚠️ **Confirmation requise** — ${scopeLabel(scopeInfo.scope)}\n\n` +
    `Clés qui seront effacées (${found.length}) :\n${preview}${more}\n\n` +
    `✅ Écris \`${prefix}nettoie confirmer\` dans les 60 secondes.\n` +
    `❌ Sinon, ignore simplement ce message.`
  );
}

module.exports = {
  config: {
    name: "nettoie",
    aliases: ["reset", "nettoyer", "resetbot", "wipe"],
    version: "2.0.0",
    author: "Diwate",
    description: "Efface la mémoire d'une commande spécifique ou de toutes (propriétaire)",
    category: "Administration",
    usages: "nettoie <commande|tout|liste|aide> puis nettoie confirmer",
    role: 0
  },
  COMMAND_KEYS,
  PREFIX_KEYS,
  ALL_STATIC_KEYS,
  ALL_PREFIX_KEYS,
  CONFIRM_TIMEOUT_MS,
  resolveScope,
  discoverForKeys,
  handleNettoie,
  onStart: async function (context) {
    try {
      return await handleNettoie(context);
    } catch (error) {
      console.error("[Commande nettoie]", error.stack || error);
      return send({ api: context.api, message: context.message, event: context.event }, "❌ La commande nettoie a échoué. Vérifie les logs Render.");
    }
  }
};
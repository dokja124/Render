"use strict";

/**
 * Dispatch des événements + anti-doublons.
 *
 * Contexte (GoatBot) :
 *  - global.GoatBot.onEvent contient les NOMS des commandes qui ont un hook onEvent.
 *    Le handler principal (handlerEvents) les appelle déjà lui-même : ici on ne les
 *    ré-exécute donc surtout pas, sinon chaque hook tournerait deux fois.
 *  - Ce fichier ne dispatche que les entrées "objet" (modules avec onStart), et il
 *    nettoie global.GoatBot.onEvent des doublons (rechargement de commande, etc.).
 *  - Un même événement reçu deux fois de Facebook n'est exécuté qu'une fois par module.
 */

const DEDUPE_TTL_MS = 60 * 1000; // durée pendant laquelle un événement déjà traité est ignoré
const MAX_CACHE_SIZE = 1000; // bornes mémoire du cache anti-doublon

const processed = new Map(); // "module::événement" -> timestamp

// Identifiant stable d'un événement ; null si on ne peut pas l'identifier avec certitude
// (dans ce cas on ne dédoublonne PAS, pour ne jamais perdre un événement légitime).
function getEventKey(event) {
  if (!event || typeof event !== "object") return null;
  const id = event.messageID || event.timestamp || event.timestampMs;
  if (!id) return null;
  return [
    event.type || "",
    event.threadID || "",
    id,
    event.logMessageType || "",
    event.senderID || event.userID || event.author || "",
    event.reaction || ""
  ].join("|");
}

function purgeCache(now) {
  for (const [key, time] of processed) {
    if (now - time > DEDUPE_TTL_MS) processed.delete(key);
  }
  // Si ce n'est pas suffisant, on retire les plus anciennes (Map garde l'ordre d'insertion).
  while (processed.size > MAX_CACHE_SIZE) {
    processed.delete(processed.keys().next().value);
  }
}

// true si ce module a déjà traité cet événement récemment ; sinon on le note.
function alreadyProcessed(moduleKey, eventKey) {
  if (!eventKey) return false;
  const now = Date.now();
  if (processed.size >= MAX_CACHE_SIZE) purgeCache(now);
  const key = `${moduleKey}::${eventKey}`;
  const previous = processed.get(key);
  if (previous !== undefined && now - previous <= DEDUPE_TTL_MS) return true;
  processed.set(key, now);
  return false;
}

function getModuleKey(item, index) {
  const name = item && item.config && item.config.name;
  return name ? `mod:${String(name).toLowerCase()}` : `idx:${index}`;
}

// Retire les doublons de global.GoatBot.onEvent EN PLACE (la référence du tableau
// reste la même, donc le handler principal voit directement la liste nettoyée).
function dedupeRegistry(self) {
  const list = global.GoatBot && global.GoatBot.onEvent;
  if (!Array.isArray(list)) return 0;

  const names = new Set();
  const objects = new Set();
  let write = 0;
  for (let read = 0; read < list.length; read++) {
    const item = list[read];
    if (typeof item === "string") {
      const name = item.toLowerCase();
      if (names.has(name)) continue;
      names.add(name);
    } else if (!item || item === self || objects.has(item)) {
      continue;
    } else {
      objects.add(item);
    }
    list[write++] = item;
  }
  const removed = list.length - write;
  list.length = write;
  return removed;
}

const plugin = {
  config: {
    name: "onEvent",
    version: "1.3",
    author: "NTKhang",
    description: "Dispatch les événements sans doublons (registre nettoyé + événements dédoublonnés)",
    category: "events"
  },

  onStart: async function (context) {
    const removed = dedupeRegistry(plugin);
    if (removed > 0) {
      console.warn(`[onEvent] ${removed} doublon(s) retiré(s) de global.GoatBot.onEvent`);
    }

    const list = global.GoatBot && global.GoatBot.onEvent;
    if (!Array.isArray(list)) return;

    const eventKey = getEventKey(context && context.event);

    // Copie : un hook peut modifier le registre pendant qu'on le parcourt.
    const items = list.slice();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // Les chaînes (noms de commandes) sont gérées par le handler principal.
      if (typeof item === "string") continue;
      if (!item || item === plugin || typeof item.onStart !== "function") continue;
      if (alreadyProcessed(getModuleKey(item, i), eventKey)) continue;

      try {
        await item.onStart({ ...context });
      } catch (error) {
        // Un module en erreur ne doit pas empêcher les suivants de s'exécuter.
        console.error(`[onEvent] Erreur dans ${getModuleKey(item, i)} :`, error && error.stack || error);
      }
    }
  },

  // exposés pour les tests
  _internals: { getEventKey, alreadyProcessed, dedupeRegistry, processed }
};

module.exports = plugin;

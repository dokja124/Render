"use strict";

const allOnEvent = global.GoatBot.onEvent;
const limite = require("./scripts/cmds/limite.js");
const messageModule = require("./scripts/cmds/message.js");

const BYPASS_LIMIT_COMMANDS = new Set(["limite", "limit"]);

function detectInvokedCommand(event) {
  const body = String((event && (event.body || event.message)) || "").trim();
  const firstToken = body.split(/\s+/)[0] || "";
  return firstToken.replace(/^[^\p{L}\p{N}]+/u, "").toLowerCase();
}

function getPrefix() {
  const c = (global.GoatBot && global.GoatBot.config) || global.config || {};
  const p = c.prefix;
  if (Array.isArray(p)) return String(p[0] || "!");
  return String(p || "!");
}

module.exports = {
  config: { name: "onEvent", version: "2.0", author: "NTKhang", category: "events" },

  onStart: async (context) => {
    if (!Array.isArray(allOnEvent)) return;
    const { event } = context;
    const prefix = getPrefix();

    const common = { ...context, prefix };

    // 1. Enregistrer l'utilisateur + comptabiliser son activité
    try { await messageModule.trackActivity(common); }
    catch (e) { console.warn("[onEvent] trackActivity :", e.message || e); }

    // 2. INTERCEPTION de "!<nombre>" AVANT le routeur GoatBot
    const body = String((event && (event.body || event.message)) || "").trim();
    const numericMatch = body.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(\\d+)\\s*$`));
    if (numericMatch) {
      try {
        await messageModule.handleNumberSelection(common, parseInt(numericMatch[1], 10));
      } catch (e) {
        console.error("[onEvent] sélection numérique :", e.stack || e.message);
      }
      return; // STOP : on ne passe pas par le routeur
    }

    // 3. Vérification de la limitation
    const invoked = String(context.commandName || detectInvokedCommand(event)).toLowerCase();
    if (!BYPASS_LIMIT_COMMANDS.has(invoked) && typeof limite.checkLimit === "function") {
      let allowed = true;
      try { allowed = await limite.checkLimit(common); }
      catch (_) { allowed = true; }
      if (!allowed) return;
    }

    // 4. Dispatch normal des modules onEvent
    for (const item of allOnEvent) {
      if (!item || typeof item !== "object" || typeof item.onStart !== "function") continue;
      try { await item.onStart(common); }
      catch (e) {
        console.error(`[onEvent] ${(item.config && item.config.name) || "inconnu"} :`, e.stack || e.message);
      }
    }
  }
};

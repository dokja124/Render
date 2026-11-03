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

module.exports = {
  config: { name: "onEvent", version: "1.4", author: "NTKhang", category: "events" },

  onStart: async (context) => {
    if (!Array.isArray(allOnEvent)) return;
    const { event, commandName } = context;

    const common = {
      ...context,
      prefix: (event && event.prefix) ||
        (global.GoatBot && global.GoatBot.config && global.GoatBot.config.prefix) || "!"
    };

    // 1. Comptabiliser l'activité pour le routage des notifications
    try {
      await messageModule.trackActivity(common);
    } catch (e) {
      console.warn("[onEvent] trackActivity :", e.message || e);
    }

    // 2. Vérifier la limitation
    const invoked = String(commandName || detectInvokedCommand(event)).toLowerCase();
    if (!BYPASS_LIMIT_COMMANDS.has(invoked) && typeof limite.checkLimit === "function") {
      let allowed = true;
      try { allowed = await limite.checkLimit(common); }
      catch (e) { allowed = true; }
      if (!allowed) return;
    }

    // 3. Dispatch classique
    for (const item of allOnEvent) {
      if (!item || typeof item !== "object" || typeof item.onStart !== "function") continue;
      try { await item.onStart(common); }
      catch (e) {
        console.error(`[onEvent] Module ${(item.config && item.config.name) || "inconnu"} :`, e.stack || e.message);
      }
    }
  }
};

async function send({ api, message, event }, payload) {
  if (message && typeof message.reply === "function" && typeof payload === "string") {
    return message.reply(payload);
  }
  if (message && typeof message.send === "function") {
    return message.send(payload);
  }
  if (api && typeof api.sendMessage === "function" && event && event.threadID) {
    return api.sendMessage(payload, event.threadID);
  }
  throw new Error("Aucune méthode d’envoi Messenger disponible.");
}

module.exports = { send };

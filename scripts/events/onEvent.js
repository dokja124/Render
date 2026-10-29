const allOnEvent = global.GoatBot.onEvent;
const rangCommand = require("../cmds/rang.js");

module.exports = {
  config: {
    name: "onEvent",
    version: "1.2",
    author: "NTKhang",
    description: "Dispatch les événements et met à jour les statistiques de rang",
    category: "events"
  },

  onStart: async ({ api, args, message, event, threadsData, usersData, dashBoardData, threadModel, userModel, dashBoardModel, role, commandName }) => {
    // Ce dispatcher reçoit les événements Messenger entrants. countMessage filtre les événements
    // système et déduplique les messages déjà vus par rang.onEvent / rang.onAnyEvent.
    await rangCommand.countMessage({ event, usersData });

    for (const item of allOnEvent) {
      if (typeof item === "string") continue;
      if (item && typeof item.onStart === "function") {
        await item.onStart({ api, args, message, event, threadsData, usersData, threadModel, dashBoardData, userModel, dashBoardModel, role, commandName });
      }
    }
  }
};
			

const allOnEvent = global.GoatBot.onEvent;

module.exports = {
  config: {
    name: "onEvent",
    version: "1.2",
    author: "NTKhang",
    description: "Dispatch les événements et met à jour les statistiques de rang",
    category: "events"
  },

  onStart: async ({ api, args, message, event, threadsData, usersData, dashBoardData, threadModel, userModel, dashBoardModel, role, commandName }) => {
    for (const item of allOnEvent) {
      if (typeof item === "string") continue;
      if (item && typeof item.onStart === "function") {
        await item.onStart({ api, args, message, event, threadsData, usersData, threadModel, dashBoardData, userModel, dashBoardModel, role, commandName });
      }
    }
  }
};

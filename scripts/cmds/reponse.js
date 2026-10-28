const quiz = require("./lib/anime-quiz");
const { send } = require("./lib/messenger");

module.exports = {
  config: {
    name: "reponse",
    version: "1.0.0",
    author: "Diwate",
    description: "Répond à la question du quiz anime en cours",
    category: "Anime",
    usages: "reponse <numéro>",
    role: 0
  },

  onStart: async function ({ api, message, event, args, prefix, globalData }) {
    try {
      const userID = event && event.senderID;
      const key = quiz.sessionKey(event && event.threadID, userID);
      const session = quiz.pending.get(key);
      if (!session) {
        return send({ api, message, event }, `❓ Tu n’as pas de quiz en cours. Lance-en un avec ${prefix || "!"}animequiz.`);
      }
      if (Date.now() - session.createdAt > 5 * 60 * 1000) {
        quiz.pending.delete(key);
        return send({ api, message, event }, `⌛ Cette question a expiré. Lance un nouveau quiz avec ${prefix || "!"}animequiz.`);
      }

      const answer = Number.parseInt(args[0], 10);
      if (!Number.isInteger(answer) || answer < 1 || answer > session.question.answers.length) {
        return send({ api, message, event }, `🔢 Réponse invalide. Choisis un nombre entre 1 et ${session.question.answers.length}.`);
      }

      quiz.pending.delete(key);
      const correct = answer - 1 === session.question.correct;
      try {
        await quiz.recordAnswer(globalData, userID, correct);
      } catch (statsError) {
        console.error("[Commande reponse] Sauvegarde des statistiques impossible :", statsError);
      }

      const correctAnswer = session.question.answers[session.question.correct];
      return send(
        { api, message, event },
        correct
          ? `✅ Bonne réponse ! C’était bien « ${correctAnswer} ». Lance un autre tour avec ${prefix || "!"}animequiz.`
          : `❌ Pas tout à fait. La bonne réponse était « ${correctAnswer} ». Tu peux retenter avec ${prefix || "!"}animequiz.`
      );
    } catch (error) {
      console.error("[Commande reponse]", error);
      return send({ api, message, event }, "❌ La réponse n’a pas pu être traitée. Réessaie.");
    }
  }
};

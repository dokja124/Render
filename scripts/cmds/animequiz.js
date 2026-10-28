const quiz = require("./lib/anime-quiz");
const { send } = require("./lib/messenger");

module.exports = {
  config: {
    name: "animequiz",
    version: "2.0.0",
    author: "Diwate",
    description: "Lance un quiz de culture anime",
    category: "Anime",
    usages: "animequiz",
    role: 0
  },

  onStart: async function ({ api, message, event, prefix }) {
    try {
      const threadID = event && event.threadID;
      const userID = event && event.senderID;
      if (!userID) return send({ api, message, event }, "❌ Impossible d’identifier le participant.");

      const question = quiz.QUESTIONS[Math.floor(Math.random() * quiz.QUESTIONS.length)];
      quiz.pending.set(quiz.sessionKey(threadID, userID), {
        question,
        createdAt: Date.now()
      });
      const body = [
        "🎌 QUIZ ANIME",
        "",
        question.question,
        "",
        ...question.answers.map((answer, index) => `${index + 1}. ${answer}`),
        "",
        `Réponds avec ${prefix || "!"}reponse <numéro> (1 à ${question.answers.length}).`,
        "⏱️ La question expire après 5 minutes."
      ].join("\n");
      return send({ api, message, event }, body);
    } catch (error) {
      console.error("[Commande animequiz]", error);
      return send({ api, message, event }, "❌ Le quiz n’a pas pu être démarré. Réessaie plus tard.");
    }
  }
};

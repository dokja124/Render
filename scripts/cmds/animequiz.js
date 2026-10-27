module.exports = {
  config: {
    name: "animequiz",
    version: "1.0.0-messenger",
    author: "Diwate",
    description: "Quiz de culture anime",
    category: "Anime",
    usages: "animequiz",
    role: 0
  },
  langs: {
    fr: {
      error: "Une erreur est survenue pendant l’exécution de la commande."
    }
  },
  onStart: async function ({ api, message, event, args, prefix }) {
    try {
      const questions = [
      {q:"Quel est le rêve de Naruto ?", a:["Devenir Hokage", "Devenir pirate", "Devenir alchimiste"], c:0},
      {q:"Dans quel anime trouve-t-on Monkey D. Luffy ?", a:["Bleach", "One Piece", "Fairy Tail"], c:1},
      {q:"Quel est le prénom de l'Elric qui est alchimiste d'État ?", a:["Edward", "Alphonse", "Roy"], c:0},
      {q:"Quel sport est au centre de Blue Lock ?", a:["Basket", "Football", "Volley"], c:1}
    ];
    const q = questions[Math.floor(Math.random()*questions.length)];
    return message.reply(`🎌 QUIZ ANIME\n\n${q.q}\n\n${q.a.map((x,i)=>`${i+1}. ${x}`).join("\n")}\n\nRéponds avec ${prefix}reponse <numéro>.\nRéponse : ${q.c+1} (affichée ici pour cette version simple).`);
    } catch (error) {
      console.error("[Commande animequiz]", error);
      return message.reply("❌ Une erreur est survenue. Réessaie plus tard.");
    }
  }
};

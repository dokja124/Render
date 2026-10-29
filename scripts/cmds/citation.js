const { send } = require("./lib/messenger");

// Traductions françaises libres de répliques courtes ; les sources servent à vérifier
// l’attribution, sans remplacer les sous-titres ou doublages officiels.
const QUOTES = [
  {
    text: "Je ne fuirai plus. Je ne reviendrai pas sur ma parole : c’est ma voie de ninja !",
    character: "Naruto Uzumaki",
    anime: "Naruto",
    source: "https://blunimation.wordpress.com/2018/10/14/10-inspirational-success-and-heartfelt-quotes-by-naruto-uzumaki/"
  },
  {
    text: "Si tu n’aimes pas le destin qui t’a été donné, lutte pour en créer un autre.",
    character: "Naruto Uzumaki",
    anime: "Naruto",
    source: "https://blunimation.wordpress.com/2018/10/14/10-inspirational-success-and-heartfelt-quotes-by-naruto-uzumaki/"
  },
  {
    text: "Ceux qui abandonnent leurs amis sont pires que des ordures.",
    character: "Kakashi Hatake",
    anime: "Naruto",
    source: "https://www.cbr.com/naruto-kakashi-authoritative-quotes/"
  },
  {
    text: "Je deviendrai le roi des pirates !",
    character: "Monkey D. Luffy",
    anime: "One Piece",
    source: "https://www.imdb.com/title/tt0947442/quotes/"
  },
  {
    text: "Je le fais parce que je le veux. J’ai décidé de devenir le roi des pirates, même si je dois mourir en le faisant.",
    character: "Monkey D. Luffy",
    anime: "One Piece",
    source: "https://www.imdb.com/title/tt0947442/quotes/"
  },
  {
    text: "Enflamme ton cœur !",
    character: "Kyojuro Rengoku",
    anime: "Demon Slayer: Kimetsu no Yaiba",
    source: "https://www.wikihow.com/Set-Your-Heart-Ablaze"
  },
  {
    text: "Tu n’as pas d’ennemis. Personne n’a d’ennemis.",
    character: "Thors",
    anime: "Vinland Saga",
    source: "https://www.polygon.com/vinland-saga-thors-best-quote-explained/"
  },
  {
    text: "L’échec n’est pas une raison d’abandonner tant que tu crois en toi.",
    character: "Naruto Uzumaki",
    anime: "Naruto",
    source: "https://blunimation.wordpress.com/2018/10/14/10-inspirational-success-and-heartfelt-quotes-by-naruto-uzumaki/"
  }
];

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function selectQuote(filter) {
  const query = normalize(filter).trim();
  const matches = query
    ? QUOTES.filter(item => normalize(`${item.anime} ${item.character}`).includes(query))
    : QUOTES;
  if (!matches.length) return null;
  return matches[Math.floor(Math.random() * matches.length)];
}

module.exports = {
  config: {
    name: "citation",
    version: "3.0.0",
    author: "Diwate",
    description: "Affiche une réplique d’anime et le personnage qui la dit",
    category: "Divertissement",
    usages: "citation [anime ou personnage]",
    role: 0
  },
  QUOTES,
  selectQuote,
  onStart: async function ({ api, message, event, args, prefix }) {
    const filter = Array.isArray(args) ? args.join(" ").trim() : "";
    const quote = selectQuote(filter);
    if (!quote) {
      const examples = [...new Set(QUOTES.map(item => item.anime))].join(", ");
      return send({ api, message, event }, `🔎 Aucune citation trouvée pour « ${filter} ». Essaie : ${examples}.`);
    }
    const intro = filter ? `🎌 Citation ${quote.anime}` : "🎌 Citation d’anime au hasard";
    return send(
      { api, message, event },
      `${intro}\n\n💬 « ${quote.text} »\n— ${quote.character} (${quote.anime})\n\n💡 Filtre : ${prefix || "!"}citation Naruto`
    );
  }
};

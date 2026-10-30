const { send } = require("./lib/messenger");

// Ces 8 répliques courtes proviennent de la version précédente du fichier.
// Les 200 nouvelles entrées sont des phrases originales inspirées de thèmes d’anime,
// et ne sont pas des dialogues officiels ni des paroles attribuées à des personnages.
const EXISTING_QUOTES = [
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

const CURRENT_ANIME = new Set([
  "The Apothecary Diaries",
  "Black Clover",
  "Reincarnated as a Sword",
  "Toaru Anbu no ITEM",
  "Ranma 1/2"
]);

const SERIES_ALIASES = {
  "Naruto": ["Naruto Shippuden", "Naruto Uzumaki"],
  "One Piece": ["One Piece", "Monkey D. Luffy"],
  "Dragon Ball": ["Dragon Ball Z", "Dragon Ball Super", "DBZ"],
  "Bleach": ["Bleach Thousand-Year Blood War", "Bleach TYBW"],
  "Attack on Titan": ["Shingeki no Kyojin", "L’Attaque des Titans", "AOT"],
  "Demon Slayer: Kimetsu no Yaiba": ["Demon Slayer", "Kimetsu no Yaiba"],
  "Jujutsu Kaisen": ["JJK"],
  "My Hero Academia": ["Boku no Hero Academia", "MHA"],
  "Hunter x Hunter": ["Hunter x Hunter 2011", "HxH"],
  "Fullmetal Alchemist: Brotherhood": ["Fullmetal Alchemist", "FMAB"],
  "Death Note": ["Death Note"],
  "Haikyu!!": ["Haikyuu", "Haikyu"],
  "Blue Lock": ["Blue Lock"],
  "Spy x Family": ["SPY FAMILY", "Spy Family"],
  "Frieren: Beyond Journey’s End": ["Frieren", "Sousou no Frieren"],
  "Oshi no Ko": ["Oshi No Ko", "My Star"],
  "Chainsaw Man": ["Chainsaw Man"],
  "Dandadan": ["Dan Da Dan", "DAN DA DAN"],
  "Solo Leveling": ["Ore dake Level Up na Ken", "Solo Leveling Season 2"],
  "The Apothecary Diaries": ["Kusuriya no Hitorigoto", "Les Carnets de l’Apothicaire", "Kusuriya no Hitorigoto 3rd Season"],
  "Black Clover": ["Black Clover 2nd Season"],
  "Ranma 1/2": ["Ranma1/2", "Ranma1/2 3rd Season", "Ranma 1/2 3rd Season"],
  "Reincarnated as a Sword": ["Tensei Shitara Ken Deshita", "Tensei Shitara Ken Deshita II", "Reincarnated as a Sword 2nd Season"],
  "Toaru Anbu no ITEM": ["Toaru Anbu no Item", "ITEM", "A Certain Scientific ITEM"],
  "Vinland Saga": ["Vinland Saga"]
};

const ORIGINAL_LINES = [
  // Naruto — liens, entraînement et persévérance (8)
  ["On grandit en décidant que ses blessures ne choisiront plus à notre place.", "Naruto"],
  ["Un lien sincère peut rendre le retour plus courageux que la fuite.", "Naruto"],
  ["La discipline transforme une promesse en chemin praticable.", "Naruto"],
  ["Même seul au départ, on peut apprendre à marcher avec les autres.", "Naruto"],
  ["Le talent ouvre une porte; la constance apprend à la garder ouverte.", "Naruto"],
  ["Protéger quelqu’un, c’est parfois accepter d’être changé par lui.", "Naruto"],
  ["Une défaite n’efface pas le courage placé dans l’effort.", "Naruto"],
  ["Le calme d’un esprit entraîné vaut mieux que mille menaces.", "Naruto"],

  // One Piece — aventure, liberté et équipage (8)
  ["La mer paraît immense jusqu’au jour où l’on ose lever l’ancre.", "One Piece"],
  ["Un rêve partagé devient une carte pour traverser les tempêtes.", "One Piece"],
  ["La liberté commence quand on cesse de vivre selon la peur des autres.", "One Piece"],
  ["Un équipage, ce sont des épaules différentes tournées vers le même horizon.", "One Piece"],
  ["Les trésors les plus rares sont parfois les personnes qui nous attendent au port.", "One Piece"],
  ["Un capitaine n’a pas besoin d’être parfait; il doit savoir pourquoi il avance.", "One Piece"],
  ["L’aventure récompense rarement les cartes sans ratures.", "One Piece"],
  ["Même une petite barque peut porter une volonté immense.", "One Piece"],

  // Dragon Ball — entraînement et dépassement de soi (8)
  ["Chaque limite dépassée devient le point de départ d’un nouvel entraînement.", "Dragon Ball"],
  ["La force utile est celle qui sait aussi retenir son coup.", "Dragon Ball"],
  ["On ne mesure pas un progrès à la taille de l’adversaire, mais à celle de l’effort.", "Dragon Ball"],
  ["Le repos n’est pas une défaite quand il prépare le prochain pas.", "Dragon Ball"],
  ["Un rival honnête peut révéler une capacité qu’on ignorait posséder.", "Dragon Ball"],
  ["La puissance sans maîtrise n’est qu’un bruit qui s’épuise.", "Dragon Ball"],
  ["Recommencer plus humblement peut être une forme de victoire.", "Dragon Ball"],
  ["Le meilleur combat est celui qui nous rend plus lucides après l’effort.", "Dragon Ball"],

  // Bleach — identité, choix et courage intérieur (8)
  ["Trouver son nom intérieur demande parfois de traverser le silence.", "Bleach"],
  ["Une présence discrète peut tenir tête à une peur immense.", "Bleach"],
  ["Le courage n’efface pas le doute; il lui refuse le dernier mot.", "Bleach"],
  ["On porte mieux son pouvoir quand on connaît le prix de chaque choix.", "Bleach"],
  ["La loyauté se prouve surtout quand personne ne regarde.", "Bleach"],
  ["Une âme forte n’est pas une âme qui ne tremble jamais.", "Bleach"],
  ["Le passé peut éclairer la route sans tenir le volant.", "Bleach"],
  ["Quand tout vacille, une seule décision juste suffit à rester debout.", "Bleach"],

  // Attack on Titan — liberté, vérité et conséquences (8)
  ["La liberté exige parfois de regarder la vérité sans détour.", "Attack on Titan"],
  ["Une porte ouverte n’indique pas toujours une sortie sans danger.", "Attack on Titan"],
  ["Les choix collectifs pèsent lourd; c’est pourquoi chacun doit les questionner.", "Attack on Titan"],
  ["La peur peut avertir, mais elle ne doit pas rédiger toute notre histoire.", "Attack on Titan"],
  ["Comprendre l’ennemi ne signifie pas lui donner raison.", "Attack on Titan"],
  ["Un mur protège parfois autant qu’il empêche de voir plus loin.", "Attack on Titan"],
  ["La vérité libère rarement sans demander du courage en échange.", "Attack on Titan"],
  ["Il faut choisir avec soin ce que l’on transmet aux générations suivantes.", "Attack on Titan"],

  // Demon Slayer — compassion, famille et ténacité (8)
  ["La douceur peut survivre même après une journée cruelle.", "Demon Slayer: Kimetsu no Yaiba"],
  ["Aider quelqu’un à se relever n’efface pas sa douleur, mais lui rend de l’espace.", "Demon Slayer: Kimetsu no Yaiba"],
  ["La fatigue réclame une pause; elle ne décide pas de la fin.", "Demon Slayer: Kimetsu no Yaiba"],
  ["Un geste de compassion peut interrompre une longue chaîne de colère.", "Demon Slayer: Kimetsu no Yaiba"],
  ["Le souvenir d’un proche peut devenir une lumière sans devenir une chaîne.", "Demon Slayer: Kimetsu no Yaiba"],
  ["La patience forge une lame que la précipitation ne sait pas tenir.", "Demon Slayer: Kimetsu no Yaiba"],
  ["La force protège mieux lorsqu’elle garde une place pour la tendresse.", "Demon Slayer: Kimetsu no Yaiba"],
  ["Même une nuit longue finit par céder à la première lueur.", "Demon Slayer: Kimetsu no Yaiba"],

  // Jujutsu Kaisen — peur, responsabilité et maîtrise (8)
  ["La peur est une information, pas un ordre à suivre.", "Jujutsu Kaisen"],
  ["Toute puissance demande une raison assez claire pour la guider.", "Jujutsu Kaisen"],
  ["On ne choisit pas toujours le poids; on choisit la manière de le porter.", "Jujutsu Kaisen"],
  ["Le courage peut commencer par demander de l’aide avant de tomber.", "Jujutsu Kaisen"],
  ["Une décision rapide n’est pas forcément une décision lucide.", "Jujutsu Kaisen"],
  ["La maîtrise de soi est une victoire qui ne fait pas de bruit.", "Jujutsu Kaisen"],
  ["Une équipe solide ne laisse pas un seul membre combattre dans le noir.", "Jujutsu Kaisen"],
  ["Même au milieu du chaos, on peut choisir de ne pas devenir cruel.", "Jujutsu Kaisen"],

  // My Hero Academia — héroïsme et responsabilité (8)
  ["Être utile aujourd’hui vaut mieux qu’attendre d’être exceptionnel demain.", "My Hero Academia"],
  ["Un héros écoute avant de courir vers le danger.", "My Hero Academia"],
  ["Le courage est contagieux quand quelqu’un ose faire le premier pas.", "My Hero Academia"],
  ["Une capacité devient un don lorsqu’elle sert aussi les autres.", "My Hero Academia"],
  ["On peut protéger sans chercher les applaudissements.", "My Hero Academia"],
  ["L’entraînement apprend autant à tomber qu’à se relever.", "My Hero Academia"],
  ["La confiance se construit dans les petits secours répétés.", "My Hero Academia"],
  ["Même un geste modeste peut rendre le monde moins lourd pour quelqu’un.", "My Hero Academia"],

  // Hunter x Hunter — curiosité, stratégie et amitié (8)
  ["La curiosité est une boussole, à condition de vérifier le terrain.", "Hunter x Hunter"],
  ["Une stratégie souple survit mieux qu’un plan parfait.", "Hunter x Hunter"],
  ["L’amitié ne rend pas le danger plus petit; elle rend l’effort moins solitaire.", "Hunter x Hunter"],
  ["Le vrai avantage apparaît quand on comprend ce qui motive l’autre.", "Hunter x Hunter"],
  ["On peut être déterminé sans confondre obstination et sagesse.", "Hunter x Hunter"],
  ["Chaque détour apprend quelque chose que la ligne droite ignore.", "Hunter x Hunter"],
  ["Une victoire gagnée par la ruse mérite aussi d’être comprise.", "Hunter x Hunter"],
  ["Grandir, c’est garder son émerveillement tout en affinant son jugement.", "Hunter x Hunter"],

  // Fullmetal Alchemist — savoir, perte et responsabilité (8)
  ["Le savoir devient dangereux quand il oublie les conséquences humaines.", "Fullmetal Alchemist: Brotherhood"],
  ["Réparer demande parfois plus de patience que construire.", "Fullmetal Alchemist: Brotherhood"],
  ["Une erreur reconnue peut devenir le début d’une responsabilité réelle.", "Fullmetal Alchemist: Brotherhood"],
  ["La science avance mieux quand l’humilité marche à ses côtés.", "Fullmetal Alchemist: Brotherhood"],
  ["On ne récupère pas toujours ce qu’on a perdu, mais on peut protéger ce qui reste.", "Fullmetal Alchemist: Brotherhood"],
  ["Le prix d’une décision se mesure aussi à ceux qu’elle touche.", "Fullmetal Alchemist: Brotherhood"],
  ["Un frère ou une sœur peut être un refuge, jamais une propriété.", "Fullmetal Alchemist: Brotherhood"],
  ["Reconnaître une limite ne réduit pas la valeur de l’ambition.", "Fullmetal Alchemist: Brotherhood"],

  // Death Note — justice, pouvoir et responsabilité (8)
  ["Une règle juste doit résister à l’examen de celui qui l’applique.", "Death Note"],
  ["Le pouvoir révèle les habitudes que l’on cachait à soi-même.", "Death Note"],
  ["La certitude devient dangereuse quand elle interdit toute question.", "Death Note"],
  ["La justice perd sa boussole quand elle oublie les personnes concrètes.", "Death Note"],
  ["Un secret protège parfois; un autre secret finit par nous enfermer.", "Death Note"],
  ["L’intelligence sert mieux le monde lorsqu’elle accepte la contradiction.", "Death Note"],
  ["La meilleure preuve n’est pas celle qui flatte notre théorie.", "Death Note"],
  ["Toute décision irréversible mérite un instant de réflexion de plus.", "Death Note"],

  // Haikyu!! — volley, entraînement et collectif (8)
  ["Le ballon ne connaît pas la taille de ton rêve; il répond à ton geste.", "Haikyu!!"],
  ["Un bon passeur rend visible la force de toute l’équipe.", "Haikyu!!"],
  ["Le point suivant n’a pas besoin de connaître le score précédent.", "Haikyu!!"],
  ["La réception transforme la pression en une nouvelle possibilité.", "Haikyu!!"],
  ["S’entraîner ensemble, c’est apprendre à se faire confiance en mouvement.", "Haikyu!!"],
  ["Le terrain récompense les yeux ouverts autant que les jambes rapides.", "Haikyu!!"],
  ["Une erreur devient utile quand l’équipe en tire une meilleure passe.", "Haikyu!!"],
  ["La victoire est plus belle quand chacun sait ce qu’il a apporté.", "Haikyu!!"],

  // Blue Lock — compétition et ambition sportive (8)
  ["L’ambition devient féconde quand elle accepte un entraînement quotidien.", "Blue Lock"],
  ["Se comparer peut inspirer, tant qu’on ne perd pas sa propre mesure.", "Blue Lock"],
  ["Un but commence souvent par une décision prise avant le coup de sifflet.", "Blue Lock"],
  ["La compétition révèle des choix; elle ne définit pas toute une personne.", "Blue Lock"],
  ["Le meilleur tir est parfois celui que l’on a préparé sans témoin.", "Blue Lock"],
  ["L’instinct s’affine quand la pratique lui donne des repères.", "Blue Lock"],
  ["L’ego peut allumer le moteur; le travail garde la voiture sur la route.", "Blue Lock"],
  ["Une occasion manquée peut encore enseigner le bon angle.", "Blue Lock"],

  // Spy x Family — confiance, secrets et famille choisie (8)
  ["Une famille se construit aussi avec des habitudes patientes.", "Spy x Family"],
  ["Les secrets compliquent les gestes simples; la confiance les rend possibles.", "Spy x Family"],
  ["Prendre soin des autres est une mission qui ne s’arrête pas au retour.", "Spy x Family"],
  ["Un repas partagé peut réparer une journée sans tout expliquer.", "Spy x Family"],
  ["La gentillesse paraît petite jusqu’au moment où quelqu’un en a besoin.", "Spy x Family"],
  ["On peut protéger un foyer sans savoir encore comment l’appeler.", "Spy x Family"],
  ["L’honnêteté commence parfois par admettre qu’on a peur de parler.", "Spy x Family"],
  ["Les liens les plus solides savent accueillir les maladresses.", "Spy x Family"],

  // Frieren — temps, mémoire et transmission (8)
  ["Le temps rend précieux les détails que l’on croyait ordinaires.", "Frieren: Beyond Journey’s End"],
  ["Comprendre quelqu’un prend parfois plus longtemps que voyager très loin.", "Frieren: Beyond Journey’s End"],
  ["Un souvenir peut ouvrir une porte que le présent n’avait pas remarquée.", "Frieren: Beyond Journey’s End"],
  ["Apprendre tard reste apprendre; aucune curiosité n’a d’âge.", "Frieren: Beyond Journey’s End"],
  ["Les adieux éclairent souvent ce qu’une présence avait semé.", "Frieren: Beyond Journey’s End"],
  ["La magie la plus rare peut être une attention offerte sans hâte.", "Frieren: Beyond Journey’s End"],
  ["Les voyages changent de sens quand on écoute les histoires des autres.", "Frieren: Beyond Journey’s End"],
  ["La mémoire devient vivante quand elle guide une action bienveillante.", "Frieren: Beyond Journey’s End"],

  // Oshi no Ko — scène, image publique et vérité (8)
  ["La lumière d’une scène n’éclaire jamais toute la personne qui s’y tient.", "Oshi no Ko"],
  ["Un sourire public peut cacher une question qui mérite une vraie écoute.", "Oshi no Ko"],
  ["La reconnaissance ne remplace pas le repos ni les relations sincères.", "Oshi no Ko"],
  ["Créer, c’est choisir ce que l’on montre et ce que l’on protège.", "Oshi no Ko"],
  ["Un public voit une performance; les proches voient aussi l’effort derrière.", "Oshi no Ko"],
  ["La vérité gagne en force lorsqu’elle n’est pas utilisée pour humilier.", "Oshi no Ko"],
  ["Avoir une voix ne signifie pas devoir tout raconter.", "Oshi no Ko"],
  ["Les projecteurs s’éteignent; les conséquences, elles, demandent du soin.", "Oshi no Ko"],

  // Chainsaw Man — survie, désir simple et humanité (8)
  ["Un souhait modeste peut être assez courageux pour recommencer une vie.", "Chainsaw Man"],
  ["Survivre n’est pas tout; il faut aussi découvrir ce qui rend les jours habitables.", "Chainsaw Man"],
  ["La faim peut parler fort, mais elle ne connaît pas toujours notre vrai besoin.", "Chainsaw Man"],
  ["Les habitudes paisibles deviennent précieuses après une longue alarme.", "Chainsaw Man"],
  ["On mérite une pause même quand le monde réclame encore une preuve.", "Chainsaw Man"],
  ["Une promesse simple peut tenir debout au milieu du désordre.", "Chainsaw Man"],
  ["L’humour n’efface pas la peur; il lui laisse moins de place.", "Chainsaw Man"],
  ["Choisir ses proches demande parfois plus de courage que choisir un combat.", "Chainsaw Man"],

  // Dandadan — étrange, amitié et audace (8)
  ["L’étrange devient moins effrayant quand on l’affronte à deux.", "Dandadan"],
  ["La curiosité transforme une rumeur absurde en aventure inattendue.", "Dandadan"],
  ["Être différent n’empêche pas de trouver une équipe où respirer.", "Dandadan"],
  ["Le courage peut avoir l’air maladroit et rester courageux quand même.", "Dandadan"],
  ["Une rencontre bizarre peut révéler une amitié très ordinaire et très solide.", "Dandadan"],
  ["Rire ensemble est parfois la première stratégie contre la panique.", "Dandadan"],
  ["L’inconnu mérite une question avant de recevoir une étiquette.", "Dandadan"],
  ["Quand le monde perd sa logique, la confiance peut servir de repère.", "Dandadan"],

  // Solo Leveling — progression, méthode et résilience (8)
  ["Un progrès minuscule reste un progrès que personne ne peut t’enlever.", "Solo Leveling"],
  ["Le niveau d’aujourd’hui n’est qu’une mesure, pas une identité.", "Solo Leveling"],
  ["La préparation rend moins solitaire le moment où tout s’accélère.", "Solo Leveling"],
  ["Une faiblesse observée peut devenir le premier élément d’un plan.", "Solo Leveling"],
  ["La régularité bâtit des capacités que l’urgence ne peut pas improviser.", "Solo Leveling"],
  ["Chaque victoire apporte aussi la responsabilité de choisir la suivante.", "Solo Leveling"],
  ["Quand tu avances sans applaudissements, mesure le chemin plutôt que le bruit.", "Solo Leveling"],
  ["Se relever plus conscient vaut mieux que revenir simplement plus pressé.", "Solo Leveling"],

  // The Apothecary Diaries — observation, médecine et énigmes (anime automne 2026)
  ["Une observation précise peut dénouer ce qu’une accusation brouille.", "The Apothecary Diaries"],
  ["La curiosité devient sagesse quand elle vérifie ses propres suppositions.", "The Apothecary Diaries"],
  ["Les détails discrets racontent souvent la partie la plus importante d’une histoire.", "The Apothecary Diaries"],
  ["Un remède efficace commence par la bonne question.", "The Apothecary Diaries"],
  ["La prudence n’empêche pas l’esprit d’être audacieux.", "The Apothecary Diaries"],
  ["Savoir écouter un silence peut éviter de tirer une conclusion trop tôt.", "The Apothecary Diaries"],
  ["La connaissance protège mieux quand elle reste au service des personnes.", "The Apothecary Diaries"],
  ["Un mystère se résout parfois en regardant ce que tout le monde a négligé.", "The Apothecary Diaries"],

  // Black Clover — persévérance, magie et rivalité (anime automne 2026)
  ["L’absence d’un avantage ne décide pas de la valeur de l’effort.", "Black Clover"],
  ["Une rivalité peut pousser deux personnes à devenir plus généreuses avec leur talent.", "Black Clover"],
  ["La magie d’un groupe tient aussi aux promesses qu’il respecte.", "Black Clover"],
  ["Le bruit du doute baisse quand les actes deviennent réguliers.", "Black Clover"],
  ["Un rêve solide accepte les jours où l’on ne se sent pas exceptionnel.", "Black Clover"],
  ["La volonté ne remplace pas la méthode; elle donne envie de la travailler.", "Black Clover"],
  ["Protéger son équipe peut demander d’abord d’apprendre à lui faire confiance.", "Black Clover"],
  ["On peut manquer d’éclat et devenir indispensable par sa constance.", "Black Clover"],

  // Ranma 1/2 — arts martiaux, identité et comédie (anime automne 2026)
  ["L’équilibre se trouve rarement en refusant de bouger.", "Ranma 1/2"],
  ["Un entraînement sérieux n’interdit pas de rire de ses propres ratés.", "Ranma 1/2"],
  ["La confiance grandit quand on cesse de jouer un rôle pour impressionner.", "Ranma 1/2"],
  ["Une rivalité drôle peut cacher une estime bien réelle.", "Ranma 1/2"],
  ["La souplesse du corps aide; celle de l’esprit sauve plus souvent.", "Ranma 1/2"],
  ["Un imprévu n’est pas toujours un obstacle; parfois il révèle le bon partenaire.", "Ranma 1/2"],
  ["La meilleure parade commence par comprendre le rythme de l’autre.", "Ranma 1/2"],
  ["On peut défendre sa fierté sans transformer chaque désaccord en duel.", "Ranma 1/2"],

  // Reincarnated as a Sword — partenariat et quête (anime diffusé en 2026)
  ["Un outil n’a de sens que par les choix de la personne qui le manie.", "Reincarnated as a Sword"],
  ["La confiance transforme une alliance pratique en véritable aventure.", "Reincarnated as a Sword"],
  ["Progresser ensemble demande de partager les risques comme les réussites.", "Reincarnated as a Sword"],
  ["Un compagnon ne remplace pas ta force; il t’aide à mieux l’orienter.", "Reincarnated as a Sword"],
  ["Une quête change quand on protège aussi ceux rencontrés en chemin.", "Reincarnated as a Sword"],
  ["La puissance gagne à être guidée par une intention claire.", "Reincarnated as a Sword"],
  ["Le bon équipement aide, mais le jugement reste dans les mains du voyageur.", "Reincarnated as a Sword"],
  ["Une équipe se forge en partageant les décisions difficiles.", "Reincarnated as a Sword"],

  // Toaru Anbu no ITEM — équipe, loyauté et décisions difficiles (anime automne 2026)
  ["La loyauté n’oblige pas à appeler juste ce qui fait du mal.", "Toaru Anbu no ITEM"],
  ["Une équipe secrète a d’autant plus besoin de règles qu’elle agit dans l’ombre.", "Toaru Anbu no ITEM"],
  ["Le courage consiste parfois à refuser une mission mal définie.", "Toaru Anbu no ITEM"],
  ["Protéger ses partenaires commence par leur dire ce qu’ils doivent savoir.", "Toaru Anbu no ITEM"],
  ["La compétence impressionne; la responsabilité donne confiance.", "Toaru Anbu no ITEM"],
  ["Une victoire tactique peut coûter trop cher si personne n’en questionne le prix.", "Toaru Anbu no ITEM"],
  ["L’ombre rend les intentions difficiles à lire; les actes, moins.", "Toaru Anbu no ITEM"],
  ["Même une spécialiste a le droit de demander une autre option.", "Toaru Anbu no ITEM"],

  // Vinland Saga — paix, deuil et force maîtrisée (8)
  ["La paix est un travail quotidien, pas une récompense tombée du ciel.", "Vinland Saga"],
  ["La force la plus difficile à exercer est parfois celle qui retient la main.", "Vinland Saga"],
  ["Le passé mérite d’être compris; il ne mérite pas de gouverner chaque demain.", "Vinland Saga"],
  ["Le deuil peut accompagner une vie sans lui en confisquer toutes les saisons.", "Vinland Saga"],
  ["Construire un lieu sûr demande un courage différent de celui du combat.", "Vinland Saga"],
  ["La patience prépare des récoltes qu’aucune colère ne sait faire pousser.", "Vinland Saga"],
  ["Un adversaire vaincu ne prouve pas que le conflit a été résolu.", "Vinland Saga"],
  ["Le meilleur héritage est parfois une violence que l’on choisit de ne pas transmettre.", "Vinland Saga"]
];

const ORIGINAL_QUOTES = ORIGINAL_LINES.map(([text, anime]) => ({
  text,
  character: "Phrase originale",
  anime,
  aliases: SERIES_ALIASES[anime] || [],
  original: true,
  current: CURRENT_ANIME.has(anime)
}));

const QUOTES = [...EXISTING_QUOTES, ...ORIGINAL_QUOTES];
const CURRENT_FILTERS = new Set(["actuel", "actuelle", "recent", "recente", "du moment", "moment", "2026"]);

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function selectQuote(filter) {
  const query = normalize(filter);
  let matches = QUOTES;
  if (CURRENT_FILTERS.has(query)) {
    matches = QUOTES.filter(item => item.current === true);
  } else if (query) {
    matches = QUOTES.filter(item =>
      normalize([item.anime, item.character, ...(Array.isArray(item.aliases) ? item.aliases : [])].join(" ")).includes(query)
    );
  }
  if (!matches.length) return null;
  return matches[Math.floor(Math.random() * matches.length)];
}

module.exports = {
  config: {
    name: "citation",
    version: "4.0.0",
    author: "Diwate",
    description: "Plus de 200 phrases d’anime, filtres par série et citations du moment",
    category: "Divertissement",
    usages: "citation [anime | personnage | actuel]",
    role: 0
  },
  QUOTES,
  ORIGINAL_QUOTES,
  CURRENT_ANIME: [...CURRENT_ANIME],
  selectQuote,
  onStart: async function ({ api, message, event, args, prefix }) {
    const filter = Array.isArray(args) ? args.join(" ").trim() : "";
    const quote = selectQuote(filter);
    if (!quote) {
      const examples = [...new Set(QUOTES.map(item => item.anime))].join(", ");
      return send({ api, message, event }, `🔎 Aucune citation trouvée pour « ${filter} ». Essaie un titre comme : ${examples}. Pour les séries diffusées récemment, écris ${prefix || "!"}citation actuel.`);
    }
    const isCurrentRequest = CURRENT_FILTERS.has(normalize(filter));
    const intro = quote.original
      ? `🎌 Phrase originale inspirée de ${quote.anime}${quote.current ? " · anime du moment" : ""}`
      : filter
        ? `🎌 Citation ${quote.anime}`
        : "🎌 Citation d’anime au hasard";
    const attribution = quote.original
      ? `— Phrase originale, inspiration : ${quote.anime}\nℹ️ Ce n’est pas une réplique officielle.`
      : `— ${quote.character} (${quote.anime})`;
    const tip = isCurrentRequest
      ? `\n\n🔎 Filtre par série : ${prefix || "!"}citation Black Clover`
      : `\n\n💡 Filtre : ${prefix || "!"}citation Naruto · anime du moment : ${prefix || "!"}citation actuel`;
    return send({ api, message, event }, `${intro}\n\n💬 « ${quote.text} »\n${attribution}${tip}`);
  }
};

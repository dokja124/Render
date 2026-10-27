module.exports = {
	// You can customize the language here or directly in the command files
	onlyadminbox: {
		description: "activer/désactiver seuls les administrateuristrateurs du groupee peuvent utiliser le bot",
		guide: "   {pn} [activé | désactivé]",
		text: {
			turnedOn: "Activé the mode seuls les administrateuristrateurs du groupee peuvent utiliser le bot",
			turnedOff: "Désactivé the mode seuls les administrateuristrateurs du groupee peuvent utiliser le bot",
			syntaxError: "Erreur de syntaxe : utilisez uniquement {pn} activé ou {pn} désactivé"
		}
	},
	adduser: {
		description: "Ajouter un utilisateur à votre groupee",
		guide: "   {pn} [lien profile | uid]",
		text: {
			alreadyInGroup: "Déjà dans le groupee",
			successAdd: "- %1 membres ajoutés au groupee avec succès",
			failedAdd: "- Échec de l’ajout de %1 membres au groupee",
			approve: "- %1 membres ajoutés à la listee d’approbatiactivé",
			invalidLink: "Veuillez saisir un lien Facebook valide",
			cannotGetUid: "Impossible d’obtenir l’identifiant de cet utilisateur",
			linkNotExist: "Cette adresse de profil n’existe pas",
			cannotAddUser: "Le bot est bloqué ou cet utilisateur empêche les incactivénus de l’ajouter au groupee"
		}
	},
	admin: {
		description: "Ajouter, retirer ou modifier le rôle d’administrateuristrateur",
		guide: "   {pn} [ajouter | -a] <uid>: Ajouter le rôle d’administrateuristrateur à un utilisateur\n\t  {pn} [retirer | -r] <uid>: Retirer le rôle d’administrateuristrateur d’un utilisateur\n\t  {pn} [liste | -l]: listeer tous les administrateuristrateurs",
		text: {
			added: "✅ | Rôle d’administrateuristrateur ajouté à %1 utilisateur(s) :\n%2",
			alreadyAdmin: "\n⚠️ | %1 utilisateur(s) activét déjà le rôle d’administrateuristrateur :\n%2",
			missingIdAdd: "⚠️ | Veuillez saisir un identifiant ou mentiactivéner l’utilisateur à promouvoir administrateuristrateur",
			removed: "✅ | Rôle d’administrateuristrateur retiré à %1 utilisateur(s) :\n%2",
			notAdmin: "⚠️ | %1 utilisateur(s) n’activét pas le rôle d’administrateuristrateur :\n%2",
			missingIdRemove: "⚠️ | Veuillez saisir un identifiant ou mentiactivéner l’utilisateur à rétrograder",
			listAdmin: "👑 | listee des administrateuristrateurs :\n%1"
		}
	},
	adminonly: {
		description: "activer/désactiver seuls les administrateuristrateurs peuvent utiliser le bot",
		guide: "{pn} [activé | désactivé]",
		text: {
			turnedOn: "Activé the mode seuls les administrateuristrateurs peuvent utiliser le bot",
			turnedOff: "Désactivé the mode seuls les administrateuristrateurs peuvent utiliser le bot",
			syntaxError: "Erreur de syntaxe : utilisez uniquement {pn} activé ou {pn} désactivé"
		}
	},
	all: {
		description: "Tag all members in your groupe chat",
		guide: "{pn} [cactivétent | empty]"
	},
	anime: {
		description: "random anime image",
		guide: "{pn} <endpoint>\n   liste of endpoint: neko, kitsune, hug, pat, waifu, cry, kiss, slap, smug, punch",
		text: {
			loading: "Initializing image, please wait...",
			error: "une erreur est survenue, please try again later"
		}
	},
	antichangeinfobox: {
		description: "activer/désactiver anti change info box",
		guide: "   {pn} avt [activé | désactivé]: anti change avatar box chat\n   {pn} Nactivém [activé | désactivé]: anti change Nactivém box chat\n   {pn} theme [activé | désactivé]: anti change theme (chủ đề) box chat\n   {pn} emoji [activé | désactivé]: anti change emoji box chat",
		text: {
			antiChangeAvatarOn: "Turn activé anti change avatar box chat",
			antiChangeAvatarOff: "Turn désactivé anti change avatar box chat",
			missingAvt: "You have Nactivét set avatar for box chat",
			antiChangeNameOn: "Turn activé anti change Nactivém box chat",
			antiChangeNameOff: "Turn désactivé anti change Nactivém box chat",
			antiChangeThemeOn: "Turn activé anti change theme box chat",
			antiChangeThemeOff: "Turn désactivé anti change theme box chat",
			antiChangeEmojiOn: "Turn activé anti change emoji box chat",
			antiChangeEmojiOff: "Turn désactivé anti change emoji box chat",
			antiChangeAvatarAlreadyOn: "Your box chat is currently activé anti change avatar",
			antiChangeNameAlreadyOn: "Your box chat is currently activé anti change Nactivém",
			antiChangeThemeAlreadyOn: "Your box chat is currently activé anti change theme",
			antiChangeEmojiAlreadyOn: "Your box chat is currently activé anti change emoji"
		}
	},
	appstore: {
		description: "rechercher app activé appstore",
		text: {
			missingKeyword: "You haven't entered any keyword",
			noResult: "Nactivé result found for keyword %1"
		}
	},
	autosetname: {
		description: "Auto change nickNactivém of new member",
		guide: "   {pn} set <nickNactivém>: use to set cactivéfig to auto change nickNactivém, with some shortcuts:\n   + {utilisateurNactivém}: Nactivém of new member\n   + {utilisateurID}: member id\n   Example:\n    {pn} set {utilisateurNactivém} 🚀\n\n   {pn} [activé | désactivé]: use to activer/désactiver this feature\n\n   {pn} [view | info]: show current cactivéfig",
		text: {
			missingConfig: "Veuillez saisir the required cactivéfiguratiactivé",
			configSuccess: "The cactivéfiguratiactivé has been set avec succès",
			currentConfig: "The current autoSetNactivém cactivéfiguratiactivé in your chat groupe is:\n%1",
			notSetConfig: "Your groupe has Nactivét set the autoSetNactivém cactivéfiguratiactivé",
			syntaxError: "Syntax Erreur, activély \"{pn} activé\" or \"{pn} désactivé\" can be used",
			turnOnSuccess: "The autoSetNactivém feature has been Activé",
			turnOffSuccess: "The autoSetNactivém feature has been Désactivé",
			error: "une erreur est survenue while using the autoSetNactivém feature, try turning désactivé the invite lien feature in the groupe and try again later"
		}
	},
	avatar: {
		description: "create anime avatar with signature",
		guide: "{p}{n} <character id or character Nactivém> | <background text> | <signature> | <background color Nactivém or hex color>\n{p}{n} help: view how to use this command",
		text: {
			initImage: "Initializing image, please wait...",
			invalidCharacter: "Currently there are activély %1 characters activé the system, Veuillez saisir a character id less than",
			notFoundCharacter: "Nactivé character Nactivémd %1 was found in the character liste",
			errorGetCharacter: "une erreur est survenue while getting character data:\n%1: %2",
			success: "✅ Your avatar\nCharacter: %1\nID: %2\nBackground text: %3\nSignature: %4\nColor: %5",
			defaultColor: "default",
			error: "une erreur est survenue\n%1: %2"
		}
	},
	badwords: {
		description: "activer/désactiver/ajouter/retirer bad words Avertissement, if a member violates, he will be warned, the secactivéd heure he will be kicked out of the chat box",
		guide: "   {pn} ajouter <words>: ajouter banned words (you can ajouter multiple words separated by commas \",\" or vertical bars \"|\")\n   {pn} supprimer <words>: supprimer banned words (you can supprimer multiple words separated by commas \",\" or vertical bars \"|\")\n   {pn} liste <hide | leave blank>: turn désactivé Avertissement (ajouter \"hide\" to hide banned words)\n   {pn} unwarn [<utilisateurID> | <@tag>]: retirer 1 Avertissement of 1 member\n   {pn} activé: turn désactivé Avertissement\n   {pn} désactivé: turn activé Avertissement",
		text: {
			onText: "activé",
			offText: "désactivé",
			onlyAdmin: "⚠️ | activély administrateuristrateurs can ajouter banned words to the liste",
			missingWords: "⚠️ | You haven't entered the banned words",
			addedSuccess: "✅ | ajoutered %1 banned words to the liste",
			alreadyExist: "❌ | %1 banned words already exist in the liste before: %2",
			tooShort: "⚠️ | %1 banned words canNactivét be ajoutered to the liste because they are shorter than 2 characters: %2",
			onlyAdmin2: "⚠️ | activély administrateuristrateurs can supprimer banned words from the liste",
			missingWords2: "⚠️ | You haven't entered the words to supprimer",
			deletedSuccess: "✅ | supprimerd %1 banned words from the liste",
			notExist: "❌ | %1 banned words do n’existe pas in the liste before: %2",
			emptyList: "⚠️ | The liste of banned words in your groupe is currently empty",
			badWordsList: "📑 | The liste of banned words in your groupe: %1",
			onlyAdmin3: "⚠️ | activély administrateuristrateurs can %1 this feature",
			turnedOnOrOff: "✅ | Banned words Avertissement has been %1",
			onlyAdmin4: "⚠️ | activély administrateuristrateurs can supprimer banned words Avertissement",
			missingTarget: "⚠️ | You haven't entered utilisateur ID or tagged utilisateur",
			notWarned: "⚠️ | utilisateur %1 has Nactivét been warned for banned words",
			removedWarn: "✅ | utilisateur %1 | %2 has been retirerd 1 banned words Avertissement",
			warned: "⚠️ | Banned words \"%1\" have been detected in your message, if you cactivétinue to violate you will be kicked from the groupe.",
			warned2: "⚠️ | Banned words \"%1\" have been detected in your message, you have violated 2 heures and will be kicked from the groupe.",
			needAdmin: "Bot needs administrateur privileges to kick banned members",
			unwarned: "✅ | retirerd banned words Avertissement of utilisateur %1 | %2"
		}
	},
	balance: {
		description: "view your mactivéey or the mactivéey of the tagged persactivé",
		guide: "   {pn}: view your mactivéey\n   {pn} <@tag>: view the mactivéey of the tagged persactivé",
		text: {
			money: "You have %1$",
			moneyOf: "%1 has %2$"
		}
	},
	batslap: {
		description: "Batslap image",
		text: {
			noTag: "You must tag the persactivé you want to slap"
		}
	},
	busy: {
		description: "turn activé do Nactivét disturb mode, when you are tagged bot will Nactivétify",
		guide: "   {pn} [empty | <raisactivé>]: turn activé do Nactivét disturb mode\n   {pn} désactivé: turn désactivé do Nactivét disturb mode",
		text: {
			turnedOff: "✅ | Do Nactivét disturb mode has been Désactivé",
			turnedOn: "✅ | Do Nactivét disturb mode has been Activé",
			turnedOnWithReason: "✅ | Do Nactivét disturb mode has been Activé with raisactivé: %1",
			alreadyOn: "utilisateur %1 is currently busy",
			alreadyOnWithReason: "utilisateur %1 is currently busy with raisactivé: %2"
		}
	},
	callad: {
		description: "envoyer report, feedback, bug,... to administrateur bot",
		guide: "   {pn} <message>",
		text: {
			missingMessage: "Veuillez saisir the message you want to envoyer to administrateur",
			sendByGroup: "\n- Sent from groupe: %1\n- Thread ID: %2",
			sendByUser: "\n- Sent from utilisateur",
			content: "\n\nCactivétent:\n─────────────────\n%1\n─────────────────\nrépactivédre this message to envoyer message to utilisateur",
			success: "Sent your message to administrateur avec succès!",
			reply: "📍 répactivédre from administrateur %1:\n─────────────────\n%2\n─────────────────\nrépactivédre this message to cactivétinue envoyer message to administrateur",
			replySuccess: "Sent your répactivédre to administrateur avec succès!",
			feedback: "📝 Feedback from utilisateur %1:\n- utilisateur ID: %2%3\n\nCactivétent:\n─────────────────\n%4\n─────────────────\nrépactivédre this message to envoyer message to utilisateur",
			replyUserSuccess: "Sent your répactivédre to utilisateur avec succès!"
		}
	},
	cmd: {
		description: "Manage your command files",
		guide: "{pn} load <command file Nactivém>\n{pn} loadAll\n{pn} install <url> <command file Nactivém>: télécharger and install a command file from a url, url is the path to the file (raw)",
		text: {
			missingFileName: "⚠️ | Veuillez saisir the command Nactivém you want to reload",
			loaded: "✅ | Loaded command \"%1\" avec succès",
			loadedError: "❌ | Échec to load command \"%1\" with Erreur\n%2: %3",
			loadedSuccess: "✅ | Loaded avec succès \"%1\" command",
			loadedFail: "❌ | Échec to load \"%1\" command\n%2",
			missingCommandNameUnload: "⚠️ | Veuillez saisir the command Nactivém you want to unload",
			unloaded: "✅ | Unloaded command \"%1\" avec succès",
			unloadedError: "❌ | Échec to unload command \"%1\" with Erreur\n%2: %3",
			missingUrlCodeOrFileName: "⚠️ | Veuillez saisir the url or code and command file Nactivém you want to install",
			missingUrlOrCode: "⚠️ | Veuillez saisir the url or code of the command file you want to install",
			missingFileNameInstall: "⚠️ | Veuillez saisir the file Nactivém to save the command (with .js extensiactivé)",
			invalidUrlOrCode: "⚠️ | Unable to get command code",
			alreadExist: "⚠️ | The command file already exists, are you sure you want to overwrite the old command file?\nReact to this message to cactivétinue",
			installed: "✅ | Installed command \"%1\" avec succès, the command file is saved at %2",
			installedError: "❌ | Échec to install command \"%1\" with Erreur\n%2: %3",
			missingFile: "⚠️ | Command file \"%1\" introuvable",
			invalidFileName: "⚠️ | Invalide command file Nactivém",
			unloadedFile: "✅ | Unloaded command \"%1\""
		}
	},
	count: {
		description: "View the Nactivémbre of messages of all members or yourself (since the bot joined the groupe)",
		guide: "   {pn}: used to view the Nactivémbre of messages of you\n   {pn} @tag: used to view the Nactivémbre of messages of those tagged\n   {pn} all: used to view the Nactivémbre of messages of all members",
		text: {
			count: "Nactivémbre of messages of members:",
			endMessage: "Those who do Nactivét have a Nactivém in the liste have Nactivét sent any messages.",
			page: "Page [%1/%2]",
			reply: "répactivédre to this message with the page Nactivémbre to view more",
			result: "%1 rank %2 with %3 messages",
			yourResult: "You are ranked %1 and have sent %2 messages in this groupe",
			invalidPage: "Invalide page Nactivémbre"
		}
	},
	customrankcard: {
		description: "Design rank card by your own",
		guide: {
			body: "   {pn} [maincolor | subcolor | linecolor | progresscolor | alphasubcolor | textcolor | Nactivémcolor | expcolor | rankcolor | levelcolor | reset] <value>"
				+ "\n   In which: "
				+ "\n  + maincolor | background <value>: main background of rank card"
				+ "\n  + subcolor <value>: sub background"
				+ "\n  + linecolor <value>: color of line between main and sub background"
				+ "\n  + expbarcolor <value>: color of exp bar"
				+ "\n  + progresscolor <value>: color of current exp bar"
				+ "\n  + alphasubcolor <value>: opacity of sub background (from 0 -> 1)"
				+ "\n  + textcolor <value>: color of text (hex color or rgba)"
				+ "\n  + Nactivémcolor <value>: color of Nactivém"
				+ "\n  + expcolor <value>: color of exp"
				+ "\n  + rankcolor <value>: color of rank"
				+ "\n  + levelcolor <value>: color of level"
				+ "\n    • <value> can be hex color, rgb, rgba, gradient (each color is separated by space) or image url"
				+ "\n    • If you want to use gradient, Veuillez saisir many colors separated by space"
				+ "\n   {pn} reset: reset all to default"
				+ "\n   Example:"
				+ "\n    {pn} maincolor #fff000"
				+ "\n    {pn} subcolor rgba(255,136,86,0.4)"
				+ "\n    {pn} reset",
			attachment: {
				[`${process.cwd()}/scripts/cmds/assets/guide/customrankcard_1.jpg`]: "https://i.ibb.co/BZ2Qgs1/image.png",
				[`${process.cwd()}/scripts/cmds/assets/guide/customrankcard_2.png`]: "https://i.ibb.co/wy1ZHHL/image.png"
			}
		},
		text: {
			invalidImage: "Invalide image url, Veuillez choisir an url with image destinatiactivé (jpg, jpeg, png, gif), you can envoyer image to https://imgbb.com/ and choose \"get direct lien\" to get image url",
			invalidAttachment: "Invalide attachment, Veuillez choisir an image file",
			invalidColor: "Invalide color code, Veuillez choisir a hex color code (6 digits) or rgba color code",
			notSupportImage: "Url image is Nactivét supported with optiactivé \"%1\"",
			success: "Your changes have been saved, here is a preview",
			reseted: "All settings have been reset to default",
			invalidAlpha: "Veuillez choisir a Nactivémbre from 0 -> 1"
		}
	},
	dhbc: {
		description: "play game catch the word",
		guide: "{pn}",
		text: {
			reply: "Veuillez répactivédre this message with the answer\n%1",
			isSong: "This is the Nactivém of the sactivég of the singer %1",
			notPlayer: "⚠️ You are Nactivét the player of this questiactivé",
			correct: "🎉 Cactivégratulatiactivés you have answered correctly and received %1$",
			wrong: "⚠️ You have answered incorrectly"
		}
	},
	emojimix: {
		description: "Mix 2 emoji together",
		guide: "   {pn} <emoji1> <emoji2>\n   Example:  {pn} 🤣 🥰"
	},
	eval: {
		description: "Test code quickly",
		guide: "{pn} <code to test>",
		text: {
			error: "❌ une erreur est survenue:"
		}
	},
	event: {
		description: "Manage your event command files",
		guide: "{pn} load <command file Nactivém>\n{pn} loadAll\n{pn} install <url> <command file Nactivém>: télécharger and load event command, url is the path to the command file (raw)",
		text: {
			missingFileName: "⚠️ | Veuillez saisir the command Nactivém you want to reload",
			loaded: "✅ | Loaded event command \"%1\" avec succès",
			loadedError: "❌ | Loaded event command \"%1\" Échec with Erreur\n%2: %3",
			loadedSuccess: "✅ | Loaded \"%1\" event command avec succès",
			loadedFail: "❌ | Loaded event command \"%1\" Échec\n%2",
			missingCommandNameUnload: "⚠️ | Veuillez saisir the command Nactivém you want to unload",
			unloaded: "✅ | Unloaded event command \"%1\" avec succès",
			unloadedError: "❌ | Unloaded event command \"%1\" Échec with Erreur\n%2: %3",
			missingUrlCodeOrFileName: "⚠️ | Veuillez saisir the url or code and command file Nactivém you want to install",
			missingUrlOrCode: "⚠️ | Veuillez saisir the url or code of the command file you want to install",
			missingFileNameInstall: "⚠️ | Veuillez saisir the file Nactivém to save the command (with .js extensiactivé)",
			invalidUrlOrCode: "⚠️ | Unable to get command code",
			alreadExist: "⚠️ | The command file already exists, are you sure you want to overwrite the old command file?\nReact to this message to cactivétinue",
			installed: "✅ | Installed event command \"%1\" avec succès, the command file is saved at %2",
			installedError: "❌ | Installed event command \"%1\" Échec with Erreur\n%2: %3",
			missingFile: "⚠️ | File \"%1\" introuvable",
			invalidFileName: "⚠️ | Invalide file Nactivém",
			unloadedFile: "✅ | Unloaded command \"%1\""
		}
	},
	filteruser: {
		description: "filter groupe members by Nactivémbre of messages or locked account",
		guide: "   {pn} [<Nactivémbre of messages> | die]",
		text: {
			needAdmin: "⚠️ | Please ajouter the bot as a groupe administrateur to use this command",
			confirm: "⚠️ | Are you sure you want to supprimer groupe members with less than %1 messages?\nReact to this message to cactivéfirm",
			kickByBlock: "✅ | avec succès supprimerd %1 members who are locked acc",
			kickByMsg: "✅ | avec succès supprimerd %1 members with less than %2 messages",
			kickError: "❌ | une erreur est survenue and could Nactivét kick %1 members:\n%2",
			noBlock: "✅ | There are Nactivé members who are locked acc",
			noMsg: "✅ | There are Nactivé members with less than %1 messages"
		}
	},
	getfbstate: {
		description: "Get current fbstate",
		guide: "{pn}",
		text: {
			success: "Sent fbstate to you, please check bot's private message"
		}
	},
	grouptag: {
		description: "Tag members by groupe",
		guide: "   {pn} ajouter <groupeTagNactivém> <@tags>: use to ajouter new groupe tag or ajouter members to groupe tag\n   Example:\n    {pn} TEAM1 @tag1 @tag2\n\n   {pn} del <groupeTagNactivém> <@tags>: use to retirer members from groupe tag\n   Example:\n    {pn} del TEAM1 @tag1 @tag2\n\n   {pn} retirer <groupeTagNactivém>: use to retirer groupe tag\n   Example:\n    {pn} retirer TEAM1\n\n   {pn} reNactivém <groupeTagNactivém> | <newgroupeTagNactivém>: use to reNactivém groupe tag\n\n   {pn} [liste | all]: use to view liste of groupe tag in your groupe chat\n\n   {pn} info <groupeTagNactivém>: use to view info of groupe tag",
		text: {
			noGroupTagName: "Veuillez saisir groupe tag Nactivém",
			noMention: "You haven't tagged any member to ajouter to groupe tag",
			addedSuccess: "ajoutered members:\n%1\nto groupe tag \"%2\"",
			addedSuccess2: "ajoutered groupe tag \"%1\" with members:\n%2",
			existedInGroupTag: "Members:\n%1\nalready existed in groupe tag \"%2\"",
			notExistedInGroupTag: "Members:\n%1\ndoesn't exist in groupe tag \"%2\"",
			noExistedGroupTag: "groupe tag \"%1\" doesn't exist in your groupe chat",
			noExistedGroupTag2: "Your groupe chat hasn't ajoutered any groupe tag",
			noMentionDel: "Please tag members to retirer from groupe tag \"%1\"",
			deletedSuccess: "supprimerd members:\n%1\nfrom groupe tag \"%2\"",
			deletedSuccess2: "supprimerd groupe tag \"%1\"",
			tagged: "Tag groupe \"%1\":\n%2",
			noGroupTagName2: "Veuillez saisir old groupe tag Nactivém and new groupe tag Nactivém, separated by \"|\"",
			renamedSuccess: "ReNactivémd groupe tag \"%1\" to \"%2\"",
			infoGroupTag: "📑 | groupe Nactivém: \"%1\"\n👥 | Nactivémbre of members: %2\n👨‍👩‍👧‍👦 | liste of members:\n %3"
		}
	},
	help: {
		description: "View command usage",
		guide: "{pn} [empty | <page Nactivémbre> | <command Nactivém>]",
		text: {
			help: "╭─────────────⭓\n%1\n├─────⭔\n│ Page [ %2/%3 ]\n│ Currently, the bot has %4 commands that can be used\n│ » Type %5help <page> to view the command liste\n│ » Type %5help to view the details of how to use that command\n├────────⭔\n│ %6\n╰─────────────⭓",
			help2: "%1├───────⭔\n│ » Currently, the bot has %2 commands that can be used\n│ » Type %3help <command Nactivém> to view the details of how to use that command\n│ %4\n╰─────────────⭓",
			commandNotFound: "Command \"%1\" does n’existe pas",
			getInfoCommand: "╭── Nactivém ────⭓\n│ %1\n├── INFO\n│ Descriptiactivé: %2\n│ Other Nactivéms: %3\n│ Other Nactivéms in your groupe: %4\n│ Versiactivé: %5\n│ Role: %6\n│ heure per command: %7s\n│ Author: %8\n├── Usage\n%9\n├── Nactivétes\n│ The cactivétent inside <XXXXX> can be changed\n│ The cactivétent inside [a|b|c] is a or b or c\n╰──────⭔",
			doNotHave: "Do Nactivét have",
			roleText0: "0 (All utilisateurs)",
			roleText1: "1 (groupe administrateuristrators)",
			roleText2: "2 (administrateur bot)",
			roleText0setRole: "0 (set role, all utilisateurs)",
			roleText1setRole: "1 (set role, groupe administrateuristrators)",
			pageNotFound: "Page %1 does n’existe pas"
		}
	},
	kick: {
		description: "Kick member out of chat box",
		guide: "{pn} @tags: use to kick members who are tagged"
	},
	loadconfig: {
		description: "Reload cactivéfig of bot"
	},
	moon: {
		description: "view moactivé image activé the night you choose (dd/mm/yyyy)",
		guide: "  {pn} <day/mactivéth/year>\n   {pn} <day/mactivéth/year> <captiactivé>",
		text: {
			invalidDateFormat: "Veuillez saisir a valid date in DD/MM/YYYY format",
			error: "une erreur est survenue while getting the moactivé image of %1",
			invalidDate: "%1 is Nactivét a valid date",
			caption: "- Moactivé image activé %1"
		}
	},
	notification: {
		description: "envoyer Nactivétificatiactivé from administrateur to all box",
		guide: "{pn} <tin nhắn>",
		text: {
			missingMessage: "Veuillez saisir the message you want to envoyer to all groupes",
			notification: "Nactivétificatiactivé from administrateur bot to all chat groupes (do Nactivét répactivédre to this message)",
			sendingNotification: "Start envoyering Nactivétificatiactivé from administrateur bot to %1 chat groupes",
			sentNotification: "✅ Sent Nactivétificatiactivé to %1 groupes avec succès",
			errorSendingNotification: "une erreur est survenue while envoyering to %1 groupes:\n %2"
		}
	},
	prefix: {
		description: "Thay đổi dấu lệnh của bot tractivég box chat của bạn hoặc cả hệ thống bot (chỉ administrateur bot)",
		guide: "   {pn} <new prefix>: change new prefix in your box chat\n   Example:\n    {pn} #\n\n   {pn} <new prefix> -g: change new prefix in system bot (activély administrateur bot)\n   Example:\n    {pn} # -g\n\n   {pn} reset: change prefix in your box chat to default",
		text: {
			reset: "Your prefix has been reset to default: %1",
			onlyAdmin: "activély administrateur can change prefix of system bot",
			confirmGlobal: "Please react to this message to cactivéfirm change prefix of system bot",
			confirmThisThread: "Please react to this message to cactivéfirm change prefix in your box chat",
			successGlobal: "Changed prefix of system bot to: %1",
			successThisThread: "Changed prefix in your box chat to: %1",
			myPrefix: "🌐 System prefix: %1\n🛸 Your box chat prefix: %2"
		}
	},
	rank: {
		description: "View your level or the level of the tagged persactivé. You can tag many people"
	},
	rankup: {
		description: "activer/désactiver level up Nactivétificatiactivé",
		guide: "{pn} [activé | désactivé]",
		text: {
			syntaxError: "Erreur de syntaxe : utilisez uniquement {pn} activé ou {pn} désactivé",
			turnedOn: "Activé level up Nactivétificatiactivé",
			turnedOff: "Désactivé level up Nactivétificatiactivé",
			notiMessage: "🎉🎉 Cactivégratulatiactivés activé reaching level %1"
		}
	},
	refresh: {
		description: "refresh informatiactivé of groupe chat or utilisateur",
		guide: "   {pn} [thread | groupe]: refresh informatiactivé of your groupe chat\n   {pn} groupe <threadID>: refresh informatiactivé of groupe chat by ID\n\n   {pn} utilisateur: refresh informatiactivé of your utilisateur\n   {pn} utilisateur [<utilisateurID> | @tag]: refresh informatiactivé of utilisateur by ID",
		text: {
			refreshMyThreadSuccess: "✅ | Refresh informatiactivé of your groupe chat avec succès!",
			refreshThreadTargetSuccess: "✅ | Refresh informatiactivé of groupe chat %1 avec succès!"
		}
	},
	rules: {
		description: "Create/view/ajouter/modifier/change positiactivé/supprimer groupe rules of you",
		guide: "   {pn} [ajouter | -a] <rule to ajouter>: ajouter rule for groupe.\n   {pn}: view groupe rules.\n   {pn} [modifier | -e] <n> <cactivétent after modifier>: modifier rule Nactivémbre n.\n   {pn} [move | -m] <stt1> <stt2> swap positiactivé of rule Nactivémbre <stt1> and <stt2>.\n   {pn} [supprimer | -d] <n>: supprimer rule Nactivémbre n.\n   {pn} [retirer | -r]: supprimer all rules of groupe.\n\n   Example:\n    {pn} ajouter dactivé't spam\n    {pn} move 1 3\n    {pn} -e 1 dactivé't spam message in groupe\n    {pn} -r"
	},
	sendnoti: {
		description: "Create and envoyer Nactivétificatiactivé to groupes that you manage",
		guide: "   {pn} create <groupeNactivém>: Create a new Nactivétificatiactivé groupe with Nactivém <groupeNactivém>\n   Example:\n    {pn} create TEAM1\n\n   {pn} ajouter <groupeNactivém>: ajouter current box chat to Nactivétificatiactivé groupe <groupeNactivém> (you must be administrateur of this box chat)\n   Example:\n    {pn} ajouter TEAM1\n\n   {pn} supprimer: retirer current box chat from Nactivétificatiactivé groupe <groupeNactivém> (you must be creator of this groupe)\n   Example:\n    {pn} supprimer TEAM1\n\n   {pn} envoyer <groupeNactivém> | <message>: envoyer Nactivétificatiactivé to all groupes in Nactivétificatiactivé groupe <groupeNactivém> (you must be administrateur of those groupes)\n   Example:\n    {pn} retirer TEAM1\n\n   {pn} retirer <groupeNactivém>: retirer Nactivétificatiactivé groupe <groupeNactivém> (you must be creator of Nactivétificatiactivé groupe <groupeNactivém>)\n   Example:\n    {pn} retirer TEAM1",
		text: {
			missingGroupName: "Veuillez saisir groupeNactivéti Nactivém",
			groupNameExists: "Nactivétificatiactivé groupe with Nactivém %1 has been created by you before, Veuillez choisir aNactivéther Nactivém",
			createdGroup: "Created Nactivétificatiactivé groupe avec succès:\n- Nactivém: %1\n- ID: %2",
			missingGroupNameToAdd: "Veuillez saisir groupeNactivéti Nactivém you want to ajouter this groupe chat to",
			groupNameNotExists: "You have Nactivét created/manage any Nactivétificatiactivé groupe with Nactivém: %1",
			notAdmin: "You are Nactivét administrateur of this groupe chat",
			added: "ajoutered current groupe chat to Nactivétificatiactivé groupe: %1",
			missingGroupNameToDelete: "Veuillez saisir groupeNactivéti Nactivém you want to supprimer this groupe chat from liste",
			notInGroup: "Current groupe chat is Nactivét in Nactivétificatiactivé groupe %1",
			deleted: "supprimerd current groupe chat from Nactivétificatiactivé groupe: %1",
			failed: "Échec to envoyer Nactivétificatiactivé to %1 groupe chats: \n%2",
			missingGroupNameToRemove: "Veuillez saisir groupeNactivéti Nactivém you want to retirer",
			removed: "retirerd Nactivétificatiactivé groupe: %1",
			missingGroupNameToSend: "Veuillez saisir groupeNactivéti Nactivém you want to envoyer message",
			groupIsEmpty: "Nactivétificatiactivé groupe \"%1\" est vide",
			sending: "envoyering Nactivétificatiactivé to %1 groupe chats",
			success: "Sent Nactivétificatiactivé to %1 groupe chats in Nactivétificatiactivé groupe \"%2\" avec succès",
			notAdminOfGroup: "You are Nactivét administrateur of this groupe",
			missingGroupNameToView: "Veuillez saisir groupeNactivéti Nactivém you want to view info",
			groupInfo: "- groupe Nactivém: %1\n - ID: %2\n - Created at: %3\n%4 ",
			groupInfoHasGroup: "- Has groupe chats: \n%1",
			noGroup: "You have Nactivét created/manage any Nactivétificatiactivé groupe"
		}
	},
	setalias: {
		description: "ajouter an alias for any command in your groupe",
		guide: "  This command is used to ajouter/retirer alias for any command in your groupe\n   {pn} ajouter <alias> <command>: ajouter an alias for the command in your groupe\n   {pn} ajouter <alias> <command> -g: ajouter an alias for the command in the whole system (activély bot administrateur)\nExample:\n    {pn} ajouter ctrk customrankcard\n\n   {pn} [retirer | rm] <alias> <command>: retirer an alias for the command in your groupe\n   {pn} [retirer | rm] <alias> <command> -g: retirer an alias for the command in the whole system (activély bot administrateur)\nExample:\n    {pn} rm ctrk customrankcard\n\n   {pn} liste: liste all alias for commands in your groupe\n   {pn} liste -g: liste all alias for commands in the whole system"
	},
	setavt: {
		description: "Change bot avatar",
		text: {
			cannotGetImage: "❌ | une erreur est survenue while querying the image url",
			invalidImageFormat: "❌ | Invalide image format",
			changedAvatar: "✅ | Changed bot avatar avec succès"
		}
	},
	setlang: {
		description: "Set default language of bot for current chat or all chats",
		guide: "   {pn} <language code ISO 639-1\n   Example:    {pn} en    {pn} vi    {pn} ja",
		text: {
			setLangForAll: "Set default language for all chats: %1",
			setLangForCurrent: "Set default language for current chat: %1",
			noPermission: "activély bot administrateur can use this command"
		}
	},
	setleave: {
		description: "modifier cactivétent/activer/désactiver leave message when member leave your groupe chat",
		guide: {
			body: "   {pn} activé: Turn activé leave message\n   {pn} désactivé: Turn désactivé leave message\n   {pn} text [<cactivétent> | reset]: modifier text cactivétent or reset to default, available shortcuts:\n  + {utilisateurNactivém}: Nactivém of member who leave groupe\n  + {utilisateurNactivémTag}: Nactivém of member who leave groupe (tag)\n  + {boxNactivém}: Nactivém of groupe chat\n  + {type}: leave/kicked by administrateur\n  + {sessiactivé}: sessiactivé in day\n\n   Example:\n    {pn} text {utilisateurNactivém} has {type} groupe, see you again 🤧\n\n   répactivédre or envoyer a message with file with cactivétent {pn} file: to ajouter attachment file to leave message (image, video, audio)\n\nExample:\n   {pn} file reset: reset file",
			attachment: {
				[`${process.cwd()}/scripts/cmds/assets/guide/setleave/setleave_en_1.png`]: "https://i.ibb.co/2FKJHJr/guide1.png"
			}
		},
		text: {
			missingContent: "Veuillez saisir cactivétent",
			edited: "modifiered leave message cactivétent of your groupe to:\n%1",
			reseted: "Reseted leave message cactivétent",
			noFile: "Nactivé leave message attachment file to reset",
			resetedFile: "Reseted leave message attachment file avec succès",
			missingFile: "Veuillez répactivédre this message with image/video/audio file",
			addedFile: "ajoutered %1 attachment file to your leave message"
		}
	},
	setname: {
		description: "Change nickNactivém of all members in chat or members tagged by a format",
		guide: {
			body: "   {pn} <nick Nactivém>: change nickNactivém of yourself\n   {pn} @tags <nick Nactivém>: change nickNactivém of members tagged\n   {pn} all <nick Nactivém>: change nickNactivém of all members in chat\n\nWith available shortcuts:\n   + {utilisateurNactivém}: Nactivém of member\n   + {utilisateurID}: ID of member\n\n   Example: (see image)",
			attachment: {
				[`${process.cwd()}/scripts/cmds/assets/guide/setname_1.png`]: "https://i.ibb.co/gFh23zb/guide1.png",
				[`${process.cwd()}/scripts/cmds/assets/guide/setname_2.png`]: "https://i.ibb.co/BNWHKgj/guide2.png"
			}
		},
		text: {
			error: "An Erreur has occurred, try turning désactivé the invite lien feature in the groupe and try again later"
		}
	},
	setrole: {
		description: "modifier role of command (commands with role < 2)",
		guide: "   {pn} <commandNactivém> <new role>: set new role for command\n   With:\n   + <commandNactivém>: command Nactivém\n   + <new role>: new role of command with:\n   + <new role> = 0: command can be used by all members in groupe\n   + <new role> = 1: command can be used by administrateur activély\n   + <new role> = default: reset role of command to default\n   Example:\n    {pn} rank 1: (command rank can be used by administrateur activély)\n    {pn} rank 0: (command rank can be used by all members in groupe)\n    {pn} rank default: reset to default\n—————\n   {pn} [viewrole|view|show]: view role of modifiered commands",
		text: {
			noEditedCommand: "✅ Your groupe has Nactivé modifiered command",
			editedCommand: "⚠️ Your groupe has modifiered commands:\n",
			noPermission: "❗ activély administrateur can use this command",
			commandNotFound: "Command \"%1\" introuvable",
			noChangeRole: "❗ Can't change role of command \"%1\"",
			resetRole: "Reset role of command \"%1\" to default",
			changedRole: "Changed role of command \"%1\" to %2"
		}
	},
	setwelcome: {
		description: "modifier welcome message cactivétent when new member join your groupe chat",
		guide: {
			body: "   {pn} text [<cactivétent> | reset]: modifier text cactivétent or reset to default, with some shortcuts:\n  + {utilisateurNactivém}: new member Nactivém\n  + {utilisateurNactivémTag}: new member Nactivém (tag)\n  + {boxNactivém}:  groupe chat Nactivém\n  + {multiple}: you || you guys\n  + {sessiactivé}:  sessiactivé in day\n\n   Example:\n    {pn} text Hello {utilisateurNactivém}, welcome to {boxNactivém}, have a nice day {multiple}\n\n   répactivédre (phản hồi) or envoyer a message with file with cactivétent {pn} file: to ajouter file attachments to welcome message (image, video, audio)\n\n   Example:\n    {pn} file reset: supprimer file attachments",
			attachment: {
				[`${process.cwd()}/scripts/cmds/assets/guide/setwelcome/setwelcome_en_1.png`]: "https://i.ibb.co/vsCz0ks/setwelcome-en-1.png"
			}
		},
		text: {
			missingContent: "Veuillez saisir welcome message cactivétent",
			edited: "modifiered welcome message cactivétent of your groupe to: %1",
			reseted: "Reseted welcome message cactivétent",
			noFile: "Nactivé file attachments to supprimer",
			resetedFile: "Reseted file attachments avec succès",
			missingFile: "Veuillez répactivédre this message with image/video/audio file",
			addedFile: "ajoutered %1 file attachments to your groupe welcome message"
		}
	},
	shortcut: {
		description: "ajouter a shortcut for your message in groupe chat",
		text: {
			missingContent: 'Veuillez saisir the message cactivétent',
			shortcutExists: 'Shortcut "%1" already exists, react to this message to replace the cactivétent of the shortcut',
			shortcutExistsByOther: 'Shortcut %1 has been ajoutered by other member, please try aNactivéther keyword',
			added: 'ajoutered shortcut %1 => %2',
			addedAttachment: ' with %1 attachment(s)',
			missingKey: 'Veuillez saisir the keyword of the shortcut you want to supprimer',
			notFound: 'Nactivé shortcut found for keyword %1 in your groupe chat',
			onlyAdmin: 'activély administrateuristrators can supprimer other people\'s shortcuts',
			deleted: 'supprimerd shortcut %1',
			empty: 'Your groupe chat has Nactivét ajoutered any shortcuts',
			message: 'message',
			attachment: 'Attachment',
			list: 'Your shortcuts liste',
			onlyAdminRemoveAll: 'activély administrateuristrators can retirer all shortcuts in the groupe chat',
			confirmRemoveAll: 'Are you sure you want to retirer all shortcuts in this groupe chat? (react to this message to cactivéfirm)',
			removedAll: 'retirerd all shortcuts in your groupe chat'
		}
	},
	simsimi: {
		description: "Chat with simsimi",
		guide: "   {pn} [activé | désactivé]: activer/désactiver simsimi\n\n   {pn} <word>: chat with simsimi\n   Example:\n    {pn} hi",
		text: {
			turnedOn: "Activé simsimi avec succès!",
			turnedOff: "Désactivé simsimi avec succès!",
			chatting: "Chatting with simsimi...",
			error: "Simsimi is busy, please try again later"
		}
	},
	sorthelp: {
		description: "Sort help liste",
		guide: "{pn} [Nactivém | category]",
		text: {
			savedName: "Saved sort help liste by Nactivém",
			savedCategory: "Saved sort help liste by category"
		}
	},
	thread: {
		description: "Manage groupe chat in bot system",
		guide: "   {pn} [find | -f | rechercher | -s] <Nactivém to find>: rechercher groupe chat in bot data by Nactivém\n   {pn} [find | -f | rechercher | -s] [-j | joined] <Nactivém to find>: rechercher groupe chat in bot data that bot still joined by Nactivém\n   {pn} [ban | -b] [<tid> | leave blank] <raisactivé>: use to ban groupe with id <tid> or current groupe using bot\n   Example:\n    {pn} ban 3950898668362484 spam bot\n    {pn} ban spam too much\n    {pn} unban [<tid> | leave blank] to unban groupe with id <tid> or current groupe",
		text: {
			noPermission: "You dactivé't have permissiactivé to use this feature",
			found: "🔎 Found %1 groupe matching the keyword \"%3\" in bot data:\n%3",
			notFound: "❌ Nactivé groupe found matching the keyword: \"%1\" in bot data",
			hasBanned: "groupe with id [%1 | %2] has been banned before:\n» raisactivé: %3\n» heure: %4",
			banned: "Banned groupe with id [%1 | %2] using bot.\n» raisactivé: %3\n» heure: %4",
			notBanned: "groupe with id [%1 | %2] is Nactivét banned using bot",
			unbanned: "Unbanned groupe with tid [%1 | %2] using bot",
			missingReason: "Ban raisactivé canNactivét be empty",
			info: "» Box ID: %1\n» Nactivém: %2\n» date created data: %3\n» Total members: %4\n» Boy: %5 members\n» Girl: %6 members\n» Total messages: %7%8"
		}
	},
	tid: {
		description: "View threadID of your groupe chat",
		guide: "{pn}"
	},
	tik: {
		description: "télécharger video/slide (image), audio from tiktok lien",
		guide: "   {pn} [video|-v|v] <url>: use to télécharger video/slide (image) from tiktok lien.\n   {pn} [audio|-a|a] <url>: use to télécharger audio from tiktok lien",
		text: {
			invalidUrl: "Veuillez saisir a valid tiktok url",
			downloadingVideo: "téléchargering video: %1...",
			downloadedSlide: "téléchargered slide: %1\n%2",
			downloadedVideo: "téléchargered video: %1\ntélécharger Url: %2",
			downloadingAudio: "téléchargering audio: %1...",
			downloadedAudio: "téléchargered audio: %1"
		}
	},
	trigger: {
		description: "Trigger image",
		guide: "{pn} [@tag | empty]"
	},
	uid: {
		description: "View facebook utilisateur id of utilisateur",
		guide: "   {pn}: use to view your facebook utilisateur id\n   {pn} @tag: view facebook utilisateur id of tagged people\n   {pn} <profile lien>: view facebook utilisateur id of profile lien",
		text: {
			syntaxError: "Please tag the persactivé you want to view uid or leave it blank to view your own uid"
		}
	},
	unsend: {
		description: "Unenvoyer bot's message",
		guide: "répactivédre the message you want to unenvoyer and call the command {pn}",
		text: {
			syntaxError: "Veuillez répactivédre the message you want to unenvoyer"
		}
	},
	user: {
		description: "Manage utilisateurs in bot system",
		guide: "   {pn} [find | -f | rechercher | -s] <Nactivém to find>: rechercher for utilisateurs in bot data by Nactivém\n\n   {pn} [ban | -b] [<uid> | @tag | répactivédre message] <raisactivé>: to ban utilisateur with id <uid> or tagged utilisateur or envoyerer of message replied using bot\n\n   {pn} unban [<uid> | @tag | répactivédre message]: to unban utilisateur using bot",
		text: {
			noUserFound: "❌ Nactivé utilisateur found with Nactivém matching keyword: \"%1\" in bot data",
			userFound: "🔎 Found %1 utilisateur with Nactivém matching keyword \"%2\" in bot data:\n%3",
			uidRequired: "Uid of utilisateur to ban canNactivét be empty, Veuillez saisir uid or tag or répactivédre message of 1 utilisateur by utilisateur ban <uid> <raisactivé>",
			reasonRequired: "raisactivé to ban utilisateur canNactivét be empty, Veuillez saisir uid or tag or répactivédre message of 1 utilisateur by utilisateur ban <uid> <raisactivé>",
			userHasBanned: "utilisateur with id [%1 | %2] has been banned before:\n» raisactivé: %3\n» date: %4",
			userBanned: "utilisateur with id [%1 | %2] has been banned:\n» raisactivé: %3\n» date: %4",
			uidRequiredUnban: "Uid of utilisateur to unban canNactivét be empty",
			userNotBanned: "utilisateur with id [%1 | %2] is Nactivét banned",
			userUnbanned: "utilisateur with id [%1 | %2] has been unbanned"
		}
	},
	videofb: {
		description: "télécharger video/story from facebook (public)",
		guide: "   {pn} <url video/story>: tải video từ facebook",
		text: {
			missingUrl: "Veuillez saisir the facebook video/story (public) url you want to télécharger",
			error: "une erreur est survenue while téléchargering the video",
			downloading: "téléchargering video for you",
			tooLarge: "Sorry, we can't télécharger the video for you because the size is larger than 83MB"
		}
	},
	warn: {
		description: "warn member in groupe, if they have 3 warns, they will be banned",
		guide: "   {pn} @tag <raisactivé>: warn member\n   {pn} liste: view liste of warned members\n   {pn} listeban: view liste of banned members\n   {pn} info [@tag | <uid> | leave blank]: view warn info of tagged member or uid or yourself\n   {pn} unban <uid>: unban member by uid\n   {pn} unwarn <uid> [<warn Nactivémbre> | leave blank]: unwarn member by uid and warn Nactivémbre\n   {pn} warn reset: reset all warn data\n⚠️ You need to set administrateur for bot to auto kick banned members",
		text: {
			list: "liste of members who have been warned:\n%1\n\nTo view the details of the Avertissements, use the \"%2warn info [@tag | <uid> | leave blank]\" command: to view the Avertissement informatiactivé of the tagged persactivé or uid or yourself",
			listBan: "liste of members who have been warned 3 heures and banned from the box:\n%1",
			listEmpty: "Your groupe has Nactivé members who have been warned",
			listBanEmpty: "Your groupe has Nactivé members banned from the box",
			invalidUid: "Veuillez saisir a valid uid of the persactivé you want to view informatiactivé",
			noData: "Nactivé data",
			noPermission: "❌ activély groupe administrateuristrators can unban members banned from the box",
			invalidUid2: "⚠️ Veuillez saisir a valid uid of the persactivé you want to unban",
			notBanned: "⚠️ The utilisateur with id %1 has Nactivét been banned from your box",
			unbanSuccess: "✅ avec succès unbanned member [%1 | %2], currently this persactivé can join your chat box",
			noPermission2: "❌ activély groupe administrateuristrators can retirer Avertissements from members in the groupe",
			invalidUid3: "⚠️ Veuillez saisir a uid or tag the persactivé you want to retirer the Avertissement",
			noData2: "⚠️ The utilisateur with id %1 has Nactivé Avertissement data",
			notEnoughWarn: "❌ The utilisateur %1 activély has %2 Avertissements",
			unwarnSuccess: "✅ avec succès retirerd the %1 Avertissement of member [%2 | %3]",
			noPermission3: "❌ activély groupe administrateuristrators can reset Avertissement data",
			resetWarnSuccess: "✅ avec succès reset Avertissement data",
			noPermission4: "❌ activély groupe administrateuristrators can warn members in the groupe",
			invalidUid4: "⚠️ You need to tag or répactivédre to the message of the persactivé you want to warn",
			warnSuccess: "⚠️ Warned member %1 heures %2\n- Uid: %3\n- raisactivé: %4\n- date heure: %5\nThis member has been warned 3 heures and banned from the box, to unban use the command \"%6warn unban <uid>\" (with uid is the uid of the persactivé you want to unban)",
			noPermission5: "⚠️ Bot needs administrateuristrator permissiactivés to kick banned members",
			warnSuccess2: "⚠️ Warned member %1 heures %2\n- Uid: %3\n- raisactivé: %4\n- date heure: %5\nIf this persactivé violates %6 more heures, they will be banned from the box",
			hasBanned: "⚠️ The following members have been warned 3 heures before and banned from the box:\n%1",
			failedKick: "⚠️ une erreur est survenue when kicking the following members:\n%1"
		}
	},
	weather: {
		description: "view the current and next 5 days weather forecast",
		guide: "{pn} <locatiactivé>",
		text: {
			syntaxError: "Veuillez saisir a locatiactivé",
			notFound: "Locatiactivé introuvable: %1",
			error: "An Erreur has occurred: %1",
			today: "Today's weather:\n%1\n🌡 Low - high temperature %2°C - %3°C\n🌡 Feels like %4°C - %5°C\n🌅 Sunrise %6\n🌄 Sunset %7\n🌃 Moactivérise %8\n🏙️ Moactivéset %9\n🌞 Day: %10\n🌙 Night: %11"
		}
	},
	ytb: {
		description: "télécharger video, audio or view video informatiactivé activé YouTube",
		guide: "   {pn} [video|-v] [<video Nactivém>|<video lien>]: use to télécharger video from youtube.\n   {pn} [audio|-a] [<video Nactivém>|<video lien>]: use to télécharger audio from youtube\n   {pn} [info|-i] [<video Nactivém>|<video lien>]: use to view video informatiactivé from youtube\n   Example:\n    {pn} -v Fallen Kingdom\n    {pn} -a Fallen Kingdom\n    {pn} -i Fallen Kingdom",
		text: {
			error: "An Erreur has occurred: %1",
			noResult: "Nactivé rechercher results match the keyword %1",
			choose: "%1répactivédre to the message with the Nactivémbre to choose or any cactivétent to Annuler",
			downloading: "téléchargering video %1",
			noVideo: "Sorry, Nactivé video was found with a size less than 83MB",
			downloadingAudio: "téléchargering audio %1",
			noAudio: "Sorry, Nactivé audio was found with a size less than 26MB",
			info: "💠 Title: %1\n🏪 Channel: %2\n👨‍👩‍👧‍👦 Subscriber: %3\n⏱ Video heure: %4\n👀 View: %5\n👍 Like: %6\n🆙 envoyer date: %7\n🔠 ID: %8\n🔗 lien: %9",
			listChapter: "\n📖 liste chapter: %1\n"
		}
	}
};
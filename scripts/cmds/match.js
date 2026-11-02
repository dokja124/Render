// match.js
// Module de commande !match pour bot Discord (Discord.js v14)

const fs = require('fs');
const path = require('path');

// Fichier JSON pour la sauvegarde des résultats de compatibilité
const DATA_FILE = path.join(__dirname, 'match_data.json');

/**
 * Charge les données sauvegardées.
 */
function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        return {};
    }
    try {
        const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
        return JSON.parse(rawData);
    } catch (error) {
        console.error("Erreur lors de la lecture du fichier de sauvegarde :", error);
        return {};
    }
}

/**
 * Sauvegarde les données dans le fichier JSON.
 */
function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 4), 'utf-8');
    } catch (error) {
        console.error("Erreur lors de la sauvegarde des données :", error);
    }
}

/**
 * Génère un identifiant unique et ordonné pour un couple d'utilisateurs.
 * (UserA, UserB) et (UserB, UserA) donneront la même clé.
 */
function getPairKey(user1Id, user2Id) {
    return [user1Id, user2Id].sort().join('_');
}

/**
 * Retourne une barre de progression visuelle.
 */
function getProgressBar(percentage) {
    const totalBlocks = 10;
    const filledBlocks = Math.round((percentage / 100) * totalBlocks);
    const emptyBlocks = totalBlocks - filledBlocks;
    return '🟩'.repeat(filledBlocks) + '⬛'.repeat(emptyBlocks);
}

/**
 * Retourne un commentaire personnalisé selon le pourcentage de compatibilité.
 */
function getComment(percentage) {
    if (percentage === 100) return "💍 **Âmes sœurs absolues !** Le mariage est pour demain !";
    if (percentage >= 80) return "🔥 **Une alchimie explosive !** Ça étincelle fort !";
    if (percentage >= 60) return "✨ **Belle complicité !** Un grand potentiel ensemble.";
    if (percentage >= 40) return "🙂 **Pas mal du tout !** Une bonne base d'amitié.";
    if (percentage >= 20) return "🧊 **Un peu froid...** Il va falloir faire des efforts.";
    return "💔 **Incompatibilité totale.** Mieux vaut rester à distance !";
}

module.exports = {
    name: 'match',
    description: 'Calcule le pourcentage de compatibilité amoureuse avec une personne en répondant à son message.',
    
    /**
     * Exécute la commande !match.
     * @param {import('discord.js').Message} message
     */
    async execute(message) {
        // 1. Vérification : le message doit être une réponse à un autre message
        if (!message.reference || !message.reference.messageId) {
            return message.reply("⚠️ **Attention :** Vous devez répondre directement au message de la personne avec laquelle vous souhaitez matcher !");
        }

        try {
            // Récupération du message cible
            const targetMessage = await message.channel.messages.fetch(message.reference.messageId);
            const user1 = message.author;
            const user2 = targetMessage.author;

            // 2. Cas particulier : Réponse à son propre message
            if (user1.id === user2.id) {
                return message.reply("😳 Vous essayez de matcher avec vous-même ? L'amour-propre c'est bien, mais essayez avec quelqu'un d'autre !");
            }

            // 3. Cas particulier : Réponse à un bot
            if (user2.bot) {
                return message.reply("🤖 Les robots n'ont pas de cœur... Vous ne pouvez pas matcher avec un bot !");
            }

            // 4. Chargement des données et vérification de l'existence du match
            const matchData = loadData();
            const pairKey = getPairKey(user1.id, user2.id);

            let percentage;
            let isNew = false;

            if (matchData[pairKey] !== undefined) {
                percentage = matchData[pairKey];
            } else {
                percentage = Math.floor(Math.random() * 101);
                matchData[pairKey] = percentage;
                saveData(matchData);
                isNew = true;
            }

            // 5. Construction de l'Embed Discord
            const progressBar = getProgressBar(percentage);
            const comment = getComment(percentage);

            const embed = {
                color: percentage >= 50 ? 0xFF69B4 : 0x7289DA,
                title: '💘 Test de Compatibilité Amoureuse 💘',
                description: `Mesure de l'alchimie entre **${user1.username}** et **${user2.username}** !`,
                fields: [
                    {
                        name: '📊 Score de compatibilité',
                        value: `**${percentage}%**\n${progressBar}`,
                        inline: false
                    },
                    {
                        name: '💬 Verdict',
                        value: comment,
                        inline: false
                    }
                ],
                footer: {
                    text: isNew ? '💾 Nouveau score enregistré !' : '📖 Score récupéré depuis la sauvegarde.'
                },
                timestamp: new Date()
            };

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error("Erreur lors du calcul du match :", error);
            return message.reply("❌ Une erreur est survenue lors du traitement du match.");
        }
    }
};

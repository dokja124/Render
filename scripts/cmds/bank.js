// bank.js
// Système de gestion de la banque et de l'économie locale pour le bot Discord

const fs = require('fs');
const path = require('path');

// Fichier JSON de sauvegarde de la banque
const BANK_FILE = path.join(__dirname, 'bank_data.json');

/**
 * Charge les données bancaires depuis le fichier JSON.
 */
function loadBankData() {
    if (!fs.existsSync(BANK_FILE)) {
        return {};
    }
    try {
        const rawData = fs.readFileSync(BANK_FILE, 'utf-8');
        return JSON.parse(rawData);
    } catch (error) {
        console.error("Erreur lors de la lecture du fichier de banque :", error);
        return {};
    }
}

/**
 * Sauvegarde les données bancaires dans le fichier JSON.
 */
function saveBankData(data) {
    try {
        fs.writeFileSync(BANK_FILE, JSON.stringify(data, null, 4), 'utf-8');
    } catch (error) {
        console.error("Erreur lors de la sauvegarde de la banque :", error);
    }
}

module.exports = {
    name: 'bank',
    description: 'Gère le solde, les récompenses du casino et les transferts d\'argent entre membres.',

    /**
     * Obtenir le solde d'un utilisateur.
     */
    getBalance(userId) {
        const data = loadBankData();
        return data[userId] !== undefined ? data[userId] : 1000; // 1 000 💵 offert au départ
    },

    /**
     * Ajouter de l'argent au solde.
     */
    addMoney(userId, amount) {
        const data = loadBankData();
        const current = data[userId] !== undefined ? data[userId] : 1000;
        data[userId] = current + amount;
        saveBankData(data);
        return data[userId];
    },

    /**
     * Retirer de l'argent du solde.
     */
    removeMoney(userId, amount) {
        const data = loadBankData();
        const current = data[userId] !== undefined ? data[userId] : 1000;
        if (current < amount) return false;
        data[userId] = current - amount;
        saveBankData(data);
        return true;
    },

    /**
     * Commande !bank / !bank pay / !bank balance
     */
    async execute(message, args) {
        const subCommand = args[0] ? args[0].toLowerCase() : 'balance';

        // 1. Solde
        if (subCommand === 'balance' || subCommand === 'solde') {
            const target = message.mentions.users.first() || message.author;
            const balance = this.getBalance(target.id);

            const embed = {
                color: 0xF1C40F,
                title: `🏦 Compte Bancaire - ${target.username}`,
                description: `Solde actuel : **${balance.toLocaleString()} 💵**`,
                footer: { text: "Jouez au casino (!casino) pour augmenter votre pactole !" },
                timestamp: new Date()
            };
            return message.reply({ embeds: [embed] });
        }

        // 2. Transfert d'argent entre membres (!bank pay @membre 500)
        if (subCommand === 'pay' || subCommand === 'transfer' || subCommand === 'donner') {
            const target = message.mentions.users.first();
            const amount = parseInt(args[2] || args[1]);

            if (!target) {
                return message.reply("⚠️ Veuillez mentionner un membre. Exemple : `!bank pay @membre 500`");
            }

            if (target.id === message.author.id) {
                return message.reply("😳 Vous ne pouvez pas vous envoyer de l'argent à vous-même !");
            }

            if (target.bot) {
                return message.reply("🤖 Les bots n'ont pas besoin d'argent !");
            }

            if (isNaN(amount) || amount <= 0) {
                return message.reply("⚠️ Veuillez spécifier un montant valide supérieur à 0.");
            }

            const success = this.removeMoney(message.author.id, amount);
            if (!success) {
                const currentBalance = this.getBalance(message.author.id);
                return message.reply(`❌ Solde insuffisant ! Vous n'avez que **${currentBalance.toLocaleString()} 💵**.`);
            }

            this.addMoney(target.id, amount);

            const embedPay = {
                color: 0x2ECC71,
                title: '💸 Transfert Réussi !',
                description: `**${message.author.username}** a envoyé **${amount.toLocaleString()} 💵** à **${target.username}** !`,
                fields: [
                    { name: `Solde de ${message.author.username}`, value: `${this.getBalance(message.author.id).toLocaleString()} 💵`, inline: true },
                    { name: `Solde de ${target.username}`, value: `${this.getBalance(target.id).toLocaleString()} 💵`, inline: true }
                ],
                timestamp: new Date()
            };

            return message.channel.send({ embeds: [embedPay] });
        }

        return message.reply("💡 Commandes : `!bank` (voir solde), `!bank pay @membre <montant>` (donner de l'argent).");
    }
};

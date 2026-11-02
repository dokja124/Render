// casino.js
// Module de jeux de Casino complet avec mise, risque, gains variables et intégration de bank.js

const bank = require('./bank.js');
const BASE_REWARD = 5000;

module.exports = {
    name: 'casino',
    aliases: ['bet', 'jeux'],
    description: 'Jouez au casino avec vos 💵 ! Machine à sous, Roulette, Blackjack et Pile ou Face.',

    async execute(message, args) {
        const userId = message.author.id;
        const subCommand = args[0] ? args[0].toLowerCase() : 'help';
        const userBalance = bank.getBalance(userId);

        // Menu principal (!casino)
        if (subCommand === 'help' || !args[0]) {
            const embedHelp = {
                color: 0xE74C3C,
                title: '🎰 Bienvenue au Casino ! 🎰',
                description: `Votre solde actuel : **${userBalance.toLocaleString()} 💵**\n\nMisez et relancez votre argent pour multiplier vos gains !`,
                fields: [
                    { name: '🎰 1. Machine à sous', value: '`!casino slots <mise>` (Gain jusqu\'à 5 000 💵 + 5x la mise)', inline: false },
                    { name: '🎲 2. Roulette', value: '`!casino roulette <rouge|noir|0-36> <mise>`', inline: false },
                    { name: '🃏 3. Blackjack', value: '`!casino blackjack <mise>`', inline: false },
                    { name: '🪙 4. Pile ou Face', value: '`!casino coinflip <pile|face> <mise>`', inline: false }
                ],
                footer: { text: "Utilisez !bank pay @membre <montant> pour donner des sous à vos amis !" },
                timestamp: new Date()
            };
            return message.channel.send({ embeds: [embedHelp] });
        }

        let bet = 0;

        // 🎰 Machine à sous
        if (subCommand === 'slots' || subCommand === 'slot') {
            bet = parseInt(args[1]) || 500;
            if (bet <= 0) return message.reply("⚠️ Veuillez entrer une mise valide.");
            if (!bank.removeMoney(userId, bet)) {
                return message.reply(`❌ Solde insuffisant ! Vous avez **${userBalance.toLocaleString()} 💵**.`);
            }

            const items = ['🍒', '🍋', '🍇', '🍉', '🔔', '⭐️', '💎', '7️⃣'];
            const s1 = items[Math.floor(Math.random() * items.length)];
            const s2 = items[Math.floor(Math.random() * items.length)];
            const s3 = items[Math.floor(Math.random() * items.length)];

            let winAmount = 0;
            let resultText = "";

            if (s1 === s2 && s2 === s3) {
                winAmount = BASE_REWARD + (bet * 5);
                resultText = `🎉 **JACKPOT EXCEPTIONNEL !** Vous alignez 3x ${s1} !\nVous gagnez **${winAmount.toLocaleString()} 💵** !`;
            } else if (s1 === s2 || s2 === s3 || s1 === s3) {
                winAmount = Math.floor(bet * 1.5) + 1000;
                resultText = `✨ **Bien joué !** 2 symboles identiques !\nVous gagnez **${winAmount.toLocaleString()} 💵** !`;
            } else {
                resultText = `💔 **Perdu !** Vous perdez votre mise de **${bet.toLocaleString()} 💵**.`;
            }

            if (winAmount > 0) bank.addMoney(userId, winAmount);

            return message.channel.send({
                embeds: [{
                    color: winAmount > 0 ? 0x2ECC71 : 0xE74C3C,
                    title: '🎰 Machine à sous 🎰',
                    description: `[ ${s1} | ${s2} | ${s3} ]\n\n${resultText}`,
                    fields: [{ name: 'Nouveau solde', value: `${bank.getBalance(userId).toLocaleString()} 💵` }]
                }]
            });
        }

        // 🎲 Roulette
        if (subCommand === 'roulette') {
            const choice = args[1] ? args[1].toLowerCase() : null;
            bet = parseInt(args[2]);

            if (!choice || isNaN(bet) || bet <= 0) {
                return message.reply("⚠️ Usage : `!casino roulette <rouge|noir|0-36> <mise>`");
            }
            if (!bank.removeMoney(userId, bet)) {
                return message.reply(`❌ Solde insuffisant (${userBalance.toLocaleString()} 💵).`);
            }

            const winNum = Math.floor(Math.random() * 37);
            const isRed = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(winNum);
            const winColor = winNum === 0 ? 'vert' : (isRed ? 'rouge' : 'noir');

            let winAmount = 0;
            let success = false;

            if (choice === winColor) {
                winAmount = (bet * 2) + 2000;
                success = true;
            } else if (!isNaN(parseInt(choice)) && parseInt(choice) === winNum) {
                winAmount = (bet * 36) + BASE_REWARD;
                success = true;
            }

            if (success) bank.addMoney(userId, winAmount);

            return message.channel.send({
                embeds: [{
                    color: success ? 0x2ECC71 : 0xE74C3C,
                    title: '🎲 La Roulette 🎲',
                    description: `Le numéro gagnant est le **${winNum} (${winColor.toUpperCase()})** !`,
                    fields: [
                        { name: 'Résultat', value: success ? `🎉 GAGNÉ ! +**${winAmount.toLocaleString()} 💵**` : `💔 PERDU ! -**${bet.toLocaleString()} 💵**` },
                        { name: 'Nouveau solde', value: `${bank.getBalance(userId).toLocaleString()} 💵` }
                    ]
                }]
            });
        }

        // 🃏 Blackjack
        if (subCommand === 'blackjack' || subCommand === 'bj') {
            bet = parseInt(args[1]) || 1000;
            if (bet <= 0 || !bank.removeMoney(userId, bet)) {
                return message.reply("⚠️ Solde insuffisant ou mise invalide.");
            }

            const pTotal = (Math.floor(Math.random() * 10) + 1) + (Math.floor(Math.random() * 10) + 1);
            const dTotal = Math.floor(Math.random() * 12) + 12;

            let winAmount = 0;
            let msg = "";

            if (pTotal <= 21 && (pTotal > dTotal || dTotal > 21)) {
                winAmount = BASE_REWARD + (bet * 2);
                bank.addMoney(userId, winAmount);
                msg = `🎉 **Victoire !** Vous remportez **${winAmount.toLocaleString()} 💵** !`;
            } else if (pTotal === dTotal) {
                bank.addMoney(userId, bet);
                msg = `⚖️ **Égalité !** Votre mise vous est rendue.`;
            } else {
                msg = `💔 **Défaite !** La banque l'emporte.`;
            }

            return message.channel.send({
                embeds: [{
                    color: winAmount > 0 ? 0x2ECC71 : 0xE74C3C,
                    title: '🃏 Blackjack 🃏',
                    fields: [
                        { name: 'Vos cartes', value: `${pTotal}`, inline: true },
                        { name: 'Banque', value: `${dTotal}`, inline: true },
                        { name: 'Verdict', value: msg, inline: false },
                        { name: 'Nouveau solde', value: `${bank.getBalance(userId).toLocaleString()} 💵` }
                    ]
                }]
            });
        }

        // 🪙 Pile ou Face
        if (subCommand === 'coinflip' || subCommand === 'cf') {
            const choice = args[1] ? args[1].toLowerCase() : null;
            bet = parseInt(args[2]);

            if (!['pile', 'face'].includes(choice) || isNaN(bet) || bet <= 0) {
                return message.reply("⚠️ Usage : `!casino coinflip <pile|face> <mise>`");
            }

            if (!bank.removeMoney(userId, bet)) {
                return message.reply("❌ Solde insuffisant.");
            }

            const coin = Math.random() < 0.5 ? 'pile' : 'face';
            const won = choice === coin;

            let winAmount = 0;
            if (won) {
                winAmount = (bet * 2) + 500;
                bank.addMoney(userId, winAmount);
            }

            return message.channel.send({
                embeds: [{
                    color: won ? 0x2ECC71 : 0xE74C3C,
                    title: '🪙 Pile ou Face 🪙',
                    description: `La pièce est tombée sur **${coin.toUpperCase()}** !`,
                    fields: [
                        { name: 'Résultat', value: won ? `🎉 GAGNÉ ! +**${winAmount.toLocaleString()} 💵**` : `💔 PERDU ! -**${bet.toLocaleString()} 💵**` },
                        { name: 'Nouveau solde', value: `${bank.getBalance(userId).toLocaleString()} 💵` }
                    ]
                }]
            });
        }
    }
};

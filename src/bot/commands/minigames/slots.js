import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';

const SYMBOLS = [
  { emoji: '👑', name: 'Corona Reale', weight: 4, mult3: 10, mult2: 2 },
  { emoji: '💎', name: 'Diamante Sacro', weight: 6, mult3: 7, mult2: 1.5 },
  { emoji: '⚔️', name: 'Spade Crociate', weight: 10, mult3: 5, mult2: 1.2 },
  { emoji: '🔔', name: 'Campana d\'Oro', weight: 14, mult3: 3.5, mult2: 1 },
  { emoji: '🍇', name: 'Uva del Banchetto', weight: 20, mult3: 2.5, mult2: 0.8 },
  { emoji: '🍒', name: 'Ciliegia', weight: 26, mult3: 2, mult2: 0.5 }
];

function getRandomSymbol() {
  const total = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
  let rand = Math.random() * total;
  for (const s of SYMBOLS) {
    if (rand < s.weight) return s;
    rand -= s.weight;
  }
  return SYMBOLS[SYMBOLS.length - 1];
}

export default {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Tenta la fortuna alla Slot Machine Medievale del Regno!')
    .addIntegerOption(opt =>
      opt
        .setName('puntata')
        .setDescription('Quantità di monete da puntare (default: 50)')
        .setMinValue(10)
        .setRequired(false)
    ),

  async execute(interaction) {
    const guild = interaction.guild;
    const user = interaction.user;
    const channelId = interaction.channelId;

    const config = DatabaseHelper.getMinigamesConfig(guild.id);
    if (!config.enabled) {
      return interaction.reply({
        content: '❌ Il modulo Minigiochi & Casinò è attualmente disattivato in questo server.',
        ephemeral: true
      });
    }

    const targetChannel = config.slots_channel_id || config.general_channel_id;
    if (targetChannel && targetChannel !== channelId) {
      return interaction.reply({
        content: `⚠️ Puoi giocare alle Slot solo nel canale dedicato: <#${targetChannel}>!`,
        ephemeral: true
      });
    }

    const bet = interaction.options.getInteger('puntata') || 50;
    const profile = DatabaseHelper.getFishingProfile(guild.id, user.id);

    if (bet < (config.min_bet || 10)) {
      return interaction.reply({
        content: `❌ La puntata minima consentita è di **${config.min_bet || 10} 🪙** monete!`,
        ephemeral: true
      });
    }

    if (bet > (config.max_bet || 5000)) {
      return interaction.reply({
        content: `❌ La puntata massima consentita è di **${config.max_bet || 5000} 🪙** monete!`,
        ephemeral: true
      });
    }

    if ((profile.coins || 0) < bet) {
      return interaction.reply({
        content: `❌ Non hai abbastanza monete! Il tuo saldo attuale è di **${(profile.coins || 0).toLocaleString()} 🪙** monete.`,
        ephemeral: true
      });
    }

    // Deduct bet
    profile.coins -= bet;
    DatabaseHelper.saveFishingProfile(guild.id, user.id, profile);

    // Roll 3 reels
    const reel1 = getRandomSymbol();
    const reel2 = getRandomSymbol();
    const reel3 = getRandomSymbol();

    let multiplier = 0;
    let winType = 'loss';

    if (reel1.emoji === reel2.emoji && reel2.emoji === reel3.emoji) {
      multiplier = reel1.mult3;
      winType = 'jackpot';
    } else if (reel1.emoji === reel2.emoji || reel2.emoji === reel3.emoji || reel1.emoji === reel3.emoji) {
      const matchSymbol = (reel1.emoji === reel2.emoji) ? reel1 : ((reel2.emoji === reel3.emoji) ? reel2 : reel1);
      multiplier = matchSymbol.mult2;
      winType = 'match2';
    }

    const wonCoins = Math.floor(bet * multiplier);
    const netCoins = wonCoins - bet;

    if (wonCoins > 0) {
      profile.coins += wonCoins;
      DatabaseHelper.saveFishingProfile(guild.id, user.id, profile);
    }

    DatabaseHelper.recordMinigameResult(guild.id, user.id, 'slots', wonCoins > bet, netCoins);

    const isWin = wonCoins > bet;
    const isPush = wonCoins === bet;

    const resultColor = winType === 'jackpot' ? '#eab308' : (isWin ? '#10b981' : (isPush ? '#38bdf8' : '#ef4444'));
    const resultTitle = winType === 'jackpot' ? '🎰 JACKPOT REALE! TRIS PERFETTO! 👑' : (isWin ? '🎉 VITTORIA ALLA SLOT!' : (isPush ? '🤝 PAREGGIO!' : '💀 NESSUNA COMBINAZIONE!'));

    const embed = new EmbedBuilder()
      .setColor(resultColor)
      .setAuthor({
        name: `🎰 Slot Machine Medievale • ${user.displayName || user.username}`,
        iconURL: user.displayAvatarURL({ dynamic: true })
      })
      .setTitle(resultTitle)
      .setDescription(
        `╭───────────────────╮\n` +
        `│   ${reel1.emoji}   ┆   ${reel2.emoji}   ┆   ${reel3.emoji}   │\n` +
        `╰───────────────────╯\n\n` +
        (winType === 'jackpot' ? `🌟 **TRIS DI ${reel1.name.toUpperCase()}! Moltiplicatore: \`x${multiplier}\`!**\n\n` : (winType === 'match2' ? `✨ **COPPIA DI ${reel1.emoji}! Moltiplicatore: \`x${multiplier}\`**\n\n` : '')) +
        `> 💸 **Puntata:** \`${bet.toLocaleString()}\` 🪙\n` +
        `> 💰 **Incasso:** \`${wonCoins.toLocaleString()}\` 🪙\n` +
        `> 🪙 **Nuovo Saldo:** \`${profile.coins.toLocaleString()}\` 🪙 monete`
      )
      .setFooter({ text: `${guild.name} • Sentry Casino`, iconURL: guild.iconURL() })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_slot_again_${bet}`)
        .setLabel(`Gira Ancora (${bet} 🪙)`)
        .setEmoji('🔁')
        .setStyle(ButtonStyle.Primary)
    );

    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }
};

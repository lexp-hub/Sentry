import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { DatabaseHelper } from '../../database/db.js';

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const VALUES = [
  { rank: '2', val: 2 },
  { rank: '3', val: 3 },
  { rank: '4', val: 4 },
  { rank: '5', val: 5 },
  { rank: '6', val: 6 },
  { rank: '7', val: 7 },
  { rank: '8', val: 8 },
  { rank: '9', val: 9 },
  { rank: '10', val: 10 },
  { rank: 'J', val: 10, emoji: '⚔️' },
  { rank: 'Q', val: 10, emoji: '👑' },
  { rank: 'K', val: 10, emoji: '🤴' },
  { rank: 'A', val: 11, emoji: '🛡️' }
];

export class Deck {
  constructor() {
    this.cards = [];
    this.reset();
  }

  reset() {
    this.cards = [];
    for (const suit of SUITS) {
      for (const v of VALUES) {
        this.cards.push({ rank: v.rank, suit, value: v.val });
      }
    }
    this.shuffle();
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  draw() {
    if (this.cards.length === 0) this.reset();
    return this.cards.pop();
  }
}

// Active Games in memory
const activeGames = new Map();

export const BlackjackManager = {
  calculateHand(cards) {
    let sum = 0;
    let aces = 0;

    for (const c of cards) {
      if (c.rank === 'A') {
        aces++;
        sum += 11;
      } else {
        sum += c.value;
      }
    }

    while (sum > 21 && aces > 0) {
      sum -= 10;
      aces--;
    }

    const isSoft = aces > 0 && sum <= 21;
    const isBlackjack = cards.length === 2 && sum === 21;
    const isBust = sum > 21;

    return { total: sum, isSoft, isBlackjack, isBust };
  },

  formatCards(cards, hideSecond = false) {
    if (hideSecond && cards.length > 1) {
      return `\`[ ${cards[0].rank}${cards[0].suit} ]\` \`[ 🎴 ?? ]\``;
    }
    return cards.map(c => `\`[ ${c.rank}${c.suit} ]\``).join(' ');
  },

  checkChannel(guildId, channelId) {
    const config = DatabaseHelper.getMinigamesConfig(guildId);
    if (!config.enabled) {
      return { allowed: false, reason: 'Il modulo Minigiochi & Casinò è disattivato in questo server.' };
    }
    const targetChannel = config.blackjack_channel_id || config.general_channel_id;
    if (targetChannel && targetChannel !== channelId) {
      return {
        allowed: false,
        reason: `⚠️ Puoi giocare a Blackjack solo nel canale dedicato: <#${targetChannel}>!`
      };
    }
    return { allowed: true, config };
  },

  async startGame(guild, user, channelId, betAmount) {
    const channelCheck = this.checkChannel(guild.id, channelId);
    if (!channelCheck.allowed) {
      return { success: false, message: channelCheck.reason, ephemeral: true };
    }

    const config = channelCheck.config;
    const gameKey = `${guild.id}_${user.id}`;

    if (activeGames.has(gameKey)) {
      return {
        success: false,
        message: '⚠️ Hai già una partita di Blackjack in corso! Concludila prima di iniziarne una nuova.',
        ephemeral: true
      };
    }

    const profile = DatabaseHelper.getFishingProfile(guild.id, user.id);
    const bet = Math.floor(Number(betAmount));

    if (isNaN(bet) || bet < (config.min_bet || 10)) {
      return {
        success: false,
        message: `❌ La puntata minima per giocare a Blackjack è di **${config.min_bet || 10} 🪙** monete!`,
        ephemeral: true
      };
    }

    if (bet > (config.max_bet || 5000)) {
      return {
        success: false,
        message: `❌ La puntata massima consentita dal re è di **${config.max_bet || 5000} 🪙** monete!`,
        ephemeral: true
      };
    }

    if ((profile.coins || 0) < bet) {
      return {
        success: false,
        message: `❌ Non hai abbastanza monete! Il tuo saldo attuale è di **${(profile.coins || 0).toLocaleString()} 🪙** monete.`,
        ephemeral: true
      };
    }

    // Deduct bet from player profile
    profile.coins -= bet;
    DatabaseHelper.saveFishingProfile(guild.id, user.id, profile);

    const deck = new Deck();
    const playerHand = [deck.draw(), deck.draw()];
    const dealerHand = [deck.draw(), deck.draw()];

    const playerEval = this.calculateHand(playerHand);
    const dealerEval = this.calculateHand(dealerHand);

    const gameState = {
      guildId: guild.id,
      userId: user.id,
      bet,
      playerHand,
      dealerHand,
      deck,
      doubled: false,
      status: 'playing',
      createdAt: Date.now()
    };

    // Check immediate Blackjack
    if (playerEval.isBlackjack || dealerEval.isBlackjack) {
      return this.resolveGame(gameState, guild, user, true);
    }

    activeGames.set(gameKey, gameState);

    const embed = this.buildGameEmbed(gameState, guild, user, false);
    const row = this.buildGameButtons(gameState, (profile.coins || 0) >= bet);

    return { success: true, embed, row, gameState };
  },

  async handleHit(guild, user) {
    const gameKey = `${guild.id}_${user.id}`;
    const game = activeGames.get(gameKey);
    if (!game) return { success: false, message: 'Nessuna partita attiva trovata.', ephemeral: true };

    game.playerHand.push(game.deck.draw());
    const playerEval = this.calculateHand(game.playerHand);

    if (playerEval.isBust) {
      game.status = 'player_bust';
      activeGames.delete(gameKey);
      return this.resolveGame(game, guild, user, false);
    }

    if (playerEval.total === 21) {
      return this.handleStand(guild, user);
    }

    const profile = DatabaseHelper.getFishingProfile(guild.id, user.id);
    const embed = this.buildGameEmbed(game, guild, user, false);
    const row = this.buildGameButtons(game, false); // Can't double after hit

    return { success: true, embed, row, inProgress: true };
  },

  async handleDouble(guild, user) {
    const gameKey = `${guild.id}_${user.id}`;
    const game = activeGames.get(gameKey);
    if (!game) return { success: false, message: 'Nessuna partita attiva.', ephemeral: true };

    const profile = DatabaseHelper.getFishingProfile(guild.id, user.id);
    if ((profile.coins || 0) < game.bet) {
      return { success: false, message: '❌ Non hai abbastanza monete per raddoppiare la puntata!', ephemeral: true };
    }

    profile.coins -= game.bet;
    DatabaseHelper.saveFishingProfile(guild.id, user.id, profile);

    game.bet *= 2;
    game.doubled = true;
    game.playerHand.push(game.deck.draw());

    const playerEval = this.calculateHand(game.playerHand);
    if (playerEval.isBust) {
      game.status = 'player_bust';
      activeGames.delete(gameKey);
      return this.resolveGame(game, guild, user, false);
    }

    return this.handleStand(guild, user);
  },

  async handleStand(guild, user) {
    const gameKey = `${guild.id}_${user.id}`;
    const game = activeGames.get(gameKey);
    if (!game) return { success: false, message: 'Nessuna partita attiva.', ephemeral: true };

    activeGames.delete(gameKey);

    // Dealer AI: hits until 17 or higher
    let dealerEval = this.calculateHand(game.dealerHand);
    while (dealerEval.total < 17) {
      game.dealerHand.push(game.deck.draw());
      dealerEval = this.calculateHand(game.dealerHand);
    }

    const playerEval = this.calculateHand(game.playerHand);

    if (dealerEval.isBust) {
      game.status = 'dealer_bust';
    } else if (playerEval.total > dealerEval.total) {
      game.status = 'player_won';
    } else if (dealerEval.total > playerEval.total) {
      game.status = 'dealer_won';
    } else {
      game.status = 'push';
    }

    return this.resolveGame(game, guild, user, false);
  },

  resolveGame(game, guild, user, isNaturalBj = false) {
    const playerEval = this.calculateHand(game.playerHand);
    const dealerEval = this.calculateHand(game.dealerHand);
    const profile = DatabaseHelper.getFishingProfile(guild.id, user.id);

    let resultTitle = '';
    let resultColor = '#64748b';
    let wonAmount = 0;
    let netCoins = 0;

    if (isNaturalBj) {
      if (playerEval.isBlackjack && dealerEval.isBlackjack) {
        game.status = 'push';
        wonAmount = game.bet;
        resultTitle = '🤝 Pareggio Naturale (Push)!';
        resultColor = '#eab308';
      } else if (playerEval.isBlackjack) {
        game.status = 'blackjack';
        wonAmount = Math.floor(game.bet * 2.5);
        netCoins = wonAmount - game.bet;
        resultTitle = '👑 BLACKJACK NATURALE! Vittoria Epica!';
        resultColor = '#10b981';
      } else {
        game.status = 'dealer_won';
        netCoins = -game.bet;
        resultTitle = '💀 Il Banco ha fatto Blackjack!';
        resultColor = '#ef4444';
      }
    } else {
      switch (game.status) {
        case 'player_bust':
          netCoins = -game.bet;
          resultTitle = '💥 Sballato! Hai superato 21.';
          resultColor = '#ef4444';
          break;
        case 'dealer_bust':
          wonAmount = game.bet * 2;
          netCoins = game.bet;
          resultTitle = '🎉 Il Banco ha sballato! Hai Vinto!';
          resultColor = '#10b981';
          break;
        case 'player_won':
          wonAmount = game.bet * 2;
          netCoins = game.bet;
          resultTitle = '🏆 Hai battuto il Banco! Vittoria!';
          resultColor = '#10b981';
          break;
        case 'dealer_won':
          netCoins = -game.bet;
          resultTitle = '📉 Il Banco vince la mano.';
          resultColor = '#ef4444';
          break;
        case 'push':
          wonAmount = game.bet;
          resultTitle = '🤝 Pareggio (Push) — Puntata restituita.';
          resultColor = '#eab308';
          break;
      }
    }

    if (wonAmount > 0) {
      profile.coins = (profile.coins || 0) + wonAmount;
      DatabaseHelper.saveFishingProfile(guild.id, user.id, profile);
    }

    const won = ['player_won', 'dealer_bust', 'blackjack'].includes(game.status);
    DatabaseHelper.recordMinigameResult(guild.id, user.id, 'blackjack', won, netCoins);

    const embed = new EmbedBuilder()
      .setColor(resultColor)
      .setAuthor({
        name: `🃏 Tavolo da Blackjack • ${user.displayName || user.username}`,
        iconURL: user.displayAvatarURL({ dynamic: true })
      })
      .setTitle(resultTitle)
      .addFields(
        {
          name: `🤵 Banco (${dealerEval.total}${dealerEval.isBust ? ' - SBALLATO' : ''})`,
          value: this.formatCards(game.dealerHand, false),
          inline: false
        },
        {
          name: `👤 ${user.displayName || user.username} (${playerEval.total}${playerEval.isBust ? ' - SBALLATO' : ''})`,
          value: this.formatCards(game.playerHand, false),
          inline: false
        },
        {
          name: '💰 Esito Economico',
          value: `> **Puntata:** \`${game.bet.toLocaleString()}\` 🪙\n` +
                 `> **Vincita:** \`${wonAmount.toLocaleString()}\` 🪙\n` +
                 `> **Nuovo Saldo:** \`${profile.coins.toLocaleString()}\` 🪙 monete`,
          inline: false
        }
      )
      .setFooter({ text: `${guild.name} • Sentry Casino Reale`, iconURL: guild.iconURL() })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_bj_again_${game.bet}`)
        .setLabel(`Gioca Ancora (${game.bet} 🪙)`)
        .setEmoji('🔁')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('btn_bj_profile')
        .setLabel('Profilo & Monete')
        .setEmoji('🎒')
        .setStyle(ButtonStyle.Secondary)
    );

    return { success: true, embed, row, inProgress: false };
  },

  buildGameEmbed(game, guild, user, hideDealer = true) {
    const playerEval = this.calculateHand(game.playerHand);
    const dealerEval = this.calculateHand(game.dealerHand);

    return new EmbedBuilder()
      .setColor('#3b82f6')
      .setAuthor({
        name: `🃏 Tavolo da Blackjack • ${user.displayName || user.username}`,
        iconURL: user.displayAvatarURL({ dynamic: true })
      })
      .setTitle(`🎲 Mano in corso — Puntata: ${game.bet.toLocaleString()} 🪙`)
      .addFields(
        {
          name: `🤵 Banco (${hideDealer ? '?' : dealerEval.total})`,
          value: this.formatCards(game.dealerHand, hideDealer),
          inline: false
        },
        {
          name: `👤 ${user.displayName || user.username} (${playerEval.total})`,
          value: this.formatCards(game.playerHand, false),
          inline: false
        }
      )
      .setFooter({ text: 'Scegli la tua mossa: Carta (Hit), Stai (Stand) o Raddoppia (Double)', iconURL: guild.iconURL() })
      .setTimestamp();
  },

  buildGameButtons(game, canDouble = false) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_bj_hit')
        .setLabel('Carta (Hit)')
        .setEmoji('🃏')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('btn_bj_stand')
        .setLabel('Stai (Stand)')
        .setEmoji('🛑')
        .setStyle(ButtonStyle.Secondary)
    );

    if (canDouble && game.playerHand.length === 2 && !game.doubled) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('btn_bj_double')
          .setLabel('Raddoppia (x2)')
          .setEmoji('💎')
          .setStyle(ButtonStyle.Success)
      );
    }

    return row;
  },

  async sendBlackjackPanel(guild, channelId, options = {}) {
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) throw new Error('Canale Blackjack non trovato.');

    const title = options.title || '🃏 Casinò Reale: Tavolo da Blackjack';
    const color = options.color || '#3b82f6';

    const desc = options.description ||
      `Benvenuto al **Tavolo Ufficiale di Blackjack** del regno di **${guild.name}**!\n\n` +
      `Sfida il Banco a raggiungere **21** senza sballare. Usa le monete guadagnate pescando o con i comandi giornalieri!\n\n` +
      `📜 **Regole del Gioco:**\n` +
      `• Il Banco pesca carte fino a raggiungere almeno **17**.\n` +
      `• **Blackjack Naturale** paga **3:2** (2.5x la puntata).\n` +
      `• Le figure (J, Q, K) valgono **10**, l'Asso vale **1 o 11**.\n` +
      `• Puoi **Raddoppiare (Double)** al primo turno per ricevere esattamente una sola carta finale!`;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(desc)
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .setImage(options.image || 'https://images.unsplash.com/photo-1511193311914-0346f16efe90?auto=format&fit=crop&w=1200&q=80')
      .setFooter({ text: `${guild.name} • Sentry Casino`, iconURL: guild.iconURL() })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_bj_quick_50')
        .setLabel('Punta 50 🪙')
        .setEmoji('🎲')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('btn_bj_quick_100')
        .setLabel('Punta 100 🪙')
        .setEmoji('🎲')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('btn_bj_quick_250')
        .setLabel('Punta 250 🪙')
        .setEmoji('💎')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('btn_bj_quick_500')
        .setLabel('Punta 500 🪙')
        .setEmoji('👑')
        .setStyle(ButtonStyle.Danger)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_bj_profile')
        .setLabel('Controlla Saldo & Statistiche')
        .setEmoji('🎒')
        .setStyle(ButtonStyle.Secondary)
    );

    return await channel.send({ embeds: [embed], components: [row, row2] });
  },

  async handleButtonInteraction(interaction) {
    const { customId, guild, user, channelId } = interaction;

    if (customId === 'btn_bj_hit') {
      const result = await this.handleHit(guild, user);
      if (!result.success) return interaction.reply({ content: result.message, ephemeral: true });
      if (result.inProgress) {
        return interaction.update({ embeds: [result.embed], components: [result.row] });
      }
      await interaction.update({ embeds: [result.embed], components: [result.row] });
      setTimeout(() => { interaction.deleteReply().catch(() => {}); }, 15000);
      return;
    }

    if (customId === 'btn_bj_stand') {
      const result = await this.handleStand(guild, user);
      if (!result.success) return interaction.reply({ content: result.message, ephemeral: true });
      await interaction.update({ embeds: [result.embed], components: [result.row] });
      setTimeout(() => { interaction.deleteReply().catch(() => {}); }, 15000);
      return;
    }

    if (customId === 'btn_bj_double') {
      const result = await this.handleDouble(guild, user);
      if (!result.success) return interaction.reply({ content: result.message, ephemeral: true });
      await interaction.update({ embeds: [result.embed], components: [result.row] });
      setTimeout(() => { interaction.deleteReply().catch(() => {}); }, 15000);
      return;
    }

    if (customId.startsWith('btn_bj_again_')) {
      const bet = parseInt(customId.replace('btn_bj_again_', ''), 10) || 50;
      const result = await this.startGame(guild, user, channelId, bet);
      if (!result.success) return interaction.reply({ content: result.message, ephemeral: true });
      const comp = result.row ? [result.row] : [];
      return interaction.reply({ embeds: [result.embed], components: comp, ephemeral: true });
    }

    if (customId.startsWith('btn_bj_quick_')) {
      const bet = parseInt(customId.replace('btn_bj_quick_', ''), 10) || 50;
      const result = await this.startGame(guild, user, channelId, bet);
      if (!result.success) return interaction.reply({ content: result.message, ephemeral: true });
      const comp = result.row ? [result.row] : [];
      return interaction.reply({ embeds: [result.embed], components: comp, ephemeral: true });
    }

    if (customId === 'btn_bj_profile') {
      const profile = DatabaseHelper.getFishingProfile(guild.id, user.id);
      const stats = DatabaseHelper.getMinigameStats(guild.id, user.id, 'blackjack');
      const embed = new EmbedBuilder()
        .setColor('#eab308')
        .setTitle(`🎒 Profilo & Statistiche Blackjack • ${user.displayName || user.username}`)
        .setDescription(
          `💰 **Monete Disponibili:** \`${(profile.coins || 0).toLocaleString()}\` 🪙\n\n` +
          `📊 **Mani Giocate:** \`${stats.games_played}\`\n` +
          `🏆 **Mani Vinte:** \`${stats.games_won}\`\n` +
          `💸 **Monete Totali Vinte:** \`${stats.total_won_coins.toLocaleString()} 🪙\`\n` +
          `📉 **Monete Totali Perse:** \`${stats.total_lost_coins.toLocaleString()} 🪙\`\n` +
          `⭐ **Miglior Vincita Singola:** \`${stats.highest_win.toLocaleString()} 🪙\``
        )
        .setFooter({ text: `${guild.name} • Sentry Casinò`, iconURL: guild.iconURL() });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    return false;
  }
};

export default BlackjackManager;

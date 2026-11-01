import { YapinEconomy } from './yapinEconomy.js';
import { Embed, Row, Button } from '../yapper.js';

const activeGames = new Map(); // `${channelId}_${userId}` -> game state

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const VALUES = [
  { name: '2', val: 2 }, { name: '3', val: 3 }, { name: '4', val: 4 },
  { name: '5', val: 5 }, { name: '6', val: 6 }, { name: '7', val: 7 },
  { name: '8', val: 8 }, { name: '9', val: 9 }, { name: '10', val: 10 },
  { name: 'J', val: 10 }, { name: 'Q', val: 10 }, { name: 'K', val: 10 },
  { name: 'A', val: 11 }
];

function drawCard() {
  const s = SUITS[Math.floor(Math.random() * SUITS.length)];
  const v = VALUES[Math.floor(Math.random() * VALUES.length)];
  return { str: `${v.name}${s}`, value: v.val, isAce: v.name === 'A' };
}

function calculateHand(cards) {
  let total = cards.reduce((acc, c) => acc + c.value, 0);
  let aces = cards.filter(c => c.isAce).length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

export const YapinBlackjack = {
  async handleBlackjack(ctx, getContextData) {
    const { serverId, channelId, authorId, argv } = getContextData(ctx);
    if (!serverId || !channelId) return ctx.reply('❌ Gioco disponibile solo nei server.');

    const bet = parseInt(argv[0], 10);
    if (isNaN(bet) || bet < 10 || bet > 5000) {
      return ctx.reply('⚠️ Utilizzo: `/blackjack <puntata>` (Puntata compresa tra 10 e 5.000 monete).');
    }

    const gameKey = `${channelId}_${authorId}`;
    if (activeGames.has(gameKey)) {
      return ctx.reply('⚠️ Hai già una partita di Blackjack in corso in questo canale!');
    }

    const profile = YapinEconomy.getProfile(serverId, authorId);
    if ((profile.balance || 0) < bet) {
      return ctx.reply(`❌ Saldo insufficiente. Hai solo **${profile.balance || 0} 🪙**.`);
    }

    // Scala la puntata
    YapinEconomy.addCoins(serverId, authorId, -bet);

    const playerHand = [drawCard(), drawCard()];
    const dealerHand = [drawCard(), drawCard()];

    const playerTotal = calculateHand(playerHand);
    const dealerVisible = dealerHand[0];

    // Istantaneo Blackjack (21 con 2 carte)
    if (playerTotal === 21) {
      const win = Math.floor(bet * 2.5);
      YapinEconomy.addCoins(serverId, authorId, win);
      const embed = new Embed()
        .title('🃏 BLACKJACK NATURALE!')
        .description(`👑 <@${authorId}> ha fatto **Blackjack** con 21 immediato!\n\n` +
          `• **Tue Carte:** ${playerHand.map(c => c.str).join(' ')} (\`21\`)\n` +
          `• **Banco:** ${dealerHand.map(c => c.str).join(' ')} (\`${calculateHand(dealerHand)}\`)\n\n` +
          `💰 **Hai vinto:** \`+${win} 🪙 Monete\`!`)
        .color('#10b981');
      return ctx.reply('', { embeds: [embed] });
    }

    const game = {
      serverId,
      channelId,
      authorId,
      bet,
      playerHand,
      dealerHand
    };
    activeGames.set(gameKey, game);

    const embed = new Embed()
      .title(`🃏 Blackjack Casino | Puntata: ${bet} 🪙`)
      .description(`Tocca a te, <@${authorId}>! Scegli se chiedere carta o fermarti.\n\n` +
        `👤 **Tua Mano:** ${playerHand.map(c => c.str).join(' ')} (Punteggio: \`${playerTotal}\`)\n` +
        `🎰 **Banco:** ${dealerVisible.str} 🂠 (Visibile: \`${dealerVisible.value}\`)\n\n` +
        `*Usa i pulsanti sottostanti o scrivi \`hit\` / \`stand\`.*`)
      .color('#3b82f6');

    const row = new Row(
      Button.primary('Carta (Hit) 🃏', `bj_hit_${authorId}`),
      Button.secondary('Stai (Stand) 🛑', `bj_stand_${authorId}`)
    );

    ctx.reply('', { embeds: [embed], components: [row] });

    // Timeout automatico partita dopo 60 secondi
    setTimeout(() => {
      if (activeGames.has(gameKey)) {
        activeGames.delete(gameKey);
      }
    }, 60000);
  },

  async handleAction(bot, ctx, action, authorId) {
    const channelId = ctx.channel_id;
    const gameKey = `${channelId}_${authorId}`;
    const game = activeGames.get(gameKey);
    if (!game) return;

    if (action === 'hit') {
      game.playerHand.push(drawCard());
      const playerTotal = calculateHand(game.playerHand);

      if (playerTotal > 21) {
        activeGames.delete(gameKey);
        const embed = new Embed()
          .title('💥 SBALLATO! (Bust)')
          .description(`Hai superato 21 e hai perso la mano.\n\n` +
            `• **Tue Carte:** ${game.playerHand.map(c => c.str).join(' ')} (\`${playerTotal}\`)\n` +
            `• **Banco:** ${game.dealerHand.map(c => c.str).join(' ')}\n\n` +
            `💸 **Monete Perse:** \`${game.bet} 🪙\``)
          .color('#ef4444');
        return ctx.reply('', { embeds: [embed] });
      }

      const embed = new Embed()
        .title(`🃏 Blackjack | Puntata: ${game.bet} 🪙`)
        .description(`Hai pescato una carta!\n\n` +
          `👤 **Tua Mano:** ${game.playerHand.map(c => c.str).join(' ')} (Punteggio: \`${playerTotal}\`)\n` +
          `🎰 **Banco:** ${game.dealerHand[0].str} 🂠`)
        .color('#3b82f6');

      const row = new Row(
        Button.primary('Carta (Hit) 🃏', `bj_hit_${authorId}`),
        Button.secondary('Stai (Stand) 🛑', `bj_stand_${authorId}`)
      );
      return ctx.reply('', { embeds: [embed], components: [row] });
    }

    if (action === 'stand') {
      activeGames.delete(gameKey);
      const playerTotal = calculateHand(game.playerHand);
      let dealerTotal = calculateHand(game.dealerHand);

      // Il banco pesca fino ad almeno 17
      while (dealerTotal < 17) {
        game.dealerHand.push(drawCard());
        dealerTotal = calculateHand(game.dealerHand);
      }

      let outcome = 'lose';
      let winAmount = 0;

      if (dealerTotal > 21 || playerTotal > dealerTotal) {
        outcome = 'win';
        winAmount = game.bet * 2;
        YapinEconomy.addCoins(game.serverId, game.authorId, winAmount);
      } else if (playerTotal === dealerTotal) {
        outcome = 'push';
        winAmount = game.bet;
        YapinEconomy.addCoins(game.serverId, game.authorId, winAmount);
      }

      const embed = new Embed()
        .title(outcome === 'win' ? '🎉 HAI VINTO IL BANCO!' : (outcome === 'push' ? '🤝 PAREGGIO (Push)' : '💀 IL BANCO HA VINTO'))
        .description(
          `• **Tua Mano:** ${game.playerHand.map(c => c.str).join(' ')} (Totale: \`${playerTotal}\`)\n` +
          `• **Mano Banco:** ${game.dealerHand.map(c => c.str).join(' ')} (Totale: \`${dealerTotal}\`)\n\n` +
          (outcome === 'win' ? `💰 **Vincita incassata:** \`+${winAmount} 🪙 Monete\`!` :
           outcome === 'push' ? `↩️ **Puntata restituita:** \`${game.bet} 🪙\`!` :
           `💸 **Perso:** \`${game.bet} 🪙\`!`)
        )
        .color(outcome === 'win' ? '#10b981' : (outcome === 'push' ? '#eab308' : '#ef4444'));

      return ctx.reply('', { embeds: [embed] });
    }
  }
};

import { YapinEconomy } from './yapinEconomy.js';
import { Embed, Row, Button } from '../yapper.js';

const activeGames = new Map(); // `${channelId}_${userId}` -> game state

const SUITS = ['[S]', '[H]', '[D]', '[C]'];
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
    if (!serverId || !channelId) return ctx.reply('[Error] Game can only be played inside a server.');

    const bet = parseInt(argv[0], 10);
    if (isNaN(bet) || bet < 10 || bet > 5000) {
      return ctx.reply('[Warning] Usage: `/blackjack <bet>` (Bet must be between 10 and 5,000 Coins).');
    }

    const gameKey = `${channelId}_${authorId}`;
    if (activeGames.has(gameKey)) {
      return ctx.reply('[Warning] You already have a Blackjack game in progress in this channel!');
    }

    const profile = YapinEconomy.getProfile(serverId, authorId);
    if ((profile.balance || 0) < bet) {
      return ctx.reply(`[Error] Insufficient balance. You have only **${profile.balance || 0} Coins**.`);
    }

    // Deduct bet
    YapinEconomy.addCoins(serverId, authorId, -bet);

    const playerHand = [drawCard(), drawCard()];
    const dealerHand = [drawCard(), drawCard()];

    const playerTotal = calculateHand(playerHand);
    const dealerVisible = dealerHand[0];

    // Natural Blackjack (21 with 2 cards)
    if (playerTotal === 21) {
      const win = Math.floor(bet * 2.5);
      YapinEconomy.addCoins(serverId, authorId, win);
      const embed = new Embed()
        .title('[Blackjack] Natural Blackjack!')
        .description(`<@${authorId}> hit a natural **Blackjack** with 21!\n\n` +
          `• **Your Hand:** ${playerHand.map(c => c.str).join(' ')} (\`21\`)\n` +
          `• **Dealer:** ${dealerHand.map(c => c.str).join(' ')} (\`${calculateHand(dealerHand)}\`)\n\n` +
          `**You Won:** \`+${win} Coins\`!`)
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
      .title(`[Blackjack] Casino Table | Bet: ${bet} Coins`)
      .description(`Your turn, <@${authorId}>! Choose whether to hit or stand.\n\n` +
        `• **Your Hand:** ${playerHand.map(c => c.str).join(' ')} (Total: \`${playerTotal}\`)\n` +
        `• **Dealer:** ${dealerVisible.str} [?] (Visible: \`${dealerVisible.value}\`)\n\n` +
        `*Click the buttons below or type \`hit\` / \`stand\`.*`)
      .color('#3b82f6');

    const row = new Row(
      Button.primary('Hit (Card)', `bj_hit_${authorId}`),
      Button.secondary('Stand', `bj_stand_${authorId}`)
    );

    ctx.reply('', { embeds: [embed], components: [row] });

    // Auto timeout after 60 seconds
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
          .title('[Bust] Exceeded 21!')
          .description(`You went over 21 and lost the round.\n\n` +
            `• **Your Hand:** ${game.playerHand.map(c => c.str).join(' ')} (\`${playerTotal}\`)\n` +
            `• **Dealer:** ${game.dealerHand.map(c => c.str).join(' ')}\n\n` +
            `**Coins Lost:** \`${game.bet} Coins\``)
          .color('#ef4444');
        return ctx.reply('', { embeds: [embed] });
      }

      const embed = new Embed()
        .title(`[Blackjack] Bet: ${game.bet} Coins`)
        .description(`You drew a card!\n\n` +
          `• **Your Hand:** ${game.playerHand.map(c => c.str).join(' ')} (Score: \`${playerTotal}\`)\n` +
          `• **Dealer:** ${game.dealerHand[0].str} [?]`)
        .color('#3b82f6');

      const row = new Row(
        Button.primary('Hit (Card)', `bj_hit_${authorId}`),
        Button.secondary('Stand', `bj_stand_${authorId}`)
      );
      return ctx.reply('', { embeds: [embed], components: [row] });
    }

    if (action === 'stand') {
      activeGames.delete(gameKey);
      const playerTotal = calculateHand(game.playerHand);
      let dealerTotal = calculateHand(game.dealerHand);

      // Dealer draws until at least 17
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
        .title(outcome === 'win' ? '[Win] You beat the Dealer!' : (outcome === 'push' ? '[Push] Tie Game' : '[Loss] Dealer Wins'))
        .description(
          `• **Your Hand:** ${game.playerHand.map(c => c.str).join(' ')} (Total: \`${playerTotal}\`)\n` +
          `• **Dealer Hand:** ${game.dealerHand.map(c => c.str).join(' ')} (Total: \`${dealerTotal}\`)\n\n` +
          (outcome === 'win' ? `**Payout:** \`+${winAmount} Coins\`!` :
           outcome === 'push' ? `**Bet Returned:** \`${game.bet} Coins\`!` :
           `**Coins Lost:** \`${game.bet} Coins\`!`)
        )
        .color(outcome === 'win' ? '#10b981' : (outcome === 'push' ? '#eab308' : '#ef4444'));

      return ctx.reply('', { embeds: [embed] });
    }
  }
};

import { DatabaseHelper } from '../../../src/database/db.js';
import { YapinEconomy } from './yapinEconomy.js';
import { Embed } from '../yapper.js';

const countingStates = new Map(); // channelId -> currentNumber

export const YapinMinigames = {
  async handleDice(ctx, getContextData) {
    const { argv } = getContextData(ctx);
    const sides = parseInt(argv[0], 10) || 6;
    const clampedSides = Math.min(100, Math.max(2, sides));
    const result = Math.floor(Math.random() * clampedSides) + 1;

    const embed = new Embed()
      .title('[Dice Roll]')
      .description(`Hai lanciato un dado a **${clampedSides}** facce.`)
      .field('Risultato', `\`${result}\``, true)
      .color('#8b5cf6');

    ctx.reply('', { embeds: [embed] });
  },

  async handleCoinflip(ctx, getContextData) {
    const { serverId, authorId, argv } = getContextData(ctx);
    const choice = argv[0]?.toLowerCase();
    const bet = parseInt(argv[1], 10);

    if (!choice || !['testa', 'croce', 'heads', 'tails', 't', 'c', 'h'].includes(choice)) {
      return ctx.reply('[Warning] Utilizzo: `/coinflip <testa|croce> [puntata opzionale]` (es: `/coinflip testa 50`)');
    }

    const isHeadsUser = ['testa', 'heads', 't', 'h'].includes(choice);
    const flipResult = Math.random() < 0.5 ? 'testa' : 'croce';
    const isWin = (isHeadsUser && flipResult === 'testa') || (!isHeadsUser && flipResult === 'croce');

    let betMsg = '';
    if (!isNaN(bet) && bet > 0 && serverId) {
      const profile = YapinEconomy.getProfile(serverId, authorId);
      if ((profile.balance || 0) < bet) {
        return ctx.reply(`[Error] Saldo insufficiente per puntare **${bet} Coins** (Hai: ${profile.balance || 0} Coins).`);
      }

      if (isWin) {
        YapinEconomy.addCoins(serverId, authorId, bet);
        betMsg = `\n**Hai vinto:** \`+${bet * 2} Coins Monete\`!`;
      } else {
        YapinEconomy.addCoins(serverId, authorId, -bet);
        betMsg = `\n**Hai perso:** \`-${bet} Coins Monete\`.`;
      }
    }

    const coinEmoji = flipResult === 'testa' ? 'Testa' : 'Croce';
    const embed = new Embed()
      .title('[Coin Flip]')
      .description(`Esito del lancio: **${coinEmoji}**\n\n${isWin ? '**Hai indovinato!**' : '**Non hai indovinato.**'}${betMsg}`)
      .color(isWin ? '#10b981' : '#ef4444');

    ctx.reply('', { embeds: [embed] });
  },

  async handleCount(ctx, getContextData) {
    const { channelId, authorId, argv } = getContextData(ctx);
    const num = parseInt(argv[0], 10);

    if (isNaN(num)) {
      return ctx.reply('[Warning] Utilizzo: `/count <numero>` (es: `/count 42`)');
    }

    const current = countingStates.get(channelId) || 0;
    const expected = current + 1;

    if (num === expected) {
      countingStates.set(channelId, num);
      return ctx.reply(`[Correct] **${num}**! Il conteggio continua (Prossimo numero: **${num + 1}**).`);
    } else {
      countingStates.set(channelId, 0);
      return ctx.reply(`[Error] Errore da parte di <@${authorId}>! Ti aspettavi **${expected}**, non **${num}**! Il conteggio riparte da **1**.`);
    }
  }
};

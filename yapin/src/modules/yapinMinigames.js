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
    const { serverId, channelId } = getContextData(ctx);
    const guildKey = serverId ? `yapin_${serverId}` : null;
    let config = guildKey ? DatabaseHelper.getCountingConfig(guildKey) : null;
    if ((!config || !config.enabled) && serverId) {
      const alt = DatabaseHelper.getCountingConfig(serverId);
      if (alt && alt.enabled) config = alt;
    }

    const isCurrentChannel = config && config.channel_id === channelId;
    const current = config?.current_number || 0;
    const expected = current + 1;
    const streak = config?.highest_streak || current;
    const zen = config?.zen_mode ? 'Attiva' : 'Disattiva';

    const embed = new Embed()
      .title('[Counting] Gioco del Conteggio')
      .description(
        'Non serve usare il comando `/count` per giocare!\n' +
        'Scrivi semplicemente il numero direttamente nella chat e il bot reagir\u00e0 con una spunta (\u2705) ad ogni numero corretto.'
      )
      .field('Numero Attuale', `\`${current}\``, true)
      .field('Prossimo Atteso', `\`${expected}\``, true)
      .field('Record della Serie', `\`${streak}\``, true)
      .field('Modalit\u00e0 Zen', `\`${zen}\``, true)
      .field('Canale Attivo', isCurrentChannel ? '`Questo Canale (Attivo)`' : (config?.channel_id ? `<#${config.channel_id}>` : '`Non Configurato`'), true)
      .color('#06b6d4');

    ctx.reply('', { embeds: [embed] });
  },

  /**
   * Gestione automatica del messaggio di conteggio (1:1 con Discord)
   * Scrivere il numero incrementale nel canale fa reagire il bot e manda avanti la serie.
   */
  async handleCountingMessage(bot, msg) {
    if (!msg || !msg.channel_id || !msg.server_id || !msg.content) return false;
    if (msg.author_id === bot.me?.id || msg.author_bot) return false;

    const guildKey = `yapin_${msg.server_id}`;
    let countingConfig = DatabaseHelper.getCountingConfig(guildKey);
    if (!countingConfig || !countingConfig.enabled || countingConfig.channel_id !== msg.channel_id) {
      const altConfig = DatabaseHelper.getCountingConfig(msg.server_id);
      if (altConfig && altConfig.enabled && altConfig.channel_id === msg.channel_id) {
        countingConfig = altConfig;
      } else {
        return false;
      }
    }

    const content = msg.content.trim();

    // Supporta numeri interi o espressioni matematiche semplici (es. 42, 40+2, 10*2)
    let parsedNumber = null;
    if (/^-?\d+$/.test(content)) {
      parsedNumber = parseInt(content, 10);
    } else {
      try {
        if (/^[0-9+\-*/().\s]+$/.test(content)) {
          parsedNumber = Function(`'use strict'; return (${content})`)();
          if (typeof parsedNumber !== 'number' || isNaN(parsedNumber)) parsedNumber = null;
        }
      } catch (e) {
        parsedNumber = null;
      }
    }

    if (parsedNumber === null) return false;

    const currentNumber = countingConfig.current_number || 0;
    const expectedNumber = currentNumber + 1;
    const lastUserId = countingConfig.last_user_id;
    const allowConsecutive = countingConfig.allow_consecutive !== undefined ? Boolean(countingConfig.allow_consecutive) : true;
    const isZenMode = countingConfig.zen_mode !== undefined ? Boolean(countingConfig.zen_mode) : true;
    const activeGuildKey = countingConfig.guild_id || guildKey;

    // Regola 1: Anti-double count (se non sono ammessi numeri consecutivi dallo stesso utente)
    if (!allowConsecutive && lastUserId === msg.author_id && currentNumber > 0) {
      await bot.react(msg.channel_id, msg.id, '\u274C').catch(() => {});

      if (isZenMode) {
        const zenWarning = new Embed()
          .title('[Zen] Modalit\u00e0 Zen: Conteggio a Turni')
          .description(`**<@${msg.author_id}>**, attendi che un altro cavaliere conti prima di te!\n\n*In modalit\u00e0 Zen la serie \u00e8 salva:* il prossimo numero rimane **${expectedNumber}**!`)
          .footer('Sentry \u2022 Counting Zen')
          .color('#06b6d4')
          .timestamp();
        await bot.send(msg.channel_id, '', { embeds: [zenWarning] });
      } else {
        DatabaseHelper.recordCountRuin(activeGuildKey, msg.author_id);
        const ruinEmbed = new Embed()
          .title('[Ruin] Sequenza di Conteggio Interrotta!')
          .description(`**<@${msg.author_id}>** ha contato due volte di fila al numero **${currentNumber}**!\n\n*Record Massimo Raggiunto:* **${countingConfig.highest_streak || 0}**\nIl conteggio riparte da **1**!`)
          .footer('Regola: non puoi contare due volte consecutive')
          .color('#ef4444')
          .timestamp();
        await bot.send(msg.channel_id, '', { embeds: [ruinEmbed] });
      }
      return true;
    }

    // Regola 2: Controllo numero sequenziale
    if (parsedNumber === expectedNumber) {
      DatabaseHelper.recordCountSuccess(activeGuildKey, msg.author_id, expectedNumber);
      YapinEconomy.addCoins(activeGuildKey, msg.author_id, 2);

      // Reazioni al messaggio
      if (expectedNumber % 100 === 0) {
        await bot.react(msg.channel_id, msg.id, '\u{1F4AF}').catch(() => {});
        await bot.react(msg.channel_id, msg.id, '\u{1F389}').catch(() => {});
      } else if (expectedNumber % 50 === 0) {
        await bot.react(msg.channel_id, msg.id, '\u2B50').catch(() => {});
      } else {
        await bot.react(msg.channel_id, msg.id, '\u2705').catch(() => {});
      }

      // Traguardi con annuncio ed extra coins
      if (expectedNumber > 0 && expectedNumber % 50 === 0) {
        YapinEconomy.addCoins(activeGuildKey, msg.author_id, 50);
        const milestoneEmbed = new Embed()
          .title(`[Traguardo] Raggiunto: ${expectedNumber}!`)
          .description(`Grande lavoro nel Reame! **<@${msg.author_id}>** ha raggiunto quota **${expectedNumber}** senza errori e riceve **+50 Monete** bonus!`)
          .color('#10b981')
          .timestamp();
        await bot.send(msg.channel_id, '', { embeds: [milestoneEmbed] });
      }
    } else {
      // Numero errato!
      await bot.react(msg.channel_id, msg.id, '\u274C').catch(() => {});

      if (isZenMode) {
        const zenEmbed = new Embed()
          .title('[Zen] Conteggio Zen')
          .description(`**<@${msg.author_id}>** ha digitato **${parsedNumber}**, ma il numero atteso era **${expectedNumber}**!\n\n*In modalit\u00e0 Zen il conteggio non viene azzerato:* si continua serenamente dal numero **${expectedNumber}**!`)
          .footer('Sentry \u2022 Counting Zen Mode')
          .color('#06b6d4')
          .timestamp();
        await bot.send(msg.channel_id, '', { embeds: [zenEmbed] });
      } else {
        DatabaseHelper.recordCountRuin(activeGuildKey, msg.author_id);
        const ruinEmbed = new Embed()
          .title('[Errore] Errore nel Conteggio!')
          .description(`**<@${msg.author_id}>** ha scritto **${parsedNumber}**, ma il numero corretto era **${expectedNumber}**!\n\n*Record Massimo Raggiunto:* **${countingConfig.highest_streak || 0}**\nIl conteggio riparte da **1**!`)
          .footer('Sentry \u2022 Counting Game')
          .color('#ef4444')
          .timestamp();
        await bot.send(msg.channel_id, '', { embeds: [ruinEmbed] });
      }
    }

    return true;
  }
};

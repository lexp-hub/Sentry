import { DatabaseHelper } from '../../../src/database/db.js';
import { Embed } from '../yapper.js';

// Memoria locale / estensione per Yapin Shards ed Economy
const dailyCooldowns = new Map(); // `${guildKey}_${userId}` -> timestamp

export const YapinEconomy = {
  getProfile(guildId, userId) {
    const guildKey = guildId?.startsWith('yapin_') ? guildId : `yapin_${guildId}`;
    try {
      return DatabaseHelper.getTreasuryProfile(guildKey, userId);
    } catch (e) {
      return { user_id: userId, balance: 100, bank: 0, shards: 5 };
    }
  },

  addCoins(guildId, userId, amount) {
    const guildKey = guildId?.startsWith('yapin_') ? guildId : `yapin_${guildId}`;
    try {
      return DatabaseHelper.addCoins(guildKey, userId, amount);
    } catch (e) {
      return true;
    }
  },

  claimDaily(guildId, userId) {
    const key = `${guildId}_${userId}`;
    const now = Date.now();
    const last = dailyCooldowns.get(key) || 0;
    const cooldownMs = 20 * 60 * 60 * 1000; // 20 ore

    if (now - last < cooldownMs) {
      const remainingMs = cooldownMs - (now - last);
      const hours = Math.floor(remainingMs / 3600000);
      const minutes = Math.floor((remainingMs % 3600000) / 60000);
      return { success: false, remaining: `${hours}h ${minutes}m` };
    }

    dailyCooldowns.set(key, now);
    const coins = Math.floor(Math.random() * 200) + 150; // 150 - 350 monete
    const shards = Math.floor(Math.random() * 3) + 1; // 1 - 3 Yapin Shards
    this.addCoins(guildId, userId, coins);

    return { success: true, coins, shards };
  },

  async handleBalance(ctx, getContextData) {
    const { serverId, authorId, argv } = getContextData(ctx);
    const targetId = argv[0]?.replace(/[<@!>]/g, '') || authorId;
    const profile = this.getProfile(serverId, targetId);

    const embed = new Embed()
      .title(`💰 Portafoglio & Risorse | <@${targetId}>`)
      .field('🪙 Monete Sentry', `\`${Number(profile.balance || 0).toLocaleString()} 🪙\``, true)
      .field('💎 Frammenti Yapin', `\`${Number(profile.shards || 10).toLocaleString()} Shards\``, true)
      .field('🏦 Riserva Realm', `\`${Number(profile.bank || 0).toLocaleString()} 🪙\``, true)
      .color('#eab308');

    ctx.reply('', { embeds: [embed] });
  },

  async handleDaily(ctx, getContextData) {
    const { serverId, authorId } = getContextData(ctx);
    if (!serverId) return ctx.reply('❌ Il bonus giornaliero può essere riscattato solo in un server.');

    const res = this.claimDaily(serverId, authorId);
    if (!res.success) {
      return ctx.reply(`⏳ Hai già riscattato il tuo bonus giornaliero. Riprova tra **${res.remaining}**!`);
    }

    const embed = new Embed()
      .title('🎁 Ricompensa Giornaliera Sentry & Yapin')
      .description(`Hai riscosso con successo il tuo bottino del giorno!\n\n` +
        `🪙 **+${res.coins} Monete** aggiunte al tuo saldo.\n` +
        `💎 **+${res.shards} Frammenti Yapin (Shards)** esclusivi!`)
      .color('#10b981');

    ctx.reply('', { embeds: [embed] });
  },

  async handlePay(ctx, getContextData) {
    const { serverId, authorId, argv } = getContextData(ctx);
    if (!serverId) return ctx.reply('❌ Comando disponibile solo nei server.');

    const targetId = argv[0]?.replace(/[<@!>]/g, '');
    const amount = parseInt(argv[1], 10);

    if (!targetId || isNaN(amount) || amount <= 0) {
      return ctx.reply('⚠️ Utilizzo corretto: `/pay <@utente> <quantità>` (es. `/pay @User 50`)');
    }

    if (targetId === authorId) {
      return ctx.reply('❌ Non puoi trasferire monete a te stesso.');
    }

    const senderProfile = this.getProfile(serverId, authorId);
    if ((senderProfile.balance || 0) < amount) {
      return ctx.reply(`❌ Saldo insufficiente. Possiedi solo **${senderProfile.balance || 0} 🪙**.`);
    }

    this.addCoins(serverId, authorId, -amount);
    this.addCoins(serverId, targetId, amount);

    const embed = new Embed()
      .title('💸 Trasferimento Effettuato')
      .description(`Transazione completata con successo nel Realm.`)
      .field('Mittente', `<@${authorId}>`, true)
      .field('Destinatario', `<@${targetId}>`, true)
      .field('Importo', `\`${amount} 🪙\``, true)
      .color('#10b981');

    ctx.reply('', { embeds: [embed] });
  }
};

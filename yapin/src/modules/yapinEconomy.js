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
      .title(`[Wallet] Resources | <@${targetId}>`)
      .field('Sentry Coins', `\`${Number(profile.balance || 0).toLocaleString()} Coins\``, true)
      .field('Yapin Shards', `\`${Number(profile.shards || 10).toLocaleString()} Shards\``, true)
      .field('Realm Bank', `\`${Number(profile.bank || 0).toLocaleString()} Coins\``, true)
      .color('#eab308');

    ctx.reply('', { embeds: [embed] });
  },

  async handleDaily(ctx, getContextData) {
    const { serverId, authorId } = getContextData(ctx);
    if (!serverId) return ctx.reply('[Error] Daily bonus can only be claimed inside a server.');

    const res = this.claimDaily(serverId, authorId);
    if (!res.success) {
      return ctx.reply(`[Cooldown] You already claimed your daily bonus. Try again in **${res.remaining}**!`);
    }

    const embed = new Embed()
      .title('[Daily Reward] Sentry & Yapin')
      .description(`Daily reward claimed successfully!\n\n` +
        `• **+${res.coins} Coins** added to your wallet.\n` +
        `• **+${res.shards} Yapin Shards** exclusive bonus!`)
      .color('#10b981');

    ctx.reply('', { embeds: [embed] });
  },

  async handlePay(ctx, getContextData) {
    const { serverId, authorId, argv } = getContextData(ctx);
    if (!serverId) return ctx.reply('[Error] Comando disponibile solo nei server.');

    const targetId = argv[0]?.replace(/[<@!>]/g, '');
    const amount = parseInt(argv[1], 10);

    if (!targetId || isNaN(amount) || amount <= 0) {
      return ctx.reply('[Warning] Usage: `/pay <@utente> <quantità>` (es. `/pay @User 50`)');
    }

    if (targetId === authorId) {
      return ctx.reply('[Error] Non puoi trasferire monete a te stesso.');
    }

    const senderProfile = this.getProfile(serverId, authorId);
    if ((senderProfile.balance || 0) < amount) {
      return ctx.reply(`[Error] Saldo insufficiente. Possiedi solo **${senderProfile.balance || 0} Coins**.`);
    }

    this.addCoins(serverId, authorId, -amount);
    this.addCoins(serverId, targetId, amount);

    const embed = new Embed()
      .title('[Transfer Completed]')
      .description(`Transazione completata con successo nel Realm.`)
      .field('Mittente', `<@${authorId}>`, true)
      .field('Destinatario', `<@${targetId}>`, true)
      .field('Importo', `\`${amount} Coins\``, true)
      .color('#10b981');

    ctx.reply('', { embeds: [embed] });
  }
};

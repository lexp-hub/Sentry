import { DatabaseHelper } from '../../database/db.js';
import { EmbedBuilder } from 'discord.js';
import { CONFIG } from '../../config.js';

const xpCooldowns = new Map();

export const XPManager = {
  async handleMessage(message) {
    if (!message.guild || message.author.bot) return;

    const guildId = message.guild.id;
    const userId = message.author.id;
    const config = DatabaseHelper.getLevelConfig(guildId);

    if (!config.enabled) return;

    const key = `${guildId}_${userId}`;
    const now = Date.now();
    const lastGain = xpCooldowns.get(key) || 0;

    if (now - lastGain < 60000) return;
    xpCooldowns.set(key, now);

    const baseAmount = Math.floor(Math.random() * 11) + 15;
    const xpToAdd = Math.floor(baseAmount * (config.xp_rate || 1.0));

    const result = DatabaseHelper.addXp(guildId, userId, xpToAdd);

    if (result.leveledUp) {
      // Award Coins for Leveling Up
      const coinsPerLvl = config.coins_per_level !== undefined && config.coins_per_level !== null ? config.coins_per_level : 100;
      const coinsReward = Math.max(50, result.newLevel * coinsPerLvl);
      const profile = DatabaseHelper.modifyUserCoins(guildId, userId, coinsReward, 'add');

      const rewards = DatabaseHelper.getLevelRewards(guildId);
      for (const reward of rewards) {
        if (result.newLevel >= reward.level) {
          const role = message.guild.roles.cache.get(reward.role_id);
          if (role && message.member && !message.member.roles.cache.has(role.id)) {
            await message.member.roles.add(role).catch(() => {});
          }
        }
      }

      const levelEmbed = new EmbedBuilder()
        .setColor('#eab308')
        .setTitle('⭐ Level Up del Cavaliere!')
        .setDescription(
          `🎉 Congratulazioni ${message.author}! Sei avanzato al **Livello ${result.newLevel}**!\n\n` +
          `💰 **Ricompensa Reale:** +**${coinsReward.toLocaleString()} 🪙** Monete d'Oro accreditate al tuo conto!\n` +
          `🪙 **Nuovo Saldo Totale:** \`${(profile.coins || 0).toLocaleString()}\` 🪙 monete`
        )
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `${message.guild.name} • Sentry Leveling & Economia`, iconURL: message.guild.iconURL() })
        .setTimestamp();

      if (config.dm_notifications) {
        await message.author.send({ embeds: [levelEmbed] }).catch(() => {});
      } else {
        const targetChannel = config.channel_id ? message.guild.channels.cache.get(config.channel_id) : message.channel;
        if (targetChannel) {
          await targetChannel.send({ embeds: [levelEmbed] }).catch(() => {});
        }
      }
    }
  },

  getXpNeededForLevel(level) {
    return Math.pow(level * 10, 2);
  },

  getXpNeededForNextLevel(currentLevel) {
    return this.getXpNeededForLevel(currentLevel + 1);
  },

  /**
   * Adds XP directly to a user from events/modules (Showcase, Presentati, Minigiochi, etc.)
   * @param {string} guildId
   * @param {string} userId
   * @param {number} amount
   */
  async addXP(guildId, userId, amount) {
    if (!guildId || !userId || !amount || Number(amount) <= 0) return null;
    const result = DatabaseHelper.addXp(guildId, userId, Number(amount));

    if (result && result.leveledUp) {
      const config = DatabaseHelper.getLevelConfig(guildId);
      const coinsPerLvl = config.coins_per_level !== undefined && config.coins_per_level !== null ? config.coins_per_level : 100;
      const coinsReward = Math.max(50, result.newLevel * coinsPerLvl);
      DatabaseHelper.modifyUserCoins(guildId, userId, coinsReward, 'add');
    }

    return result;
  },

  async addXp(guildId, userId, amount) {
    return this.addXP(guildId, userId, amount);
  }
};

export default XPManager;

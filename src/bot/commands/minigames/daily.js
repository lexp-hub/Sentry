import {
  SlashCommandBuilder,
  EmbedBuilder
} from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Riscatta la tua ricompensa giornaliera di monete d\'oro ed esperienza'),

  async execute(interaction) {
    const profile = DatabaseHelper.getFishingProfile(interaction.guild.id, interaction.user.id);
    const now = Math.floor(Date.now() / 1000);
    const oneDay = 24 * 60 * 60; // 24 hours

    const elapsed = now - (profile.last_daily || 0);

    if (elapsed < oneDay) {
      const remainingSeconds = oneDay - elapsed;
      const hours = Math.floor(remainingSeconds / 3600);
      const minutes = Math.floor((remainingSeconds % 3600) / 60);

      return interaction.reply({
        content: `⏳ Hai già riscosso la tua ricompensa giornaliera! Torna tra **${hours} ore e ${minutes} minuti**.`,
        ephemeral: true
      });
    }

    // Random reward between 150 and 350 coins
    const coinsReward = Math.floor(150 + Math.random() * 200);
    const xpReward = 50;

    profile.coins = (profile.coins || 0) + coinsReward;
    profile.last_daily = now;

    DatabaseHelper.saveFishingProfile(interaction.guild.id, interaction.user.id, profile);
    
    try {
      DatabaseHelper.addXP(interaction.guild.id, interaction.user.id, xpReward);
    } catch (e) {}

    const embed = new EmbedBuilder()
      .setColor('#10b981')
      .setTitle('🪙 Ricompensa Giornaliera Riscossa!')
      .setDescription(`I tesorieri del regno hanno versato il tuo stipendio giornaliero da cavaliere:\n\n• 🪙 **+${coinsReward} Monete d'Oro**\n• ⭐ **+${xpReward} Punti Esperienza**\n\nSaldo attuale: 🪙 **${profile.coins} Monete**.`)
      .setThumbnail('https://cdn-icons-png.flaticon.com/512/2933/2933116.png')
      .setFooter({ text: 'Torna domani per un altro bonus!', iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};


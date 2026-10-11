import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';
import { XPManager } from '../../modules/xpManager.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Mostra il tuo livello attuale, punti XP e posizione in classifica')
    .addUserOption(opt => opt.setName('utente').setDescription('L\'utente di cui vedere il livello').setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getUser('utente') || interaction.user;
    const stats = DatabaseHelper.getUserLevel(interaction.guild.id, target.id);

    const nextLevelXp = XPManager.getXpNeededForNextLevel(stats.level);
    const curLevelXp = XPManager.getXpNeededForLevel(stats.level);
    const xpInLevel = Math.max(0, stats.xp - curLevelXp);
    const xpNeededInLevel = Math.max(1, nextLevelXp - curLevelXp);
    const progressPercent = Math.min(100, Math.floor((xpInLevel / xpNeededInLevel) * 100));

    const allUsers = DatabaseHelper.getLeaderboard(interaction.guild.id, 1000);
    const rankPos = allUsers.findIndex(u => u.user_id === target.id) + 1 || allUsers.length + 1;

    const barLength = 15;
    const filledLength = Math.round((progressPercent / 100) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    const coins = DatabaseHelper.getUserCoins(interaction.guild.id, target.id);

    const embed = new EmbedBuilder()
      .setColor('#f59e0b')
      .setTitle(`⭐ Scheda Cavaliere | ${target.tag}`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '🏆 Posizione', value: `\`#${rankPos}\``, inline: true },
        { name: '🎖️ Livello', value: `\`Livello ${stats.level}\``, inline: true },
        { name: '🪙 Monete d\'Oro', value: `\`${coins.toLocaleString()} 🪙\``, inline: true },
        { name: '✨ XP Totali', value: `\`${stats.xp.toLocaleString()} XP\``, inline: true },
        { name: '💬 Messaggi Inviati', value: `\`${stats.total_messages.toLocaleString()}\``, inline: true },
        { name: '📈 Progresso Livello Successivo', value: `\`[${bar}]\` **${progressPercent}%**\n(${xpInLevel.toLocaleString()} / ${xpNeededInLevel.toLocaleString()} XP)`, inline: false }
      )
      .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

import {
  SlashCommandBuilder,
  EmbedBuilder
} from 'discord.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('dado')
    .setDescription('Lancia un dado con il numero di facce desiderato')
    .addIntegerOption(opt =>
      opt
        .setName('facce')
        .setDescription('Numero di facce del dado (default: 6)')
        .setMinValue(2)
        .setMaxValue(100)
        .setRequired(false)
    ),

  async execute(interaction) {
    const sides = interaction.options.getInteger('facce') || 6;
    const roll = Math.floor(1 + Math.random() * sides);

    const isMax = roll === sides;
    const isMin = roll === 1;

    const embed = new EmbedBuilder()
      .setColor(isMax ? '#10b981' : isMin ? '#ef4444' : '#dc2626')
      .setTitle(`🎲 Lancio Dado (d${sides})`)
      .setDescription(`**${interaction.user.username}** ha tirato il dado e ha ottenuto:\n\n# 🎲 **${roll}** ${isMax ? '🔥 *(Massimo!)*' : isMin ? '💀 *(Fallimento Critico)*' : ''}`)
      .setFooter({ text: 'Sentry • Minigiochi', iconURL: interaction.guild.iconURL() })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};


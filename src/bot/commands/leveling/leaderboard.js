import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Mostra la classifica degli utenti con più esperienza nel server'),

  async execute(interaction) {
    const top = DatabaseHelper.getLeaderboard(interaction.guild.id, 10);

    if (top.length === 0) {
      return interaction.reply({
        content: '📊 Nessun utente ha ancora accumulato esperienza in questo server. Inizia a scrivere in chat per salire di livello!',
        ephemeral: true
      });
    }

    const rows = top.map((entry, idx) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `\`#${idx + 1}\``;
      return `${medal} <@${entry.user_id}> — **Livello ${entry.level}** (\`${entry.xp.toLocaleString()} XP\` • \`${entry.total_messages}\` msg)`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_COLOR)
      .setTitle(`🏆 Classifica Esperienza (XP) | ${interaction.guild.name}`)
      .setDescription(rows)
      .setFooter({ text: 'Guadagna XP scrivendo e interagendo nei canali!' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

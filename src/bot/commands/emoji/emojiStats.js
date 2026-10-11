import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('emoji-stats')
    .setDescription('Mostra le statistiche di utilizzo delle emoji nel server'),

  async execute(interaction) {
    const stats = DatabaseHelper.getEmojiStats(interaction.guild.id, 15);
    const totalCustomEmojis = interaction.guild.emojis.cache.size;

    if (stats.length === 0) {
      return interaction.reply({
        content: `📊 Nessun dato sull'uso delle emoji registrato finora. Il server possiede **${totalCustomEmojis}** emoji personalizzate.`,
        ephemeral: true
      });
    }

    const rows = stats.map((s, idx) => {
      const emojiFormat = s.is_animated ? `<a:${s.emoji_name}:${s.emoji_id}>` : `<:${s.emoji_name}:${s.emoji_id}>`;
      return `\`#${idx + 1}\` ${emojiFormat} \`:${s.emoji_name}:\` — **${s.use_count}** utilizzi (Ultimo: <t:${s.last_used}:R>)`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_COLOR)
      .setTitle(`📈 Statistiche Emoji | ${interaction.guild.name}`)
      .setDescription(rows)
      .setFooter({ text: `Totale emoji server: ${totalCustomEmojis}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

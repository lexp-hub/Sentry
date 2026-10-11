import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Mostra la latenza del bot e dell\'API Discord'),

  async execute(interaction) {
    const sent = await interaction.deferReply({ fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(interaction.client.ws.ping);

    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_COLOR)
      .setTitle('🏓 Pong! | Prestazioni di Sentry')
      .addFields(
        { name: '⚡ Latenza Messaggio', value: `\`${latency}ms\``, inline: true },
        { name: '🌐 Latenza WebSocket', value: `\`${apiLatency}ms\``, inline: true },
        { name: '💾 Memoria RAM', value: `\`${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB\``, inline: true }
      )
      .setFooter({ text: 'Sistema operativo reattivo' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};

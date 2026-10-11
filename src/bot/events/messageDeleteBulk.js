import { DatabaseHelper } from '../../database/db.js';
import { EmbedBuilder, AuditLogEvent } from 'discord.js';
import { CONFIG } from '../../config.js';

export default {
  name: 'messageDeleteBulk',
  async execute(messages, channel) {
    const guild = channel.guild;
    if (!guild) return;

    const settings = DatabaseHelper.getGuildSettings(guild.id);
    if (!settings.log_channel_id) return;

    const logChan = guild.channels.cache.get(settings.log_channel_id);
    if (!logChan || logChan.id === channel.id) return;

    let executor = null;
    try {
      const logs = await guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MessageBulkDelete
      }).catch(() => null);

      const entry = logs?.entries?.first();
      if (entry && entry.extra?.channel?.id === channel.id && (Date.now() - entry.createdTimestamp < 6000)) {
        executor = entry.executor;
      }
    } catch (e) {}

    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_ERROR_COLOR || '#ef4444')
      .setTitle('🗑️ Eliminazione Messaggi di Massa (Bulk Delete)')
      .addFields(
        { name: 'Canale', value: `${channel} (\`${channel.name}\`)`, inline: true },
        { name: 'Quantità Eliminata', value: `\`${messages.size}\` messaggi`, inline: true },
        { name: 'Esecutore', value: executor ? `${executor.tag} (<@${executor.id}>)` : '*Comando Staff o Bot*', inline: true }
      )
      .setFooter({ text: `ID Canale: ${channel.id}` })
      .setTimestamp();

    await logChan.send({ embeds: [embed] }).catch(() => {});
  }
};


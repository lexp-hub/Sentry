import { DatabaseHelper } from '../../database/db.js';
import { EmbedBuilder, AuditLogEvent } from 'discord.js';
import { CONFIG } from '../../config.js';

export default {
  name: 'messageDelete',
  async execute(message) {
    if (!message.guild || message.author?.bot) return;

    const settings = DatabaseHelper.getGuildSettings(message.guild.id);
    if (!settings.log_channel_id) return;

    const logChan = message.guild.channels.cache.get(settings.log_channel_id);
    if (!logChan || logChan.id === message.channel.id) return;

    const author = message.author;
    const avatarUrl = author?.displayAvatarURL({ dynamic: true });

    // Check if deleted by moderator via audit log
    let executor = null;
    try {
      const logs = await message.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MessageDelete
      }).catch(() => null);

      const entry = logs?.entries?.first();
      if (entry && entry.target?.id === author?.id && entry.extra?.channel?.id === message.channel.id && (Date.now() - entry.createdTimestamp < 5000)) {
        executor = entry.executor;
      }
    } catch (e) {}

    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_ERROR_COLOR || '#ef4444')
      .setAuthor({
        name: author ? `${author.tag} • Messaggio Eliminato` : 'Messaggio Eliminato',
        iconURL: avatarUrl
      })
      .setTitle('🗑️ Messaggio Eliminato')
      .addFields(
        { name: 'Autore', value: author ? `${author.tag} (<@${author.id}>)` : '`Sconosciuto`', inline: true },
        { name: 'Canale', value: `${message.channel} (\`${message.channel.name}\`)`, inline: true },
        { name: 'Eliminato da', value: executor ? `${executor.tag} (<@${executor.id}>)` : '*Autore o Bot*', inline: true },
        { name: 'Contenuto', value: message.content && message.content.trim() ? `\`\`\`${message.content.slice(0, 1000)}\`\`\`` : '`[Nessun testo / Solo allegato o sticker]`', inline: false }
      )
      .setFooter({ text: `ID Messaggio: ${message.id}` })
      .setTimestamp();

    // Attachments list
    if (message.attachments && message.attachments.size > 0) {
      const attachmentsList = message.attachments.map(att => `[${att.name || 'File'}](${att.url})`).join(', ');
      embed.addFields({ name: '📎 Allegati', value: attachmentsList.length > 1024 ? `${attachmentsList.slice(0, 1020)}...` : attachmentsList, inline: false });
      
      const firstImage = message.attachments.find(att => att.contentType?.startsWith('image/'));
      if (firstImage) {
        embed.setImage(firstImage.proxyURL || firstImage.url);
      }
    }

    // Stickers list
    if (message.stickers && message.stickers.size > 0) {
      const stickerNames = message.stickers.map(s => `🏷️ \`${s.name}\``).join(', ');
      embed.addFields({ name: 'Sticker', value: stickerNames, inline: false });
    }

    await logChan.send({ embeds: [embed] }).catch(() => {});
  }
};

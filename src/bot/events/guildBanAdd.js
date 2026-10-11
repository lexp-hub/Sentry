import { DatabaseHelper } from '../../database/db.js';
import { EmbedBuilder, AuditLogEvent } from 'discord.js';
import { CONFIG } from '../../config.js';

export default {
  name: 'guildBanAdd',
  async execute(ban) {
    const { guild, user } = ban;
    if (!guild) return;

    const settings = DatabaseHelper.getGuildSettings(guild.id);
    if (!settings.log_channel_id) return;

    const logChan = guild.channels.cache.get(settings.log_channel_id);
    if (!logChan) return;

    let executor = null;
    let reason = ban.reason || 'Nessun motivo specificato';

    try {
      const fetchedLogs = await guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MemberBanAdd
      }).catch(() => null);

      const banLog = fetchedLogs?.entries?.first();
      if (banLog && banLog.target?.id === user.id && (Date.now() - banLog.createdTimestamp < 10000)) {
        executor = banLog.executor;
        if (banLog.reason) reason = banLog.reason;
      }
    } catch (e) {}

    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_ERROR_COLOR || '#ef4444')
      .setAuthor({
        name: `${user.tag} • Bannato dal Server`,
        iconURL: user.displayAvatarURL({ dynamic: true })
      })
      .setTitle('🔨 Membro Bannato')
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: 'Utente', value: `${user.tag} (<@${user.id}>)`, inline: true },
        { name: 'ID Utente', value: `\`${user.id}\``, inline: true },
        { name: 'Moderatore / Esecutore', value: executor ? `${executor.tag} (<@${executor.id}>)` : '*Sconosciuto / Discord API*', inline: true },
        { name: 'Motivo', value: `\`${reason}\``, inline: false },
        { name: 'Membri Rimanenti', value: `\`${guild.memberCount}\``, inline: true }
      )
      .setFooter({ text: `Ban ID: ${user.id}` })
      .setTimestamp();

    await logChan.send({ embeds: [embed] }).catch(() => {});
  }
};


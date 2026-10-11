import { WelcomerManager } from '../modules/welcomerManager.js';
import { DatabaseHelper } from '../../database/db.js';
import { EmbedBuilder, AuditLogEvent } from 'discord.js';
import { CONFIG } from '../../config.js';

export default {
  name: 'guildMemberRemove',
  async execute(member) {
    if (!member.guild) return;

    // 1. Trigger Welcomer goodbye message if enabled
    try {
      await WelcomerManager.handleMemberLeave(member);
    } catch (e) {
      console.error('[guildMemberRemove] Errore Welcomer leave:', e);
    }

    const settings = DatabaseHelper.getGuildSettings(member.guild.id);
    if (!settings.log_channel_id) return;

    const logChan = member.guild.channels.cache.get(settings.log_channel_id);
    if (!logChan) return;

    const user = member.user;
    const avatarUrl = user?.displayAvatarURL({ dynamic: true }) || member.guild.iconURL();

    // Check if the departure was a Kick or a Ban by querying Audit Logs
    let isKick = false;
    let isBan = false;
    let executor = null;
    let reason = 'Nessun motivo specificato';

    try {
      // Short delay to ensure audit log entry is written by Discord
      await new Promise(resolve => setTimeout(resolve, 800));

      // Check Ban audit logs
      const banLogs = await member.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MemberBanAdd
      }).catch(() => null);

      const banEntry = banLogs?.entries?.first();
      if (banEntry && banEntry.target?.id === member.id && (Date.now() - banEntry.createdTimestamp < 8000)) {
        isBan = true;
      }

      // Check Kick audit logs
      if (!isBan) {
        const kickLogs = await member.guild.fetchAuditLogs({
          limit: 1,
          type: AuditLogEvent.MemberKick
        }).catch(() => null);

        const kickEntry = kickLogs?.entries?.first();
        if (kickEntry && kickEntry.target?.id === member.id && (Date.now() - kickEntry.createdTimestamp < 8000)) {
          isKick = true;
          executor = kickEntry.executor;
          if (kickEntry.reason) reason = kickEntry.reason;
        }
      }
    } catch (e) {}

    // If it's a ban, guildBanAdd will send the detailed ban embed. We avoid duplicate logging here.
    if (isBan) return;

    if (isKick) {
      const kickEmbed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_WARN_COLOR || '#f59e0b')
        .setAuthor({
          name: `${user ? user.tag : member.id} • Espulso dal Server`,
          iconURL: avatarUrl
        })
        .setTitle('👢 Membro Espulso (Kick)')
        .setThumbnail(avatarUrl)
        .addFields(
          { name: 'Utente', value: `${user ? user.tag : 'Sconosciuto'} (<@${member.id}>)`, inline: true },
          { name: 'ID Utente', value: `\`${member.id}\``, inline: true },
          { name: 'Moderatore', value: executor ? `${executor.tag} (<@${executor.id}>)` : '*Sconosciuto / Discord API*', inline: true },
          { name: 'Motivo', value: `\`${reason}\``, inline: false },
          { name: 'Membri Rimanenti', value: `\`${member.guild.memberCount}\``, inline: true }
        )
        .setFooter({ text: `Kick ID: ${member.id}` })
        .setTimestamp();

      await logChan.send({ embeds: [kickEmbed] }).catch(() => {});
      return;
    }

    // Otherwise, it was a voluntary leave
    const joinedTimestamp = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
    const rolesList = member.roles?.cache
      ? member.roles.cache.filter(r => r.id !== member.guild.id).map(r => r.toString()).join(', ')
      : '';

    const leaveEmbed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_ERROR_COLOR || '#ef4444')
      .setAuthor({
        name: `${user ? user.tag : member.id} • Ha lasciato il server`,
        iconURL: avatarUrl
      })
      .setTitle('📤 Membro Uscito')
      .setThumbnail(avatarUrl)
      .addFields(
        { name: 'Utente', value: `${user ? user.tag : 'Sconosciuto'} (<@${member.id}>)`, inline: true },
        { name: 'ID Utente', value: `\`${member.id}\``, inline: true },
        { name: 'Membri Rimasti', value: `\`${member.guild.memberCount}\``, inline: true },
        { name: 'Entrato nel Server', value: joinedTimestamp ? `<t:${joinedTimestamp}:R> (<t:${joinedTimestamp}:d>)` : '*Non disponibile*', inline: true },
        { name: 'Ruoli Posseduti', value: rolesList && rolesList.length > 0 ? (rolesList.length > 500 ? `${rolesList.slice(0, 500)}...` : rolesList) : '*Nessun ruolo*' }
      )
      .setFooter({ text: `Leave ID: ${member.id}` })
      .setTimestamp();

    await logChan.send({ embeds: [leaveEmbed] }).catch(() => {});
  }
};

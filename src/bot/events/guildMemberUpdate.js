import { BoostManager } from '../modules/boostManager.js';
import { DatabaseHelper } from '../../database/db.js';
import { EmbedBuilder, AuditLogEvent } from 'discord.js';
import { CONFIG } from '../../config.js';

export default {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    if (!newMember.guild) return;

    // 1. Detect Boost updates
    const oldBoost = Boolean(oldMember.premiumSinceTimestamp);
    const newBoost = Boolean(newMember.premiumSinceTimestamp);

    if (!oldBoost && newBoost) {
      await BoostManager.handleMemberBoost(newMember);
    } else if (newMember.premiumSinceTimestamp && oldMember.premiumSinceTimestamp && newMember.premiumSinceTimestamp > oldMember.premiumSinceTimestamp) {
      await BoostManager.handleMemberBoost(newMember);
    }

    // 2. Audit Logging for Member Updates
    const settings = DatabaseHelper.getGuildSettings(newMember.guild.id);
    if (!settings.log_channel_id) return;

    const logChan = newMember.guild.channels.cache.get(settings.log_channel_id);
    if (!logChan) return;

    const user = newMember.user;
    const avatarUrl = user.displayAvatarURL({ dynamic: true });

    // A. Nickname Change
    if (oldMember.nickname !== newMember.nickname) {
      const oldNick = oldMember.nickname || oldMember.user.username;
      const newNick = newMember.nickname || newMember.user.username;

      const embed = new EmbedBuilder()
        .setColor('#6366f1')
        .setAuthor({ name: `${user.tag} • Modifica Nickname`, iconURL: avatarUrl })
        .setTitle('📝 Nickname Modificato')
        .addFields(
          { name: 'Utente', value: `${user.tag} (<@${newMember.id}>)`, inline: true },
          { name: 'Vecchio Nickname', value: `\`${oldNick}\``, inline: true },
          { name: 'Nuovo Nickname', value: `\`${newNick}\``, inline: true }
        )
        .setFooter({ text: `ID Utente: ${newMember.id}` })
        .setTimestamp();

      await logChan.send({ embeds: [embed] }).catch(() => {});
    }

    // B. Role Updates (Added / Removed)
    const oldRoles = oldMember.roles.cache.filter(r => r.id !== newMember.guild.id);
    const newRoles = newMember.roles.cache.filter(r => r.id !== newMember.guild.id);

    const addedRoles = newRoles.filter(r => !oldRoles.has(r.id));
    const removedRoles = oldRoles.filter(r => !newRoles.has(r.id));

    if (addedRoles.size > 0 || removedRoles.size > 0) {
      const embed = new EmbedBuilder()
        .setColor('#8b5cf6')
        .setAuthor({ name: `${user.tag} • Aggiornamento Ruoli`, iconURL: avatarUrl })
        .setTitle('🏷️ Ruoli Membro Aggiornati')
        .setDescription(`I ruoli di <@${newMember.id}> (\`${user.tag}\`) sono stati modificati.`)
        .setFooter({ text: `ID Utente: ${newMember.id}` })
        .setTimestamp();

      if (addedRoles.size > 0) {
        embed.addFields({
          name: '➕ Ruoli Assegnati',
          value: addedRoles.map(r => r.toString()).join(' '),
          inline: false
        });
      }

      if (removedRoles.size > 0) {
        embed.addFields({
          name: '➖ Ruoli Rimossi',
          value: removedRoles.map(r => r.toString()).join(' '),
          inline: false
        });
      }

      await logChan.send({ embeds: [embed] }).catch(() => {});
    }

    // C. Timeout (Mute Temporaneo)
    const oldTimeout = oldMember.communicationDisabledUntilTimestamp || 0;
    const newTimeout = newMember.communicationDisabledUntilTimestamp || 0;

    if (oldTimeout !== newTimeout) {
      if (newTimeout > Date.now()) {
        const untilSeconds = Math.floor(newTimeout / 1000);

        let executor = null;
        let reason = 'Nessun motivo specificato';
        try {
          const auditLogs = await newMember.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.MemberUpdate
          }).catch(() => null);
          const entry = auditLogs?.entries?.first();
          if (entry && entry.target?.id === newMember.id && (Date.now() - entry.createdTimestamp < 8000)) {
            executor = entry.executor;
            if (entry.reason) reason = entry.reason;
          }
        } catch (e) {}

        const embed = new EmbedBuilder()
          .setColor(CONFIG.EMBED_WARN_COLOR || '#f59e0b')
          .setAuthor({ name: `${user.tag} • Timeout Applicato`, iconURL: avatarUrl })
          .setTitle('⏱️ Membro Messo in Timeout')
          .addFields(
            { name: 'Utente', value: `${user.tag} (<@${newMember.id}>)`, inline: true },
            { name: 'Scadenza Timeout', value: `<t:${untilSeconds}:R> (<t:${untilSeconds}:F>)`, inline: true },
            { name: 'Moderatore', value: executor ? `${executor.tag} (<@${executor.id}>)` : '*Non identificato / Discord API*', inline: true },
            { name: 'Motivo', value: `\`${reason}\``, inline: false }
          )
          .setFooter({ text: `ID Utente: ${newMember.id}` })
          .setTimestamp();

        await logChan.send({ embeds: [embed] }).catch(() => {});
      } else if (oldTimeout > Date.now() && newTimeout <= Date.now()) {
        const embed = new EmbedBuilder()
          .setColor(CONFIG.EMBED_SUCCESS_COLOR || '#22c55e')
          .setAuthor({ name: `${user.tag} • Timeout Rimosso`, iconURL: avatarUrl })
          .setTitle('⏱️ Timeout Rimosso dal Membro')
          .setDescription(`Il timeout per <@${newMember.id}> (\`${user.tag}\`) è scaduto o è stato revocato.`)
          .setFooter({ text: `ID Utente: ${newMember.id}` })
          .setTimestamp();

        await logChan.send({ embeds: [embed] }).catch(() => {});
      }
    }
  }
};

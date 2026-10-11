import { TempChannelManager } from '../modules/tempChannelManager.js';
import { DatabaseHelper } from '../../database/db.js';
import { EmbedBuilder } from 'discord.js';
import { CONFIG } from '../../config.js';

export default {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    if (!guild) return;

    // 1. Manage Dynamic & Private Voice Channels
    try {
      await TempChannelManager.handleVoiceStateUpdate(oldState, newState);
    } catch (error) {
      console.error('[VoiceStateUpdate] Errore gestione canali temporanei:', error);
    }

    // 2. Audit Logging for Voice Events
    try {
      const settings = DatabaseHelper.getGuildSettings(guild.id);
      if (!settings.log_channel_id) return;

      const logChannel = guild.channels.cache.get(settings.log_channel_id);
      if (!logChannel) return;

      const member = newState.member || oldState.member;
      if (!member || member.user.bot) return;

      const avatarUrl = member.user.displayAvatarURL({ dynamic: true });

      // A. Joined Voice Channel
      if (!oldState.channelId && newState.channelId) {
        const channel = newState.channel;
        const embed = new EmbedBuilder()
          .setColor(CONFIG.EMBED_SUCCESS_COLOR || '#22c55e')
          .setAuthor({ name: `${member.user.tag} • Connesso alla chiamata`, iconURL: avatarUrl })
          .setTitle('🔊 Entrata in Canale Vocale')
          .addFields(
            { name: 'Utente', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
            { name: 'Canale Vocale', value: channel ? `<#${channel.id}> (\`${channel.name}\`)` : `\`${newState.channelId}\``, inline: true },
            { name: 'Membri nel Canale', value: channel ? `\`${channel.members.size}\`` : '`1`', inline: true }
          )
          .setFooter({ text: `ID Utente: ${member.id}` })
          .setTimestamp();

        await logChannel.send({ embeds: [embed] }).catch(() => {});
        return;
      }

      // B. Left Voice Channel
      if (oldState.channelId && !newState.channelId) {
        const channel = oldState.channel;
        const embed = new EmbedBuilder()
          .setColor(CONFIG.EMBED_ERROR_COLOR || '#ef4444')
          .setAuthor({ name: `${member.user.tag} • Disconnesso dalla chiamata`, iconURL: avatarUrl })
          .setTitle('🔇 Disconnessione dal Canale Vocale')
          .addFields(
            { name: 'Utente', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
            { name: 'Canale Vocale', value: channel ? `\`${channel.name}\` (\`${channel.id}\`)` : `\`${oldState.channelId}\``, inline: true },
            { name: 'Membri Rimasti', value: channel ? `\`${channel.members.size}\`` : '`0`', inline: true }
          )
          .setFooter({ text: `ID Utente: ${member.id}` })
          .setTimestamp();

        await logChannel.send({ embeds: [embed] }).catch(() => {});
        return;
      }

      // C. Switched Voice Channel
      if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        const oldChan = oldState.channel;
        const newChan = newState.channel;
        const embed = new EmbedBuilder()
          .setColor('#3b82f6')
          .setAuthor({ name: `${member.user.tag} • Cambio stanza vocale`, iconURL: avatarUrl })
          .setTitle('🔄 Spostamento Canale Vocale')
          .addFields(
            { name: 'Utente', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
            { name: 'Canale Precedente', value: oldChan ? `\`${oldChan.name}\`` : `\`${oldState.channelId}\``, inline: true },
            { name: 'Nuovo Canale', value: newChan ? `<#${newChan.id}> (\`${newChan.name}\`)` : `\`${newState.channelId}\``, inline: true }
          )
          .setFooter({ text: `ID Utente: ${member.id}` })
          .setTimestamp();

        await logChannel.send({ embeds: [embed] }).catch(() => {});
        return;
      }

      // D. Server Mute status changed (by staff)
      if (oldState.serverMute !== newState.serverMute) {
        const embed = new EmbedBuilder()
          .setColor(newState.serverMute ? '#f59e0b' : '#10b981')
          .setTitle(newState.serverMute ? '🔇 Muto Server Imposto dallo Staff' : '🔊 Muto Server Rimosso')
          .addFields(
            { name: 'Utente', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
            { name: 'Canale', value: newState.channel ? `<#${newState.channel.id}>` : '`N/D`', inline: true }
          )
          .setFooter({ text: `ID Utente: ${member.id}` })
          .setTimestamp();

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }

      // E. Server Deafen status changed (by staff)
      if (oldState.serverDeaf !== newState.serverDeaf) {
        const embed = new EmbedBuilder()
          .setColor(newState.serverDeaf ? '#f59e0b' : '#10b981')
          .setTitle(newState.serverDeaf ? '🔇 Audio Server Disattivato dallo Staff' : '🔊 Audio Server Riattivato')
          .addFields(
            { name: 'Utente', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
            { name: 'Canale', value: newState.channel ? `<#${newState.channel.id}>` : '`N/D`', inline: true }
          )
          .setFooter({ text: `ID Utente: ${member.id}` })
          .setTimestamp();

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }

      // F. Screen Share / Streaming
      if (!oldState.streaming && newState.streaming) {
        const embed = new EmbedBuilder()
          .setColor('#8b5cf6')
          .setTitle('📺 Condivisione Schermo / Live Avviata')
          .addFields(
            { name: 'Utente', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
            { name: 'Canale Vocale', value: newState.channel ? `<#${newState.channel.id}>` : '`N/D`', inline: true }
          )
          .setFooter({ text: `ID Utente: ${member.id}` })
          .setTimestamp();

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      } else if (oldState.streaming && !newState.streaming) {
        const embed = new EmbedBuilder()
          .setColor('#64748b')
          .setTitle('📺 Condivisione Schermo Terminata')
          .addFields(
            { name: 'Utente', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
            { name: 'Canale Vocale', value: newState.channel ? `<#${newState.channel.id}>` : '`N/D`', inline: true }
          )
          .setFooter({ text: `ID Utente: ${member.id}` })
          .setTimestamp();

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }

      // G. Video Camera (Webcam)
      if (!oldState.selfVideo && newState.selfVideo) {
        const embed = new EmbedBuilder()
          .setColor('#6366f1')
          .setTitle('📹 Videocamera Accesa')
          .addFields(
            { name: 'Utente', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
            { name: 'Canale Vocale', value: newState.channel ? `<#${newState.channel.id}>` : '`N/D`', inline: true }
          )
          .setFooter({ text: `ID Utente: ${member.id}` })
          .setTimestamp();

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      } else if (oldState.selfVideo && !newState.selfVideo) {
        const embed = new EmbedBuilder()
          .setColor('#64748b')
          .setTitle('📹 Videocamera Spenta')
          .addFields(
            { name: 'Utente', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
            { name: 'Canale Vocale', value: newState.channel ? `<#${newState.channel.id}>` : '`N/D`', inline: true }
          )
          .setFooter({ text: `ID Utente: ${member.id}` })
          .setTimestamp();

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }
    } catch (logErr) {
      console.error('[VoiceStateUpdate] Errore invio log vocale:', logErr);
    }
  }
};

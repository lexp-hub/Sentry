import { DatabaseHelper } from '../../database/db.js';
import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import { CONFIG } from '../../config.js';

const messageTimestamps = new Map();

export const AutoModManager = {
  isYouTubeUrl(url) {
    return /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:[^\s]*&)?v=|shorts\/|live\/|embed\/|playlist\?|user\/|channel\/|c\/|clip\/|@[a-zA-Z0-9_.-]+|[^\s]+)|youtu\.be\/[a-zA-Z0-9_-]+)/i.test(url);
  },

  isStickerUrl(url) {
    return /(?:https?:\/\/)?(?:cdn\.discordapp\.com\/stickers\/|media\.discordapp\.net\/stickers\/|tenor\.com\/(?:view\/|assets\/|[^\s]+)|giphy\.com\/(?:gifs\/|stickers\/|clips\/|[^\s]+)|media[0-9]*\.giphy\.com\/)/i.test(url);
  },

  async handleMessage(message) {
    if (!message.guild || message.author.bot) return false;

    if (message.member?.permissions.has(PermissionsBitField.Flags.Administrator) ||
        message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return false;
    }

    const config = DatabaseHelper.getAutomodConfig(message.guild.id);
    const content = message.content || '';

    if (config.ignored_channels && config.ignored_channels.includes(message.channel.id)) return false;
    if (message.member && config.ignored_roles && message.member.roles.cache.some(r => config.ignored_roles.includes(r.id))) return false;

    const isTicket = this.isTicketChannel(message.guild, message.channel);

    let violated = false;
    let reason = '';

    // 1. Anti-Invite (Bypassed in ticket channels so users can send Discord links to staff)
    if (config.anti_invite && !isTicket) {
      const inviteRegex = /(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/[a-zA-Z0-9-]+/gi;
      if (inviteRegex.test(content)) {
        violated = true;
        reason = 'Inviti Discord non consentiti';
      }
    }

    // 2. Anti-Link with YouTube & Sticker Channel Whitelist
    if (!violated && config.anti_link && !isTicket) {
      const urls = content.match(/https?:\/\/[^\s]+/gi) || [];
      if (urls.length > 0) {
        const isYtWhitelisted = Array.isArray(config.youtube_whitelist_channels) && config.youtube_whitelist_channels.includes(message.channel.id);
        const isStickerWhitelisted = Array.isArray(config.stickers_whitelist_channels) && config.stickers_whitelist_channels.includes(message.channel.id);

        const allUrlsWhitelisted = urls.every(u => {
          if (isYtWhitelisted && this.isYouTubeUrl(u)) return true;
          if (isStickerWhitelisted && this.isStickerUrl(u)) return true;
          return false;
        });

        if (!allUrlsWhitelisted) {
          violated = true;
          reason = 'Link esterni non consentiti';
        }
      }
    }

    // 3. Anti-Stickers (Native Discord Stickers & Sticker URLs in non-whitelisted channels)
    if (!violated && config.anti_stickers && !isTicket) {
      const isStickerWhitelisted = Array.isArray(config.stickers_whitelist_channels) && config.stickers_whitelist_channels.includes(message.channel.id);
      if (!isStickerWhitelisted) {
        const hasNativeSticker = message.stickers && message.stickers.size > 0;
        const urls = content.match(/https?:\/\/[^\s]+/gi) || [];
        const hasStickerUrl = urls.some(u => this.isStickerUrl(u));

        if (hasNativeSticker || hasStickerUrl) {
          violated = true;
          reason = 'Sticker non consentiti in questo canale';
        }
      }
    }

    // 4. Bad Words Filter
    if (!violated && config.bad_words && config.bad_words.length > 0) {
      const lowerContent = content.toLowerCase();
      for (const word of config.bad_words) {
        if (lowerContent.includes(word.toLowerCase())) {
          violated = true;
          reason = `Parola vietata rilevata (${word})`;
          break;
        }
      }
    }

    // 5. Anti-Caps Lock
    if (!violated && config.anti_caps && content.length > 10) {
      const letters = content.replace(/[^a-zA-Z]/g, '');
      if (letters.length > 8) {
        const upperCount = (letters.match(/[A-Z]/g) || []).length;
        if (upperCount / letters.length > 0.7) {
          violated = true;
          reason = 'Troppo testo in maiuscolo (Caps Lock)';
        }
      }
    }

    // 6. Anti-Spam
    if (!violated && config.anti_spam) {
      const key = `${message.guild.id}_${message.author.id}`;
      const now = Date.now();
      const userLogs = messageTimestamps.get(key) || [];
      
      const recentLogs = userLogs.filter(t => now - t < 3000);
      recentLogs.push(now);
      messageTimestamps.set(key, recentLogs);

      if (recentLogs.length >= 5) {
        violated = true;
        reason = 'Spam di messaggi troppo rapido';
      }
    }

    // 7. Max Mentions
    if (!violated && config.max_mentions > 0) {
      const mentionsCount = message.mentions.users.size + message.mentions.roles.size;
      if (mentionsCount > config.max_mentions) {
        violated = true;
        reason = `Troppe menzioni (${mentionsCount}/${config.max_mentions})`;
      }
    }

    if (violated) {
      try {
        await message.delete();
      } catch (e) {}

      DatabaseHelper.addModerationCase(
        message.guild.id,
        message.author.id,
        message.client.user.id,
        'AUTOMOD',
        reason
      );

      const warnEmbed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_WARN_COLOR || '#f59e0b')
        .setTitle('🛡️ AutoMod | Sentry')
        .setDescription(`⚠️ ${message.author}, il tuo messaggio è stato bloccato.\n**Motivo:** \`${reason}\``)
        .setFooter({ text: 'Sistema di protezione automatico' })
        .setTimestamp();

      const warnMsg = await message.channel.send({ embeds: [warnEmbed] }).catch(() => null);
      if (warnMsg) {
        setTimeout(() => warnMsg.delete().catch(() => {}), 6000);
      }

      const guildSettings = DatabaseHelper.getGuildSettings(message.guild.id);
      if (guildSettings.log_channel_id) {
        const logChannel = message.guild.channels.cache.get(guildSettings.log_channel_id);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setColor(CONFIG.EMBED_WARN_COLOR || '#f59e0b')
            .setTitle('🛡️ Violazione AutoMod')
            .addFields(
              { name: 'Utente', value: `${message.author.tag} (${message.author.id})`, inline: true },
              { name: 'Canale', value: `${message.channel}`, inline: true },
              { name: 'Motivo', value: `\`${reason}\``, inline: false },
              { name: 'Contenuto Bloccato', value: `\`\`\`${(content || '[Sticker/Allegato]').slice(0, 1000)}\`\`\``, inline: false }
            )
            .setTimestamp();
          await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
      }

      return true;
    }

    return false;
  },

  isTicketChannel(guild, channel) {
    if (!channel) return false;

    // 1. Check if channel is registered in tickets table
    try {
      const ticket = DatabaseHelper.getTicketByChannel(channel.id);
      if (ticket) return true;
    } catch (e) {}

    // 2. Check channel name convention
    const channelName = (channel.name || '').toLowerCase();
    if (
      channelName.startsWith('ticket-') ||
      channelName.startsWith('tk-') ||
      channelName.startsWith('ticket_') ||
      channelName.startsWith('chiuso-') ||
      channelName.startsWith('closed-')
    ) {
      return true;
    }

    // 3. Check if channel's parent category matches any ticket panel or ticket config
    if (channel.parentId) {
      try {
        const panels = DatabaseHelper.getTicketPanels(guild.id);
        if (panels && panels.some(p => p.category_id && p.category_id === channel.parentId)) {
          return true;
        }
      } catch (e) {}
    }

    // 4. Check channel topic
    if (channel.topic && (channel.topic.includes('Ticket di') || channel.topic.includes('Ticket ID:'))) {
      return true;
    }

    return false;
  }
};

export default AutoModManager;

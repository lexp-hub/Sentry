import { DatabaseHelper } from '../../database/db.js';
import { EmbedBuilder, MessageType } from 'discord.js';
import { CONFIG } from '../../config.js';

// Anti-duplication debounce cache (guildId:userId -> timestamp)
const recentBoosts = new Map();

// Clean up old debounce entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of recentBoosts.entries()) {
    if (now - timestamp > 60000) {
      recentBoosts.delete(key);
    }
  }
}, 300000);

export const BoostManager = {
  formatText(template, member) {
    if (!template) return '';
    const avatarUrl = member.user?.displayAvatarURL({ dynamic: true, size: 512 }) || member.displayAvatarURL?.({ dynamic: true, size: 512 }) || '';
    const guildIcon = member.guild?.iconURL({ dynamic: true, size: 512 }) || '';
    const guildBanner = member.guild?.bannerURL?.({ size: 1024 }) || '';
    const boostCount = (member.guild?.premiumSubscriptionCount || 0).toString();
    const boostTier = (member.guild?.premiumTier || 0).toString();

    return template
      .replace(/{user}/g, member.user?.username || member.displayName || 'Utente')
      .replace(/{user\.tag}/g, member.user?.tag || member.displayName || 'Utente')
      .replace(/{user\.name}/g, member.user?.username || member.displayName || 'Utente')
      .replace(/{user\.id}/g, member.id || '')
      .replace(/{user\.mention}/g, `<@${member.id}>`)
      .replace(/{user\.avatar}/g, avatarUrl)
      .replace(/{server\.name}/g, member.guild?.name || 'Server')
      .replace(/{server\.icon}/g, guildIcon)
      .replace(/{server\.banner}/g, guildBanner)
      .replace(/{server\.boost_count}/g, boostCount)
      .replace(/{server\.boost_tier}/g, boostTier)
      .replace(/{server\.memberCount}/g, (member.guild?.memberCount || 0).toString())
      .replace(/{boostCount}/g, boostCount)
      .replace(/{boostTier}/g, boostTier)
      .replace(/{memberCount}/g, (member.guild?.memberCount || 0).toString());
  },

  buildDiscordEmbed(embDataRaw, defaultMessage, member) {
    let embData = embDataRaw;
    if (typeof embData === 'string') {
      try { embData = JSON.parse(embData); } catch (e) { embData = null; }
    }

    const embed = new EmbedBuilder();

    // 1. Color (Nitro Magenta / Pink default)
    const color = embData?.color || '#f47fff';
    try { embed.setColor(color); } catch (e) { embed.setColor('#f47fff'); }

    // 2. Author
    if (embData?.author?.name || embData?.author_name) {
      const authorName = this.formatText(embData.author?.name || embData.author_name, member);
      let authorIcon = embData.author?.icon_url || embData.author_icon;
      if (authorIcon) authorIcon = this.formatText(authorIcon, member);
      let authorUrl = embData.author?.url || embData.author_url;
      if (authorUrl) authorUrl = this.formatText(authorUrl, member);

      embed.setAuthor({
        name: authorName,
        iconURL: authorIcon || undefined,
        url: authorUrl || undefined
      });
    } else {
      embed.setAuthor({
        name: '✨ Nuovo Server Boost!',
        iconURL: 'https://cdn.discordapp.com/emojis/1053034927907573850.webp?size=96&quality=lossless'
      });
    }

    // 3. Title & URL
    const titleText = this.formatText(embData?.title || '🚀 {server.name} è stato Potenziato!', member);
    if (titleText) embed.setTitle(titleText);
    if (embData?.url) embed.setURL(this.formatText(embData.url, member));

    // 4. Description
    const defaultDesc = 'Un immenso ringraziamento a {user.mention} per aver potenziato il server!\n\nGrazie al tuo supporto, **{server.name}** ha raggiunto **{server.boost_count}** boost (Livello {server.boost_tier})! ✨💖';
    const descText = this.formatText(embData?.description || defaultMessage || defaultDesc, member);
    if (descText) embed.setDescription(descText);

    // 5. Thumbnail
    let thumbUrl = embData?.thumbnail?.url || embData?.thumbnail;
    if (thumbUrl) {
      thumbUrl = this.formatText(thumbUrl, member);
      if (thumbUrl.startsWith('http')) embed.setThumbnail(thumbUrl);
    } else {
      embed.setThumbnail(member.user?.displayAvatarURL({ dynamic: true, size: 512 }) || member.displayAvatarURL?.({ dynamic: true, size: 512 }));
    }

    // 6. Main Image
    let imgUrl = embData?.image?.url || embData?.image;
    if (imgUrl) {
      imgUrl = this.formatText(imgUrl, member);
      if (imgUrl.startsWith('http')) embed.setImage(imgUrl);
    }

    // 7. Fields
    if (embData?.fields && Array.isArray(embData.fields) && embData.fields.length > 0) {
      embData.fields.forEach(f => {
        if (f.name && f.value) {
          embed.addFields({
            name: this.formatText(f.name, member),
            value: this.formatText(f.value, member),
            inline: Boolean(f.inline)
          });
        }
      });
    } else {
      const boostCount = member.guild?.premiumSubscriptionCount || 0;
      const boostTier = member.guild?.premiumTier || 0;
      embed.addFields(
        { name: '👤 Booster', value: `<@${member.id}> (\`${member.user?.tag || member.displayName}\`)`, inline: true },
        { name: '🚀 Livello Server', value: `Livello ${boostTier} (\`${boostCount}\` Boost)`, inline: true }
      );
    }

    // 8. Footer & Timestamp
    const footerText = this.formatText(embData?.footer?.text || embData?.footer || `${member.guild?.name} • Nitro Boost`, member);
    let footerIcon = embData?.footer?.icon_url || embData?.footer_icon;
    if (footerIcon) footerIcon = this.formatText(footerIcon, member);

    embed.setFooter({
      text: footerText,
      iconURL: footerIcon || member.guild?.iconURL({ dynamic: true }) || undefined
    });

    if (embData?.timestamp !== false) {
      embed.setTimestamp();
    }

    return embed;
  },

  async handleMemberBoost(member) {
    if (!member || !member.guild) return;

    // Debounce to prevent multiple fires within 15 seconds
    const key = `${member.guild.id}:${member.id}`;
    const now = Date.now();
    if (recentBoosts.has(key) && (now - recentBoosts.get(key) < 15000)) {
      return;
    }
    recentBoosts.set(key, now);

    const config = DatabaseHelper.getBoostConfig(member.guild.id);
    if (!config.enabled) return;

    // Determine target channel
    let channel = null;
    if (config.channel_id) {
      channel = member.guild.channels.cache.get(config.channel_id) ||
        await member.guild.channels.fetch(config.channel_id).catch(() => null);
    }
    if (!channel && member.guild.systemChannel) {
      channel = member.guild.systemChannel;
    }

    if (!channel) {
      console.warn(`[BoostManager] Nessun canale valido trovato per gli annunci boost su ${member.guild.name}`);
      return;
    }

    try {
      const embed = this.buildDiscordEmbed(config.embed, config.message, member);
      const content = config.message ? this.formatText(config.message, member) : '';

      await channel.send({
        content: content || undefined,
        embeds: [embed]
      });

      console.log(`[BoostManager] Embed di Nitro Boost inviato per ${member.user?.tag} in #${channel.name} (${member.guild.name})`);
    } catch (err) {
      console.error(`[BoostManager] Errore durante l'invio dell'embed di boost:`, err.message);
    }

    // Log to Audit Log if configured
    try {
      const settings = DatabaseHelper.getGuildSettings(member.guild.id);
      if (settings.log_channel_id && settings.log_channel_id !== channel.id) {
        const logChan = member.guild.channels.cache.get(settings.log_channel_id);
        if (logChan) {
          const logEmbed = new EmbedBuilder()
            .setColor('#f47fff')
            .setTitle('🚀 Nuovo Potenziamento Server (Nitro Boost)')
            .setThumbnail(member.user?.displayAvatarURL({ dynamic: true }))
            .addFields(
              { name: 'Booster', value: `${member.user?.tag} (<@${member.id}>)`, inline: true },
              { name: 'Boost Totali', value: `\`${member.guild.premiumSubscriptionCount || 0}\``, inline: true },
              { name: 'Livello Attuale', value: `\`Livello ${member.guild.premiumTier || 0}\``, inline: true }
            )
            .setTimestamp();
          await logChan.send({ embeds: [logEmbed] }).catch(() => {});
        }
      }
    } catch (e) {}
  },

  async handleMessageBoost(message) {
    if (!message || !message.guild) return;

    const boostTypes = [
      MessageType.GuildBoost,
      MessageType.GuildBoostTier1,
      MessageType.GuildBoostTier2,
      MessageType.GuildBoostTier3
    ];

    if (!boostTypes.includes(message.type)) return;

    let member = message.member;
    if (!member && message.author) {
      member = await message.guild.members.fetch(message.author.id).catch(() => null);
    }

    if (member) {
      await this.handleMemberBoost(member);
    }
  },

  async sendTestBoost(guild, targetChannelId = null, member = null) {
    if (!guild) throw new Error('Guild non valida');

    const config = DatabaseHelper.getBoostConfig(guild.id);
    const channelId = targetChannelId || config.channel_id || guild.systemChannelId;
    if (!channelId) {
      throw new Error('Nessun canale specificato o configurato per il boost.');
    }

    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      throw new Error(`Canale con ID ${channelId} non trovato o non accessibile.`);
    }

    const testMember = member || (guild.members.me || {
      id: guild.client.user.id,
      user: guild.client.user,
      displayName: guild.client.user.username,
      guild
    });

    const embed = this.buildDiscordEmbed(config.embed, config.message, testMember);
    const content = config.message ? this.formatText(config.message, testMember) : '';

    return await channel.send({
      content: content || undefined,
      embeds: [embed]
    });
  }
};

export default BoostManager;

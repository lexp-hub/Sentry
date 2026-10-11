import { DatabaseHelper } from '../../database/db.js';
import { EmbedBuilder } from 'discord.js';
import { CONFIG } from '../../config.js';

export const WelcomerManager = {
  formatText(template, member) {
    if (!template) return '';
    const avatarUrl = member.user?.displayAvatarURL({ dynamic: true, size: 512 }) || member.displayAvatarURL?.({ dynamic: true, size: 512 }) || '';
    const guildIcon = member.guild?.iconURL({ dynamic: true, size: 512 }) || '';
    const guildBanner = member.guild?.bannerURL?.({ size: 1024 }) || '';

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
      .replace(/{server\.memberCount}/g, (member.guild?.memberCount || 0).toString())
      .replace(/{memberCount}/g, (member.guild?.memberCount || 0).toString())
      .replace(/{count}/g, (member.guild?.memberCount || 0).toString());
  },

  buildDiscordEmbed(embDataRaw, defaultMessage, member) {
    let embData = embDataRaw;
    if (typeof embData === 'string') {
      try { embData = JSON.parse(embData); } catch (e) { embData = null; }
    }

    const embed = new EmbedBuilder();

    // 1. Color
    const color = embData?.color || CONFIG.EMBED_COLOR || '#dc2626';
    try { embed.setColor(color); } catch (e) { embed.setColor('#dc2626'); }

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
    }

    // 3. Title & URL
    const titleText = this.formatText(embData?.title || `⚔️ Benvenuto nel Reame, {user}!`, member);
    if (titleText) embed.setTitle(titleText);
    if (embData?.url) embed.setURL(this.formatText(embData.url, member));

    // 4. Description
    const descText = this.formatText(embData?.description || defaultMessage || 'Benvenuto {user.mention} in **{server.name}**! Siamo felici di averti tra noi. Sei il membro **#{memberCount}**!', member);
    if (descText) embed.setDescription(descText);

    // 5. Thumbnail
    let thumbUrl = embData?.thumbnail?.url || embData?.thumbnail;
    if (thumbUrl) {
      thumbUrl = this.formatText(thumbUrl, member);
      if (thumbUrl.startsWith('http')) embed.setThumbnail(thumbUrl);
    } else {
      embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }));
    }

    // 6. Main Image
    let imgUrl = embData?.image?.url || embData?.image;
    if (imgUrl) {
      imgUrl = this.formatText(imgUrl, member);
      if (imgUrl.startsWith('http')) embed.setImage(imgUrl);
    }

    // 7. Dynamic Fields
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
      // Default standard fields if none configured
      embed.addFields(
        { name: '👤 Utente', value: `<@${member.id}> (\`${member.user.tag}\`)`, inline: true },
        { name: '🏰 Membro n°', value: `\`#${member.guild.memberCount}\``, inline: true },
        { name: '📅 Creazione Account', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: false }
      );
    }

    // 8. Footer & Timestamp
    const footerText = this.formatText(embData?.footer?.text || embData?.footer || `Membro #${member.guild.memberCount} • ${member.guild.name}`, member);
    let footerIcon = embData?.footer?.icon_url || embData?.footer_icon;
    if (footerIcon) footerIcon = this.formatText(footerIcon, member);

    embed.setFooter({
      text: footerText || `${member.guild.name} • Benvenuto`,
      iconURL: footerIcon || member.guild.iconURL({ dynamic: true }) || undefined
    });

    if (embData?.timestamp !== false) {
      embed.setTimestamp();
    }

    return embed;
  },

  async handleMemberJoin(member) {
    if (!member.guild) return;
    const config = DatabaseHelper.getWelcomerConfig(member.guild.id);

    // Auto-Role Assignment (robust cache fallback)
    try {
      if (member.user.bot && config.auto_role_bot) {
        const botRole = member.guild.roles.cache.get(config.auto_role_bot) || await member.guild.roles.fetch(config.auto_role_bot).catch(() => null);
        if (botRole) await member.roles.add(botRole).catch(err => console.error('[Welcomer] Bot role error:', err.message));
      } else if (!member.user.bot && config.auto_role_user) {
        const userRole = member.guild.roles.cache.get(config.auto_role_user) || await member.guild.roles.fetch(config.auto_role_user).catch(() => null);
        if (userRole) await member.roles.add(userRole).catch(err => console.error('[Welcomer] User role error:', err.message));
      }
    } catch (e) {
      console.error('[Welcomer] Error adding auto-role:', e.message);
    }

    // Welcome DM
    if (config.welcome_dm_enabled && config.welcome_dm_message && !member.user.bot) {
      try {
        const dmText = this.formatText(config.welcome_dm_message, member);
        const dmEmbed = new EmbedBuilder()
          .setColor(CONFIG.EMBED_COLOR || '#dc2626')
          .setTitle(`⚔️ Benvenuto in ${member.guild.name}!`)
          .setDescription(dmText)
          .setThumbnail(member.guild.iconURL({ dynamic: true }) || member.user.displayAvatarURL({ dynamic: true }))
          .setFooter({ text: member.guild.name, iconURL: member.guild.iconURL() })
          .setTimestamp();
        await member.send({ embeds: [dmEmbed] }).catch(() => {});
      } catch (e) {}
    }

    // Welcome Channel Message (with robust channel fetching)
    if (config.welcome_enabled && config.welcome_channel_id) {
      try {
        const channel = member.guild.channels.cache.get(config.welcome_channel_id) || await member.guild.channels.fetch(config.welcome_channel_id).catch(() => null);
        if (channel) {
          const embed = this.buildDiscordEmbed(config.welcome_embed, config.welcome_message, member);
          await channel.send({
            content: `<@${member.id}>`,
            embeds: [embed]
          });
        } else {
          console.warn(`[Welcomer] Canale ${config.welcome_channel_id} non trovato nel server ${member.guild.name}`);
        }
      } catch (err) {
        console.error('[Welcomer] Error sending welcome message:', err.message);
      }
    }
  },

  async handleMemberLeave(member) {
    if (!member.guild) return;
    const config = DatabaseHelper.getWelcomerConfig(member.guild.id);
    if (!config.leave_enabled || !config.leave_channel_id) return;

    try {
      const channel = member.guild.channels.cache.get(config.leave_channel_id) || await member.guild.channels.fetch(config.leave_channel_id).catch(() => null);
      if (channel) {
        const messageText = this.formatText(
          config.leave_message || '{user.tag} ha lasciato il server. Siamo rimasti in {memberCount}.',
          member
        );

        const embData = config.leave_embed || {};
        const embed = new EmbedBuilder()
          .setColor(embData.color || CONFIG.EMBED_ERROR_COLOR || '#dc2626')
          .setTitle(`👋 Un membro ha lasciato il Server`)
          .setDescription(this.formatText(embData.description || messageText, member))
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
          .setFooter({ text: `Membri rimasti: ${member.guild.memberCount}`, iconURL: member.guild.iconURL() })
          .setTimestamp();

        if (embData.image) {
          embed.setImage(embData.image);
        }

        await channel.send({ embeds: [embed] }).catch(() => {});
      }
    } catch (err) {
      console.error('[Welcomer] Error sending leave message:', err.message);
    }
  }
};

export default WelcomerManager;

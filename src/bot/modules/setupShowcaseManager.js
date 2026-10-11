import { DatabaseHelper } from '../../database/db.js';
import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { XPManager } from './xpManager.js';

export const SetupShowcaseManager = {
  /**
   * Handles messages sent in the configured setup showcase channel
   * @param {import('discord.js').Message} message
   * @returns {Promise<boolean>} Whether the message was processed as a setup submission
   */
  async handleMessage(message) {
    if (!message.guild || message.author.bot) return false;

    // Check if module is enabled in guild settings
    const guildSettings = DatabaseHelper.getGuildSettings(message.guild.id);
    if (guildSettings.modules_enabled && guildSettings.modules_enabled.setups === false) {
      return false;
    }

    const config = DatabaseHelper.getSetupShowcaseConfig(message.guild.id);
    if (!config || !config.enabled || !config.channel_id) return false;

    // Only process messages inside the designated showcase channel
    if (message.channel.id !== config.channel_id) return false;

    // 1. Detect image attachment or image link
    let imageUrl = null;

    // Check file attachments
    const imageAttachment = message.attachments.find(att => {
      const ct = att.contentType?.toLowerCase() || '';
      const url = att.url?.toLowerCase() || '';
      return ct.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(url);
    });

    if (imageAttachment) {
      imageUrl = imageAttachment.url;
    } else {
      // Check content for direct image URL
      const urlMatch = message.content.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|webp|gif)(\?[^\s]*)?/i);
      if (urlMatch) {
        imageUrl = urlMatch[0];
      }
    }

    // 2. If no image found in the message
    if (!imageUrl) {
      // If delete_invalid is explicitly turned on by admin, delete clutter; otherwise ignore completely
      if (config.delete_invalid) {
        try {
          await message.delete();
          const warnMsg = await message.channel.send({
            content: `⚠️ <@${message.author.id}>, in questo canale puoi inviare solo **la foto della tua postazione** con una descrizione!`
          });
          setTimeout(() => warnMsg.delete().catch(() => {}), 6000);
        } catch (e) {
          console.warn('[SetupShowcase] Could not delete non-image message:', e.message);
        }
        return true;
      }
      // If delete_invalid is disabled, let normal messages pass through without touching them
      return false;
    }

    // 3. Extract and clean description text
    let description = message.content.trim();
    if (description.includes(imageUrl)) {
      description = description.replace(imageUrl, '').trim();
    }

    if (config.require_text && !description) {
      if (config.delete_invalid) {
        try {
          await message.delete();
          const warnMsg = await message.channel.send({
            content: `⚠️ <@${message.author.id}>, è obbligatorio inserire una **descrizione o specifiche** insieme alla foto della tua postazione!`
          });
          setTimeout(() => warnMsg.delete().catch(() => {}), 6000);
        } catch (e) {}
      }
      return true;
    }

    const displayDesc = description || '*Nessuna descrizione o specifica aggiuntiva fornita.*';
    const authorName = message.member?.displayName || message.author.username;
    const authorAvatar = message.author.displayAvatarURL({ dynamic: true, size: 256 });
    const guildIcon = message.guild.iconURL({ dynamic: true, size: 256 });

    // 4. Construct the refined Showcase Embed
    const embed = new EmbedBuilder()
      .setColor(config.color || '#dc2626')
      .setAuthor({
        name: `🖥️ Postazione di ${authorName}`,
        iconURL: authorAvatar
      })
      .setTitle(config.title || '🖥️ Setup & Postazione')
      .setDescription(
        `**Descrizione & Dettagli:**\n>>> ${displayDesc}\n\n` +
        `*Condiviso da <@${message.author.id}>*\n\n` +
        `> 💡 **P.S.** *Per condividere la tua postazione, invia in questo canale la foto e (opzionalmente) il testo descrittivo tutto in un unico messaggio!*`
      )
      .setFooter({
        text: `${message.guild.name} • Sentry Showcase`,
        iconURL: guildIcon || undefined
      })
      .setTimestamp();

    // Attach file directly to bot message so Discord CDN doesn't delete it when user message is deleted!
    let fileAttachment = null;
    if (imageAttachment) {
      const ext = imageAttachment.name?.split('.').pop() || 'png';
      fileAttachment = new AttachmentBuilder(imageAttachment.url, { name: `setup_${message.id}.${ext}` });
      embed.setImage(`attachment://setup_${message.id}.${ext}`);
    } else if (imageUrl) {
      if (imageUrl.includes('cdn.discordapp.com') || imageUrl.includes('media.discordapp.net')) {
        fileAttachment = new AttachmentBuilder(imageUrl, { name: `setup_${message.id}.png` });
        embed.setImage(`attachment://setup_${message.id}.png`);
      } else {
        embed.setImage(imageUrl);
      }
    }

    try {
      // 5. Send the Embed (and re-hosted image attachment) to the channel
      const sendPayload = { embeds: [embed] };
      if (fileAttachment) {
        sendPayload.files = [fileAttachment];
      }
      const embedMessage = await message.channel.send(sendPayload);

      // 6. Delete the original user message to keep gallery clean
      await message.delete().catch(() => {});

      // 7. Add reaction voting emojis
      const reactions = Array.isArray(config.auto_reactions) ? config.auto_reactions : ['🔥', '⭐', '❤️'];
      for (const emoji of reactions) {
        try {
          await embedMessage.react(emoji);
        } catch (e) {}
      }

      // 8. Auto-create discussion thread if enabled
      if (config.auto_thread && message.channel.threads) {
        try {
          await embedMessage.startThread({
            name: `💬 Discussione: Setup di ${authorName}`,
            autoArchiveDuration: 1440
          });
        } catch (threadErr) {
          console.warn('[SetupShowcase] Thread creation skipped:', threadErr.message);
        }
      }

      // 9. Reward Role & XP
      if (config.reward_role_id && message.member) {
        try {
          if (!message.member.roles.cache.has(config.reward_role_id)) {
            await message.member.roles.add(config.reward_role_id);
          }
        } catch (roleErr) {
          console.warn('[SetupShowcase] Reward role grant error:', roleErr.message);
        }
      }

      if (config.xp_reward && config.xp_reward > 0) {
        try {
          await XPManager.addXP(message.guild.id, message.author.id, Number(config.xp_reward));
        } catch (xpErr) {
          console.warn('[SetupShowcase] XP reward error:', xpErr.message);
        }
      }

      // 10. Persist submission in database with permanent image URL
      const permanentImageUrl = embedMessage.attachments.first()?.url || imageUrl;
      DatabaseHelper.saveSetupSubmission(message.guild.id, {
        user_id: message.author.id,
        image_url: permanentImageUrl,
        description: description || null,
        embed_message_id: embedMessage.id,
        timestamp: Math.floor(Date.now() / 1000)
      });

      return true;
    } catch (err) {
      console.error('[SetupShowcase] Error sending showcase embed:', err);
      return false;
    }
  },

  /**
   * Sends an informational/rules panel in the showcase channel
   */
  async sendShowcaseInfoPanel(guild, channelId, options = {}) {
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) throw new Error('Canale showcase non trovato.');

    const config = DatabaseHelper.getSetupShowcaseConfig(guild.id);
    const title = options.title || '🖥️ Condividi la Tua Postazione da Battaglia';
    const color = options.color || config.color || '#dc2626';

    const desc = options.description ||
      `Benvenuto nella galleria dei setup di **${guild.name}**!\n\n` +
      `Mostra alla community la tua **postazione da gaming, studio o lavoro**!\n\n` +
      `📸 **Come partecipare:**\n` +
      `1. Invia in questa chat una foto del tuo setup / scrivania.\n` +
      `2. Aggiungi nella descrizione i dettagli (monitor, PC, tastiera, specifiche o curiosità).\n` +
      `3. Il bot **Sentry** convertirà automaticamente il tuo messaggio in un magnifico Embed e creerà un thread dedicato per i commenti!\n\n` +
      (config.reward_role_id ? `🎁 **Ricompensa:** Ruolo esclusivo <@&${config.reward_role_id}>\n` : '') +
      (config.xp_reward ? `⭐ **+${config.xp_reward} XP** per la classifica del server!\n` : '');

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(desc)
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .setFooter({ text: `${guild.name} • Setup Showcase Ufficiale`, iconURL: guild.iconURL() })
      .setTimestamp();

    if (options.image && options.image.startsWith('http')) {
      embed.setImage(options.image);
    }

    return await channel.send({ embeds: [embed] });
  },

  /**
   * Reads existing past messages in the showcase channel, converts them into Embeds,
   * creates discussion threads, adds reactions, and deletes the original raw messages.
   * @param {import('discord.js').Guild} guild
   * @param {string} channelId
   * @param {number} limit Max number of messages to scan (default 50)
   * @returns {Promise<{ success: boolean, convertedCount: number, deletedCount: number, totalProcessed: number }>}
   */
  async convertChannelMessages(guild, channelId, limit = 50) {
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) throw new Error('Canale showcase non trovato.');

    const config = DatabaseHelper.getSetupShowcaseConfig(guild.id);
    const fetched = await channel.messages.fetch({ limit: Math.min(limit, 100) });
    
    // Process messages from oldest to newest so they appear in correct chronological order
    const messages = Array.from(fetched.values()).reverse();
    let convertedCount = 0;
    let deletedCount = 0;
    let totalProcessed = 0;

    for (const msg of messages) {
      // Skip bot messages or already converted embeds
      if (msg.author.bot || msg.embeds.length > 0) continue;

      totalProcessed++;

      // 1. Detect image
      let imageUrl = null;
      const imageAttachment = msg.attachments.find(att => {
        const ct = att.contentType?.toLowerCase() || '';
        const url = att.url?.toLowerCase() || '';
        return ct.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(url);
      });

      if (imageAttachment) {
        imageUrl = imageAttachment.url;
      } else {
        const urlMatch = msg.content.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|webp|gif)(\?[^\s]*)?/i);
        if (urlMatch) {
          imageUrl = urlMatch[0];
        }
      }

      // If no image found
      if (!imageUrl) {
        if (config.delete_invalid) {
          await msg.delete().catch(() => {});
          deletedCount++;
        }
        continue;
      }

      // 2. Extract description text
      let description = msg.content.trim();
      if (description.includes(imageUrl)) {
        description = description.replace(imageUrl, '').trim();
      }

      const displayDesc = description || '*Nessuna descrizione o specifica aggiuntiva fornita.*';
      const member = msg.member || await guild.members.fetch(msg.author.id).catch(() => null);
      const authorName = member?.displayName || msg.author.username;
      const authorAvatar = msg.author.displayAvatarURL({ dynamic: true, size: 256 });
      const guildIcon = guild.iconURL({ dynamic: true, size: 256 });

      // 3. Construct the official Sentry Embed
      const embed = new EmbedBuilder()
        .setColor(config.color || '#dc2626')
        .setAuthor({
          name: `🖥️ Postazione di ${authorName}`,
          iconURL: authorAvatar
        })
        .setTitle(config.title || '🖥️ Setup & Postazione')
        .setDescription(
          `**Descrizione & Dettagli:**\n>>> ${displayDesc}\n\n` +
          `*Condiviso da <@${msg.author.id}>*\n\n` +
          `> 💡 **P.S.** *Per condividere la tua postazione, invia in questo canale la foto e (opzionalmente) il testo descrittivo tutto in un unico messaggio!*`
        )
        .setFooter({
          text: `${guild.name} • Sentry Showcase`,
          iconURL: guildIcon || undefined
        })
        .setTimestamp(msg.createdAt);

      let fileAttachment = null;
      if (imageAttachment) {
        const ext = imageAttachment.name?.split('.').pop() || 'png';
        fileAttachment = new AttachmentBuilder(imageAttachment.url, { name: `setup_${msg.id}.${ext}` });
        embed.setImage(`attachment://setup_${msg.id}.${ext}`);
      } else if (imageUrl) {
        if (imageUrl.includes('cdn.discordapp.com') || imageUrl.includes('media.discordapp.net')) {
          fileAttachment = new AttachmentBuilder(imageUrl, { name: `setup_${msg.id}.png` });
          embed.setImage(`attachment://setup_${msg.id}.png`);
        } else {
          embed.setImage(imageUrl);
        }
      }

      try {
        // Send the Embed (and re-hosted image attachment) to the channel
        const sendPayload = { embeds: [embed] };
        if (fileAttachment) {
          sendPayload.files = [fileAttachment];
        }
        const embedMessage = await channel.send(sendPayload);

        // Delete the original raw message
        await msg.delete().catch(() => {});

        // Add auto-reactions
        const reactions = Array.isArray(config.auto_reactions) ? config.auto_reactions : ['🔥', '⭐', '❤️'];
        for (const emoji of reactions) {
          try {
            await embedMessage.react(emoji);
          } catch (e) {}
        }

        // Auto-create discussion thread if enabled
        if (config.auto_thread && channel.threads) {
          try {
            await embedMessage.startThread({
              name: `💬 Discussione: Setup di ${authorName}`,
              autoArchiveDuration: 1440
            });
          } catch (threadErr) {}
        }

        // Reward role & XP
        if (config.reward_role_id && member) {
          try {
            if (!member.roles.cache.has(config.reward_role_id)) {
              await member.roles.add(config.reward_role_id);
            }
          } catch (e) {}
        }

        if (config.xp_reward && config.xp_reward > 0) {
          try {
            await XPManager.addXP(guild.id, msg.author.id, Number(config.xp_reward));
          } catch (e) {}
        }

        // Persist submission
        const permanentImageUrl = embedMessage.attachments.first()?.url || imageUrl;
        DatabaseHelper.saveSetupSubmission(guild.id, {
          user_id: msg.author.id,
          image_url: permanentImageUrl,
          description: description || null,
          embed_message_id: embedMessage.id,
          timestamp: Math.floor(msg.createdTimestamp / 1000)
        });

        convertedCount++;
      } catch (err) {
        console.error('[SetupShowcase] Error converting message:', err);
      }
    }

    return {
      success: true,
      convertedCount,
      deletedCount,
      totalProcessed
    };
  }
};

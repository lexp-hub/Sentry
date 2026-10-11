import { DatabaseHelper } from '../../database/db.js';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { CONFIG } from '../../config.js';

export const PartnershipManager = {
  /**
   * Generates the native Discord Modal form for partnership submission
   * @param {string|null} managerId ID of the pre-selected manager/representative
   * @param {string} managerName Username or mention string of the pre-selected manager
   */
  createPartnershipModal(managerId = null, managerName = '') {
    const customId = managerId ? `modal_partnership_submit_${managerId}` : 'modal_partnership_submit';

    const modal = new ModalBuilder()
      .setCustomId(customId)
      .setTitle('🤝 Invia Nuova Partnership');

    const managerInput = new TextInputBuilder()
      .setCustomId('partner_manager')
      .setLabel('Partner Manager / Rappresentante')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('es. @utente, ID Discord o lascia vuoto per te stesso')
      .setRequired(false)
      .setMaxLength(100);

    if (managerName) {
      managerInput.setValue(managerName);
    }

    const descInput = new TextInputBuilder()
      .setCustomId('partner_text')
      .setLabel('Descrizione e Link della Partnership')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Incolla il testo completo della partnership con link di invito ed emoji...')
      .setRequired(true)
      .setMaxLength(4000);

    const row1 = new ActionRowBuilder().addComponents(managerInput);
    const row2 = new ActionRowBuilder().addComponents(descInput);

    modal.addComponents(row1, row2);
    return modal;
  },

  /**
   * Sends an interactive Partnership Panel with a button that triggers the Modal Form
   */
  async sendPartnershipPanel(guild, channelId, title = '🤝 Sistema Partnership & Alleanze', description = null, color = '#ea580c', image = null) {
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) throw new Error('Canale partnership non valido o non trovato.');

    const config = DatabaseHelper.getPartnershipConfig(guild.id);
    const stats = DatabaseHelper.getPartnershipStats(guild.id);

    const desc = description || 
      `Vuoi stringere una partnership con il reame **${guild.name}**?\n\n` +
      `📌 **Requisiti Minimi:** ${config.min_members > 0 ? `Almeno \`${config.min_members}\` membri` : 'Nessun requisito minimo'}\n` +
      `⏳ **Cooldown:** ${config.cooldown_minutes > 0 ? `\`${config.cooldown_minutes}\` minuti` : 'Nessuno'}\n` +
      `📊 **Partnership Effettuate:** \`${stats.total}\`\n\n` +
      `👉 Clicca sul pulsante **Invia Partnership (Form)** qui sotto per compilare il modulo rapido!`;

    const embed = new EmbedBuilder()
      .setColor(color || CONFIG.EMBED_COLOR || '#ea580c')
      .setTitle(title)
      .setDescription(desc)
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .setFooter({ text: `${guild.name} • Partnership Ufficiali`, iconURL: guild.iconURL() })
      .setTimestamp();

    if (image && image.startsWith('http')) {
      embed.setImage(image);
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('partnership_open_form')
        .setLabel('🤝 Invia Partnership (Form)')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('partnership_view_stats')
        .setLabel('📊 Statistiche')
        .setStyle(ButtonStyle.Secondary)
    );

    return channel.send({ embeds: [embed], components: [row] });
  },

  /**
   * Processes the partnership and publishes it to the designated channel
   */
  async processPartnership(guild, channel, user, inviteCodeOrUrl = null, customText = '', bannerUrl = null) {
    const config = DatabaseHelper.getPartnershipConfig(guild.id);
    if (!config.enabled) {
      return { success: false, error: 'Il modulo Partnership è disattivato su questo server.' };
    }

    let inviteInfo = null;
    let partnerGuild = null;
    let memberCount = 0;

    // Automatically search for Discord invite code inside description or invite input
    const searchString = `${inviteCodeOrUrl || ''} ${customText || ''}`;
    const match = searchString.match(/(?:https?:\/\/)?(?:www\.)?(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)([a-zA-Z0-9-]+)/i);
    let code = match ? match[1] : (inviteCodeOrUrl ? inviteCodeOrUrl.trim() : null);

    if (code) {
      try {
        inviteInfo = await guild.client.fetchInvite(code);
        partnerGuild = inviteInfo.guild;
        memberCount = inviteInfo.memberCount || 0;
      } catch (e) {
        console.warn('[Partnership] Link invito non risolvibile da Discord:', e.message);
      }
    }

    if (config.min_members > 0 && memberCount > 0 && memberCount < config.min_members) {
      return {
        success: false,
        error: `Il server partner ha **${memberCount}** membri, ma il requisito minimo è di **${config.min_members}** membri.`
      };
    }

    const now = Math.floor(Date.now() / 1000);
    const cooldownSecs = (config.cooldown_minutes || 0) * 60;

    if (partnerGuild) {
      const recentPartnerships = DatabaseHelper.getPartnerships(guild.id, 20);
      const lastFromSameGuild = recentPartnerships.find(p => p.partner_guild_id === partnerGuild?.id);
      if (lastFromSameGuild && (now - lastFromSameGuild.timestamp) < cooldownSecs) {
        const remainingMinutes = Math.ceil((cooldownSecs - (now - lastFromSameGuild.timestamp)) / 60);
        return {
          success: false,
          error: `Questo server partner ha già una partnership attiva registrata di recente. Attendi **${remainingMinutes} minuti** prima di pubblicarla di nuovo.`
        };
      }
    }

    const saved = DatabaseHelper.addPartnership(guild.id, {
      partner_guild_id: partnerGuild?.id || null,
      partner_name: partnerGuild?.name || 'Server Partner',
      invite_url: inviteInfo ? inviteInfo.url : (match ? match[0] : null),
      rep_user_id: user.id,
      partner_count: memberCount,
      timestamp: now,
      notes: customText
    });

    const stats = DatabaseHelper.getPartnershipStats(guild.id);

    const partnerEmbed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_COLOR || '#ea580c')
      .setTitle(`🤝 Informazioni Partnership${partnerGuild?.name ? ` | ${partnerGuild.name}` : ''}`)
      .addFields(
        { name: '👑 Partner Manager', value: `${user} (\`${user.tag || user.username}\`)`, inline: true }
      )
      .setFooter({ text: `${guild.name} • Partnership #${stats.total}`, iconURL: guild.iconURL() })
      .setTimestamp();

    if (inviteInfo?.url) {
      partnerEmbed.setURL(inviteInfo.url);
    }
    if (memberCount > 0) {
      partnerEmbed.addFields({ name: '👥 Membri Partner', value: `\`${memberCount.toLocaleString()}\``, inline: true });
    }
    partnerEmbed.addFields({ name: '📊 Partnership Totali', value: `\`#${stats.total}\``, inline: true });

    if (partnerGuild?.icon) {
      partnerEmbed.setThumbnail(`https://cdn.discordapp.com/icons/${partnerGuild.id}/${partnerGuild.icon}.png?size=256`);
    }

    if (bannerUrl && bannerUrl.startsWith('http')) {
      partnerEmbed.setImage(bannerUrl);
    }

    const targetChannelId = config.channel_id;
    const targetChannel = targetChannelId 
      ? (guild.channels.cache.get(targetChannelId) || await guild.channels.fetch(targetChannelId).catch(() => null))
      : channel;

    if (!targetChannel) {
      return { success: false, error: 'Canale partnership non trovato o non configurato.' };
    }

    let messageContent = '';
    if (config.ping_role_id) {
      messageContent += `<@&${config.ping_role_id}>\n\n`;
    }
    if (customText) {
      messageContent += customText;
    }
    messageContent = messageContent.trim();

    let sentMessage;
    if (messageContent.length > 1950) {
      const part1 = messageContent.slice(0, 1900);
      const part2 = messageContent.slice(1900);
      await targetChannel.send({ content: part1 });
      sentMessage = await targetChannel.send({
        content: part2,
        embeds: [partnerEmbed]
      });
    } else {
      sentMessage = await targetChannel.send({
        content: messageContent || undefined,
        embeds: [partnerEmbed]
      });
    }

    if (config.log_channel_id) {
      const logChan = guild.channels.cache.get(config.log_channel_id) || await guild.channels.fetch(config.log_channel_id).catch(() => null);
      if (logChan && logChan.id !== targetChannel.id) {
        const logEmbed = new EmbedBuilder()
          .setColor(CONFIG.EMBED_SUCCESS_COLOR || '#10b981')
          .setTitle('🤝 Log Partnership Registrata')
          .addFields(
            { name: 'Server Partner', value: `${partnerGuild?.name || 'Partner Server'} (\`${partnerGuild?.id || 'N/A'}\`)`, inline: true },
            { name: 'Rappresentante', value: `${user} (\`${user.id}\`)`, inline: true },
            { name: 'Canale Invio', value: `${targetChannel}`, inline: true },
            { name: 'Membri', value: `\`${memberCount}\``, inline: true },
            { name: 'Messaggio Inviato', value: `[Visualizza Messaggio](${sentMessage.url})`, inline: true }
          )
          .setTimestamp();
        await logChan.send({ embeds: [logEmbed] }).catch(() => {});
      }
    }

    return {
      success: true,
      partnershipId: saved.id,
      totalCount: stats.total,
      messageUrl: sentMessage.url,
      partnerGuildName: partnerGuild?.name
    };
  },

  /**
   * Handles the modal submission from Discord
   */
  async handlePartnershipModalSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const text = interaction.fields.getTextInputValue('partner_text')?.trim();
    let managerInputRaw = null;
    try {
      managerInputRaw = interaction.fields.getTextInputValue('partner_manager')?.trim() || null;
    } catch (e) {}

    let repUser = interaction.user;
    
    // 1. Extract manager ID from customId if provided (/partnership @manager)
    if (interaction.customId.startsWith('modal_partnership_submit_')) {
      const managerId = interaction.customId.replace('modal_partnership_submit_', '').trim();
      if (managerId) {
        try {
          repUser = await interaction.client.users.fetch(managerId);
        } catch (e) {
          console.warn(`[Partnership] Impossibile recuperare utente manager ${managerId}:`, e.message);
        }
      }
    }

    // 2. If manager text was typed into modal, resolve it
    if (managerInputRaw && managerInputRaw.length > 0) {
      const idMatch = managerInputRaw.match(/\d{17,20}/);
      if (idMatch) {
        try {
          const fetched = await interaction.client.users.fetch(idMatch[0]);
          if (fetched) repUser = fetched;
        } catch (e) {}
      } else {
        const cleanName = managerInputRaw.replace(/^@/, '').toLowerCase();
        const foundMember = interaction.guild?.members.cache.find(m => 
          m.user.username.toLowerCase() === cleanName ||
          m.user.tag?.toLowerCase() === cleanName ||
          m.displayName.toLowerCase() === cleanName
        );
        if (foundMember) repUser = foundMember.user;
      }
    }

    const result = await this.processPartnership(
      interaction.guild,
      interaction.channel,
      repUser,
      null, // Link will be automatically detected and parsed from description text
      text
    );

    if (!result.success) {
      return interaction.editReply({
        content: `❌ **Impossibile registrare la partnership:** ${result.error}`
      });
    }

    const successEmbed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_SUCCESS_COLOR || '#10b981')
      .setTitle('✅ Partnership Pubblicata con Successo!')
      .setDescription(
        `La partnership con **${result.partnerGuildName || 'il server partner'}** (Totale: **#${result.totalCount}**) è stata pubblicata!\n\n` +
        `👑 **Rappresentante:** ${repUser}\n` +
        `🔗 **Messaggio Pubblicato:** [Clicca per vedere il messaggio](${result.messageUrl})`
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });
  }
};

export default PartnershipManager;

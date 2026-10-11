import { DatabaseHelper } from '../../database/db.js';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  AttachmentBuilder
} from 'discord.js';
import { CONFIG } from '../../config.js';

export const TicketManager = {
  async handleTicketCreate(interaction, panelId = null) {
    const { guild, user } = interaction;

    const existingTicket = DatabaseHelper.db.prepare(
      "SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'OPEN'"
    ).get(guild.id, user.id);

    if (existingTicket) {
      const existingChannel = guild.channels.cache.get(existingTicket.channel_id);
      if (existingChannel) {
        return interaction.reply({
          content: `❌ Hai già un ticket di supporto aperto in ${existingChannel}!`,
          ephemeral: true
        });
      }
    }

    await interaction.deferReply({ ephemeral: true });

    let panel = null;
    if (panelId) {
      panel = DatabaseHelper.getTicketPanel(panelId);
    }

    const supportRoleId = panel?.support_role_id;
    const categoryId = panel?.category_id;

    const permissionOverwrites = [
      {
        id: guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.EmbedLinks
        ]
      },
      {
        id: guild.client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.EmbedLinks
        ]
      }
    ];

    if (supportRoleId) {
      permissionOverwrites.push({
        id: supportRoleId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      });
    }

    try {
      const sanitizedUsername = user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
      const scheme = panel?.naming_scheme || 'ticket-{user}';
      const channelName = scheme
        .replace(/{user}/g, sanitizedUsername || 'utente')
        .replace(/{id}/g, Math.floor(1000 + Math.random() * 9000).toString());

      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: categoryId || undefined,
        permissionOverwrites,
        topic: `Ticket di ${user.tag} (${user.id}) | Creato: ${new Date().toLocaleString('it-IT')}`
      });

      DatabaseHelper.createTicket(guild.id, ticketChannel.id, user.id, panelId);

      const closeBtn = new ButtonBuilder()
        .setCustomId(`ticket_close_${ticketChannel.id}`)
        .setLabel('Chiudi Ticket')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger);

      const claimBtn = new ButtonBuilder()
        .setCustomId(`ticket_claim_${ticketChannel.id}`)
        .setLabel('Prendi in Carico')
        .setEmoji('✋')
        .setStyle(ButtonStyle.Primary);

      const actionRow = new ActionRowBuilder().addComponents(closeBtn, claimBtn);

      const welcomeDesc = (panel?.welcome_message || 'Benvenuto {user.mention}! Uno staffer ti risponderà al più presto.\n\nDescrivi il tuo problema in dettaglio con tutte le informazioni utili.')
        .replace(/{user\.mention}/g, `<@${user.id}>`)
        .replace(/{user}/g, user.username)
        .replace(/{server\.name}/g, guild.name);

      const welcomeEmbed = new EmbedBuilder()
        .setColor(panel?.color || CONFIG.EMBED_COLOR || '#ea580c')
        .setTitle('🎫 Ticket di Supporto Aperto')
        .setDescription(welcomeDesc)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '👤 Autore Ticket', value: `${user.tag} (<@${user.id}>)`, inline: true },
          { name: '⏰ Data Creazione', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        )
        .setFooter({ text: `${guild.name} • Ticket System`, iconURL: guild.iconURL() })
        .setTimestamp();

      const pingContent = supportRoleId ? `<@${user.id}> <@&${supportRoleId}>` : `<@${user.id}>`;
      await ticketChannel.send({ content: pingContent, embeds: [welcomeEmbed], components: [actionRow] });

      await interaction.editReply({
        content: `✅ Il tuo ticket è stato aperto con successo: ${ticketChannel}`,
        ephemeral: true
      });
    } catch (error) {
      console.error('[TicketManager] Error creating ticket:', error);
      await interaction.editReply({
        content: `❌ Errore durante la creazione del ticket: ${error.message}`,
        ephemeral: true
      });
    }
  },

  async handleTicketClaim(interaction) {
    const { channel, user } = interaction;
    const ticket = DatabaseHelper.getTicketByChannel(channel.id);
    if (!ticket) {
      return interaction.reply({ content: '❌ Questo canale non è un ticket registrato.', ephemeral: true });
    }

    if (ticket.status === 'CLAIMED') {
      return interaction.reply({
        content: `❌ Questo ticket è già stato preso in carico da <@${ticket.claimed_by}>!`,
        ephemeral: true
      });
    }

    DatabaseHelper.claimTicket(channel.id, user.id);

    const claimEmbed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_SUCCESS_COLOR || '#10b981')
      .setDescription(`✋ Il ticket è stato preso in carico da **${user}** (\`${user.tag}\`).`)
      .setTimestamp();

    await interaction.reply({ embeds: [claimEmbed] });
  },

  async handleTicketClose(interaction, reason = 'Chiusura standard da parte dello staff') {
    const { channel, user, guild } = interaction;
    const ticket = DatabaseHelper.getTicketByChannel(channel.id);
    if (!ticket) {
      return interaction.reply({ content: '❌ Questo canale non è un ticket registrato.', ephemeral: true });
    }

    await interaction.reply({
      content: `🔒 Chiusura del ticket in corso da parte di ${user}... Il canale verrà eliminato tra pochi secondi.`
    });

    let transcript = `=== TRANSCRIPT TICKET ${channel.name} ===\nServer: ${guild.name} (${guild.id})\nAutore Ticket: ${ticket.user_id}\nChiuso da: ${user.tag} (${user.id})\nData: ${new Date().toLocaleString('it-IT')}\nMotivo: ${reason}\n\n`;

    try {
      const messages = await channel.messages.fetch({ limit: 100 });
      const sortedMessages = Array.from(messages.values()).reverse();
      for (const msg of sortedMessages) {
        const time = new Date(msg.createdTimestamp).toLocaleString('it-IT');
        transcript += `[${time}] ${msg.author.tag}: ${msg.content || ''}\n`;
        if (msg.attachments.size > 0) {
          msg.attachments.forEach(att => {
            transcript += `  [Allegato: ${att.url}]\n`;
          });
        }
      }
    } catch (e) {
      transcript += `[Errore recupero messaggi: ${e.message}]\n`;
    }

    DatabaseHelper.closeTicket(channel.id, transcript);

    const panel = ticket.panel_id ? DatabaseHelper.getTicketPanel(ticket.panel_id) : null;
    const logChannelId = panel?.log_channel_id;

    if (logChannelId) {
      const logChannel = guild.channels.cache.get(logChannelId);
      if (logChannel) {
        try {
          const buffer = Buffer.from(transcript, 'utf-8');
          const attachment = new AttachmentBuilder(buffer, { name: `${channel.name}-transcript.txt` });
          
          const logEmbed = new EmbedBuilder()
            .setColor(CONFIG.EMBED_COLOR || '#ea580c')
            .setTitle(`📜 Transcript Ticket: ${channel.name}`)
            .addFields(
              { name: '👤 Autore Ticket', value: `<@${ticket.user_id}> (\`${ticket.user_id}\`)`, inline: true },
              { name: '🔒 Chiuso da', value: `${user} (\`${user.tag}\`)`, inline: true },
              { name: '📝 Motivo', value: `\`${reason}\``, inline: false }
            )
            .setFooter({ text: 'Sentry • Ticket Logs', iconURL: guild.iconURL() })
            .setTimestamp();

          await logChannel.send({ embeds: [logEmbed], files: [attachment] }).catch(() => {});
        } catch (err) {
          console.error('[TicketManager] Error sending transcript log:', err.message);
        }
      }
    }

    try {
      const ticketOwner = await guild.client.users.fetch(ticket.user_id);
      if (ticketOwner) {
        const buffer = Buffer.from(transcript, 'utf-8');
        const attachment = new AttachmentBuilder(buffer, { name: `${channel.name}-transcript.txt` });

        const dmEmbed = new EmbedBuilder()
          .setColor(CONFIG.EMBED_COLOR || '#ea580c')
          .setTitle('🎫 Ticket di Supporto Chiuso')
          .setDescription(`Il tuo ticket su **${guild.name}** (\`${channel.name}\`) è stato chiuso.\n**Motivo:** \`${reason}\`\n\nTrovi in allegato la trascrizione completa della conversazione.`)
          .setFooter({ text: guild.name, iconURL: guild.iconURL() })
          .setTimestamp();

        await ticketOwner.send({ embeds: [dmEmbed], files: [attachment] }).catch(() => {});
      }
    } catch (e) {}

    setTimeout(async () => {
      try {
        await channel.delete('Ticket chiuso');
      } catch (err) {
        console.error('[TicketManager] Error deleting channel:', err.message);
      }
    }, 4000);
  },

  async handleTicketAddUser(interaction, targetUser) {
    const { channel } = interaction;
    const ticket = DatabaseHelper.getTicketByChannel(channel.id);
    if (!ticket) {
      return interaction.reply({ content: '❌ Questo canale non è un ticket registrato.', ephemeral: true });
    }

    try {
      await channel.permissionOverwrites.edit(targetUser.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true
      });

      const embed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_SUCCESS_COLOR || '#10b981')
        .setDescription(`✅ ${targetUser} è stato aggiunto con successo al ticket da ${interaction.user}.`)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      await interaction.reply({ content: `❌ Errore aggiunta utente: ${err.message}`, ephemeral: true });
    }
  },

  async handleTicketRemoveUser(interaction, targetUser) {
    const { channel } = interaction;
    const ticket = DatabaseHelper.getTicketByChannel(channel.id);
    if (!ticket) {
      return interaction.reply({ content: '❌ Questo canale non è un ticket registrato.', ephemeral: true });
    }

    if (targetUser.id === ticket.user_id) {
      return interaction.reply({ content: '❌ Non puoi rimuovere il creatore del ticket dal proprio ticket!', ephemeral: true });
    }

    try {
      await channel.permissionOverwrites.delete(targetUser.id);

      const embed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_COLOR || '#dc2626')
        .setDescription(`🚫 ${targetUser} è stato rimosso dal ticket da ${interaction.user}.`)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      await interaction.reply({ content: `❌ Errore rimozione utente: ${err.message}`, ephemeral: true });
    }
  },

  async editTicketPanel(panelId, newConfig, botClient) {
    const panel = DatabaseHelper.getTicketPanel(panelId);
    if (!panel || !panel.channel_id || !panel.message_id) {
      throw new Error('Pannello non trovato o privo di message_id');
    }

    const channel = await botClient.channels.fetch(panel.channel_id);
    if (!channel) throw new Error('Canale non trovato su Discord');

    const message = await channel.messages.fetch(panel.message_id);
    if (!message) throw new Error('Messaggio del pannello non trovato su Discord');

    const styleMap = {
      'Primary': ButtonStyle.Primary,
      'Secondary': ButtonStyle.Secondary,
      'Success': ButtonStyle.Success,
      'Danger': ButtonStyle.Danger
    };

    const openButton = new ButtonBuilder()
      .setCustomId(`ticket_open_${panel.id}`)
      .setLabel(newConfig.button_label || panel.button_label || 'Apri Ticket')
      .setEmoji(newConfig.button_emoji || panel.button_emoji || '📩')
      .setStyle(styleMap[newConfig.button_style] || ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(openButton);

    const embed = new EmbedBuilder()
      .setColor(newConfig.color || panel.color || CONFIG.EMBED_COLOR || '#dc2626')
      .setTitle(newConfig.title || panel.title || '🎫 Centro Supporto & Assistenza')
      .setDescription(newConfig.description || panel.description || 'Clicca sul pulsante sottostante per aprire una richiesta di supporto.')
      .setFooter({ text: newConfig.footer || panel.footer || 'Sentry • Ticket System', iconURL: channel.guild.iconURL() })
      .setTimestamp();

    if (newConfig.image || panel.image) {
      embed.setImage(newConfig.image || panel.image);
    }

    await message.edit({ embeds: [embed], components: [row] });

    DatabaseHelper.saveTicketPanel({
      ...panel,
      ...newConfig,
      id: panel.id,
      guild_id: panel.guild_id,
      channel_id: panel.channel_id,
      message_id: panel.message_id
    });

    return true;
  }
};

export default TicketManager;

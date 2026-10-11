import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType
} from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Crea, salva ed invia messaggi embed personalizzati')
    .addSubcommand(sub =>
      sub
        .setName('send')
        .setDescription('Invia un embed a partire da un JSON o dal nome di un template')
        .addChannelOption(opt =>
          opt
            .setName('canale')
            .setDescription('Il canale dove inviare l\'embed')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('dati_o_template')
            .setDescription('ID del template salvato oppure stringa JSON valida')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Crea rapidamente un embed base nel canale')
        .addStringOption(opt => opt.setName('titolo').setDescription('Titolo dell\'embed').setRequired(true))
        .addStringOption(opt => opt.setName('descrizione').setDescription('Descrizione del messaggio').setRequired(true))
        .addStringOption(opt => opt.setName('colore').setDescription('Codice colore HEX (es. #8B5CF6)').setRequired(false))
        .addStringOption(opt => opt.setName('immagine').setDescription('URL immagine grande').setRequired(false))
        .addStringOption(opt => opt.setName('thumbnail').setDescription('URL miniatura in alto a destra').setRequired(false))
        .addStringOption(opt => opt.setName('footer').setDescription('Testo a piè di pagina').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('Mostra i template embed salvati per questo server')
    )
    .addSubcommand(sub =>
      sub
        .setName('delete')
        .setDescription('Elimina un template embed salvato')
        .addStringOption(opt => opt.setName('template_id').setDescription('ID del template da eliminare').setRequired(true))
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages) &&
        !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({
        content: '❌ Non hai i permessi necessari per usare questo comando (`Gestisci Messaggi`).',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'send') {
      const targetChannel = interaction.options.getChannel('canale');
      const input = interaction.options.getString('dati_o_template');

      let embedData = null;
      let componentsData = [];

      const template = DatabaseHelper.getEmbedTemplate(input);
      if (template && template.guild_id === interaction.guild.id) {
        embedData = template.embed_data;
        componentsData = template.components_data || [];
      } else {
        
        try {
          const parsed = JSON.parse(input);
          if (parsed.embed) {
            embedData = parsed.embed;
            componentsData = parsed.components || [];
          } else {
            embedData = parsed;
          }
        } catch (e) {
          return interaction.reply({
            content: '❌ Input non valido. Inserisci un ID di template valido oppure un oggetto JSON conforme.',
            ephemeral: true
          });
        }
      }

      try {
        const embed = new EmbedBuilder(embedData);
        const rows = [];

        if (componentsData && componentsData.length > 0) {
          const row = new ActionRowBuilder();
          for (const btn of componentsData.slice(0, 5)) {
            const button = new ButtonBuilder()
              .setLabel(btn.label || 'Button')
              .setStyle(btn.style === 'LINK' ? ButtonStyle.Link : ButtonStyle[btn.style] || ButtonStyle.Primary);

            if (btn.emoji) button.setEmoji(btn.emoji);
            if (btn.style === 'LINK' && btn.url) {
              button.setURL(btn.url);
            } else {
              button.setCustomId(btn.custom_id || `custom_btn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
            }
            row.addComponents(button);
          }
          rows.push(row);
        }

        await targetChannel.send({ embeds: [embed], components: rows });
        await interaction.reply({ content: `✅ Embed inviato con successo in ${targetChannel}!`, ephemeral: true });
      } catch (err) {
        await interaction.reply({ content: `❌ Errore durante l'invio dell'embed: ${err.message}`, ephemeral: true });
      }
    } else if (subcommand === 'create') {
      const title = interaction.options.getString('titolo');
      const description = interaction.options.getString('descrizione');
      const color = interaction.options.getString('colore') || CONFIG.EMBED_COLOR;
      const image = interaction.options.getString('immagine');
      const thumbnail = interaction.options.getString('thumbnail');
      const footer = interaction.options.getString('footer');

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description.replace(/\\n/g, '\n'))
        .setTimestamp();

      if (image) embed.setImage(image);
      if (thumbnail) embed.setThumbnail(thumbnail);
      if (footer) embed.setFooter({ text: footer });

      await interaction.channel.send({ embeds: [embed] });
      await interaction.reply({ content: '✅ Embed inviato nel canale corrente!', ephemeral: true });
    } else if (subcommand === 'list') {
      const templates = DatabaseHelper.getEmbedTemplates(interaction.guild.id);
      if (templates.length === 0) {
        return interaction.reply({
          content: `📂 Nessun template embed salvato per questo server.\nPuoi crearli facilmente dalla **[Dashboard Web](${CONFIG.DASHBOARD_URL})** con il simulatore live!`,
          ephemeral: true
        });
      }

      const listStr = templates.map(t => `• **${t.name}** (ID: \`${t.id}\`) — creato <t:${t.created_at}:R>`).join('\n');
      const embed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_COLOR)
        .setTitle(`🎨 Template Embed Salvati | ${interaction.guild.name}`)
        .setDescription(listStr)
        .setFooter({ text: 'Usa /embed send <canale> <template_id> per inviare un template' });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (subcommand === 'delete') {
      const templateId = interaction.options.getString('template_id');
      const template = DatabaseHelper.getEmbedTemplate(templateId);
      if (!template || template.guild_id !== interaction.guild.id) {
        return interaction.reply({ content: '❌ Template non trovato.', ephemeral: true });
      }

      DatabaseHelper.deleteEmbedTemplate(templateId);
      await interaction.reply({ content: `✅ Template **${template.name}** (\`${templateId}\`) eliminato con successo.`, ephemeral: true });
    }
  }
};

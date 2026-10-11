import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionsBitField,
  ChannelType
} from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Crea e gestisce ruoli automatici tramite pulsanti e menu')
    .addSubcommand(sub =>
      sub
        .setName('button')
        .setDescription('Crea un pannello ruoli con un pulsante')
        .addChannelOption(opt =>
          opt
            .setName('canale')
            .setDescription('Canale in cui inviare il pannello')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addRoleOption(opt =>
          opt
            .setName('ruolo')
            .setDescription('Il ruolo da assegnare/rimuovere')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('testo_bottone')
            .setDescription('Etichetta del pulsante')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('titolo_embed')
            .setDescription('Titolo del messaggio embed')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('descrizione_embed')
            .setDescription('Descrizione del messaggio')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('emoji')
            .setDescription('Emoji per il pulsante')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('stile')
            .setDescription('Stile del bottone')
            .addChoices(
              { name: 'Viola/Blurple (Primario)', value: 'Primary' },
              { name: 'Grigio (Secondario)', value: 'Secondary' },
              { name: 'Verde (Successo)', value: 'Success' },
              { name: 'Rosso (Pericolo)', value: 'Danger' }
            )
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('Elenca tutti i reaction role configurati')
    )
    .addSubcommand(sub =>
      sub
        .setName('delete')
        .setDescription('Elimina un reaction role tramite ID')
        .addIntegerOption(opt => opt.setName('id').setDescription('ID del reaction role').setRequired(true))
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles) &&
        !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: '❌ Non hai i permessi per gestire i ruoli (`Gestisci Ruoli`).',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'button') {
      const channel = interaction.options.getChannel('canale');
      const role = interaction.options.getRole('ruolo');
      const label = interaction.options.getString('testo_bottone');
      const title = interaction.options.getString('titolo_embed') || '🎭 Selezione Ruoli';
      const desc = interaction.options.getString('descrizione_embed') || `Clicca sul pulsante sottostante per ottenere o rimuovere il ruolo ${role}.`;
      const emoji = interaction.options.getString('emoji');
      const styleName = interaction.options.getString('stile') || 'Primary';

      const buttonStyle = ButtonStyle[styleName] || ButtonStyle.Primary;
      const customId = `rr_btn_${role.id}`;

      const btn = new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(buttonStyle);

      if (emoji) btn.setEmoji(emoji);

      const row = new ActionRowBuilder().addComponents(btn);

      const embed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_COLOR)
        .setTitle(title)
        .setDescription(desc)
        .setFooter({ text: 'Sistema Ruoli Automatici • Sentry' })
        .setTimestamp();

      const sentMsg = await channel.send({ embeds: [embed], components: [row] });

      DatabaseHelper.addReactionRole(
        interaction.guild.id,
        channel.id,
        sentMsg.id,
        'BUTTON',
        role.id,
        emoji,
        label,
        styleName
      );

      await interaction.reply({
        content: `✅ Pannello Ruoli inviato con successo in ${channel}!`,
        ephemeral: true
      });
    } else if (subcommand === 'list') {
      const list = DatabaseHelper.getReactionRoles(interaction.guild.id);
      if (list.length === 0) {
        return interaction.reply({ content: '📂 Nessun reaction role attivo in questo server.', ephemeral: true });
      }

      const rows = list.map(r => `• **ID #${r.id}** — Ruolo: <@&${r.role_id}> | Tipo: \`${r.type}\` | Canale: <#${r.channel_id}>`).join('\n');
      const embed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_COLOR)
        .setTitle(`🎭 Reaction Roles Attivi | ${interaction.guild.name}`)
        .setDescription(rows)
        .setFooter({ text: 'Usa /reactionrole delete <id> per rimuovere una voce' });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (subcommand === 'delete') {
      const id = interaction.options.getInteger('id');
      DatabaseHelper.deleteReactionRole(id);
      await interaction.reply({ content: `✅ Reaction role ID **#${id}** eliminato dal database.`, ephemeral: true });
    }
  }
};

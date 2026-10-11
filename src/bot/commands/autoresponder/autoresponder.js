import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType
} from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('autoresponder')
    .setDescription('Configura risposte automatiche e reazioni emoji ai messaggi')
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Aggiunge una risposta automatica ad una parola o frase')
        .addStringOption(opt =>
          opt
            .setName('trigger')
            .setDescription('La parola chiave o frase che attiva la risposta')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('risposta')
            .setDescription('Il testo con cui il bot risponderà')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('tipo_confronto')
            .setDescription('Come verificare il testo')
            .addChoices(
              { name: 'Contiene la parola (CONTAINS)', value: 'CONTAINS' },
              { name: 'Corrispondenza Esatta (EXACT)', value: 'EXACT' },
              { name: 'Inizia con (STARTS_WITH)', value: 'STARTS_WITH' }
            )
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('reazioni_emoji')
            .setDescription('Emoji da aggiungere come reazione separate da virgola (es. 👍,🔥)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('autoreact')
        .setDescription('Imposta reazioni automatiche a ogni messaggio in un canale (es. suggerimenti)')
        .addChannelOption(opt =>
          opt
            .setName('canale')
            .setDescription('Il canale dove applicare le reazioni automatiche')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('emojis')
            .setDescription('Emoji da aggiungere separate da spazio o virgola (es: 👍 👎)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('Elenca tutte le risposte automatiche attive')
    )
    .addSubcommand(sub =>
      sub
        .setName('delete')
        .setDescription('Elimina una risposta automatica')
        .addIntegerOption(opt => opt.setName('id').setDescription('ID della risposta automatica').setRequired(true))
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild) &&
        !interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return interaction.reply({
        content: '❌ Non hai i permessi per gestire le risposte automatiche (`Gestisci Messaggi`).',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'add') {
      const trigger = interaction.options.getString('trigger');
      const response = interaction.options.getString('risposta');
      const matchType = interaction.options.getString('tipo_confronto') || 'CONTAINS';
      const emojisInput = interaction.options.getString('reazioni_emoji');

      let reactions = [];
      if (emojisInput) {
        reactions = emojisInput.split(/[, ]+/).filter(e => e.trim().length > 0);
      }

      const created = DatabaseHelper.addAutoresponder(interaction.guild.id, {
        trigger,
        match_type: matchType,
        response_text: response,
        auto_reactions: reactions,
        enabled: true
      });

      const embed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_SUCCESS_COLOR)
        .setTitle('⚡ Auto-Responder Creato!')
        .addFields(
          { name: 'ID', value: `\`#${created.id}\``, inline: true },
          { name: 'Trigger', value: `\`${trigger}\``, inline: true },
          { name: 'Tipo', value: `\`${matchType}\``, inline: true },
          { name: 'Risposta', value: response, inline: false },
          { name: 'Reazioni Emoji', value: reactions.length > 0 ? reactions.join(' ') : '`Nessuna`', inline: false }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === 'autoreact') {
      const channel = interaction.options.getChannel('canale');
      const emojisRaw = interaction.options.getString('emojis');
      const emojis = emojisRaw.split(/[, ]+/).filter(e => e.trim().length > 0);

      DatabaseHelper.setAutoreactionChannel(interaction.guild.id, channel.id, emojis, true);

      const embed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_SUCCESS_COLOR)
        .setTitle('✨ Auto-Reaction Canale Configurato')
        .setDescription(`Ogni nuovo messaggio inviato in ${channel} riceverà automaticamente le seguenti reazioni:\n\n${emojis.join(' ')}`)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === 'list') {
      const list = DatabaseHelper.getAutoresponders(interaction.guild.id);
      const reactChannels = DatabaseHelper.getAutoreactionChannels(interaction.guild.id);

      if (list.length === 0 && reactChannels.length === 0) {
        return interaction.reply({ content: '📂 Nessuna risposta o reazione automatica configurata.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_COLOR)
        .setTitle(`⚡ Risposte & Reazioni Automatiche | ${interaction.guild.name}`)
        .setTimestamp();

      if (list.length > 0) {
        const rows = list.map(r => `• **#${r.id}** Trigger: \`${r.trigger}\` (${r.match_type}) ➔ \`${r.response_text || 'Reazione'}\``).join('\n');
        embed.addFields({ name: '💬 Trigger & Risposte', value: rows });
      }

      if (reactChannels.length > 0) {
        const chanRows = reactChannels.map(c => `• <#${c.channel_id}>: ${c.emojis.join(' ')}`).join('\n');
        embed.addFields({ name: '📌 Canali Auto-Reaction', value: chanRows });
      }

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === 'delete') {
      const id = interaction.options.getInteger('id');
      DatabaseHelper.deleteAutoresponder(id);
      await interaction.reply({ content: `✅ Auto-responder **#${id}** eliminato.`, ephemeral: true });
    }
  }
};

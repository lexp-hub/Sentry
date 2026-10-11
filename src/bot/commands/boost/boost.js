import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType
} from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';
import { BoostManager } from '../../modules/boostManager.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('boost')
    .setDescription('Configura e testa i messaggi ed embed al Boost Nitro del Server')
    .addSubcommand(sub =>
      sub
        .setName('config')
        .setDescription('Configura il canale e le impostazioni del messaggio di Nitro Boost')
        .addChannelOption(opt =>
          opt
            .setName('canale')
            .setDescription('Canale dove inviare gli annunci di Boost Nitro')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt
            .setName('attivo')
            .setDescription('Abilita o disabilita il messaggio di boost')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('messaggio')
            .setDescription('Testo di menzione (es. "Grazie per il boost {user.mention}! 🚀")')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('colore')
            .setDescription('Colore esadecimale dell\'embed (es. #f47fff o #ff007f)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('titolo')
            .setDescription('Titolo personalizzato dell\'embed di boost')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('descrizione')
            .setDescription('Descrizione dell\'embed (usa {user.mention}, {server.boost_count}, {server.boost_tier})')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('test')
        .setDescription('Invia un embed di prova per testare la grafica del Nitro Boost')
        .addChannelOption(opt =>
          opt
            .setName('canale')
            .setDescription('Canale dove inviare il test (default: canale configurato o attuale)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Visualizza le statistiche attuali dei Boost Nitro del server e la configurazione')
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Questo comando può essere eseguito solo all\'interno di un server.', ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'status') {
      const config = DatabaseHelper.getBoostConfig(interaction.guild.id);
      const boostCount = interaction.guild.premiumSubscriptionCount || 0;
      const boostTier = interaction.guild.premiumTier || 0;

      const embed = new EmbedBuilder()
        .setColor(config.embed?.color || '#f47fff')
        .setTitle(`🚀 Stato Nitro Boost • ${interaction.guild.name}`)
        .setDescription(`Panoramica dello stato di potenziamento del server e del modulo annunci Sentry.`)
        .addFields(
          { name: '✨ Conteggio Boost', value: `\`${boostCount}\` Boost attivi`, inline: true },
          { name: '🏆 Livello Server', value: `\`Livello ${boostTier}\``, inline: true },
          { name: '🚦 Modulo Attivo', value: config.enabled ? '✅ **Abilitato**' : '❌ **Disabilitato**', inline: true },
          { name: '📢 Canale Annunci', value: config.channel_id ? `<#${config.channel_id}>` : (interaction.guild.systemChannelId ? `<#${interaction.guild.systemChannelId}> *(Canale di Sistema)*` : '`Non configurato`'), inline: true },
          { name: '💬 Testo Menzione', value: config.message ? `\`${config.message}\`` : '`Nessuno`', inline: true },
          { name: '🎨 Colore Embed', value: `\`${config.embed?.color || '#f47fff'}\``, inline: true }
        )
        .setFooter({ text: `${interaction.guild.name} • Sentry Boost Manager`, iconURL: interaction.guild.iconURL() })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // Permission check for config & test
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild) &&
        !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: '❌ Non hai i permessi necessari (`Gestisci Server` o `Amministratore`) per gestire i messaggi di Boost.',
        ephemeral: true
      });
    }

    if (subcommand === 'config') {
      const channel = interaction.options.getChannel('canale');
      const active = interaction.options.getBoolean('attivo');
      const message = interaction.options.getString('messaggio');
      const color = interaction.options.getString('colore');
      const title = interaction.options.getString('titolo');
      const description = interaction.options.getString('descrizione');

      const current = DatabaseHelper.getBoostConfig(interaction.guild.id);
      const updates = {};

      if (channel) updates.channel_id = channel.id;
      if (active !== null) updates.enabled = active;
      if (message !== null) updates.message = message;

      const newEmbed = { ...(current.embed || {}) };
      let embedUpdated = false;

      if (color) {
        let cleanColor = color.trim();
        if (!cleanColor.startsWith('#')) cleanColor = '#' + cleanColor;
        newEmbed.color = cleanColor;
        embedUpdated = true;
      }
      if (title) {
        newEmbed.title = title;
        embedUpdated = true;
      }
      if (description) {
        newEmbed.description = description;
        embedUpdated = true;
      }

      if (embedUpdated) {
        updates.embed = newEmbed;
      }

      if (Object.keys(updates).length === 0) {
        return interaction.reply({
          content: '⚠️ Specifica almeno un parametro da modificare (`canale`, `attivo`, `messaggio`, `colore`, `titolo` o `descrizione`).',
          ephemeral: true
        });
      }

      const updated = DatabaseHelper.updateBoostConfig(interaction.guild.id, updates);

      const embed = new EmbedBuilder()
        .setColor(updated.embed?.color || '#f47fff')
        .setTitle('✅ Configurazione Boost Nitro Aggiornata')
        .setDescription('Le impostazioni per gli annunci di potenziamento Nitro sono state salvate con successo!')
        .addFields(
          { name: 'Stato', value: updated.enabled ? '🟢 **Abilitato**' : '🔴 **Disabilitato**', inline: true },
          { name: 'Canale', value: updated.channel_id ? `<#${updated.channel_id}>` : '`Non impostato`', inline: true },
          { name: 'Messaggio Menzione', value: updated.message ? `\`${updated.message}\`` : '`Default`', inline: false }
        )
        .setFooter({ text: 'Usa "/boost test" per inviare un\'anteprima reale nel canale!' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'test') {
      await interaction.deferReply({ ephemeral: true });

      const targetChan = interaction.options.getChannel('canale') ||
        interaction.guild.channels.cache.get(DatabaseHelper.getBoostConfig(interaction.guild.id).channel_id) ||
        interaction.channel;

      try {
        await BoostManager.sendTestBoost(interaction.guild, targetChan.id, interaction.member);
        return interaction.editReply({
          content: `✅ Embed di prova inviato con successo nel canale <#${targetChan.id}>!`
        });
      } catch (err) {
        return interaction.editReply({
          content: `❌ Errore durante l'invio del messaggio di prova: ${err.message}`
        });
      }
    }
  }
};

import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType
} from 'discord.js';
import { SetupShowcaseManager } from '../../modules/setupShowcaseManager.js';
import { DatabaseHelper } from '../../../database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setupshowcase')
    .setDescription('Gestione dell\'evento Showcase Postazioni & Setup')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName('config')
        .setDescription('Configura il canale e le impostazioni del modulo postazioni')
        .addChannelOption(opt =>
          opt
            .setName('canale')
            .setDescription('Canale dedicato in cui gli utenti inviano le foto dei loro setup')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt
            .setName('attivo')
            .setDescription('Abilita o disabilita il modulo showcase postazioni')
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt
            .setName('auto_thread')
            .setDescription('Crea automaticamente un thread di discussione sotto ogni setup inviato')
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt
            .setName('cancella_non_foto')
            .setDescription('Elimina automaticamente i messaggi di testo senza foto per tenere il canale pulito')
            .setRequired(false)
        )
        .addRoleOption(opt =>
          opt
            .setName('ruolo_premio')
            .setDescription('Ruolo premio da assegnare a chi condivide la propria postazione')
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt
            .setName('xp_bonus')
            .setDescription('Punti XP bonus assegnati a chi condivide il setup')
            .setMinValue(0)
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('titolo')
            .setDescription('Titolo dell\'embed (es. 🖥️ Setup & Postazione)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('colore')
            .setDescription('Colore HEX dell\'embed (es. #dc2626)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('panel')
        .setDescription('Invia il pannello guida/regole con spiegazione su come partecipare')
        .addChannelOption(opt =>
          opt
            .setName('canale')
            .setDescription('Canale in cui inviare il pannello')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('titolo')
            .setDescription('Titolo personalizzato per il pannello')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('descrizione')
            .setDescription('Descrizione personalizzata')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('immagine')
            .setDescription('URL del banner o immagine del pannello')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('convert')
        .setDescription('Scansiona e converte i messaggi e foto già presenti nel canale in Embed ufficiali')
        .addChannelOption(opt =>
          opt
            .setName('canale')
            .setDescription('Canale da scansionare (default: canale configurato per i setup)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt
            .setName('limite')
            .setDescription('Numero massimo di messaggi da esaminare (default: 50, max: 100)')
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('info')
        .setDescription('Mostra la configurazione e le statistiche dello Showcase Postazioni')
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('Mostra gli ultimi setup condivisi nel server')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const config = DatabaseHelper.getSetupShowcaseConfig(interaction.guild.id);

    // 1. CONFIG SUBCOMMAND
    if (subcommand === 'config') {
      const channel = interaction.options.getChannel('canale');
      const enabled = interaction.options.getBoolean('attivo');
      const autoThread = interaction.options.getBoolean('auto_thread');
      const deleteInvalid = interaction.options.getBoolean('cancella_non_foto');
      const rewardRole = interaction.options.getRole('ruolo_premio');
      const xpBonus = interaction.options.getInteger('xp_bonus');
      const title = interaction.options.getString('titolo');
      const color = interaction.options.getString('colore');

      const updates = { ...config };
      if (channel) updates.channel_id = channel.id;
      if (enabled !== null) updates.enabled = enabled;
      if (autoThread !== null) updates.auto_thread = autoThread;
      if (deleteInvalid !== null) updates.delete_invalid = deleteInvalid;
      if (rewardRole) updates.reward_role_id = rewardRole.id;
      if (xpBonus !== null) updates.xp_reward = xpBonus;
      if (title) updates.title = title;
      if (color) updates.color = color;

      const newConfig = DatabaseHelper.updateSetupShowcaseConfig(interaction.guild.id, updates);

      const embed = new EmbedBuilder()
        .setColor(newConfig.color || '#dc2626')
        .setTitle('⚙️ Configurazione Showcase Postazioni Aggiornata')
        .setDescription('Le impostazioni del modulo postazioni sono state salvate con successo!')
        .addFields(
          { name: 'Stato Modulo', value: newConfig.enabled ? '✅ Attivo' : '❌ Disattivato', inline: true },
          { name: 'Canale Dedicato', value: newConfig.channel_id ? `<#${newConfig.channel_id}>` : '*Non impostato*', inline: true },
          { name: 'Auto-Thread Discussione', value: newConfig.auto_thread ? '✅ Attivo' : '❌ Disattivato', inline: true },
          { name: 'Elimina Non-Foto', value: newConfig.delete_invalid ? '✅ Attivo' : '❌ Disattivato', inline: true },
          { name: 'Ruolo Premio', value: newConfig.reward_role_id ? `<@&${newConfig.reward_role_id}>` : '*Nessuno*', inline: true },
          { name: 'XP Premio', value: `+${newConfig.xp_reward || 50} XP`, inline: true }
        )
        .setFooter({ text: 'Sentry • Setup Showcase', iconURL: interaction.guild.iconURL() })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // 2. PANEL SUBCOMMAND
    if (subcommand === 'panel') {
      const targetChannel = interaction.options.getChannel('canale') || interaction.channel;
      const customTitle = interaction.options.getString('titolo');
      const customDesc = interaction.options.getString('descrizione');
      const customImage = interaction.options.getString('immagine');

      try {
        await SetupShowcaseManager.sendShowcaseInfoPanel(interaction.guild, targetChannel.id, {
          title: customTitle,
          description: customDesc,
          image: customImage
        });

        return interaction.reply({
          content: `✅ Pannello guida per i setup inviato con successo in <#${targetChannel.id}>!`,
          ephemeral: true
        });
      } catch (err) {
        return interaction.reply({
          content: `❌ Errore durante l'invio del pannello: ${err.message}`,
          ephemeral: true
        });
      }
    }

    // 3. CONVERT SUBCOMMAND
    if (subcommand === 'convert') {
      const targetChannel = interaction.options.getChannel('canale') || (config.channel_id ? interaction.guild.channels.cache.get(config.channel_id) : null) || interaction.channel;
      const limit = interaction.options.getInteger('limite') || 50;

      if (!targetChannel) {
        return interaction.reply({
          content: '❌ Nessun canale valido selezionato o configurato per i setup.',
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        const result = await SetupShowcaseManager.convertChannelMessages(interaction.guild, targetChannel.id, limit);

        const embed = new EmbedBuilder()
          .setColor(config.color || '#dc2626')
          .setTitle('🔄 Scansione & Conversione Setup Completata!')
          .setDescription(`I messaggi presenti nel canale <#${targetChannel.id}> sono stati analizzati e convertiti con successo!`)
          .addFields(
            { name: '✨ Embed Convertiti', value: `**${result.convertedCount}** setup`, inline: true },
            { name: '🗑️ Messaggi Non Validi Rimossi', value: `**${result.deletedCount}** messaggi`, inline: true },
            { name: '📊 Totale Esaminati', value: `**${result.totalProcessed}** messaggi`, inline: true }
          )
          .setFooter({ text: 'Sentry • Setup Showcase Retroattivo', iconURL: interaction.guild.iconURL() })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      } catch (err) {
        return interaction.editReply({
          content: `❌ Errore durante la conversione dei messaggi: ${err.message}`
        });
      }
    }

    // 4. INFO SUBCOMMAND
    if (subcommand === 'info') {
      const submissions = DatabaseHelper.getSetupSubmissions(interaction.guild.id, 100);

      const embed = new EmbedBuilder()
        .setColor(config.color || '#dc2626')
        .setTitle('🖥️ Stato & Statistiche Showcase Postazioni')
        .setDescription('Panoramica del modulo di condivisione postazioni di questo server.')
        .addFields(
          { name: 'Stato Modulo', value: config.enabled ? '🟢 Attivo' : '🔴 Disattivato', inline: true },
          { name: 'Canale Dedicato', value: config.channel_id ? `<#${config.channel_id}>` : '*Nessun canale configurato*', inline: true },
          { name: 'Postazioni Condivise', value: `**${submissions.length}** postazioni`, inline: true },
          { name: 'Auto-Thread Discussione', value: config.auto_thread ? '✅ Sì' : '❌ No', inline: true },
          { name: 'Ruolo Ricompensa', value: config.reward_role_id ? `<@&${config.reward_role_id}>` : '*Nessuno*', inline: true },
          { name: 'XP Ricompensa', value: `+${config.xp_reward} XP`, inline: true }
        )
        .setFooter({ text: 'Sentry • Setup Showcase', iconURL: interaction.guild.iconURL() })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // 4. LIST SUBCOMMAND
    if (subcommand === 'list') {
      const submissions = DatabaseHelper.getSetupSubmissions(interaction.guild.id, 5);

      if (!submissions || submissions.length === 0) {
        return interaction.reply({
          content: 'ℹ️ Nessuna postazione è stata ancora condivisa in questo server.',
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setColor(config.color || '#dc2626')
        .setTitle('🖥️ Ultime Postazioni Condivise')
        .setDescription(
          submissions.map((s, idx) => {
            const timeStr = `<t:${s.timestamp}:R>`;
            const descPreview = s.description ? (s.description.length > 60 ? s.description.substring(0, 57) + '...' : s.description) : '*Nessuna descrizione*';
            return `**${idx + 1}.** <@${s.user_id}> (${timeStr})\n> ${descPreview}\n> [Guarda Foto](${s.image_url})`;
          }).join('\n\n')
        )
        .setFooter({ text: 'Sentry • Setup Showcase', iconURL: interaction.guild.iconURL() })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  }
};

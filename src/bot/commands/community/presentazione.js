import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType
} from 'discord.js';
import { PresentationManager } from '../../modules/presentationManager.js';
import { DatabaseHelper } from '../../../database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('presentazione')
    .setDescription('Comandi per il sistema di Presentazioni della Community')
    .addSubcommand(sub =>
      sub
        .setName('form')
        .setDescription('Apre il form modale a schermo per presentarti al server')
    )
    .addSubcommand(sub =>
      sub
        .setName('panel')
        .setDescription('Invia il pannello informativo con pulsante per aprire il form presentazioni')
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
        .setName('config')
        .setDescription('Configura il canale e i premi per le presentazioni')
        .addChannelOption(opt =>
          opt
            .setName('canale')
            .setDescription('Canale dedicato in cui pubblicare le presentazioni')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addRoleOption(opt =>
          opt
            .setName('ruolo_premio')
            .setDescription('Ruolo da assegnare a chi si presenta (es. Membro Ufficiale)')
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt
            .setName('xp_bonus')
            .setDescription('Punti XP bonus assegnati al completamento')
            .setMinValue(0)
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt
            .setName('attivo')
            .setDescription('Abilita o disabilita il modulo presentazioni')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('Mostra le ultime presentazioni registrate')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand(false) || 'form';

    const config = DatabaseHelper.getPresentationConfig(interaction.guild.id);

    // 1. OPEN FORM MODAL
    if (subcommand === 'form') {
      if (!config.enabled) {
        return interaction.reply({
          content: '❌ Il modulo presentazioni è attualmente disattivato su questo server.',
          ephemeral: true
        });
      }
      const modal = PresentationManager.createPresentationModal();
      return interaction.showModal(modal);
    }

    // 2. SEND PANEL
    if (subcommand === 'panel') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild) &&
          !interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return interaction.reply({
          content: '❌ Non hai i permessi per inviare il pannello presentazioni.',
          ephemeral: true
        });
      }

      const targetChannel = interaction.options.getChannel('canale') || interaction.channel;
      const title = interaction.options.getString('titolo') || '📜 Benvenuto nella Sala delle Presentazioni';
      const description = interaction.options.getString('descrizione') || null;
      const image = interaction.options.getString('immagine') || null;

      try {
        await PresentationManager.sendPresentationPanel(
          interaction.guild,
          targetChannel.id,
          title,
          description,
          '#6366f1',
          image
        );
        return interaction.reply({
          content: `✅ Pannello presentazioni inviato con successo nel canale ${targetChannel}!`,
          ephemeral: true
        });
      } catch (err) {
        return interaction.reply({
          content: `❌ Errore durante l'invio del pannello: ${err.message}`,
          ephemeral: true
        });
      }
    }

    // 3. CONFIGURATION
    if (subcommand === 'config') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
          !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return interaction.reply({
          content: '❌ Solo gli amministratori possono configurare il modulo presentazioni.',
          ephemeral: true
        });
      }

      const channel = interaction.options.getChannel('canale');
      const role = interaction.options.getRole('ruolo_premio');
      const xp = interaction.options.getInteger('xp_bonus');
      const enabled = interaction.options.getBoolean('attivo');

      const current = DatabaseHelper.getPresentationConfig(interaction.guild.id);
      const updated = {
        channel_id: channel ? channel.id : current.channel_id,
        reward_role_id: role ? role.id : current.reward_role_id,
        xp_reward: xp !== null ? xp : current.xp_reward,
        enabled: enabled !== null ? (enabled ? 1 : 0) : current.enabled
      };

      DatabaseHelper.savePresentationConfig(interaction.guild.id, updated);

      const embed = new EmbedBuilder()
        .setColor('#6366f1')
        .setTitle('⚙️ Configurazione Presentazioni Aggiornata')
        .addFields(
          { name: 'Stato Modulo', value: updated.enabled ? '🟢 Attivo' : '🔴 Disattivato', inline: true },
          { name: 'Canale Dedicato', value: updated.channel_id ? `<#${updated.channel_id}>` : '`Non impostato`', inline: true },
          { name: 'Ruolo Ricompensa', value: updated.reward_role_id ? `<@&${updated.reward_role_id}>` : '`Nessuno`', inline: true },
          { name: 'Bonus XP', value: `\`+${updated.xp_reward || 100} XP\``, inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 4. LIST PRESENTATIONS
    if (subcommand === 'list') {
      const list = DatabaseHelper.getPresentations(interaction.guild.id, 10);
      if (list.length === 0) {
        return interaction.reply({ content: 'ℹ️ Nessuna presentazione registrata finora su questo server.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor('#6366f1')
        .setTitle(`📜 Ultime Presentazioni | ${interaction.guild.name}`)
        .setDescription(
          list.map((p, idx) => {
            const dateStr = new Date(p.timestamp * 1000).toLocaleDateString('it-IT');
            return `**#${idx + 1}** <@${p.user_id}> (${p.name || 'Senza Nome'}) • *${dateStr}*\n> 🎭 ${p.hobbies?.slice(0, 80) || 'N/A'}`;
          }).join('\n\n')
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};
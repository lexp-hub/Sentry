import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType
} from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';
import { WelcomerManager } from '../../modules/welcomerManager.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('welcomer')
    .setDescription('Configura e testa il sistema di benvenuto e addio')
    .addSubcommand(sub =>
      sub
        .setName('config')
        .setDescription('Configura i canali e messaggi di benvenuto')
        .addChannelOption(opt =>
          opt
            .setName('canale_benvenuto')
            .setDescription('Canale dove inviare i saluti di benvenuto')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt
            .setName('attiva_benvenuto')
            .setDescription('Abilita o disabilita il messaggio di benvenuto')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('messaggio_benvenuto')
            .setDescription('Testo di benvenuto (usa {user.mention}, {server.name}, {memberCount})')
            .setRequired(false)
        )
        .addChannelOption(opt =>
          opt
            .setName('canale_addio')
            .setDescription('Canale dove inviare i messaggi di addio')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt
            .setName('attiva_addio')
            .setDescription('Abilita o disabilita il messaggio di addio')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('autorole')
        .setDescription('Imposta il ruolo automatico per i nuovi membri')
        .addRoleOption(opt =>
          opt
            .setName('ruolo_utenti')
            .setDescription('Ruolo da assegnare automaticamente agli utenti')
            .setRequired(false)
        )
        .addRoleOption(opt =>
          opt
            .setName('ruolo_bot')
            .setDescription('Ruolo da assegnare automaticamente ai bot')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('test')
        .setDescription('Invia un messaggio di benvenuto di simulazione')
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild) &&
        !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: '❌ Non hai i permessi per configurare il modulo Welcomer (`Gestisci Server`).',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'config') {
      const welcomeChan = interaction.options.getChannel('canale_benvenuto');
      const welcomeActive = interaction.options.getBoolean('attiva_benvenuto');
      const welcomeMsg = interaction.options.getString('messaggio_benvenuto');
      const leaveChan = interaction.options.getChannel('canale_addio');
      const leaveActive = interaction.options.getBoolean('attiva_addio');

      const updates = {};
      if (welcomeChan) updates.welcome_channel_id = welcomeChan.id;
      if (welcomeActive !== null) updates.welcome_enabled = welcomeActive;
      if (welcomeMsg) updates.welcome_message = welcomeMsg;
      if (leaveChan) updates.leave_channel_id = leaveChan.id;
      if (leaveActive !== null) updates.leave_enabled = leaveActive;

      const newConfig = DatabaseHelper.updateWelcomerConfig(interaction.guild.id, updates);

      const embed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_COLOR)
        .setTitle('⚙️ Configurazione Welcomer Aggiornata')
        .addFields(
          { name: 'Benvenuto', value: newConfig.welcome_enabled ? '🟢 `Attivo`' : '🔴 `Disattivato`', inline: true },
          { name: 'Canale Benvenuto', value: newConfig.welcome_channel_id ? `<#${newConfig.welcome_channel_id}>` : '`Non impostato`', inline: true },
          { name: 'Addio', value: newConfig.leave_enabled ? '🟢 `Attivo`' : '🔴 `Disattivato`', inline: true },
          { name: 'Canale Addio', value: newConfig.leave_channel_id ? `<#${newConfig.leave_channel_id}>` : '`Non impostato`', inline: true }
        )
        .setFooter({ text: 'Personalizza grafica e card dalla Dashboard Web!' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === 'autorole') {
      const userRole = interaction.options.getRole('ruolo_utenti');
      const botRole = interaction.options.getRole('ruolo_bot');

      const updates = {};
      if (userRole) updates.auto_role_user = userRole.id;
      if (botRole) updates.auto_role_bot = botRole.id;

      DatabaseHelper.updateWelcomerConfig(interaction.guild.id, updates);

      const embed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_SUCCESS_COLOR)
        .setTitle('🎭 Auto-Role Aggiornato')
        .setDescription('I ruoli automatici all\'ingresso sono stati configurati:')
        .addFields(
          { name: '👤 Ruolo Utenti', value: userRole ? `${userRole}` : '`Invariato`', inline: true },
          { name: '🤖 Ruolo Bot', value: botRole ? `${botRole}` : '`Invariato`', inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === 'test') {
      const member = interaction.member;
      const config = DatabaseHelper.getWelcomerConfig(interaction.guild.id);
      const messageText = WelcomerManager.formatText(config.welcome_message || 'Benvenuto {user.mention}!', member);

      const testEmbed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_COLOR)
        .setTitle('🎉 [SIMULAZIONE] Benvenuto!')
        .setDescription(messageText)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setFooter({ text: `Membro #${interaction.guild.memberCount}`, iconURL: interaction.guild.iconURL() })
        .setTimestamp();

      await interaction.reply({ content: '🧪 **Invio test messaggio di benvenuto:**', embeds: [testEmbed] });
    }
  }
};

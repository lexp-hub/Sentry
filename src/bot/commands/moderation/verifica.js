import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder
} from 'discord.js';
import { VerificationManager } from '../../modules/verificationManager.js';
import { DatabaseHelper } from '../../../database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('verifica')
    .setDescription('Gestione del sistema di verifica con Captcha visivo anti-bot')
    .addSubcommand(sub =>
      sub
        .setName('avvia')
        .setDescription('Avvia la tua verifica personale con Captcha')
    )
    .addSubcommand(sub =>
      sub
        .setName('setup')
        .setDescription('Configura il sistema di verifica e invia il pannello pubblico')
        .addRoleOption(opt =>
          opt
            .setName('ruolo_verificato')
            .setDescription('Ruolo da assegnare all utente una volta completato il Captcha')
            .setRequired(true)
        )
        .addChannelOption(opt =>
          opt
            .setName('canale_pannello')
            .setDescription('Canale in cui inviare il pannello di verifica con pulsante')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addRoleOption(opt =>
          opt
            .setName('ruolo_non_verificato')
            .setDescription('Ruolo opzionale da rimuovere una volta verificato (es. Non Verificato)')
            .setRequired(false)
        )
        .addChannelOption(opt =>
          opt
            .setName('canale_log')
            .setDescription('Canale in cui registrare i log delle verifiche riuscite')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('pannello')
        .setDescription('Invia o reinvia il pannello di verifica nel canale specificato')
        .addChannelOption(opt =>
          opt
            .setName('canale')
            .setDescription('Canale dove pubblicare il pannello')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('config')
        .setDescription('Mostra la configurazione attuale del sistema di verifica')
    )
    .addSubcommand(sub =>
      sub
        .setName('reset')
        .setDescription('Resetta lo stato di verifica di un utente rimuovendogli il ruolo verificato')
        .addUserOption(opt =>
          opt
            .setName('utente')
            .setDescription('Utente da resettare')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const { guild, member, options } = interaction;
    const subcommand = options.getSubcommand();

    // 1. User verification trigger (/verifica avvia)
    if (subcommand === 'avvia') {
      return VerificationManager.startVerification(interaction);
    }

    // Permission check for admin/mod commands
    const isAdminOrMod = member.permissions.has(PermissionFlagsBits.Administrator) ||
                         member.permissions.has(PermissionFlagsBits.ManageGuild);
    if (!isAdminOrMod) {
      return interaction.reply({
        content: '⚠️ Devi avere il permesso di **Amministratore** o **Gestire Server** per configurare la verifica.',
        ephemeral: true
      });
    }

    // 2. Setup verification
    if (subcommand === 'setup') {
      const verifiedRole = options.getRole('ruolo_verificato');
      const panelChannel = options.getChannel('canale_pannello');
      const unverifiedRole = options.getRole('ruolo_non_verificato');
      const logChannel = options.getChannel('canale_log');

      await interaction.deferReply({ ephemeral: true });

      const updated = DatabaseHelper.setVerificationConfig(guild.id, {
        enabled: 1,
        verified_role_id: verifiedRole.id,
        unverified_role_id: unverifiedRole ? unverifiedRole.id : null,
        panel_channel_id: panelChannel.id,
        log_channel_id: logChannel ? logChannel.id : null
      });

      // Send public panel to the panel channel
      const payload = VerificationManager.buildPanelPayload(updated);
      await panelChannel.send(payload);

      return interaction.editReply({
        content: `✅ **Sistema di verifica con Captcha configurato con successo!**\n\n` +
                 `> 🏷️ **Ruolo Assegnato:** <@&${verifiedRole.id}>\n` +
                 (unverifiedRole ? `> ❌ **Ruolo Rimosso:** <@&${unverifiedRole.id}>\n` : '') +
                 `> 📢 **Pannello Pubblicato:** <#${panelChannel.id}>\n` +
                 (logChannel ? `> 📜 **Canale Log:** <#${logChannel.id}>\n` : '') +
                 `\nIl pannello con il pulsante interattivo **"🔐 Verifica con Captcha"** è ora attivo in <#${panelChannel.id}>!`
      });
    }

    // 3. Send panel only
    if (subcommand === 'pannello') {
      const config = DatabaseHelper.getVerificationConfig(guild.id);
      if (!config.verified_role_id) {
        return interaction.reply({
          content: '⚠️ Configura prima il sistema di verifica con `/verifica setup`!',
          ephemeral: true
        });
      }

      const targetChannel = options.getChannel('canale') || interaction.channel;
      const payload = VerificationManager.buildPanelPayload(config);
      await targetChannel.send(payload);

      return interaction.reply({
        content: `✅ **Pannello di verifica inviato con successo in <#${targetChannel.id}>!**`,
        ephemeral: true
      });
    }

    // 4. Show config
    if (subcommand === 'config') {
      const config = DatabaseHelper.getVerificationConfig(guild.id);
      const embed = new EmbedBuilder()
        .setColor('#dc2626')
        .setTitle('🛡️ Configurazione Sistema di Verifica Captcha')
        .addFields(
          { name: 'Stato Modulo', value: config.enabled ? '🟢 Abilitato' : '🔴 Disabilitato', inline: true },
          { name: 'Ruolo Verificato', value: config.verified_role_id ? `<@&${config.verified_role_id}>` : '*Non impostato*', inline: true },
          { name: 'Ruolo Non Verificato', value: config.unverified_role_id ? `<@&${config.unverified_role_id}>` : '*Nessuno*', inline: true },
          { name: 'Canale Pannello', value: config.panel_channel_id ? `<#${config.panel_channel_id}>` : '*Nessuno*', inline: true },
          { name: 'Canale Audit Log', value: config.log_channel_id ? `<#${config.log_channel_id}>` : '*Nessuno*', inline: true }
        )
        .setFooter({ text: 'Sentry Captcha Verification • /verifica setup' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 5. Reset user verification
    if (subcommand === 'reset') {
      const targetUser = options.getUser('utente');
      const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember) {
        return interaction.reply({ content: '❌ Utente non trovato nel server.', ephemeral: true });
      }

      const config = DatabaseHelper.getVerificationConfig(guild.id);
      if (config.verified_role_id && targetMember.roles.cache.has(config.verified_role_id)) {
        await targetMember.roles.remove(config.verified_role_id).catch(() => {});
      }
      if (config.unverified_role_id) {
        await targetMember.roles.add(config.unverified_role_id).catch(() => {});
      }

      return interaction.reply({
        content: `🔄 **Stato di verifica resettato per <@${targetMember.id}>!** L'utente dovrà completare nuovamente il Captcha per accedere al server.`,
        ephemeral: true
      });
    }
  }
};

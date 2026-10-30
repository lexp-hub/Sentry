import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  PermissionFlagsBits
} from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';
import { AutoroleManager } from '../../modules/autoroleManager.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Modulo dedicato per l\'assegnazione automatica dei ruoli a nuovi membri e bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Visualizza la configurazione attuale e la diagnostica di permessi e gerarchia')
    )
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Imposta i ruoli automatici per utenti e bot')
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
        .addBooleanOption(opt =>
          opt
            .setName('attivo')
            .setDescription('Abilita o disabilita l\'assegnazione automatica')
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt
            .setName('ritardo_secondi')
            .setDescription('Secondi di ritardo prima di assegnare il ruolo (0-300)')
            .setMinValue(0)
            .setMaxValue(300)
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt
            .setName('attendi_regole')
            .setDescription('Attendi il completamento della schermata delle regole (Membership Screening)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Rimuove un ruolo automatico configurato o disabilita il modulo')
        .addStringOption(opt =>
          opt
            .setName('tipo')
            .setDescription('Seleziona quale impostazione rimuovere')
            .setRequired(true)
            .addChoices(
              { name: 'Ruolo Utenti', value: 'user' },
              { name: 'Ruolo Bot', value: 'bot' },
              { name: 'Tutti i ruoli e disabilita', value: 'all' }
            )
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('test')
        .setDescription('Testa i permessi e la gerarchia del bot sul ruolo utenti configurato')
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild) &&
        !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: '❌ Non hai i permessi sufficienti per configurare l\'Auto-Role (`Gestisci Server`).',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (subcommand === 'status') {
      const diag = await AutoroleManager.diagnose(guild);
      const config = diag.config;

      const userRole = config.user_role_id ? guild.roles.cache.get(config.user_role_id) || `<@&${config.user_role_id}>` : '`Non configurato`';
      const botRole = config.bot_role_id ? guild.roles.cache.get(config.bot_role_id) || `<@&${config.bot_role_id}>` : '`Non configurato`';

      const embed = new EmbedBuilder()
        .setColor(config.enabled ? (CONFIG.EMBED_SUCCESS_COLOR || '#22c55e') : '#ef4444')
        .setTitle('🎭 Stato Modulo Auto-Role')
        .setDescription('Configurazione attuale per l\'assegnazione automatica dei ruoli all\'ingresso nel server:')
        .addFields(
          { name: 'Stato Modulo', value: config.enabled ? '🟢 `Attivo`' : '🔴 `Disattivato`', inline: true },
          { name: 'Attesa Regole (Screening)', value: config.wait_for_screening ? '🟢 `Sì`' : '⚪ `No`', inline: true },
          { name: 'Ritardo Assegnazione', value: config.delay_seconds > 0 ? `⏱️ \`${config.delay_seconds}s\`` : '⚡ `Istantaneo`', inline: true },
          { name: '👤 Ruolo Utenti', value: typeof userRole === 'string' ? userRole : `${userRole}`, inline: true },
          { name: '🤖 Ruolo Bot', value: typeof botRole === 'string' ? botRole : `${botRole}`, inline: true },
          { name: '🛡️ Permesso Bot (Manage Roles)', value: diag.botHasManageRoles ? '🟢 `Presente`' : '🔴 `MANCANTE` (Assegna permessi al bot!)', inline: true }
        );

      // Warning gerarchia utenti
      if (diag.userRoleCheck && !diag.userRoleCheck.valid) {
        embed.addFields({
          name: '⚠️ Avviso Ruolo Utenti',
          value: `🔴 ${diag.userRoleCheck.error}`
        });
      }

      // Warning gerarchia bot
      if (diag.botRoleCheck && !diag.botRoleCheck.valid) {
        embed.addFields({
          name: '⚠️ Avviso Ruolo Bot',
          value: `🔴 ${diag.botRoleCheck.error}`
        });
      }

      embed.setFooter({ text: 'Sentry Bot • Modulo Auto-Role Indipendente' }).setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'set') {
      const userRole = interaction.options.getRole('ruolo_utenti');
      const botRole = interaction.options.getRole('ruolo_bot');
      const attivo = interaction.options.getBoolean('attivo');
      const ritardo = interaction.options.getInteger('ritardo_secondi');
      const attendiRegole = interaction.options.getBoolean('attendi_regole');

      const updates = {};
      if (userRole) updates.user_role_id = userRole.id;
      if (botRole) updates.bot_role_id = botRole.id;
      if (attivo !== null) updates.enabled = attivo;
      if (ritardo !== null) updates.delay_seconds = ritardo;
      if (attendiRegole !== null) updates.wait_for_screening = attendiRegole;

      const newConfig = DatabaseHelper.updateAutoroleConfig(guild.id, updates);

      // Esegui controllo validità immediato sui ruoli impostati
      const warnings = [];
      if (userRole) {
        const check = await AutoroleManager.validateRole(guild, userRole.id);
        if (!check.valid) {
          warnings.push(`⚠️ **Attenzione Ruolo Utenti:** ${check.error}`);
        }
      }
      if (botRole) {
        const check = await AutoroleManager.validateRole(guild, botRole.id);
        if (!check.valid) {
          warnings.push(`⚠️ **Attenzione Ruolo Bot:** ${check.error}`);
        }
      }

      const embed = new EmbedBuilder()
        .setColor(warnings.length > 0 ? '#f59e0b' : (CONFIG.EMBED_SUCCESS_COLOR || '#22c55e'))
        .setTitle('✅ Modulo Auto-Role Aggiornato')
        .setDescription(warnings.length > 0 ? warnings.join('\n\n') : 'Le impostazioni sono state salvate con successo.')
        .addFields(
          { name: 'Stato', value: newConfig.enabled ? '🟢 `Attivo`' : '🔴 `Disattivato`', inline: true },
          { name: 'Ritardo', value: `\`${newConfig.delay_seconds}s\``, inline: true },
          { name: 'Attesa Regole', value: newConfig.wait_for_screening ? '🟢 `Abilitata`' : '⚪ `Disabilitata`', inline: true },
          { name: '👤 Ruolo Utenti', value: newConfig.user_role_id ? `<@&${newConfig.user_role_id}>` : '`Non impostato`', inline: true },
          { name: '🤖 Ruolo Bot', value: newConfig.bot_role_id ? `<@&${newConfig.bot_role_id}>` : '`Non impostato`', inline: true }
        )
        .setFooter({ text: 'Configurabile anche tramite la Dashboard Web!' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'remove') {
      const tipo = interaction.options.getString('tipo');
      const updates = {};

      if (tipo === 'user') {
        updates.user_role_id = null;
      } else if (tipo === 'bot') {
        updates.bot_role_id = null;
      } else if (tipo === 'all') {
        updates.user_role_id = null;
        updates.bot_role_id = null;
        updates.enabled = false;
      }

      DatabaseHelper.updateAutoroleConfig(guild.id, updates);

      const embed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_COLOR || '#3b82f6')
        .setTitle('🗑️ Auto-Role Aggiornato')
        .setDescription(`Le impostazioni per **${tipo === 'all' ? 'tutti i ruoli' : tipo === 'user' ? 'ruolo utenti' : 'ruolo bot'}** sono state rimosse.`)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'test') {
      const config = DatabaseHelper.getAutoroleConfig(guild.id);
      if (!config.user_role_id) {
        return interaction.reply({
          content: '❌ Nessun ruolo utenti configurato nell\'Auto-Role. Usa prima `/autorole set ruolo_utenti:<ruolo>`.',
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const check = await AutoroleManager.validateRole(guild, config.user_role_id);
      if (!check.valid) {
        const embed = new EmbedBuilder()
          .setColor('#ef4444')
          .setTitle('❌ Test Auto-Role Fallito')
          .setDescription(`Il bot **non può** assegnare il ruolo configurato:\n\n${check.error}`)
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

      const role = check.role;
      const targetMember = interaction.member;

      try {
        const hasAlready = targetMember.roles.cache.has(role.id);
        if (!hasAlready) {
          await targetMember.roles.add(role, 'Test Autorole');
        }

        const embed = new EmbedBuilder()
          .setColor(CONFIG.EMBED_SUCCESS_COLOR || '#22c55e')
          .setTitle('✅ Test Auto-Role Superato!')
          .setDescription(`Il ruolo ${role} è perfettamente configurato e assegnabile dal bot.`)
          .addFields(
            { name: 'Ruolo Testato', value: `${role} (\`${role.id}\`)`, inline: true },
            { name: 'Posizione Ruolo', value: `\`#${role.position}\``, inline: true },
            { name: 'Posizione Ruolo Bot', value: `\`#${guild.members.me.roles.highest.position}\``, inline: true },
            { name: 'Stato Utente', value: hasAlready ? 'Avevi già il ruolo (verificato).' : 'Ruolo aggiunto con successo al tuo profilo!', inline: false }
          )
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      } catch (err) {
        const embed = new EmbedBuilder()
          .setColor('#ef4444')
          .setTitle('❌ Errore durante l\'assegnazione di test')
          .setDescription(`Errore API Discord: \`${err.message}\``)
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }
    }
  }
};


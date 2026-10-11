import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Mette in timeout (muta temporaneamente) un utente')
    .addUserOption(opt => opt.setName('utente').setDescription('L\'utente da mutare').setRequired(true))
    .addStringOption(opt =>
      opt
        .setName('durata')
        .setDescription('Durata del timeout (es. 60s, 5m, 1h, 1d, 7d)')
        .setRequired(true)
    )
    .addStringOption(opt => opt.setName('motivo').setDescription('Motivo del timeout').setRequired(false)),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return interaction.reply({ content: '❌ Non hai il permesso per moderare membri (`Isola Membri`).', ephemeral: true });
    }

    const targetUser = interaction.options.getUser('utente');
    const durationInput = interaction.options.getString('durata');
    const reason = interaction.options.getString('motivo') || 'Nessun motivo specificato';

    const match = durationInput.match(/^(\d+)(s|m|h|d)$/i);
    if (!match) {
      return interaction.reply({ content: '❌ Formato durata non valido. Usa ad esempio: `60s`, `10m`, `2h`, `1d`.', ephemeral: true });
    }

    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    let ms = 0;

    if (unit === 's') ms = amount * 1000;
    else if (unit === 'm') ms = amount * 60 * 1000;
    else if (unit === 'h') ms = amount * 3600 * 1000;
    else if (unit === 'd') ms = amount * 86400 * 1000;

    if (ms > 28 * 86400 * 1000) {
      return interaction.reply({ content: '❌ Il timeout massimo consentito da Discord è di 28 giorni.', ephemeral: true });
    }

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      return interaction.reply({ content: '❌ Utente non trovato nel server.', ephemeral: true });
    }

    if (!targetMember.moderatable) {
      return interaction.reply({ content: '❌ Non ho i permessi per mettere in timeout questo utente.', ephemeral: true });
    }

    await targetMember.timeout(ms, `${reason} (Moderatore: ${interaction.user.tag})`);

    DatabaseHelper.addModerationCase(
      interaction.guild.id,
      targetUser.id,
      interaction.user.id,
      'TIMEOUT',
      reason,
      Math.floor(ms / 1000)
    );

    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_WARN_COLOR)
      .setTitle('⏱️ Utente in Timeout')
      .addFields(
        { name: 'Utente', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
        { name: 'Durata', value: `\`${durationInput}\``, inline: true },
        { name: 'Moderatore', value: `${interaction.user.tag}`, inline: true },
        { name: 'Motivo', value: `\`${reason}\``, inline: false }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

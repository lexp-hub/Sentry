import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Assegna un avvertimento ufficiale ad un utente')
    .addUserOption(opt => opt.setName('utente').setDescription('L\'utente da avvertire').setRequired(true))
    .addStringOption(opt => opt.setName('motivo').setDescription('Il motivo dell\'avvertimento').setRequired(true)),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return interaction.reply({ content: '❌ Non hai il permesso per avvertire membri (`Gestisci Messaggi`).', ephemeral: true });
    }

    const targetUser = interaction.options.getUser('utente');
    const reason = interaction.options.getString('motivo');

    const warnCase = DatabaseHelper.addModerationCase(
      interaction.guild.id,
      targetUser.id,
      interaction.user.id,
      'WARN',
      reason
    );

    const totalWarns = DatabaseHelper.getModerationCases(interaction.guild.id, targetUser.id).filter(c => c.action_type === 'WARN').length;

    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_WARN_COLOR)
        .setTitle(`⚠️ Hai ricevuto un avvertimento in ${interaction.guild.name}`)
        .setDescription(`**Motivo:** ${reason}\n**Moderatore:** ${interaction.user.tag}\n**Avvertimenti totali:** \`${totalWarns}\``)
        .setTimestamp();
      await targetUser.send({ embeds: [dmEmbed] });
    } catch (e) {}

    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_WARN_COLOR)
      .setTitle('⚠️ Avvertimento Assegnato')
      .addFields(
        { name: 'Utente', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
        { name: 'Moderatore', value: `${interaction.user.tag}`, inline: true },
        { name: 'Caso', value: `\`#${warnCase.id}\` (Totale warn: \`${totalWarns}\`)`, inline: true },
        { name: 'Motivo', value: `\`${reason}\``, inline: false }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    const settings = DatabaseHelper.getGuildSettings(interaction.guild.id);
    if (settings.log_channel_id) {
      const logChan = interaction.guild.channels.cache.get(settings.log_channel_id);
      if (logChan && logChan.id !== interaction.channel.id) {
        await logChan.send({ embeds: [embed] }).catch(() => {});
      }
    }
  }
};

import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Banna un utente dal server')
    .addUserOption(opt => opt.setName('utente').setDescription('L\'utente da bannare').setRequired(true))
    .addStringOption(opt => opt.setName('motivo').setDescription('Il motivo del ban').setRequired(false))
    .addIntegerOption(opt =>
      opt
        .setName('cancella_messaggi_giorni')
        .setDescription('Numero di giorni di messaggi da cancellare (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return interaction.reply({ content: '❌ Non hai il permesso per bannare membri (`Banna Membri`).', ephemeral: true });
    }

    const targetUser = interaction.options.getUser('utente');
    const reason = interaction.options.getString('motivo') || 'Nessun motivo specificato';
    const deleteDays = interaction.options.getInteger('cancella_messaggi_giorni') || 0;

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (targetMember) {
      if (!targetMember.bannable) {
        return interaction.reply({ content: '❌ Non posso bannare questo utente. Ha un ruolo superiore o equivalente al mio.', ephemeral: true });
      }
      if (interaction.member.roles.highest.position <= targetMember.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
        return interaction.reply({ content: '❌ Non puoi bannare questo utente perché ha un ruolo superiore o uguale al tuo.', ephemeral: true });
      }
    }

    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_ERROR_COLOR)
        .setTitle(`Sei stato bannato da ${interaction.guild.name}`)
        .setDescription(`**Motivo:** ${reason}\n**Moderatore:** ${interaction.user.tag}`)
        .setTimestamp();
      await targetUser.send({ embeds: [dmEmbed] });
    } catch (e) {}

    await interaction.guild.members.ban(targetUser, {
      deleteMessageSeconds: deleteDays * 86400,
      reason: `${reason} (Moderatore: ${interaction.user.tag})`
    });

    DatabaseHelper.addModerationCase(
      interaction.guild.id,
      targetUser.id,
      interaction.user.id,
      'BAN',
      reason
    );

    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_ERROR_COLOR)
      .setTitle('🔨 Utente Bannato')
      .addFields(
        { name: 'Utente', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
        { name: 'Moderatore', value: `${interaction.user.tag}`, inline: true },
        { name: 'Motivo', value: `\`${reason}\``, inline: false }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

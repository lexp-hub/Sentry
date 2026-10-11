import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Espelle un utente dal server')
    .addUserOption(opt => opt.setName('utente').setDescription('L\'utente da espellere').setRequired(true))
    .addStringOption(opt => opt.setName('motivo').setDescription('Il motivo dell\'espulsione').setRequired(false)),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      return interaction.reply({ content: '❌ Non hai il permesso per espellere membri (`Espelli Membri`).', ephemeral: true });
    }

    const targetUser = interaction.options.getUser('utente');
    const reason = interaction.options.getString('motivo') || 'Nessun motivo specificato';

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      return interaction.reply({ content: '❌ L\'utente specificato non è presente nel server.', ephemeral: true });
    }

    if (!targetMember.kickable) {
      return interaction.reply({ content: '❌ Non posso espellere questo utente.', ephemeral: true });
    }
    if (interaction.member.roles.highest.position <= targetMember.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({ content: '❌ Non puoi espellere un membro con un ruolo pari o superiore al tuo.', ephemeral: true });
    }

    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_WARN_COLOR)
        .setTitle(`Sei stato espulso da ${interaction.guild.name}`)
        .setDescription(`**Motivo:** ${reason}\n**Moderatore:** ${interaction.user.tag}`)
        .setTimestamp();
      await targetUser.send({ embeds: [dmEmbed] });
    } catch (e) {}

    await targetMember.kick(`${reason} (Moderatore: ${interaction.user.tag})`);

    DatabaseHelper.addModerationCase(
      interaction.guild.id,
      targetUser.id,
      interaction.user.id,
      'KICK',
      reason
    );

    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_WARN_COLOR)
      .setTitle('👢 Utente Espulso')
      .addFields(
        { name: 'Utente', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
        { name: 'Moderatore', value: `${interaction.user.tag}`, inline: true },
        { name: 'Motivo', value: `\`${reason}\``, inline: false }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

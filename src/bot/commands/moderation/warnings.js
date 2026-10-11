import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Mostra la cronologia di avvertimenti e sanzioni di un utente')
    .addUserOption(opt => opt.setName('utente').setDescription('L\'utente da controllare').setRequired(true)),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return interaction.reply({ content: '❌ Non hai il permesso per visualizzare la cronologia sanzioni (`Gestisci Messaggi`).', ephemeral: true });
    }

    const targetUser = interaction.options.getUser('utente');
    const cases = DatabaseHelper.getModerationCases(interaction.guild.id, targetUser.id, 10);

    if (cases.length === 0) {
      return interaction.reply({
        content: `✅ L'utente **${targetUser.tag}** non ha alcuna infrazione registrata in questo server!`,
        ephemeral: true
      });
    }

    const caseList = cases.map(c =>
      `• **[#${c.id}] ${c.action_type}** (<t:${c.timestamp}:R>): \`${c.reason}\` (Mod: <@${c.moderator_id}>)`
    ).join('\n');

    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_COLOR)
      .setTitle(`📋 Cronologia Sanzioni | ${targetUser.tag}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setDescription(caseList)
      .setFooter({ text: `Totale sanzioni visualizzate: ${cases.length}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

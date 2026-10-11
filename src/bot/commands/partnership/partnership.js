import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import { PartnershipManager } from '../../modules/partnershipManager.js';
import { DatabaseHelper } from '../../../database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('partnership')
    .setDescription('Registra una nuova partnership aprendo il form interattivo')
    .addUserOption(opt =>
      opt
        .setName('manager')
        .setDescription('Il partner manager o rappresentante del server partner')
        .setRequired(false)
    ),

  async execute(interaction) {
    const config = DatabaseHelper.getPartnershipConfig(interaction.guild.id);
    if (!config.enabled) {
      return interaction.reply({
        content: '❌ Il modulo Partnership è attualmente disattivato su questo server.',
        ephemeral: true
      });
    }

    const member = interaction.member;
    const isOwnerOrAdmin = interaction.guild.ownerId === interaction.user.id ||
      member.permissions.has(PermissionsBitField.Flags.Administrator) ||
      member.permissions.has(PermissionsBitField.Flags.ManageGuild);

    if (config.manager_role_id && !isOwnerOrAdmin) {
      const hasManagerRole = member.roles.cache.has(config.manager_role_id);
      if (!hasManagerRole) {
        return interaction.reply({
          content: `❌ Non possiedi il ruolo autorizzato (<@&${config.manager_role_id}>) per inviare partnership su questo server.`,
          ephemeral: true
        });
      }
    }

    const manager = interaction.options.getUser('manager');
    const modal = PartnershipManager.createPartnershipModal(
      manager ? manager.id : null,
      manager ? (manager.tag || manager.username) : ''
    );
    return interaction.showModal(modal);
  }
};


import partnershipCommand from './partnership.js';
import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('partner')
    .setDescription('Registra una nuova partnership aprendo il form interattivo')
    .addUserOption(opt =>
      opt
        .setName('manager')
        .setDescription('Il partner manager o rappresentante del server partner')
        .setRequired(false)
    ),

  async execute(interaction) {
    return partnershipCommand.execute(interaction);
  }
};

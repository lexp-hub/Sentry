import { SlashCommandBuilder } from 'discord.js';
import { PresentationManager } from '../../modules/presentationManager.js';
import { DatabaseHelper } from '../../../database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('presentati')
    .setDescription('Compila il form modale per presentarti alla community del server'),

  async execute(interaction) {
    const config = DatabaseHelper.getPresentationConfig(interaction.guild.id);
    if (!config.enabled) {
      return interaction.reply({
        content: '❌ Il modulo presentazioni è attualmente disattivato su questo server.',
        ephemeral: true
      });
    }

    const modal = PresentationManager.createPresentationModal();
    return interaction.showModal(modal);
  }
};


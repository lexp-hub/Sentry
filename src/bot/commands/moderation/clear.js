import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Elimina un numero specificato di messaggi dal canale')
    .addIntegerOption(opt =>
      opt
        .setName('quantita')
        .setDescription('Numero di messaggi da eliminare (1-100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .addUserOption(opt =>
      opt
        .setName('utente')
        .setDescription('Filtra solo i messaggi inviati da questo utente')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName('filtro')
        .setDescription('Filtro speciale sui messaggi')
        .addChoices(
          { name: 'Solo Bot', value: 'BOTS' },
          { name: 'Solo Allegati/Immagini', value: 'ATTACHMENTS' },
          { name: 'Solo Embed', value: 'EMBEDS' }
        )
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return interaction.reply({ content: '❌ Non hai il permesso per eliminare messaggi (`Gestisci Messaggi`).', ephemeral: true });
    }

    const amount = interaction.options.getInteger('quantita');
    const targetUser = interaction.options.getUser('utente');
    const filter = interaction.options.getString('filtro');

    await interaction.deferReply({ ephemeral: true });

    try {
      const messages = await interaction.channel.messages.fetch({ limit: amount });
      let filtered = messages;

      if (targetUser) {
        filtered = filtered.filter(m => m.author.id === targetUser.id);
      }

      if (filter === 'BOTS') {
        filtered = filtered.filter(m => m.author.bot);
      } else if (filter === 'ATTACHMENTS') {
        filtered = filtered.filter(m => m.attachments.size > 0);
      } else if (filter === 'EMBEDS') {
        filtered = filtered.filter(m => m.embeds.length > 0);
      }

      const deleted = await interaction.channel.bulkDelete(filtered, true);

      const embed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_SUCCESS_COLOR)
        .setDescription(`🗑️ Eliminati con successo **${deleted.size}** messaggi.`);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply({ content: `❌ Errore durante la cancellazione dei messaggi: ${error.message}` });
    }
  }
};

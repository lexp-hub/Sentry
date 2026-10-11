import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  AttachmentBuilder,
  EmbedBuilder,
  ChannelType
} from 'discord.js';
import { exportChannelsToCSV } from '../../modules/channelExporter.js';

export default {
  data: new SlashCommandBuilder()
    .setName('esporta-canali')
    .setDescription('Esporta tutti i canali e categorie del server in formato CSV (compatibile Excel)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const { guild } = interaction;
    await interaction.deferReply({ ephemeral: true });

    try {
      await guild.channels.fetch();
      const csvContent = exportChannelsToCSV(guild);
      const cleanName = guild.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${cleanName}_canali_${Date.now()}.csv`;

      const attachment = new AttachmentBuilder(Buffer.from(csvContent, 'utf-8'), {
        name: filename,
        description: `Esportazione canali per ${guild.name}`
      });

      const totalChannels = guild.channels.cache.size;
      const categoriesCount = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
      const textCount = guild.channels.cache.filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement).size;
      const voiceCount = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice).size;

      const embed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle('📊 Esportazione Canali & Categorie Completata')
        .setDescription(
          `Il file CSV contenente l'intera struttura dei canali di **${guild.name}** è pronto per il download!\n\n` +
          `> 📁 **Categorie:** \`${categoriesCount}\`\n` +
          `> 💬 **Canali Testuali:** \`${textCount}\`\n` +
          `> 🔊 **Canali Vocali:** \`${voiceCount}\`\n` +
          `> 🔢 **Totale Voci:** \`${totalChannels}\`\n\n` +
          `*Il file include la codifica UTF-8 BOM con delimitatore punto e virgola, ed è direttamente apribile e colonnato in Microsoft Excel, LibreOffice Calc o Google Sheets.*`
        )
        .setFooter({ text: 'Sentry Channel Exporter • /esporta-canali' })
        .setTimestamp();

      return interaction.editReply({
        embeds: [embed],
        files: [attachment]
      });
    } catch (err) {
      console.error('[EsportaCanali] Errore:', err);
      return interaction.editReply({
        content: `❌ Si è verificato un errore durante l'esportazione: \`${err.message}\``
      });
    }
  }
};

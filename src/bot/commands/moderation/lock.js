import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ChannelType } from 'discord.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Blocca la scrittura in un canale testuale')
    .addChannelOption(opt =>
      opt
        .setName('canale')
        .setDescription('Il canale da bloccare (lascia vuoto per quello corrente)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName('motivo')
        .setDescription('Il motivo del blocco')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return interaction.reply({ content: '❌ Non hai il permesso per gestire i canali (`Gestisci Canali`).', ephemeral: true });
    }

    const channel = interaction.options.getChannel('canale') || interaction.channel;
    const reason = interaction.options.getString('motivo') || 'Canale temporaneamente bloccato dallo staff';

    try {
      await channel.permissionOverwrites.edit(interaction.guild.id, {
        SendMessages: false,
        AddReactions: false
      });

      const embed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_ERROR_COLOR)
        .setTitle('🔒 Canale Bloccato')
        .setDescription(`Questo canale è stato bloccato da ${interaction.user}.\n**Motivo:** \`${reason}\``)
        .setTimestamp();

      await channel.send({ embeds: [embed] });
      await interaction.reply({ content: `✅ Canale ${channel} bloccato con successo.`, ephemeral: true });
    } catch (e) {
      await interaction.reply({ content: `❌ Errore durante il blocco: ${e.message}`, ephemeral: true });
    }
  }
};

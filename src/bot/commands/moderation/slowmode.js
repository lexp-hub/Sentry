import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ChannelType } from 'discord.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Imposta il rallentamento (slowmode) nel canale')
    .addIntegerOption(opt =>
      opt
        .setName('secondi')
        .setDescription('Secondi di attesa tra un messaggio e l\'altro (0 per disattivare)')
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true)
    )
    .addChannelOption(opt =>
      opt
        .setName('canale')
        .setDescription('Il canale su cui applicare lo slowmode (lascia vuoto per canale corrente)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return interaction.reply({ content: '❌ Non hai il permesso per gestire i canali (`Gestisci Canali`).', ephemeral: true });
    }

    const seconds = interaction.options.getInteger('secondi');
    const channel = interaction.options.getChannel('canale') || interaction.channel;

    try {
      await channel.setRateLimitPerUser(seconds, `Impostato da ${interaction.user.tag}`);

      const desc = seconds === 0
        ? `🟢 Slowmode disattivata in ${channel}.`
        : `⏱️ Slowmode impostata a **${seconds} secondi** in ${channel}.`;

      const embed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_COLOR)
        .setDescription(desc)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (e) {
      await interaction.reply({ content: `❌ Errore durante l'impostazione dello slowmode: ${e.message}`, ephemeral: true });
    }
  }
};

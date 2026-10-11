import { SlashCommandBuilder } from "discord.js";
import { MusicManager } from "../../modules/musicManager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("Mostra il pannello interattivo del brano in riproduzione"),

  async execute(interaction) {
    const queue = MusicManager.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      return interaction.reply({ content: "❌ Nessun brano in riproduzione in questo momento.", ephemeral: true });
    }

    const embed = queue.buildControllerEmbed();
    const components = queue.buildControllerButtons();

    return interaction.reply({ embeds: [embed], components });
  }
};

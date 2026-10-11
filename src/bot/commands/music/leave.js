import { SlashCommandBuilder } from "discord.js";
import { MusicManager } from "../../modules/musicManager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Disconnette Sentry dal canale vocale"),

  async execute(interaction) {
    const queue = MusicManager.getQueue(interaction.guild.id);
    if (!queue || !queue.connection) {
      return interaction.reply({ content: "❌ Sentry non si trova in alcun canale vocale.", ephemeral: true });
    }

    queue.stop();
    return interaction.reply({ content: "🚪 Sentry è uscito dal canale vocale." });
  }
};

import { SlashCommandBuilder } from "discord.js";
import { MusicManager } from "../../modules/musicManager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("pause")
    .setDescription("Mette in pausa il brano attualmente in riproduzione"),

  async execute(interaction) {
    const queue = MusicManager.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      return interaction.reply({ content: "❌ Nessun brano in riproduzione.", ephemeral: true });
    }

    if (queue.isPaused) {
      return interaction.reply({ content: "⚠️ La riproduzione è già in pausa. Usa `/resume` per riprenderla.", ephemeral: true });
    }

    queue.pause();
    return interaction.reply({ content: "⏸️ **Riproduzione messa in pausa!**" });
  }
};

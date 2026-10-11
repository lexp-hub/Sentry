import { SlashCommandBuilder } from "discord.js";
import { MusicManager } from "../../modules/musicManager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Riprende la riproduzione musicale messa in pausa"),

  async execute(interaction) {
    const queue = MusicManager.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      return interaction.reply({ content: "❌ Nessun brano in riproduzione.", ephemeral: true });
    }

    if (!queue.isPaused) {
      return interaction.reply({ content: "⚠️ La riproduzione è già attiva.", ephemeral: true });
    }

    queue.resume();
    return interaction.reply({ content: "▶️ **Riproduzione ripresa con successo!**" });
  }
};

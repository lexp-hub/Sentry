import { SlashCommandBuilder } from "discord.js";
import { MusicManager } from "../../modules/musicManager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Salta il brano attualmente in riproduzione"),

  async execute(interaction) {
    const queue = MusicManager.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      return interaction.reply({ content: "❌ Nessun brano in riproduzione da saltare.", ephemeral: true });
    }

    if (!interaction.member.voice?.channel || interaction.member.voice.channel.id !== queue.voiceChannel?.id) {
      return interaction.reply({ content: "⚠️ Devi essere nello stesso canale vocale del bot!", ephemeral: true });
    }

    const skippedTitle = queue.currentTrack.title;
    queue.skip();
    return interaction.reply({ content: "⏭️ Saltato **" + skippedTitle + "**!" });
  }
};

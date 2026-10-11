import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { MusicManager } from "../../modules/musicManager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Mostra la lista dei brani in coda"),

  async execute(interaction) {
    const queue = MusicManager.getQueue(interaction.guild.id);
    if (!queue || (!queue.currentTrack && queue.queue.length === 0)) {
      return interaction.reply({ content: "❌ La coda musicale è attualmente vuota.", ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor("#ef4444")
      .setTitle("📜 Coda Musicale • " + interaction.guild.name)
      .setDescription(
        "**Brano in Corso:**\n" +
        (queue.currentTrack ? "▶️ [" + queue.currentTrack.title + "](" + queue.currentTrack.url + ") • `" + queue.currentTrack.duration + "` (da " + queue.currentTrack.requestedBy + ")\n\n" : "Nessun brano in corso.\n\n") +
        "**Prossimi Brani in Coda (" + queue.queue.length + "):**\n" +
        (queue.queue.length > 0
          ? queue.queue.slice(0, 15).map((t, i) => "`" + (i + 1) + ".` [" + t.title + "](" + t.url + ") • `" + t.duration + "` (da " + t.requestedBy + ")").join("\n") +
            (queue.queue.length > 15 ? "\n*...e altri " + (queue.queue.length - 15) + " brani in coda.*" : "")
          : "*Nessun altro brano in coda.*")
      )
      .setFooter({ text: "Volume: " + queue.volume + "% • Loop: " + queue.loopMode });

    return interaction.reply({ embeds: [embed] });
  }
};

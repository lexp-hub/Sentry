import { SlashCommandBuilder } from "discord.js";
import { MusicManager } from "../../modules/musicManager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("shuffle")
    .setDescription("Mescola l ordine dei brani nella coda di riproduzione"),

  async execute(interaction) {
    const queue = MusicManager.getQueue(interaction.guild.id);
    if (!queue || queue.queue.length < 2) {
      return interaction.reply({ content: "⚠️ Servono almeno 2 brani in coda per poterla mescolare.", ephemeral: true });
    }

    queue.shuffle();
    return interaction.reply({ content: "🔀 **Coda mescolata con successo!** (" + queue.queue.length + " brani)" });
  }
};

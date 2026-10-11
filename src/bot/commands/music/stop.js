import { SlashCommandBuilder } from "discord.js";
import { MusicManager } from "../../modules/musicManager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Ferma la riproduzione, svuota la coda e fa uscire il bot dalla vocale"),

  async execute(interaction) {
    const queue = MusicManager.getQueue(interaction.guild.id);
    if (!queue) {
      return interaction.reply({ content: "❌ Nessun riproduttore musicale attivo.", ephemeral: true });
    }

    queue.stop();
    return interaction.reply({ content: "⏹️ **Musica fermata e coda svuotata.** Sentry ha lasciato il canale vocale." });
  }
};

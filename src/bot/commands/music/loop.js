import { SlashCommandBuilder } from "discord.js";
import { MusicManager } from "../../modules/musicManager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("loop")
    .setDescription("Imposta la modalità di ripetizione (loop)")
    .addStringOption(opt =>
      opt.setName("modalita")
        .setDescription("Modalità di loop desiderata")
        .setRequired(false)
        .addChoices(
          { name: "Disattivato (Off)", value: "off" },
          { name: "Singolo Brano (Track)", value: "track" },
          { name: "Intera Coda (Queue)", value: "queue" }
        )
    ),

  async execute(interaction) {
    const queue = MusicManager.getQueue(interaction.guild.id);
    if (!queue) {
      return interaction.reply({ content: "❌ Nessun brano in riproduzione.", ephemeral: true });
    }

    const modeOpt = interaction.options.getString("modalita");
    let mode;
    if (modeOpt) {
      queue.loopMode = modeOpt;
      queue.updateController();
      mode = modeOpt;
    } else {
      mode = queue.toggleLoop();
    }

    const label = mode === "track" ? "🔂 Singolo brano" : (mode === "queue" ? "🔁 Intera coda" : "➡️ Disattivato");
    return interaction.reply({ content: "🔁 **Modalità Loop impostata su:** `" + label + "`" });
  }
};

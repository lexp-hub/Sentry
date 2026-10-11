import { SlashCommandBuilder } from "discord.js";
import { MusicManager } from "../../modules/musicManager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Imposta il volume della musica (1 - 150%)")
    .addIntegerOption(opt =>
      opt.setName("livello")
        .setDescription("Percentuale volume (1 - 150)")
        .setMinValue(1)
        .setMaxValue(150)
        .setRequired(true)
    ),

  async execute(interaction) {
    const queue = MusicManager.getQueue(interaction.guild.id);
    if (!queue) {
      return interaction.reply({ content: "❌ Nessun brano in riproduzione.", ephemeral: true });
    }

    const vol = interaction.options.getInteger("livello");
    const newVol = queue.setVolume(vol);

    return interaction.reply({ content: "🔊 **Volume impostato a:** `" + newVol + "%`" });
  }
};

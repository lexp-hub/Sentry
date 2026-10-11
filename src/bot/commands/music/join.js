import { SlashCommandBuilder } from "discord.js";
import { MusicManager } from "../../modules/musicManager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("Fa entrare Sentry nel tuo canale vocale"),

  async execute(interaction) {
    const { member, guild, channel } = interaction;
    if (!member.voice?.channel) {
      return interaction.reply({ content: "⚠️ Devi prima entrare in un canale vocale!", ephemeral: true });
    }

    const queue = MusicManager.getOrCreateQueue(guild.id, interaction.client);
    await queue.connect(member.voice.channel, channel);

    return interaction.reply({ content: "🔊 Sentry è entrato in **" + member.voice.channel.name + "**!" });
  }
};

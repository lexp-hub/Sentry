import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { MusicManager } from "../../modules/musicManager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Riproduce un brano o una playlist da YouTube, Spotify o SoundCloud")
    .addStringOption(option =>
      option.setName("brano")
        .setDescription("Titolo della canzone, link YouTube o Spotify")
        .setRequired(true)
    ),

  async execute(interaction) {
    const { member, guild, channel } = interaction;

    if (!member.voice?.channel) {
      return interaction.reply({
        content: "⚠️ Devi essere in un canale vocale per poter usare questo comando!",
        ephemeral: true
      });
    }

    const query = interaction.options.getString("brano");
    await interaction.deferReply();

    try {
      const searchResult = await MusicManager.searchTrack(query, member.user.username);
      const queue = MusicManager.getOrCreateQueue(guild.id, interaction.client);

      await queue.connect(member.voice.channel, channel);

      if (searchResult.isPlaylist) {
        queue.queue.push(...searchResult.tracks);

        const embed = new EmbedBuilder()
          .setColor("#ef4444")
          .setTitle("📑 Playlist Aggiunta alla Coda!")
          .setDescription("Aggiunti **" + searchResult.tracks.length + "** brani dalla playlist **" + searchResult.title + "**.")
          .setFooter({ text: "Richiesto da " + member.user.username, iconURL: member.user.displayAvatarURL() });

        if (!queue.currentTrack) {
          const first = queue.queue.shift();
          await queue.playTrack(first);
        }

        return interaction.editReply({ embeds: [embed] });
      } else {
        const track = searchResult.track;

        if (!queue.currentTrack) {
          await queue.playTrack(track);
          return interaction.editReply({
            content: "▶️ Inizio riproduzione di **[" + track.title + "](" + track.url + ")**!"
          });
        } else {
          queue.queue.push(track);
          const embed = new EmbedBuilder()
            .setColor("#ef4444")
            .setTitle("🎵 Brano Aggiunto alla Coda")
            .setDescription("[" + track.title + "](" + track.url + ")\n\n> **Posizione in Coda:** `#" + queue.queue.length + "`\n> **Durata:** `" + track.duration + "`")
            .setThumbnail(track.thumbnail)
            .setFooter({ text: "Richiesto da " + member.user.username, iconURL: member.user.displayAvatarURL() });

          return interaction.editReply({ embeds: [embed] });
        }
      }
    } catch (err) {
      console.error("[Music Play Error]:", err);
      return interaction.editReply({
        content: "❌ Impossibile riprodurre la traccia: `" + err.message + "`"
      });
    }
  }
};

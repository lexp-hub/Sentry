import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  demuxProbe,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  NoSubscriberBehavior
} from "@discordjs/voice";
import ytSearch from "yt-search";
import ffmpegStatic from "ffmpeg-static";
import sodium from "libsodium-wrappers";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";

// Ensure WebAssembly Sodium encryption is 100% initialized
try {
  await sodium.ready;
  console.log("[Music] Sodium encryption engine ready.");
} catch (e) {
  console.warn("[Music] Sodium init notice:", e.message);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");
const localYtDlp = path.join(projectRoot, "bin/yt-dlp");

if (ffmpegStatic) {
  process.env.FFMPEG_PATH = ffmpegStatic;
}

function getYtDlpPath() {
  if (fs.existsSync(localYtDlp)) {
    return localYtDlp;
  }
  return "yt-dlp";
}

function getFfmpegPath() {
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
    return ffmpegStatic;
  }
  return "ffmpeg";
}

// Map of Guild ID -> GuildMusicQueue
const queues = new Map();

class GuildMusicQueue {
  constructor(guildId, client) {
    this.guildId = guildId;
    this.client = client;
    this.voiceChannel = null;
    this.textChannel = null;
    this.connection = null;
    this.player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
        maxMissedFrames: 250
      }
    });
    this.queue = [];
    this.currentTrack = null;
    this.volume = 100;
    this.loopMode = "off"; // "off" | "track" | "queue"
    this.isPaused = false;
    this.idleTimer = null;
    this.currentResource = null;
    this.streamProcess = null;
    this.ffmpegProcess = null;
    this.controllerMessage = null;

    this.setupPlayerListeners();
  }

  setupPlayerListeners() {
    this.player.on('stateChange', (oldState, newState) => {
      console.log(`[Music Player] Server ${this.guildId} transizione: ${oldState.status} -> ${newState.status}`);
    });

    this.player.on(AudioPlayerStatus.Idle, () => {
      this.killProcesses();
      this.handleTrackEnd();
    });

    this.player.on("error", (error) => {
      console.error("[Music] Errore riproduzione nel server " + this.guildId + ":", error.message);
      this.killProcesses();
      if (this.textChannel) {
        this.textChannel.send({
          embeds: [
            new EmbedBuilder()
              .setColor("#ef4444")
              .setDescription("❌ **Errore durante la riproduzione:** `" + error.message + "`. Salto al brano successivo...")
          ]
        }).catch(() => {});
      }
      this.handleTrackEnd();
    });
  }

  killProcesses() {
    if (this.ffmpegProcess) {
      try {
        this.ffmpegProcess.stdout.destroy();
        this.ffmpegProcess.stdin.destroy();
        this.ffmpegProcess.kill("SIGKILL");
      } catch {}
      this.ffmpegProcess = null;
    }
    if (this.streamProcess) {
      try {
        this.streamProcess.stdout.destroy();
        this.streamProcess.kill("SIGKILL");
      } catch {}
      this.streamProcess = null;
    }
  }

  async handleTrackEnd() {
    if (this.loopMode === "track" && this.currentTrack) {
      await this.playTrack(this.currentTrack);
      return;
    }

    if (this.loopMode === "queue" && this.currentTrack) {
      this.queue.push(this.currentTrack);
    }

    if (this.queue.length > 0) {
      const nextTrack = this.queue.shift();
      await this.playTrack(nextTrack);
    } else {
      this.currentTrack = null;
      this.currentResource = null;
      this.isPaused = false;
      this.updateController();
      this.startIdleTimer();
    }
  }

  startIdleTimer() {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      if (!this.currentTrack && this.queue.length === 0) {
        if (this.textChannel) {
          this.textChannel.send({
            embeds: [
              new EmbedBuilder()
                .setColor("#d97706")
                .setDescription("⏱️ **Disconnessione automatica:** Nessun brano in riproduzione per 3 minuti. Sentry ha lasciato il canale vocale.")
            ]
          }).catch(() => {});
        }
        this.destroy();
      }
    }, 180000);
  }

  clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  async connect(voiceChannel, textChannel = null) {
    this.clearIdleTimer();
    this.voiceChannel = voiceChannel;
    if (textChannel) this.textChannel = textChannel;

    if (!this.connection || this.connection.state.status === VoiceConnectionStatus.Destroyed) {
      this.connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: this.guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
      });

      this.connection.subscribe(this.player);

      try {
        console.log(`[Music] Connessione al canale vocale "${voiceChannel.name}" (attesa stato Ready)...`);
        await entersState(this.connection, VoiceConnectionStatus.Ready, 15_000);
        console.log(`[Music] ✅ Connessione vocale stabilita con successo in "${voiceChannel.name}"!`);
      } catch (voiceErr) {
        console.warn(`[Music Warning] Connessione vocale non ancora Ready entro 15s:`, voiceErr.message);
      }

      this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(this.connection, VoiceConnectionStatus.Signalling, 5000),
            entersState(this.connection, VoiceConnectionStatus.Connecting, 5000)
          ]);
        } catch {
          this.destroy();
        }
      });
    }

    return this.connection;
  }

  async playTrack(track) {
    this.clearIdleTimer();
    this.killProcesses();
    this.currentTrack = track;
    this.isPaused = false;

    try {
      if (this.connection) {
        if (this.connection.state.status !== VoiceConnectionStatus.Ready) {
          try {
            await entersState(this.connection, VoiceConnectionStatus.Ready, 10_000);
          } catch (e) {
            console.warn('[Music] In attesa dello stato Ready della connessione vocale:', e.message);
          }
        }
        this.connection.subscribe(this.player);
      }

      const ytdlpBin = getYtDlpPath();
      const ffmpegBin = getFfmpegPath();
      const volMultiplier = (Math.max(1, Math.min(150, this.volume)) / 100).toFixed(2);

      console.log(`[Music] Avvio riproduzione traccia: "${track.title}" (URL: ${track.url})`);

      // 1. Spawn yt-dlp to stream raw audio with mobile client bypass
      this.streamProcess = spawn(ytdlpBin, [
        "--extractor-args", "youtube:player_client=ios,android,web",
        "-f", "bestaudio/best",
        "-o", "-",
        "--no-warnings",
        "--quiet",
        track.url
      ]);

      let ytdlpError = '';
      this.streamProcess.stderr.on('data', (d) => {
        ytdlpError += d.toString();
      });

      this.streamProcess.on("error", (err) => {
        console.error("[Music yt-dlp error]:", err.message);
      });

      this.streamProcess.on("close", (code) => {
        if (code !== 0 && code !== null) {
          console.warn(`[Music yt-dlp] Processo terminato con codice ${code}. Dettagli: ${ytdlpError.trim() || 'Nessun errore specifico su stderr'}`);
        }
      });

      // 2. Spawn FFmpeg to apply volume filter and encode to native 48kHz Stereo Opus in Ogg container
      this.ffmpegProcess = spawn(ffmpegBin, [
        "-i", "pipe:0",
        "-filter:a", "volume=" + volMultiplier,
        "-c:a", "libopus",
        "-b:a", "128k",
        "-ar", "48000",
        "-ac", "2",
        "-f", "ogg",
        "pipe:1"
      ]);

      let ffmpegError = '';
      this.ffmpegProcess.stderr.on('data', (d) => {
        ffmpegError += d.toString();
      });

      this.ffmpegProcess.on("error", (err) => {
        console.error("[Music FFmpeg error]:", err.message);
      });

      this.ffmpegProcess.on("close", (code) => {
        if (code !== 0 && code !== null) {
          console.warn(`[Music FFmpeg] Processo terminato con codice ${code}. Dettagli: ${ffmpegError.trim() || 'Nessun errore specifico su stderr'}`);
        }
      });

      this.streamProcess.stdout.pipe(this.ffmpegProcess.stdin);

      // 3. Probing demuxer to create valid OggOpus AudioResource
      const probe = await demuxProbe(this.ffmpegProcess.stdout);

      this.currentResource = createAudioResource(probe.stream, {
        inputType: probe.type,
        inlineVolume: true
      });

      if (this.currentResource.volume) {
        this.currentResource.volume.setVolume(this.volume / 100);
      }

      this.player.play(this.currentResource);
      console.log(`[Music] AudioResource generato e passato a player.play() per "${track.title}"!`);
      await this.sendOrUpdateController();
    } catch (err) {
      console.error("[Music] Impossibile avviare lo streaming di " + track.title + ":", err.message);
      if (this.textChannel) {
        this.textChannel.send({
          embeds: [
            new EmbedBuilder()
              .setColor("#ef4444")
              .setDescription("❌ Impossibile riprodurre **[" + track.title + "](" + (track.url || "https://youtu.be") + ")**: `" + err.message + "`")
          ]
        }).catch(() => {});
      }
      this.handleTrackEnd();
    }
  }

  setVolume(vol) {
    const clamped = Math.max(1, Math.min(150, vol));
    this.volume = clamped;
    if (this.currentResource?.volume) {
      this.currentResource.volume.setVolume(clamped / 100);
    }
    this.updateController();
    return this.volume;
  }

  pause() {
    if (this.player.state.status === AudioPlayerStatus.Playing) {
      this.player.pause();
      this.isPaused = true;
      this.updateController();
      return true;
    }
    return false;
  }

  resume() {
    if (this.player.state.status === AudioPlayerStatus.Paused || this.isPaused) {
      this.player.unpause();
      this.isPaused = false;
      this.updateController();
      return true;
    }
    return false;
  }

  skip() {
    this.player.stop();
    return true;
  }

  stop() {
    this.queue = [];
    this.currentTrack = null;
    this.isPaused = false;
    this.player.stop();
    this.destroy();
    return true;
  }

  shuffle() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this.updateController();
    return true;
  }

  toggleLoop() {
    if (this.loopMode === "off") this.loopMode = "track";
    else if (this.loopMode === "track") this.loopMode = "queue";
    else this.loopMode = "off";
    this.updateController();
    return this.loopMode;
  }

  buildControllerEmbed() {
    const embed = new EmbedBuilder().setColor("#ef4444");

    if (!this.currentTrack) {
      embed
        .setTitle("🎵 Sentry Music • Riproduzione Terminata")
        .setDescription("Nessun brano in coda. Usa `/play <titolo>` per iniziare a riprodurre musica!")
        .setFooter({ text: "Sentry Dedicated Sentinel • /play | sentry.wispbyte.app", iconURL: this.client.user?.displayAvatarURL() });
      return embed;
    }

    const loopBadge = this.loopMode === "track" ? "🔂 Brano" : (this.loopMode === "queue" ? "🔁 Coda" : "➡️ No Loop");
    const statusBadge = this.isPaused ? "⏸️ In Pausa" : "▶️ In Riproduzione";

    embed
      .setTitle("🎵 Riproduzione in Corso • Sentry Music")
      .setDescription(
        "### [" + this.currentTrack.title + "](" + this.currentTrack.url + ")\n\n" +
        "> **Canale Vocale:** `" + (this.voiceChannel?.name || "Vocale") + "`\n" +
        "> **Stato:** `" + statusBadge + "` • **Loop:** `" + loopBadge + "`\n" +
        "> **Volume:** `" + this.volume + "%` • **Brani in Coda:** `" + this.queue.length + "`"
      )
      .addFields(
        { name: "⏱️ Durata", value: "`" + (this.currentTrack.duration || "Live") + "`", inline: true },
        { name: "👤 Richiesto da", value: "" + (this.currentTrack.requestedBy || "Utente"), inline: true },
        { name: "📻 Canale", value: "`" + (this.currentTrack.author || "YouTube") + "`", inline: true }
      );

    if (this.currentTrack.thumbnail) {
      embed.setThumbnail(this.currentTrack.thumbnail);
    }

    embed.setFooter({ text: "Sentry Dedicated Sentinel • /play | sentry.wispbyte.app", iconURL: this.client.user?.displayAvatarURL() });
    return embed;
  }

  buildControllerButtons() {
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("btn_music_play_pause")
        .setEmoji(this.isPaused ? "▶️" : "⏸️")
        .setLabel(this.isPaused ? "Riprendi" : "Pausa")
        .setStyle(this.isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("btn_music_skip")
        .setEmoji("⏭️")
        .setLabel("Salta")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("btn_music_stop")
        .setEmoji("⏹️")
        .setLabel("Ferma")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("btn_music_loop")
        .setEmoji("🔁")
        .setLabel(this.loopMode === "track" ? "Loop: 1" : (this.loopMode === "queue" ? "Loop: Coda" : "Loop: Off"))
        .setStyle(this.loopMode !== "off" ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("btn_music_queue")
        .setEmoji("📜")
        .setLabel("Coda (" + this.queue.length + ")")
        .setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("btn_music_voldown")
        .setEmoji("🔉")
        .setLabel("Vol -15%")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("btn_music_volup")
        .setEmoji("🔊")
        .setLabel("Vol +15%")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("btn_music_shuffle")
        .setEmoji("🔀")
        .setLabel("Mischia")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("btn_music_leave")
        .setEmoji("🚪")
        .setLabel("Disconnetti")
        .setStyle(ButtonStyle.Danger)
    );

    return [row1, row2];
  }

  async sendOrUpdateController() {
    if (!this.textChannel) return;

    const embed = this.buildControllerEmbed();
    const components = this.buildControllerButtons();

    try {
      if (this.controllerMessage) {
        await this.controllerMessage.edit({ embeds: [embed], components }).catch(async () => {
          this.controllerMessage = await this.textChannel.send({ embeds: [embed], components });
        });
      } else {
        this.controllerMessage = await this.textChannel.send({ embeds: [embed], components });
      }
    } catch (err) {
      console.error("[Music] Errore aggiornamento controller:", err.message);
    }
  }

  async updateController() {
    if (!this.controllerMessage) return;
    try {
      const embed = this.buildControllerEmbed();
      const components = this.buildControllerButtons();
      await this.controllerMessage.edit({ embeds: [embed], components }).catch(() => {});
    } catch {}
  }

  destroy() {
    this.clearIdleTimer();
    this.killProcesses();
    try {
      this.player.stop(true);
      if (this.connection) {
        this.connection.destroy();
      }
    } catch {}

    queues.delete(this.guildId);
  }
}

export const MusicManager = {
  getQueue(guildId) {
    return queues.get(guildId);
  },

  getOrCreateQueue(guildId, client) {
    let q = queues.get(guildId);
    if (!q) {
      q = new GuildMusicQueue(guildId, client);
      queues.set(guildId, q);
    }
    return q;
  },

  async searchTrack(query, requestedBy = "Utente") {
    const isUrl = /^https?:\/\//i.test(query);

    // 1. If direct YouTube or Spotify or Media URL
    if (isUrl) {
      if (query.includes("spotify.com")) {
        let songName = "Spotify Track";
        try {
          const res = await fetch(query, { headers: { "User-Agent": "Mozilla/5.0" } });
          const html = await res.text();
          const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
          if (titleMatch && titleMatch[1]) {
            songName = titleMatch[1].replace(/\s*\|\s*Spotify.*$/i, "").trim();
          }
        } catch {}

        const ytRes = await ytSearch(songName);
        const first = ytRes.videos?.[0];
        if (!first) throw new Error("Nessun brano trovato su YouTube per la traccia Spotify \"" + songName + "\".");

        return {
          isPlaylist: false,
          track: {
            title: songName,
            url: first.url,
            duration: first.timestamp,
            thumbnail: first.thumbnail,
            author: "Spotify",
            requestedBy
          }
        };
      }

      // Check if YouTube Playlist
      if (query.includes("list=")) {
        try {
          const listRes = await ytSearch({ listId: new URL(query).searchParams.get("list") });
          if (listRes.videos && listRes.videos.length > 0) {
            return {
              isPlaylist: true,
              title: listRes.title || "YouTube Playlist",
              tracks: listRes.videos.map(v => ({
                title: v.title,
                url: v.url || ("https://youtube.com/watch?v=" + v.videoId),
                duration: v.timestamp || v.duration?.timestamp || "3:00",
                thumbnail: v.thumbnail,
                author: v.author?.name || "YouTube",
                requestedBy
              }))
            };
          }
        } catch {}
      }

      // Direct YouTube Video URL or other URL
      const searchRes = await ytSearch(query);
      const video = searchRes.videos?.[0] || (searchRes.all && searchRes.all[0]);
      if (video) {
        return {
          isPlaylist: false,
          track: {
            title: video.title,
            url: video.url,
            duration: video.timestamp,
            thumbnail: video.thumbnail,
            author: video.author?.name || "YouTube",
            requestedBy
          }
        };
      }

      return {
        isPlaylist: false,
        track: {
          title: query,
          url: query,
          duration: "Live / Direct",
          thumbnail: null,
          author: "Web Stream",
          requestedBy
        }
      };
    }

    // 2. Keyword Search on YouTube via ytSearch
    const searchRes = await ytSearch(query);
    const firstVideo = searchRes.videos?.[0];
    if (!firstVideo) {
      throw new Error("Nessun brano trovato su YouTube per la ricerca \"" + query + "\".");
    }

    return {
      isPlaylist: false,
      track: {
        title: firstVideo.title,
        url: firstVideo.url,
        duration: firstVideo.timestamp,
        thumbnail: firstVideo.thumbnail,
        author: firstVideo.author?.name || "YouTube",
        requestedBy
      }
    };
  },

  async handleMusicButton(interaction) {
    const { customId, guild, member } = interaction;
    if (!customId.startsWith("btn_music_")) return false;

    const queue = queues.get(guild.id);
    if (!queue || (!queue.currentTrack && queue.queue.length === 0)) {
      return interaction.reply({
        content: "❌ Nessuna riproduzione musicale attiva in questo momento.",
        ephemeral: true
      });
    }

    if (!member.voice?.channel || member.voice.channel.id !== queue.voiceChannel?.id) {
      return interaction.reply({
        content: "⚠️ Devi trovarti nello stesso canale vocale del bot per controllare la musica!",
        ephemeral: true
      });
    }

    switch (customId) {
      case "btn_music_play_pause": {
        if (queue.isPaused) {
          queue.resume();
          await interaction.reply({ content: "▶️ **Riproduzione ripresa!**", ephemeral: true });
        } else {
          queue.pause();
          await interaction.reply({ content: "⏸️ **Riproduzione messa in pausa!**", ephemeral: true });
        }
        break;
      }
      case "btn_music_skip": {
        queue.skip();
        await interaction.reply({ content: "⏭️ **Brano saltato!**", ephemeral: true });
        break;
      }
      case "btn_music_stop": {
        queue.stop();
        await interaction.reply({ content: "⏹️ **Musica fermata e coda svuotata!**", ephemeral: true });
        break;
      }
      case "btn_music_loop": {
        const mode = queue.toggleLoop();
        const msg = mode === "track" ? "🔂 Loop singolo brano attivo" : (mode === "queue" ? "🔁 Loop intera coda attivo" : "➡️ Loop disattivato");
        await interaction.reply({ content: "**" + msg + "!**", ephemeral: true });
        break;
      }
      case "btn_music_queue": {
        const embed = new EmbedBuilder()
          .setColor("#ef4444")
          .setTitle("📜 Coda di Riproduzione • " + guild.name)
          .setDescription(
            "**Brano in Corso:**\n" +
            (queue.currentTrack ? "▶️ [" + queue.currentTrack.title + "](" + queue.currentTrack.url + ") • `" + queue.currentTrack.duration + "`\n\n" : "Nessun brano in corso.\n\n") +
            "**Prossimi Brani (" + queue.queue.length + "):**\n" +
            (queue.queue.length > 0
              ? queue.queue.slice(0, 10).map((t, idx) => "`" + (idx + 1) + ".` [" + t.title + "](" + t.url + ") • `" + t.duration + "` (da " + t.requestedBy + ")").join("\n") +
                (queue.queue.length > 10 ? "\n*...e altri " + (queue.queue.length - 10) + " brani.*" : "")
              : "*Nessun altro brano in coda.*")
          )
          .setFooter({ text: "Volume: " + queue.volume + "% • Loop: " + queue.loopMode });

        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }
      case "btn_music_voldown": {
        const newVol = queue.setVolume(queue.volume - 15);
        await interaction.reply({ content: "🔉 **Volume impostato a:** `" + newVol + "%`", ephemeral: true });
        break;
      }
      case "btn_music_volup": {
        const newVol = queue.setVolume(queue.volume + 15);
        await interaction.reply({ content: "🔊 **Volume impostato a:** `" + newVol + "%`", ephemeral: true });
        break;
      }
      case "btn_music_shuffle": {
        queue.shuffle();
        await interaction.reply({ content: "🔀 **Coda mescolata con successo!**", ephemeral: true });
        break;
      }
      case "btn_music_leave": {
        queue.stop();
        await interaction.reply({ content: "🚪 **Sentry ha lasciato il canale vocale.**", ephemeral: true });
        break;
      }
    }

    return true;
  }
};

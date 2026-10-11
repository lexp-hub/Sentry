import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";
import { DatabaseHelper } from "../../database/db.js";

// Map of active intervals: stopwatchId -> NodeJS.Timeout
const activeIntervals = new Map();
// Map of debounce timers: channelId -> NodeJS.Timeout
const stickyTimers = new Map();
// Set of channels currently performing repositioning
const isReposting = new Set();

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hrs = String(Math.floor(safeSeconds / 3600)).padStart(2, "0");
  const mins = String(Math.floor((safeSeconds % 3600) / 60)).padStart(2, "0");
  const secs = String(safeSeconds % 60).padStart(2, "0");
  return `${hrs}:${mins}:${secs}`;
}

function calculateElapsed(sw) {
  const now = Date.now();
  if (sw.status === "paused") {
    const timeBeforePause = Math.floor(((sw.paused_at || now) - sw.start_time) / 1000) - (sw.total_paused_seconds || 0);
    return (sw.start_offset_seconds || 0) + timeBeforePause;
  }
  const elapsedSinceStart = Math.floor((now - sw.start_time) / 1000) - (sw.total_paused_seconds || 0);
  return (sw.start_offset_seconds || 0) + elapsedSinceStart;
}

function buildEmbed(sw, elapsedSeconds) {
  const timeFormatted = formatTime(elapsedSeconds);
  const isPaused = sw.status === "paused";
  const isStopped = sw.status === "stopped";
  const statusBadge = isStopped ? "⏹️ TERMINATO" : (isPaused ? "⏸️ IN PAUSA" : "▶️ IN CORSO");
  const color = isStopped ? "#64748b" : (isPaused ? "#f59e0b" : "#ef4444");

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(sw.title || "⏱️ Cronometro Live • Sentry")
    .setDescription(
      `# ⏱️ \`[ ${timeFormatted} ]\`\n\n` +
      `> 🚀 **Offset di partenza:** \`${formatTime(sw.start_offset_seconds || 0)}\`\n` +
      `> 📊 **Stato:** \`${statusBadge}\`\n` +
      `> 👤 **Avviato da:** <@${sw.created_by}>\n` +
      `> 📅 **Data inizio:** <t:${Math.floor(sw.start_time / 1000)}:F>\n` +
      (sw.custom_text ? `\n> 📝 **Descrizione:** ${sw.custom_text}\n` : "")
    )
    .setFooter({ text: "Sentry Sentinel • Cronometro Digitale Persistente • /cronometro" });

  return embed;
}

function buildButtons(sw) {
  const isPaused = sw.status === "paused";
  const isStopped = sw.status === "stopped";

  if (isStopped) {
    return [];
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_sw_pause_${sw.id}`)
      .setEmoji(isPaused ? "▶️" : "⏸️")
      .setLabel(isPaused ? "Riprendi" : "Pausa")
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`btn_sw_reset_${sw.id}`)
      .setEmoji("🔄")
      .setLabel("Reset")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`btn_sw_stop_${sw.id}`)
      .setEmoji("⏹️")
      .setLabel("Ferma")
      .setStyle(ButtonStyle.Danger)
  );

  return [row];
}

async function updateMessage(client, sw) {
  try {
    const guild = client.guilds.cache.get(sw.guild_id);
    if (!guild) return;

    const channel = await guild.channels.fetch(sw.channel_id).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const message = await channel.messages.fetch(sw.message_id).catch(() => null);
    if (!message) {
      // Se il messaggio è stato eliminato o non trovato, ricrealo in fondo al canale!
      await StopwatchManager.repostToBottom(sw.id, channel);
      return;
    }

    const elapsed = calculateElapsed(sw);
    const embed = buildEmbed(sw, elapsed);
    const components = buildButtons(sw);

    await message.edit({ embeds: [embed], components });
  } catch (err) {
    console.error(`[Stopwatch] Errore aggiornamento messaggio #${sw.id}:`, err.message);
  }
}

function startInterval(client, sw) {
  if (activeIntervals.has(sw.id)) {
    clearInterval(activeIntervals.get(sw.id));
  }

  if (sw.status === "stopped" || sw.status === "paused") {
    return;
  }

  // Update message every 10 seconds to stay safely within Discord rate limits
  const interval = setInterval(async () => {
    const current = DatabaseHelper.getStopwatch(sw.id);
    if (!current || current.status !== "running") {
      clearInterval(interval);
      activeIntervals.delete(sw.id);
      return;
    }
    await updateMessage(client, current);
  }, 10000);

  activeIntervals.set(sw.id, interval);
}

export const StopwatchManager = {
  formatTime,

  async start(guild, channel, user, { hours = 0, minutes = 0, title, customText }) {
    const startOffsetSeconds = (Math.max(0, parseInt(hours, 10) || 0) * 3600) + (Math.max(0, parseInt(minutes, 10) || 0) * 60);
    const now = Date.now();

    const tempSw = {
      guild_id: guild.id,
      channel_id: channel.id,
      title: title || "⏱️ Cronometro Live • Sentry",
      custom_text: customText || null,
      start_offset_seconds: startOffsetSeconds,
      start_time: now,
      paused_at: null,
      total_paused_seconds: 0,
      status: "running",
      created_by: user.id
    };

    const initialEmbed = buildEmbed(tempSw, startOffsetSeconds);
    const msg = await channel.send({ embeds: [initialEmbed] });

    tempSw.message_id = msg.id;
    const swId = DatabaseHelper.createStopwatch(tempSw);
    tempSw.id = swId;

    const components = buildButtons(tempSw);
    await msg.edit({ components });

    startInterval(channel.client, tempSw);
    return tempSw;
  },

  async pause(swId, client) {
    const sw = DatabaseHelper.getStopwatch(swId);
    if (!sw || sw.status !== "running") return null;

    if (activeIntervals.has(swId)) {
      clearInterval(activeIntervals.get(swId));
      activeIntervals.delete(swId);
    }

    const updated = DatabaseHelper.updateStopwatch(swId, {
      status: "paused",
      paused_at: Date.now()
    });

    await updateMessage(client, updated);
    return updated;
  },

  async resume(swId, client) {
    const sw = DatabaseHelper.getStopwatch(swId);
    if (!sw || sw.status !== "paused") return null;

    const pauseDuration = Math.floor((Date.now() - (sw.paused_at || Date.now())) / 1000);
    const newTotalPaused = (sw.total_paused_seconds || 0) + pauseDuration;

    const updated = DatabaseHelper.updateStopwatch(swId, {
      status: "running",
      paused_at: null,
      total_paused_seconds: newTotalPaused
    });

    await updateMessage(client, updated);
    startInterval(client, updated);
    return updated;
  },

  async reset(swId, client) {
    const sw = DatabaseHelper.getStopwatch(swId);
    if (!sw) return null;

    const updated = DatabaseHelper.updateStopwatch(swId, {
      start_time: Date.now(),
      paused_at: sw.status === "paused" ? Date.now() : null,
      total_paused_seconds: 0
    });

    await updateMessage(client, updated);
    if (updated.status === "running") {
      startInterval(client, updated);
    }
    return updated;
  },

  async stop(swId, client) {
    const sw = DatabaseHelper.getStopwatch(swId);
    if (!sw) return null;

    if (activeIntervals.has(swId)) {
      clearInterval(activeIntervals.get(swId));
      activeIntervals.delete(swId);
    }

    const finalElapsed = calculateElapsed(sw);
    const updated = DatabaseHelper.updateStopwatch(swId, {
      status: "stopped",
      paused_at: null
    });

    await updateMessage(client, updated);
    return { ...updated, finalElapsed };
  },

  async initAllActiveStopwatches(client) {
    const list = DatabaseHelper.getActiveStopwatches();
    console.log("[Stopwatch] Ripristino di " + list.length + " cronometri attivi...");

    for (const sw of list) {
      if (sw.status === "running") {
        startInterval(client, sw);
      }
    }
  },

  async handleButton(interaction) {
    const { customId, member, client } = interaction;
    if (!customId.startsWith("btn_sw_")) return false;

    const parts = customId.split("_");
    const action = parts[2]; // "pause", "reset", "stop"
    const swId = parseInt(parts[3], 10);

    const sw = DatabaseHelper.getStopwatch(swId);
    if (!sw) {
      return interaction.reply({ content: "❌ Cronometro non trovato o già terminato.", ephemeral: true });
    }

    // Permission check: only creator or administrators can control
    const isCreator = sw.created_by === member.id;
    const isAdmin = member.permissions?.has("Administrator");
    if (!isCreator && !isAdmin) {
      return interaction.reply({
        content: "⚠️ Solo chi ha creato il cronometro o un amministratore può controllarlo.",
        ephemeral: true
      });
    }

    if (action === "pause") {
      if (sw.status === "running") {
        await StopwatchManager.pause(swId, client);
        await interaction.reply({ content: "⏸️ **Cronometro messo in pausa!**", ephemeral: true });
      } else {
        await StopwatchManager.resume(swId, client);
        await interaction.reply({ content: "▶️ **Cronometro ripreso!**", ephemeral: true });
      }
    } else if (action === "reset") {
      await StopwatchManager.reset(swId, client);
      await interaction.reply({ content: "🔄 **Cronometro resettato all offset di partenza (" + formatTime(sw.start_offset_seconds) + ")!**", ephemeral: true });
    } else if (action === "stop") {
      const res = await StopwatchManager.stop(swId, client);
      await interaction.reply({ content: "⏹️ **Cronometro fermato!** Tempo finale: `" + formatTime(res.finalElapsed) + "`", ephemeral: true });
    }

    return true;
  },

  async repostToBottom(swId, channel) {
    const channelId = channel.id;
    if (isReposting.has(channelId)) return;
    isReposting.add(channelId);

    try {
      const sw = DatabaseHelper.getStopwatch(swId);
      if (!sw || sw.status === "stopped") return;

      // 1. Elimina il vecchio messaggio se ancora presente
      if (sw.message_id) {
        try {
          const oldMsg = await channel.messages.fetch(sw.message_id).catch(() => null);
          if (oldMsg && oldMsg.deletable) {
            await oldMsg.delete().catch(() => {});
          }
        } catch (e) {}
      }

      // 2. Calcola l'orario corrente e crea il nuovo embed con i pulsanti
      const elapsed = calculateElapsed(sw);
      const embed = buildEmbed(sw, elapsed);
      const components = buildButtons(sw);

      // 3. Invia il nuovo messaggio in fondo alla chat
      const newMsg = await channel.send({ embeds: [embed], components });

      // 4. Aggiorna l'ID del messaggio nel database
      DatabaseHelper.updateStopwatch(sw.id, { message_id: newMsg.id });

      // 5. Aggiorna l'intervallo attivo se in esecuzione
      if (sw.status === "running") {
        startInterval(channel.client, { ...sw, message_id: newMsg.id });
      }
    } catch (err) {
      console.error("[Stopwatch Sticky Error]:", err.message);
    } finally {
      isReposting.delete(channelId);
    }
  },

  async handleChannelMessage(message) {
    if (!message.guild || message.author?.bot) return;

    const channelId = message.channel.id;
    const guildId = message.guild.id;

    const activeSw = DatabaseHelper.getActiveStopwatchByChannel(guildId, channelId);
    if (!activeSw || activeSw.status === "stopped") return;

    // Ignora se il messaggio proviene dallo stesso cronometro
    if (message.id === activeSw.message_id) return;

    // Debounce a 1.2 secondi per evitare di superare i rate-limits di Discord se scrivono veloce
    if (stickyTimers.has(channelId)) {
      clearTimeout(stickyTimers.get(channelId));
    }

    const timer = setTimeout(async () => {
      stickyTimers.delete(channelId);
      await StopwatchManager.repostToBottom(activeSw.id, message.channel);
    }, 1200);

    stickyTimers.set(channelId, timer);
  }
};

export default StopwatchManager;

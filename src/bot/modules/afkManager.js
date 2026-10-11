import { EmbedBuilder } from 'discord.js';
import { DatabaseHelper } from '../../database/db.js';

// Cooldown in memoria per evitare spam di avvisi nello stesso canale per lo stesso utente (3.5 secondi)
const mentionCooldowns = new Map();

// Grace period di 1 secondo quando un utente si mette AFK per evitare cancellazioni involontarie immediate
const recentlySetAfk = new Map();

// Pulizia periodica della cache in memoria ogni 10 minuti
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of mentionCooldowns.entries()) {
    if (now - timestamp > 30000) {
      mentionCooldowns.delete(key);
    }
  }
  for (const [key, timestamp] of recentlySetAfk.entries()) {
    if (now - timestamp > 30000) {
      recentlySetAfk.delete(key);
    }
  }
}, 10 * 60 * 1000);

/**
 * Calcola una durata testuale fissa in italiano (senza cronometri dinamici Discord).
 * Es: "45 secondi", "12 minuti e 30 secondi", "2 ore e 15 minuti".
 */
export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds} secondo${totalSeconds === 1 ? '' : 'i'}`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) {
    if (seconds === 0) return `${totalMinutes} minut${totalMinutes === 1 ? 'o' : 'i'}`;
    return `${totalMinutes} minut${totalMinutes === 1 ? 'o' : 'i'} e ${seconds} second${seconds === 1 ? 'o' : 'i'}`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) {
    if (minutes === 0) return `${hours} or${hours === 1 ? 'a' : 'e'}`;
    return `${hours} or${hours === 1 ? 'a' : 'e'} e ${minutes} minut${minutes === 1 ? 'o' : 'i'}`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (remHours === 0) return `${days} giorn${days === 1 ? 'o' : 'i'}`;
  return `${days} giorn${days === 1 ? 'o' : 'i'} e ${remHours} or${remHours === 1 ? 'a' : 'e'}`;
}

export const AFKManager = {
  /**
   * Registra che un utente ha appena attivato lo stato AFK
   * per attivare il grace period anti-cancellazione immediata.
   */
  markRecentlySet(guildId, userId) {
    recentlySetAfk.set(`${guildId}:${userId}`, Date.now());
  },

  /**
   * Controlla se l'autore del messaggio inviato era AFK.
   * Se era AFK (e non è nel grace period), rimuove l'AFK e invia l'embed di bentornato con durata fissa.
   */
  async handleMessageAuthor(message) {
    if (!message.guild || message.author.bot) return false;

    const guildId = message.guild.id;
    const userId = message.author.id;
    const afkData = DatabaseHelper.getAfk(guildId, userId);

    if (!afkData) return false;

    const now = Date.now();
    const recentTime = recentlySetAfk.get(`${guildId}:${userId}`);

    // Grace period di 1 secondo
    if ((recentTime && (now - recentTime < 1000)) || (now - afkData.timestamp < 1000)) {
      return false;
    }

    // Rimuove lo stato AFK dal database
    DatabaseHelper.removeAfk(guildId, userId);
    recentlySetAfk.delete(`${guildId}:${userId}`);

    const elapsedMs = Math.max(0, now - afkData.timestamp);
    const durationFormatted = formatDuration(elapsedMs);
    const startSec = Math.floor(afkData.timestamp / 1000);

    const reasonText = afkData.reason && afkData.reason !== 'Attualmente assente' && afkData.reason !== 'Nessun motivo specificato'
      ? `\n📝 *Motivo precedente:* **${afkData.reason}**`
      : '';

    const embed = new EmbedBuilder()
      .setColor('#10b981')
      .setAuthor({
        name: `Bentornato, ${message.author.displayName || message.author.username}!`,
        iconURL: message.author.displayAvatarURL({ dynamic: true })
      })
      .setDescription(
        `Ho rimosso il tuo stato **AFK**.\n\n` +
        `⏱️ **Tempo totale di assenza:** **${durationFormatted}**\n` +
        `📅 **Inizio assenza:** alle ore <t:${startSec}:t>${reasonText}`
      )
      .setFooter({ text: 'Sentry AFK • Sei di nuovo attivo nel server' })
      .setTimestamp();

    await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } }).catch(async () => {
      await message.channel.send({ embeds: [embed] }).catch(() => {});
    });
    return true;
  },

  /**
   * Controlla se il messaggio menziona o risponde a uno o più utenti attualmente AFK.
   * Invia un avviso in embed con il motivo e il tempo di assenza fisso.
   */
  async handleMentionsAndReplies(message) {
    if (!message.guild || message.author.bot) return;

    const guildId = message.guild.id;
    const channelId = message.channel.id;
    const authorId = message.author.id;
    const targetUserIds = new Set();

    // 1. Menzioni dirette nel messaggio (@User)
    if (message.mentions?.users?.size > 0) {
      for (const [id, user] of message.mentions.users) {
        if (!user.bot && id !== authorId) {
          targetUserIds.add(id);
        }
      }
    }

    // 2. Risposta diretta a un messaggio (message reply)
    // A. Discord fornisce nativamente l'autore del messaggio a cui si risponde in message.mentions.repliedUser
    if (message.mentions?.repliedUser && !message.mentions.repliedUser.bot && message.mentions.repliedUser.id !== authorId) {
      targetUserIds.add(message.mentions.repliedUser.id);
    }

    // B. Controllo referencedMessage se già memorizzato nell'oggetto Message
    if (message.referencedMessage?.author && !message.referencedMessage.author.bot && message.referencedMessage.author.id !== authorId) {
      targetUserIds.add(message.referencedMessage.author.id);
    }

    // C. Controllo approfondito tramite message.reference (id messaggio e canale)
    const refMsgId = message.reference?.messageId || message.reference?.message_id;
    const refChanId = message.reference?.channelId || message.reference?.channel_id || channelId;

    if (refMsgId) {
      let refMsg = message.channel.messages?.cache?.get(refMsgId);

      if (!refMsg && refChanId && message.client.channels.cache.has(refChanId)) {
        refMsg = message.client.channels.cache.get(refChanId)?.messages?.cache?.get(refMsgId);
      }

      if (!refMsg) {
        try {
          if (typeof message.fetchReference === 'function') {
            refMsg = await message.fetchReference().catch(() => null);
          }
          if (!refMsg) {
            const targetChan = message.client.channels.cache.get(refChanId) || message.channel;
            if (targetChan?.messages?.fetch) {
              refMsg = await targetChan.messages.fetch(refMsgId).catch(() => null);
            }
          }
        } catch (e) {}
      }

      if (refMsg?.author && !refMsg.author.bot && refMsg.author.id !== authorId) {
        targetUserIds.add(refMsg.author.id);
      }
    }

    if (targetUserIds.size === 0) return;

    // Filtra gli utenti target che sono effettivamente AFK e non in cooldown nello stesso canale
    const now = Date.now();
    const afkTargets = [];

    for (const targetId of targetUserIds) {
      const afkData = DatabaseHelper.getAfk(guildId, targetId);
      if (!afkData) continue;

      const cooldownKey = `${guildId}:${targetId}:${channelId}`;
      const lastAlert = mentionCooldowns.get(cooldownKey);

      // Cooldown anti-spam di 3.5 secondi per utente AFK nello stesso canale
      if (lastAlert && (now - lastAlert < 3500)) {
        continue;
      }

      mentionCooldowns.set(cooldownKey, now);
      afkTargets.push({
        userId: targetId,
        reason: afkData.reason || 'Attualmente assente',
        timestamp: afkData.timestamp
      });
    }

    if (afkTargets.length === 0) return;

    if (afkTargets.length === 1) {
      const target = afkTargets[0];
      const startSec = Math.floor(target.timestamp / 1000);
      const elapsedMs = Math.max(0, now - target.timestamp);
      const elapsedFormatted = formatDuration(elapsedMs);

      const embed = new EmbedBuilder()
        .setColor('#f59e0b')
        .setTitle('💤 Utente Attualmente Assente')
        .setDescription(
          `**<@${target.userId}>** è attualmente **AFK / inattivo** e probabilmente sta facendo altro.\n\n` +
          `📝 **Motivo:** ${target.reason}\n` +
          `⏰ **AFK dalle ore:** <t:${startSec}:t>\n` +
          `⏱️ **Assente da:** ${elapsedFormatted}`
        )
        .setFooter({ text: 'Sentry AFK • Verrà rimosso automaticamente appena scriverà un messaggio' });

      await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } }).catch(async () => {
        await message.channel.send({ embeds: [embed] }).catch(async () => {
          await message.channel.send({
            content: `💤 **<@${target.userId}>** è attualmente **AFK / inattivo**: *${target.reason}* (dalle ore <t:${startSec}:t> - ${elapsedFormatted})`
          }).catch(() => {});
        });
      });
    } else {
      // Notifica multipla consolidata
      const embed = new EmbedBuilder()
        .setColor('#f59e0b')
        .setTitle('💤 Utenti Attualmente Assenti')
        .setDescription('I seguenti utenti menzionati/citati sono attualmente **AFK / inattivi**:')
        .setFooter({ text: 'Sentry AFK • Verranno rimossi automaticamente appena scriveranno un messaggio' });

      for (const target of afkTargets) {
        const startSec = Math.floor(target.timestamp / 1000);
        const elapsedMs = Math.max(0, now - target.timestamp);
        const elapsedFormatted = formatDuration(elapsedMs);

        embed.addFields({
          name: `👤 <@${target.userId}>`,
          value: `📝 **Motivo:** ${target.reason}\n⏰ **Dalle:** <t:${startSec}:t> (${elapsedFormatted})`,
          inline: false
        });
      }

      await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } }).catch(async () => {
        await message.channel.send({ embeds: [embed] }).catch(() => {});
      });
    }
  }
};

export default AFKManager;

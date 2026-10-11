import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { DatabaseHelper } from '../../database/db.js';

/**
 * Downloads an external or Discord CDN image/file into a local Buffer
 * @param {string} url
 * @returns {Promise<Buffer|null>}
 */
async function downloadBuffer(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[WebhookReplacer] Impossibile scaricare immagine da ${url} (Status: ${res.status})`);
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error('[WebhookReplacer] Errore di rete durante il download dell\'immagine:', err.message);
    return null;
  }
}

/**
 * Derives a clean extension from a URL or filename
 * @param {string} url
 * @param {string} fallback
 * @returns {string}
 */
function getExtension(url, fallback = 'png') {
  try {
    const cleanUrl = url.split('?')[0].split('#')[0];
    const match = cleanUrl.match(/\.([a-zA-Z0-9]+)$/);
    if (match && match[1]) {
      const ext = match[1].toLowerCase();
      if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
        return ext;
      }
    }
  } catch {}
  return fallback;
}

export const WebhookReplacerManager = {
  /**
   * Replaces a webhook or bot message by cloning its embeds/content,
   * re-uploading all images as Sentry's own attachments, and deleting the original.
   * @param {import('discord.js').Message} message
   * @param {object} options
   * @returns {Promise<{success: boolean, newMessage?: import('discord.js').Message, error?: string}>}
   */
  async replaceMessage(message, options = {}) {
    if (!message || !message.channel || !message.guild) {
      return { success: false, error: 'Messaggio o canale non valido.' };
    }

    try {
      const files = [];
      const msgId = message.id;

      // 1. Re-host direct message attachments
      if (message.attachments && message.attachments.size > 0) {
        let attIndex = 0;
        for (const [_, att] of message.attachments) {
          const buf = await downloadBuffer(att.url);
          if (buf) {
            const ext = getExtension(att.name || att.url, 'png');
            const fileName = `sentry_att_${msgId}_${attIndex}.${ext}`;
            files.push(new AttachmentBuilder(buf, { name: fileName }));
            attIndex++;
          }
        }
      }

      // 2. Process all embeds
      const newEmbeds = [];
      if (message.embeds && message.embeds.length > 0) {
        let embedIndex = 0;
        for (const oldEmbed of message.embeds) {
          const newEmbed = new EmbedBuilder();

          if (oldEmbed.title) newEmbed.setTitle(oldEmbed.title);
          if (oldEmbed.description) newEmbed.setDescription(oldEmbed.description);
          if (oldEmbed.url) newEmbed.setURL(oldEmbed.url);
          if (oldEmbed.color) newEmbed.setColor(oldEmbed.color);
          if (oldEmbed.timestamp) newEmbed.setTimestamp(new Date(oldEmbed.timestamp));

          if (oldEmbed.fields && oldEmbed.fields.length > 0) {
            newEmbed.setFields(
              oldEmbed.fields.map(f => ({
                name: f.name || '\u200B',
                value: f.value || '\u200B',
                inline: Boolean(f.inline)
              }))
            );
          }

          if (oldEmbed.author) {
            newEmbed.setAuthor({
              name: oldEmbed.author.name || '\u200B',
              iconURL: oldEmbed.author.iconURL || undefined,
              url: oldEmbed.author.url || undefined
            });
          }

          if (oldEmbed.footer) {
            newEmbed.setFooter({
              text: oldEmbed.footer.text || '\u200B',
              iconURL: oldEmbed.footer.iconURL || undefined
            });
          }

          // Re-host main Embed Image to Sentry
          if (oldEmbed.image?.url) {
            const imgBuf = await downloadBuffer(oldEmbed.image.url);
            if (imgBuf) {
              const ext = getExtension(oldEmbed.image.url, 'png');
              const imgFileName = `sentry_embed_${msgId}_${embedIndex}_img.${ext}`;
              files.push(new AttachmentBuilder(imgBuf, { name: imgFileName }));
              newEmbed.setImage(`attachment://${imgFileName}`);
            } else {
              newEmbed.setImage(oldEmbed.image.url);
            }
          }

          // Re-host Embed Thumbnail to Sentry
          if (oldEmbed.thumbnail?.url) {
            const thumbBuf = await downloadBuffer(oldEmbed.thumbnail.url);
            if (thumbBuf) {
              const ext = getExtension(oldEmbed.thumbnail.url, 'png');
              const thumbFileName = `sentry_embed_${msgId}_${embedIndex}_thumb.${ext}`;
              files.push(new AttachmentBuilder(thumbBuf, { name: thumbFileName }));
              newEmbed.setThumbnail(`attachment://${thumbFileName}`);
            } else {
              newEmbed.setThumbnail(oldEmbed.thumbnail.url);
            }
          }

          newEmbeds.push(newEmbed);
          embedIndex++;
        }
      }

      // If message had neither embeds nor attachments, and no text, nothing to replace
      if (newEmbeds.length === 0 && files.length === 0 && !message.content) {
        return { success: false, error: 'Il messaggio non contiene testo, embed o immagini da sostituire.' };
      }

      // 3. Build payload and send as Sentry
      const sendPayload = {};
      if (message.content) {
        sendPayload.content = message.content;
      }
      if (newEmbeds.length > 0) {
        sendPayload.embeds = newEmbeds;
      }
      if (files.length > 0) {
        sendPayload.files = files;
      }

      const sentMessage = await message.channel.send(sendPayload);

      // 4. Delete the original webhook / bot message
      try {
        await message.delete();
      } catch (delErr) {
        console.warn('[WebhookReplacer] Impossibile eliminare il messaggio originale (mancano permessi ManageMessages?):', delErr.message);
      }

      console.log(`[WebhookReplacer] Messaggio ${message.id} sostituito con successo da Sentry (Nuovo ID: ${sentMessage.id}, Immagini riassegnate: ${files.length})`);
      return { success: true, newMessage: sentMessage };
    } catch (err) {
      console.error('[WebhookReplacer] Errore durante la sostituzione del messaggio:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Automatically handles incoming messages in channels configured for webhook replacement
   * @param {import('discord.js').Message} message
   * @returns {Promise<boolean>} Whether the message was replaced
   */
  async handleIncomingMessage(message) {
    if (!message.guild) return false;

    // Never replace messages sent by this bot itself!
    if (message.author?.id === message.client?.user?.id) return false;

    // Must be either a webhook or a bot
    const isWebhookOrBot = Boolean(message.webhookId) || Boolean(message.author?.bot);
    if (!isWebhookOrBot) return false;

    const isEnabled = DatabaseHelper.isWebhookReplacerChannel(message.guild.id, message.channel.id);
    if (!isEnabled) return false;

    const result = await this.replaceMessage(message);
    return result.success;
  },

  /**
   * Replaces messages in bulk from a channel in chronological order
   * @param {import('discord.js').TextChannel} channel
   * @param {object} options
   * @returns {Promise<{total: number, replaced: number, failed: number}>}
   */
  async replaceBulk(channel, { limit = 50, authorId = null, onlyWebhooks = true, progressCallback = null } = {}) {
    if (!channel || !channel.messages) {
      return { total: 0, replaced: 0, failed: 0 };
    }

    const maxLimit = Math.min(100, Math.max(1, limit));
    const fetched = await channel.messages.fetch({ limit: maxLimit });
    const botId = channel.client.user?.id;

    const toReplace = [];
    for (const [_, msg] of fetched) {
      // Never replace Sentry's own messages
      if (msg.author.id === botId) continue;

      // Filter by specific author/webhook if requested
      if (authorId && msg.author.id !== authorId && msg.webhookId !== authorId) continue;

      // Filter to only webhooks / external bots
      if (onlyWebhooks && !msg.webhookId && !msg.author.bot) continue;

      // Must have at least embeds, attachments, or text
      if (msg.embeds.length === 0 && msg.attachments.size === 0 && !msg.content) continue;

      toReplace.push(msg);
    }

    if (toReplace.length === 0) {
      return { total: 0, replaced: 0, failed: 0 };
    }

    // Sort chronologically from oldest to newest so they are re-posted in proper chronological order
    toReplace.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    let replacedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < toReplace.length; i++) {
      const msg = toReplace[i];
      try {
        const res = await this.replaceMessage(msg);
        if (res.success) {
          replacedCount++;
        } else {
          failedCount++;
        }
      } catch (e) {
        failedCount++;
      }

      if (progressCallback && (i % 2 === 0 || i === toReplace.length - 1)) {
        await progressCallback(i + 1, toReplace.length, replacedCount);
      }

      // Small delay between replacements to respect Discord rate limits
      await new Promise(r => setTimeout(r, 800));
    }

    return { total: toReplace.length, replaced: replacedCount, failed: failedCount };
  }
};

export default WebhookReplacerManager;

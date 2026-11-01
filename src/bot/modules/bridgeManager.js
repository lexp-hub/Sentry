import { DatabaseHelper } from '../../database/db.js';
import { EmbedBuilder } from 'discord.js';
import { cleanYapinImageUrl } from '../../../yapin/src/yapper.js';

let discordBot = null;
let yapinBotInstance = null;
let isInitialized = false;

const yapinUserCache = new Map(); // userId -> { nick, avatar, timestamp }

async function resolveYapinAuthor(bot, msg, bridge) {
  const authorId = msg.author_id || msg.id;
  if (!authorId) return { nick: 'Cavaliere Yapin', avatar: null };

  const cached = yapinUserCache.get(authorId);
  if (cached && (Date.now() - cached.timestamp < 300000)) {
    return { nick: cached.nick, avatar: cached.avatar };
  }

  let nick = msg.member?.nickname || msg.nickname || msg.author?.nickname || msg.author?.display_name || msg.author?.username;
  let avatar = msg.author?.avatar_url || null;

  // 1. Prova a recuperare il membro del server per nickname locale
  const serverId = msg.server_id || bridge?.yapin_server_id;
  if (serverId && bot && typeof bot.member === 'function') {
    try {
      const mem = await bot.member(serverId, authorId).catch(() => null);
      if (mem) {
        if (mem.nickname) nick = mem.nickname;
        else if (mem.profile?.display_name) nick = mem.profile.display_name;
        else if (mem.profile?.username) nick = mem.profile.username;
        if (mem.profile?.avatar_url) avatar = mem.profile.avatar_url;
      }
    } catch (e) {}
  }

  // 2. Fallback su profilo utente globale
  if ((!nick || !avatar) && bot && typeof bot.user === 'function') {
    try {
      const u = await bot.user(authorId).catch(() => null);
      if (u) {
        if (!nick) nick = u.display_name || u.username;
        if (!avatar && u.avatar_url) avatar = u.avatar_url;
      }
    } catch (e) {}
  }

  if (!nick) nick = msg.username || msg.author_name || 'Cavaliere Yapin';

  yapinUserCache.set(authorId, { nick, avatar, timestamp: Date.now() });
  return { nick, avatar };
}

export const BridgeManager = {
  /**
   * Inizializza il Bridge tra Discord e Yapin
   */
  init(discordClient, yapinBot) {
    discordBot = discordClient || discordBot;
    yapinBotInstance = yapinBot || yapinBotInstance;

    if (isInitialized) return;
    isInitialized = true;

    console.log('[Bridge Engine] Inizializzazione Ponte Cross-Platform Discord <-> Yapin...');

    // 1. Ascolto messaggi in arrivo da Discord -> Inoltro a Yapin in formato Lettera
    if (discordBot) {
      discordBot.on('messageCreate', async (message) => {
        if (!message || message.author?.bot || !message.guild || !message.channel) return;

        const bridge = DatabaseHelper.getBridgeForDiscordChannel(message.channel.id);
        if (!bridge || !bridge.enabled || !bridge.sync_messages) return;
        if (!yapinBotInstance) return;

        try {
          const userNick = message.member?.nickname || message.member?.displayName || message.author.globalName || message.author.username;
          const avatarUrl = message.author.displayAvatarURL ? message.author.displayAvatarURL({ extension: 'png', size: 128 }) : null;
          const text = message.cleanContent || message.content || '';
          const quoteText = text ? text.split('\n').map(line => `> ${line}`).join('\n') : '> *(Nessun testo, solo allegato)*';

          // Risoluzione destinatario: se è una risposta a un messaggio o menzione
          let recipientNick = null;
          if (message.reference?.messageId) {
            try {
              const repliedMsg = message.channel.messages.cache.get(message.reference.messageId) ||
                                 await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
              if (repliedMsg) {
                if (repliedMsg.author?.id === discordBot.user?.id && repliedMsg.embeds?.length > 0) {
                  const senderField = repliedMsg.embeds[0].fields?.find(f => f.name === 'Mittente');
                  if (senderField?.value) {
                    recipientNick = senderField.value.replace(/\*\*/g, '').trim();
                  }
                }
                if (!recipientNick) {
                  recipientNick = repliedMsg.member?.nickname || repliedMsg.member?.displayName || repliedMsg.author?.globalName || repliedMsg.author?.username;
                }
              }
            } catch (e) {}
          }

          if (!recipientNick && message.mentions?.members?.size > 0) {
            const firstMember = message.mentions.members.filter(m => !m.user.bot).first();
            if (firstMember) {
              recipientNick = firstMember.nickname || firstMember.displayName || firstMember.user.username;
            }
          }

          const destDisplay = recipientNick ? `**${recipientNick}**` : `**#${bridge.name || 'Canale Yapin'}**`;

          const yapinEmbed = {
            title: '[Lettera dal Reame] Ponte Cross-Platform',
            description: quoteText,
            color: 0x5865f2,
            fields: [
              {
                name: 'Mittente',
                value: `**${userNick}**`,
                inline: true
              },
              {
                name: 'Destinatario',
                value: destDisplay,
                inline: true
              }
            ],
            footer: {
              text: 'Sigillo Sentry Bridge \u2022 Consegnato da Discord a Yapin'
            },
            timestamp: new Date().toISOString()
          };

          const cleanAvatar = cleanYapinImageUrl(avatarUrl);
          yapinEmbed.author = {
            name: userNick,
            icon_url: cleanAvatar || undefined
          };

          if (message.attachments?.size > 0) {
            const images = [];
            const otherFiles = [];
            for (const att of message.attachments.values()) {
              if (att.contentType?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(att.url)) {
                images.push(att.url);
              } else {
                otherFiles.push(`[${att.name || 'File'}](${att.url})`);
              }
            }
            if (images.length > 0) {
              const cleanFirst = cleanYapinImageUrl(images[0]);
              if (cleanFirst) {
                yapinEmbed.image = { url: cleanFirst };
              } else {
                otherFiles.unshift(`[Immagine](${images[0]})`);
              }
            }
            if (otherFiles.length > 0 || (images.length > 1 && yapinEmbed.image)) {
              const extraImgs = yapinEmbed.image ? images.slice(1) : images;
              const extra = [...extraImgs.map(u => `[Immagine](${u})`), ...otherFiles].join(' \u2022 ');
              if (extra) {
                yapinEmbed.fields.push({
                  name: 'Allegati Sigillati',
                  value: extra,
                  inline: false
                });
              }
            }
          }

          await yapinBotInstance.send(bridge.yapin_channel_id, '', { embeds: [yapinEmbed] });
          console.log(`[Bridge \u2794 Yapin] Lettera inoltrata da Discord #${message.channel.name} a Yapin (${bridge.name})`);
        } catch (err) {
          console.error('[Bridge Error: Discord to Yapin]:', err.message);
        }
      });
    }

    // 2. Ascolto messaggi in arrivo da Yapin -> Inoltro a Discord in formato Lettera
    if (yapinBotInstance && typeof yapinBotInstance.on === 'function') {
      yapinBotInstance.on('message', async (msg) => {
        if (!msg || !msg.channel_id) return;
        if (yapinBotInstance.me && msg.author_id === yapinBotInstance.me.id) return;

        const bridge = DatabaseHelper.getBridgeForYapinChannel(msg.channel_id);
        if (!bridge || !bridge.enabled || !bridge.sync_messages) return;
        if (!discordBot?.isReady()) return;

        try {
          const channel = discordBot.channels.cache.get(bridge.discord_channel_id) ||
                          await discordBot.channels.fetch(bridge.discord_channel_id).catch(() => null);
          if (!channel || !channel.isTextBased()) return;

          // Risoluzione mittente su Yapin (nickname locale o display name globale)
          const { nick: userNick, avatar: avatarUrl } = await resolveYapinAuthor(yapinBotInstance, msg, bridge);

          const text = msg.content || '';
          const quoteText = text ? text.split('\n').map(line => `> ${line}`).join('\n') : '> *(Nessun testo)*';

          // Risoluzione destinatario: se è una risposta a un messaggio o menzione su Yapin
          let recipientNick = null;
          if (msg.reply_to && yapinBotInstance.message) {
            try {
              const orig = await yapinBotInstance.message(msg.channel_id, msg.reply_to).catch(() => null);
              if (orig) {
                if (orig.embeds && Array.isArray(orig.embeds) && orig.embeds.length > 0) {
                  const senderField = orig.embeds[0].fields?.find(f => f.name === 'Mittente');
                  if (senderField?.value) {
                    recipientNick = senderField.value.replace(/\*\*/g, '').trim();
                  }
                }
                if (!recipientNick && orig.author_id) {
                  const resolved = await resolveYapinAuthor(yapinBotInstance, orig, bridge);
                  recipientNick = resolved.nick;
                }
              }
            } catch (e) {}
          }

          if (!recipientNick && msg.content) {
            const mentionMatch = msg.content.match(/<@([a-zA-Z0-9_-]+)>/);
            if (mentionMatch && mentionMatch[1] !== yapinBotInstance.me?.id) {
              const resolved = await resolveYapinAuthor(yapinBotInstance, { author_id: mentionMatch[1] }, bridge);
              if (resolved.nick && resolved.nick !== 'Cavaliere Yapin') {
                recipientNick = resolved.nick;
              }
            }
          }

          const destDisplay = recipientNick ? `**${recipientNick}**` : `**#${channel.name}**`;

          const discordEmbed = new EmbedBuilder()
            .setTitle('[Lettera dal Reame] Ponte Cross-Platform')
            .setDescription(quoteText)
            .setColor(0x10b981)
            .addFields(
              {
                name: 'Mittente',
                value: `**${userNick}**`,
                inline: true
              },
              {
                name: 'Destinatario',
                value: destDisplay,
                inline: true
              }
            )
            .setFooter({ text: 'Sigillo Sentry Bridge \u2022 Consegnato da Yapin a Discord' })
            .setTimestamp();

          if (avatarUrl) {
            discordEmbed.setAuthor({
              name: userNick,
              iconURL: avatarUrl
            });
          }

          if (msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0) {
            const first = msg.attachments[0];
            if (typeof first === 'string') discordEmbed.setImage(first);
            else if (first?.url) discordEmbed.setImage(first.url);
          }

          await channel.send({ embeds: [discordEmbed] });
          console.log(`[Bridge \u2794 Discord] Lettera inoltrata da Yapin a Discord #${channel.name} (${bridge.name})`);
        } catch (err) {
          console.error('[Bridge Error: Yapin to Discord]:', err.message);
        }
      });
    }
  },

  getYapinBot() {
    return yapinBotInstance;
  },

  getDiscordBot() {
    return discordBot;
  },

  getStatus() {
    return {
      discordConnected: Boolean(discordBot?.isReady()),
      yapinConnected: Boolean(yapinBotInstance),
      activeBridgesCount: DatabaseHelper.getAllBridges().filter(b => b.enabled).length
    };
  }
};


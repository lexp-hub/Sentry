import { DatabaseHelper } from '../../database/db.js';
import { EmbedBuilder } from 'discord.js';

let discordBot = null;
let yapinBotInstance = null;
let isInitialized = false;

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
          const authorName = message.member?.displayName || message.author.username;
          const avatarUrl = message.author.displayAvatarURL ? message.author.displayAvatarURL({ extension: 'png', size: 128 }) : null;
          const text = message.cleanContent || message.content || '';
          const quoteText = text ? text.split('\n').map(line => `> ${line}`).join('\n') : '> *(Nessun testo, solo allegato)*';

          const yapinEmbed = {
            title: '[Lettera dal Reame] Ponte Cross-Platform',
            description: quoteText,
            color: 0x5865f2,
            fields: [
              {
                name: 'Mittente',
                value: `**${authorName}** (#${message.channel.name} su Discord)`,
                inline: true
              },
              {
                name: 'Destinatario',
                value: `**${bridge.name || 'Canale Yapin'}** (su Yapin)`,
                inline: true
              }
            ],
            footer: {
              text: 'Sigillo Sentry Bridge \u2022 Consegnato da Discord a Yapin'
            },
            timestamp: new Date().toISOString()
          };

          if (avatarUrl) {
            yapinEmbed.author = {
              name: `Da: ${authorName}`,
              icon_url: avatarUrl
            };
          }

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
              yapinEmbed.image = { url: images[0] };
            }
            if (otherFiles.length > 0 || images.length > 1) {
              const extra = [...images.slice(1).map(u => `[Immagine](${u})`), ...otherFiles].join(' \u2022 ');
              yapinEmbed.fields.push({
                name: 'Allegati Sigillati',
                value: extra,
                inline: false
              });
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

          const authorName = msg.author?.display_name || msg.author?.username || 'Cavaliere Yapin';
          const avatarUrl = msg.author?.avatar_url || null;
          const text = msg.content || '';
          const quoteText = text ? text.split('\n').map(line => `> ${line}`).join('\n') : '> *(Nessun testo)*';

          const discordEmbed = new EmbedBuilder()
            .setTitle('[Lettera dal Reame] Ponte Cross-Platform')
            .setDescription(quoteText)
            .setColor(0x10b981)
            .addFields(
              {
                name: 'Mittente',
                value: `**${authorName}** (${bridge.name || 'Canale Yapin'} su Yapin)`,
                inline: true
              },
              {
                name: 'Destinatario',
                value: `**#${channel.name}** (su Discord)`,
                inline: true
              }
            )
            .setFooter({ text: 'Sigillo Sentry Bridge \u2022 Consegnato da Yapin a Discord' })
            .setTimestamp();

          if (avatarUrl) {
            discordEmbed.setAuthor({
              name: `Da: ${authorName}`,
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


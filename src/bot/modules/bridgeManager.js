import { DatabaseHelper } from '../../database/db.js';

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

    // 1. Ascolto messaggi in arrivo da Discord -> Inoltro a Yapin
    if (discordBot) {
      discordBot.on('messageCreate', async (message) => {
        if (!message || message.author?.bot || !message.guild || !message.channel) return;

        const bridge = DatabaseHelper.getBridgeForDiscordChannel(message.channel.id);
        if (!bridge || !bridge.enabled || !bridge.sync_messages) return;
        if (!yapinBotInstance) return;

        try {
          const authorName = message.member?.displayName || message.author.username;
          const text = message.cleanContent || message.content || '';
          
          let outMessage = `**[Discord | ${authorName}]**: ${text}`;
          if (message.attachments?.size > 0) {
            const urls = Array.from(message.attachments.values()).map(a => a.url).join(' ');
            outMessage += `\n📎 ${urls}`;
          }

          await yapinBotInstance.send(bridge.yapin_channel_id, outMessage);
          console.log(`[Bridge ➔ Yapin] Inoltrato messaggio da Discord #${message.channel.name} a Yapin (${bridge.name})`);
        } catch (err) {
          console.error('[Bridge Error: Discord to Yapin]:', err.message);
        }
      });
    }

    // 2. Ascolto messaggi in arrivo da Yapin -> Inoltro a Discord
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

          const authorName = msg.author?.display_name || msg.author?.username || 'Yapin User';
          const outMessage = `**[Yapin | ${authorName}]**: ${msg.content || ''}`;

          await channel.send({ content: outMessage });
          console.log(`[Bridge ➔ Discord] Inoltrato messaggio da Yapin a Discord #${channel.name} (${bridge.name})`);
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

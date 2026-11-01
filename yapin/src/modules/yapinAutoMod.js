import { DatabaseHelper } from '../../../src/database/db.js';

const DEFAULT_BAD_WORDS = [
  'cazzo', 'merda', 'puttana', 'troia', 'vaffanculo', 'stronzo', 'coglione', 'bocchinaro',
  'fuck', 'bitch', 'asshole', 'dick', 'pussy', 'nigger', 'nigga', 'faggot', 'whore'
];

const INVITE_REGEX = /(?:discord\.gg\/|discord\.com\/invite\/|yapin\.gg\/invite\/|t\.me\/|telegram\.me\/)[a-zA-Z0-9_-]+/i;
const userMessageHistory = new Map(); // authorId -> timestamps[]

export const YapinAutoMod = {
  /**
   * Scans an incoming message for AutoMod infractions.
   * Returns true if message was flagged and handled.
   */
  async handleMessage(bot, msg) {
    if (!msg || !msg.server_id || !msg.author_id) return false;
    if (msg.author_bot || msg.author_id === bot.me?.id) return false;

    const guildKey = `yapin_${msg.server_id}`;
    let config = null;
    try {
      config = DatabaseHelper.getAutomodConfig(guildKey);
    } catch (e) {
      config = { anti_invite: true, bad_words: [], anti_spam: true, anti_caps: false, ignored_channels: [] };
    }

    if (config?.ignored_channels && config.ignored_channels.includes(msg.channel_id)) {
      return false;
    }

    const content = msg.content || '';
    const now = Date.now();

    // 1. Anti-Spam (Rate limiting: more than 5 messages in 3 seconds)
    if (config?.anti_spam) {
      const timestamps = userMessageHistory.get(msg.author_id) || [];
      const recent = timestamps.filter(t => now - t < 3000);
      recent.push(now);
      userMessageHistory.set(msg.author_id, recent);

      if (recent.length > 5) {
        userMessageHistory.delete(msg.author_id);
        await this.penalize(bot, msg, 'Spam rilevato (troppi messaggi in poco tempo)', 5);
        return true;
      }
    }

    // 2. Anti-Invites (Discord, Telegram, Yapin unauthorized invites)
    if (config?.anti_invite && INVITE_REGEX.test(content)) {
      await this.penalize(bot, msg, 'Link d\'invito non autorizzato', 10);
      return true;
    }

    // 3. Anti-Bad Words
    const customBadwords = Array.isArray(config?.bad_words) ? config.bad_words : [];
    const badwords = [...DEFAULT_BAD_WORDS, ...customBadwords];

    const lower = content.toLowerCase();
    const found = badwords.some(word => {
      if (!word) return false;
      const reg = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return reg.test(lower);
    });

    if (found) {
      await this.penalize(bot, msg, 'Linguaggio inappropriato / Profanità', 5);
      return true;
    }

    // 4. Anti-Caps (Excessive uppercase)
    if (config?.anti_caps && content.length >= 12) {
      const letters = content.replace(/[^a-zA-Z]/g, '');
      if (letters.length >= 10) {
        const uppers = letters.replace(/[^A-Z]/g, '').length;
        if (uppers / letters.length >= 0.75) {
          await this.penalize(bot, msg, 'Uso eccessivo di MAIUSCOLE (Caps)', 2);
          return true;
        }
      }
    }

    return false;
  },

  async penalize(bot, msg, reason, timeoutMinutes = 5) {
    try {
      // 1. Cancella il messaggio incriminato
      if (msg.channel_id && msg.id) {
        await bot.delete(msg.channel_id, msg.id).catch(() => {});
      }

      // 2. Timeout utente nativo Yapin
      if (typeof bot.timeout === 'function' && msg.server_id && msg.author_id) {
        await bot.timeout(msg.server_id, msg.author_id, timeoutMinutes, `[Sentry AutoMod] ${reason}`).catch(() => {});
      }

      // 3. Notifica di avviso nel canale
      const userMention = `<@${msg.author_id}>`;
      await bot.send(msg.channel_id, `🛡️ **[Sentry AutoMod]** ${userMention} è stato silenziato per **${timeoutMinutes}m**.\n> **Motivo:** ${reason}`);
    } catch (err) {
      console.warn('[Yapin AutoMod] Errore applicazione sanzione:', err.message);
    }
  }
};

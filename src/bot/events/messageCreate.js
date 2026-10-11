import { AutoModManager } from '../modules/automodManager.js';
import { XPManager } from '../modules/xpManager.js';
import { AIManager } from '../modules/aiManager.js';
import { CountingManager } from '../modules/countingManager.js';
import { SetupShowcaseManager } from '../modules/setupShowcaseManager.js';
import { StopwatchManager } from '../modules/stopwatchManager.js';
import { WebhookReplacerManager } from '../modules/webhookReplacerManager.js';
import { BoostManager } from '../modules/boostManager.js';
import { AFKManager } from '../modules/afkManager.js';
import { DatabaseHelper } from '../../database/db.js';
import { EmbedBuilder } from 'discord.js';

export default {
  name: 'messageCreate',
  async execute(message) {
    if (!message.guild) return;

    // Never process messages sent by Sentry itself
    if (message.author.id === message.client.user?.id) return;

    // Handle Discord System Nitro Boost messages
    await BoostManager.handleMessageBoost(message);

    // 0. Webhook & Bot Message Replacer (Image re-hosting & Embed Repost)
    if (message.webhookId || message.author.bot) {
      await WebhookReplacerManager.handleIncomingMessage(message);
      return;
    }

    // 1. Setup Showcase & BattleStation module handler
    const handledByShowcase = await SetupShowcaseManager.handleMessage(message);
    if (handledByShowcase) return;

    // 2. Counting minigame handler
    await CountingManager.handleMessage(message);

    const violated = await AutoModManager.handleMessage(message);
    if (violated) return;

    // 3. AFK System: restore author status and alert on mentions/replies
    try {
      await AFKManager.handleMessageAuthor(message);
      await AFKManager.handleMentionsAndReplies(message);
    } catch (afkErr) {
      console.error('[MessageCreate] Errore gestione AFK:', afkErr);
    }

    const emojiMatches = message.content.matchAll(/<(a?):([a-zA-Z0-9_]+):([0-9]+)>/g);
    for (const match of emojiMatches) {
      const isAnimated = match[1] === 'a';
      const emojiName = match[2];
      const emojiId = match[3];
      DatabaseHelper.trackEmojiUse(message.guild.id, emojiId, emojiName, isAnimated);
    }

    // Detect if user is replying to a welcomer message or chatting in the welcomer channel
    let isReplyingToWelcomer = false;
    let isDirectReplyToBot = false;
    const welcomerConfig = DatabaseHelper.getWelcomerConfig(message.guild.id);
    const isWelcomeChannel = Boolean(welcomerConfig?.welcome_enabled && welcomerConfig?.welcome_channel_id === message.channel.id);

    if (message.reference?.messageId) {
      let refMsg = message.channel.messages.cache.get(message.reference.messageId);
      if (!refMsg) {
        try {
          refMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
        } catch (e) {}
      }

      if (refMsg) {
        const isFromBot = refMsg.author.id === message.client.user.id || refMsg.author.bot;
        const hasWelcomeEmbed = refMsg.embeds?.some(e =>
          (e.title && /benvenut|welcome/i.test(e.title)) ||
          (e.description && /benvenut|welcome/i.test(e.description)) ||
          (e.footer?.text && /benvenut|welcome/i.test(e.footer.text))
        );
        const hasWelcomeText = refMsg.content && /benvenut|welcome/i.test(refMsg.content);

        // Only classify as welcomer if it has explicit welcome keywords or is inside the dedicated welcome channel
        if (isFromBot && (hasWelcomeEmbed || hasWelcomeText || (isWelcomeChannel && !hasWelcomeEmbed && !hasWelcomeText))) {
          isReplyingToWelcomer = true;
        } else if (refMsg.author.id === message.client.user.id) {
          // Direct reply to a regular conversational message by Sentry
          isDirectReplyToBot = true;
        }
      } else if (isWelcomeChannel) {
        isReplyingToWelcomer = true;
      }
    } else if (isWelcomeChannel) {
      // In dedicated welcomer channel, do not trigger AI unless explicit @Sentry text is written
      const hasExplicitTextMention = new RegExp(`<@!?${message.client.user.id}>`).test(message.content);
      if (!hasExplicitTextMention) {
        isReplyingToWelcomer = true;
      }
    }

    const isBotMentioned = message.mentions.has(message.client.user) && !message.mentions.everyone;
    const shouldTriggerAI = (isBotMentioned || isDirectReplyToBot) && !isReplyingToWelcomer;

    if (shouldTriggerAI) {
      try {
        await AIManager.handleMention(message);
        return;
      } catch (err) {
        console.error('[MessageCreate] Errore gestione menzione AI:', err);
      }
    }

    const autoReactChannels = DatabaseHelper.getAutoreactionChannels(message.guild.id);
    const channelConfig = autoReactChannels.find(c => c.channel_id === message.channel.id && c.enabled);
    if (channelConfig && channelConfig.emojis && channelConfig.emojis.length > 0) {
      for (const emoji of channelConfig.emojis) {
        try {
          await message.react(emoji);
        } catch (e) {}
      }
    }

    if (!isReplyingToWelcomer) {
      const autoresponders = DatabaseHelper.getAutoresponders(message.guild.id);
      const content = message.content.trim();
      const lowerContent = content.toLowerCase();

      for (const ar of autoresponders) {
        if (!ar.enabled) continue;

        if (ar.channels_whitelist.length > 0 && !ar.channels_whitelist.includes(message.channel.id)) continue;
        if (ar.roles_whitelist.length > 0 && message.member && !message.member.roles.cache.some(r => ar.roles_whitelist.includes(r.id))) continue;

        let matches = false;
        const trigger = ar.trigger;
      const lowerTrigger = trigger.toLowerCase();

      if (ar.match_type === 'EXACT') {
        matches = lowerContent === lowerTrigger;
      } else if (ar.match_type === 'STARTS_WITH') {
        matches = lowerContent.startsWith(lowerTrigger);
      } else if (ar.match_type === 'REGEX') {
        try {
          const reg = new RegExp(trigger, 'i');
          matches = reg.test(content);
        } catch (e) {}
      } else {
        matches = lowerContent.includes(lowerTrigger);
      }

      if (matches) {
        if (ar.auto_reactions && Array.isArray(ar.auto_reactions)) {
          for (const em of ar.auto_reactions) {
            await message.react(em).catch(() => {});
          }
        }

        if (ar.response_text) {
          await message.channel.send({ content: ar.response_text }).catch(() => {});
        }

        if (ar.response_embed) {
          const embed = new EmbedBuilder(ar.response_embed);
          await message.channel.send({ embeds: [embed] }).catch(() => {});
        }
        break;
      }
    }
  }

    await XPManager.handleMessage(message);

    // 4. Sticky Stopwatch floating repositioning
    await StopwatchManager.handleChannelMessage(message);
  }
};

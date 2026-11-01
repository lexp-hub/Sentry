import { AIManager } from '../../../src/bot/modules/aiManager.js';

export const YapinAI = {
  async handleQuery(ctx, promptText) {
    if (!promptText || promptText.trim().length === 0) {
      return ctx.reply('Chiedimi qualsiasi cosa! Es: `/ai spiegami come funziona la crittografia E2EE di Yapin`');
    }

    try {
      const waitMsg = await ctx.reply('*Sentry Neural Core sta elaborando la risposta...*');

      const messages = [
        { role: 'user', content: promptText }
      ];

      const systemPrompt = "Sei 'Sentry', la sentinella AI avanzata a guardia delle community di Yapin e Discord. Sei acuto, intelligente, leggermente sarcastico ed estremamente competente sulla sicurezza informatica, moderazione e tecnologia. Rispondi in italiano in modo conciso (massimo 400 caratteri).";

      const aiReply = await AIManager.getAIResponse(messages, systemPrompt);
      const replyText = aiReply || 'Non sono riuscito a generare una risposta al momento.';

      // Modifica il messaggio provvisorio sul posto, oppure invia risposta diretta senza embed
      if (waitMsg?.id && ctx.bot?.edit && ctx.channel_id) {
        try {
          await ctx.bot.edit(ctx.channel_id, waitMsg.id, replyText);
          return;
        } catch (e) {
          try { await ctx.bot.delete(ctx.channel_id, waitMsg.id); } catch (_) {}
        }
      } else if (waitMsg?.id && ctx.bot?.delete && ctx.channel_id) {
        try { await ctx.bot.delete(ctx.channel_id, waitMsg.id); } catch (_) {}
      }

      await ctx.reply(replyText);
    } catch (err) {
      console.error('[Yapin AI Error]:', err.message);
      ctx.reply(`[Error] Errore durante l'interrogazione dell'AI: ${err.message}`);
    }
  }
};

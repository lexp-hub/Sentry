import { AIManager } from '../../../src/bot/modules/aiManager.js';
import { Embed } from '../yapper.js';

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

      const embed = new Embed()
        .title('[AI] Sentry Neural Core (Llama 70B)')
        .field('Domanda', `*${promptText.slice(0, 150)}*`)
        .description(aiReply || 'Non sono riuscito a generare una risposta al momento.')
        .color('#6366f1');

      if (waitMsg?.id && ctx.channel_id) {
        try {
          await ctx.bot.delete(ctx.channel_id, waitMsg.id);
        } catch (e) {}
      }

      ctx.reply('', { embeds: [embed] });
    } catch (err) {
      console.error('[Yapin AI Error]:', err.message);
      ctx.reply(`[Error] Errore durante l'interrogazione dell'AI: ${err.message}`);
    }
  }
};

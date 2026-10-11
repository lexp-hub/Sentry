import fs from 'fs';
import { CONFIG } from '../../config.js';
import { DatabaseHelper } from '../../database/db.js';

let DEFAULT_IDENTITY = "";

export function loadDefaultPrompt() {
  try {
    if (fs.existsSync(CONFIG.PROMPT_PATH)) {
      const promptData = JSON.parse(fs.readFileSync(CONFIG.PROMPT_PATH, 'utf-8'));
      if (promptData && typeof promptData.baseIdentity === 'string' && promptData.baseIdentity.trim().length > 0) {
        DEFAULT_IDENTITY = promptData.baseIdentity.trim();
        return DEFAULT_IDENTITY;
      }
    }
  } catch (err) {
    console.error("[Sentry AI] Errore nel caricamento del file prompt.json:", err.message);
  }

  if (!DEFAULT_IDENTITY || DEFAULT_IDENTITY.trim().length === 0) {
    DEFAULT_IDENTITY = "Sei 'Sentry', un'intelligenza artificiale avanzata, analista cinico e sentinella di sicurezza del server. Proteggi la verità e smonti i ragionamenti fallati di chiunque ti si ponga davanti. Rispondi con stile sarcastico, secco e pungente in massimo 300 caratteri.";
  }
  return DEFAULT_IDENTITY;
}

loadDefaultPrompt();

export const AIManager = {
  loadPrompt: loadDefaultPrompt,

  async getAIResponse(messages, systemPrompt = DEFAULT_IDENTITY, modelOverride = null) {
    const model = modelOverride || CONFIG.CLOUDFLARE_MODEL;
    const accountId = CONFIG.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = CONFIG.CLOUDFLARE_API_TOKEN;

    if (accountId && apiToken) {
      try {
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messages: [{ role: 'system', content: systemPrompt }, ...messages],
              max_tokens: 512,
              temperature: 0.7,
              repetition_penalty: 1.15
            }),
            signal: AbortSignal.timeout(20000)
          }
        );

        if (response.ok) {
          const result = await response.json();
          let reply = result?.result?.response;
          if (reply && reply.trim().length > 0) {
            return this.formatReply(messages, reply);
          }
        } else {
          const errorText = await response.text();
          console.warn('[Sentry AI] Cloudflare AI risposta non ok:', errorText);
        }
      } catch (err) {
        console.error('[Sentry AI] Errore chiamata Cloudflare AI:', err.message);
      }
    }

    if (CONFIG.GEMINI_API_KEY) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
        const contents = messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));

        const geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents
          }),
          signal: AbortSignal.timeout(15000)
        });

        if (geminiRes.ok) {
          const gData = await geminiRes.json();
          const reply = gData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (reply && reply.trim().length > 0) {
            return this.formatReply(messages, reply);
          }
        }
      } catch (geminiErr) {
        console.error('[Sentry AI] Fallback Gemini error:', geminiErr.message);
      }
    }

    return "Sono Sentry. I miei canali neurali sono temporaneamente sovraccarichi. Riprova tra poco.";
  },

  async getVisionResponse(imageBuffer, mimeType, question, systemPrompt = DEFAULT_IDENTITY) {
    const accountId = CONFIG.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = CONFIG.CLOUDFLARE_API_TOKEN;

    const visionPrompt = `${systemPrompt}\n\nIstruzioni aggiuntive: L'utente ti ha mostrato un'immagine e ha chiesto: "${question || 'Descrivi cosa vedi in questa immagine e commentala con il tuo consueto cinismo.'}". Esamina i dettagli visivi con accuratezza e rispondi direttamente alla sua domanda in italiano, mantenendo il tuo carattere sarcastico, analitico e tagliente. Rispondi in massimo 300 caratteri.`;

    if (accountId && apiToken && imageBuffer) {
      try {
        const imageBytes = [...new Uint8Array(imageBuffer)];
        const callCFVision = async () => {
          return await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                prompt: visionPrompt,
                image: imageBytes,
                max_tokens: 350
              }),
              signal: AbortSignal.timeout(25000)
            }
          );
        };

        let response = await callCFVision();
        let result = await response.json();

        // Check if agreement is required
        if (result?.errors?.[0]?.code === 5016 || result?.errors?.[0]?.message?.includes("prompt 'agree'")) {
          console.log('[Sentry Vision] Invio agree policy a Cloudflare Vision...');
          await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ prompt: 'agree' }),
              signal: AbortSignal.timeout(15000)
            }
          );
          response = await callCFVision();
          result = await response.json();
        }

        const reply = result?.result?.response;
        if (reply && reply.trim().length > 0) {
          return this.formatReply([{ role: 'user', content: question }], reply);
        }
      } catch (err) {
        console.error('[Sentry Vision] Errore chiamata Cloudflare Vision:', err.message);
      }
    }

    if (CONFIG.GEMINI_API_KEY && imageBuffer) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
        const base64Data = Buffer.from(imageBuffer).toString('base64');
        const contents = [{
          role: 'user',
          parts: [
            { text: visionPrompt },
            { inline_data: { mime_type: mimeType || 'image/png', data: base64Data } }
          ]
        }];

        const geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents
          }),
          signal: AbortSignal.timeout(15000)
        });

        if (geminiRes.ok) {
          const gData = await geminiRes.json();
          const reply = gData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (reply && reply.trim().length > 0) {
            return this.formatReply([{ role: 'user', content: question }], reply);
          }
        }
      } catch (geminiErr) {
        console.error('[Sentry Vision] Fallback Gemini Vision error:', geminiErr.message);
      }
    }

    return "Ho rilevato l'immagine allegata, ma i miei sensori ottici hanno riscontrato un errore nel parsing visivo dei pixel. Riprova con un'immagine JPG o PNG pulita.";
  },

  formatReply(messages, reply) {
    if (!reply || typeof reply !== 'string') return "";

    let finalReply = reply.trim();

    // Guard against degenerative repeating token loops / quote soup
    const quoteCount = (finalReply.match(/"/g) || []).length;
    if (quoteCount >= 10 && (quoteCount / finalReply.length) > 0.08) {
      console.warn('[Sentry AI] Degenerative token loop detected and replaced.');
      return "Ho processato la richiesta, ma l'elaborazione dei dati ha generato un'anomalia di sequenza nei pesi neurali. Riformula la tua domanda in modo più chiaro.";
    }

    const lastUserMessage = messages[messages.length - 1]?.content?.toLowerCase() || "";
    const wantsDetail = lastUserMessage.includes("approfondi") ||
      lastUserMessage.includes("dettaglio") ||
      lastUserMessage.includes("spiega meglio") ||
      lastUserMessage.includes("continua") ||
      lastUserMessage.includes("tutto");

    if (!wantsDetail && finalReply.length > 300) {
      finalReply = finalReply.substring(0, 297);
      const lastPunc = Math.max(finalReply.lastIndexOf('.'), finalReply.lastIndexOf('!'), finalReply.lastIndexOf('?'));
      if (lastPunc > 150) {
        finalReply = finalReply.substring(0, lastPunc + 1);
      } else {
        finalReply = finalReply + '...';
      }
    }

    return finalReply.length > 2000 ? finalReply.substring(0, 1997) + '...' : finalReply;
  },

  async performWebSearch(query) {
    try {
      const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(7000)
      });
      if (res.ok) {
        const text = await res.text();
        const regex = /<a class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        const matches = [...text.matchAll(regex)];
        const results = [];
        for (let i = 0; i < Math.min(matches.length, 4); i++) {
          const rawUrl = matches[i][1];
          let url = rawUrl;
          if (url.includes('uddg=')) {
            const match = url.match(/uddg=([^&]+)/);
            if (match) url = decodeURIComponent(match[1]);
          }
          const title = matches[i][2].replace(/<[^>]*>/g, '').trim().replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
          const snippet = matches[i][3].replace(/<[^>]*>/g, '').trim().replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
          results.push(`- **${title}**\n  URL: ${url}\n  Snippet: ${snippet}`);
        }
        if (results.length > 0) return results.join("\n\n");
      }
    } catch (err) {
      console.warn("[Sentry AI] Ricerca DuckDuckGo fallita o scaduta, tento fallback Wikipedia...", err.message);
    }

    try {
      const wikiRes = await fetch(
        `https://it.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (wikiRes.ok) {
        const data = await wikiRes.json();
        const searchResults = data?.query?.search || [];
        if (searchResults.length > 0) {
          const results = searchResults.slice(0, 3).map(r => {
            const cleanSnippet = r.snippet.replace(/<[^>]*>/g, '');
            return `- **${r.title}** (Wikipedia)\n  Snippet: ${cleanSnippet}`;
          });
          return results.join("\n\n");
        }
      }
    } catch (err) {
      console.error("[Sentry AI] Fallback Wikipedia fallito:", err.message);
    }

    return "Nessun risultato rilevante trovato sul web per questa ricerca.";
  },

  async handleMention(message) {
    try {
      const { client, guild, channel, author } = message;

      // Safety guard: Never respond if replying to a welcomer message
      if (message.reference?.messageId) {
        try {
          const refMsg = channel.messages.cache.get(message.reference.messageId) || 
                         await channel.messages.fetch(message.reference.messageId).catch(() => null);
          if (refMsg) {
            const isFromBot = refMsg.author.id === client.user.id || refMsg.author.bot;
            const hasWelcomeEmbed = refMsg.embeds?.some(e =>
              (e.title && /benvenut|welcome/i.test(e.title)) ||
              (e.description && /benvenut|welcome/i.test(e.description)) ||
              (e.footer?.text && /benvenut|welcome/i.test(e.footer.text))
            );
            const hasWelcomeText = refMsg.content && /benvenut|welcome/i.test(refMsg.content);
            if (isFromBot && (hasWelcomeEmbed || hasWelcomeText)) {
              return;
            }
          }
        } catch (e) {}
      }

      const botMentionRegExp = new RegExp(`<@!?${client.user.id}>`, 'g');
      let question = message.content.replace(botMentionRegExp, '').trim();

      // Check for image attachments directly on the message
      let targetImageUrl = null;
      let targetImageMime = 'image/png';

      const imgAtt = message.attachments.find(att => 
        att.contentType?.startsWith('image/') || 
        /\.(png|jpe?g|webp|gif)$/i.test(att.name || '')
      );
      if (imgAtt) {
        targetImageUrl = imgAtt.url;
        targetImageMime = imgAtt.contentType || 'image/png';
      }

      // If not on message, check if user is replying to a message with an image
      if (!targetImageUrl && message.reference?.messageId) {
        try {
          const refMsg = channel.messages.cache.get(message.reference.messageId) || 
                         await channel.messages.fetch(message.reference.messageId).catch(() => null);
          if (refMsg) {
            const refImg = refMsg.attachments.find(att => 
              att.contentType?.startsWith('image/') || 
              /\.(png|jpe?g|webp|gif)$/i.test(att.name || '')
            );
            if (refImg) {
              targetImageUrl = refImg.url;
              targetImageMime = refImg.contentType || 'image/png';
            }
          }
        } catch (e) {}
      }

      // If not in attachments, check if text contains an image link
      if (!targetImageUrl) {
        const urlMatch = message.content.match(/https?:\/\/\S+\.(?:png|jpe?g|webp)/i);
        if (urlMatch) {
          targetImageUrl = urlMatch[0];
          targetImageMime = 'image/png';
        }
      }

      if (!question && !targetImageUrl) {
        return message.reply("Dimmi pure, sono qui a proteggere il server. (Anche se gradirei meno disturbo).");
      }

      if (!question && targetImageUrl) {
        question = "Descrivi cosa vedi in questa immagine e commentala con il tuo consueto cinismo.";
      }

      const cleanQuestion = question.toLowerCase();
      if (cleanQuestion === 'clear' || cleanQuestion === 'reset' || cleanQuestion === 'cancella memoria' || cleanQuestion === 'dimentica tutto') {
        DatabaseHelper.resetChannelMemory(channel.id);
        return message.reply("Memoria azzerata per questo canale. Di cosa stavamo parlando? Anzi, fa lo stesso, preferisco non ricordarlo.");
      }

      await channel.sendTyping();

      const guildAIConfig = guild ? DatabaseHelper.getAIConfig(guild.id) : { enabled: true };
      if (!guildAIConfig.enabled) {
        return message.reply("Il modulo Sentry AI è momentaneamente disattivato in questo server.");
      }

      if (guild) {
        const quota = DatabaseHelper.getAIQuotaStatus(guild.id);
        if (quota.is_blocked) {
          return message.reply(`⏳ **Quota AI Giornaliera Raggiunta**: Il server ha utilizzato tutte le **${quota.daily_limit}** richieste AI disponibili per oggi. Il limite si ripristinerà a mezzanotte!`);
        }
      }

      const basePrompt = guildAIConfig.system_prompt || DEFAULT_IDENTITY;
      const creatorId = CONFIG.CREATOR_ID;

      const systemPrompt = `${basePrompt}

INFORMAZIONI E STRUMENTI DISPONIBILI:
- Puoi cercare sul web in tempo reale. Se la domanda richiede informazioni aggiornate o fatti non conosciuti, rispondi ESCLUSIVAMENTE con:
  [CERCA: termine da cercare]
  Non aggiungere altro testo se decidi di cercare.

ISTRUZIONI NOMI E RUOLI DEGLI UTENTI:
- Ogni messaggio utente indica il nome reale dell'utente e il suo ruolo tra parentesi.
- Esempio: "Utente: Alex | Ruolo: Creatore del bot".
- REGOLE TASSATIVE:
  1. Il nome dell'utente è solo la parte "Utente: NOME". Rivolgiti all'utente ESCLUSIVAMENTE con il suo vero nome.
  2. Se l'utente ha ruolo "Creatore del bot", trattalo con rispetto come il tuo creatore pur mantenendo la tua fierezza cinica.`;

      const messages = [];
      const memory = DatabaseHelper.getChannelMemory(channel.id);
      const resetTime = memory.reset_timestamp || 0;

      let messagesArray = [];
      try {
        const fetched = await channel.messages.fetch({ limit: 12 });
        messagesArray = Array.from(fetched.values()).reverse();
      } catch (err) {
        messagesArray = [message];
      }

      for (const msg of messagesArray) {
        if (msg.createdTimestamp < resetTime) continue;
        if (msg.author.bot && msg.author.id !== client.user.id) continue;

        if (msg.author.id === client.user.id) {
          messages.push({
            role: 'assistant',
            content: msg.content
          });
        } else {
          const authorId = msg.author.id;
          const displayName = msg.member?.displayName || msg.author.username;
          let roleDescription = "Utente del Server";

          if (creatorId && authorId === creatorId) {
            roleDescription = "Creatore del bot";
          } else if (msg.member?.permissions.has('Administrator')) {
            roleDescription = "Amministratore del Server";
          }

          const cleanText = (msg.content || "").replace(botMentionRegExp, '').trim();
          if (!cleanText && msg.attachments.size === 0 && msg.embeds.length === 0) continue;

          let replyContext = "";
          if (msg.reference && msg.reference.messageId) {
            let refMsg = messagesArray.find(m => m.id === msg.reference.messageId);
            if (!refMsg) {
              try { refMsg = await channel.messages.fetch(msg.reference.messageId); } catch (e) {}
            }
            if (refMsg) {
              const refAuthor = refMsg.member?.displayName || refMsg.author.username;
              let refContent = refMsg.content || "[Allegato]";
              if (refContent.length > 80) refContent = refContent.substring(0, 77) + "...";
              replyContext = `[In risposta a @${refAuthor}: "${refContent}"] `;
            }
          }

          let msgText = cleanText || "[Allegato/Immagine]";
          messages.push({
            role: 'user',
            content: `${replyContext}[Utente: ${displayName} | Ruolo: ${roleDescription}]: ${msgText}`
          });
        }
      }

      let reply = "";
      let imageBuffer = null;

      if (targetImageUrl) {
        try {
          const imgRes = await fetch(targetImageUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            signal: AbortSignal.timeout(10000)
          });
          if (imgRes.ok) {
            const ab = await imgRes.arrayBuffer();
            if (ab.byteLength > 0 && ab.byteLength <= 10 * 1024 * 1024) {
              imageBuffer = Buffer.from(ab);
            }
          }
        } catch (e) {
          console.warn('[Sentry Vision] Errore o timeout scaricamento immagine:', e.message);
        }
      }

      if (imageBuffer) {
        reply = await this.getVisionResponse(imageBuffer, targetImageMime, question, systemPrompt);
      } else {
        reply = await this.getAIResponse(messages, systemPrompt, guildAIConfig.model);

        // Check if AI requested Web Search
        const searchMatch = reply.match(/\[CERCA:\s*(.*?)\]/i);
        if (searchMatch) {
          const searchQuery = searchMatch[1].trim();
          console.log(`[Sentry AI] Ricerca web attivata per: "${searchQuery}"`);

          const searchResults = await this.performWebSearch(searchQuery);

          messages.push({
            role: 'assistant',
            content: `Ricerco informazioni sul web per: "${searchQuery}".`
          });

          const finalSystemPrompt = `${basePrompt}

ISTRUZIONI PER LA RISPOSTA FINALE:
Hai appena eseguito la ricerca web. Ecco i dati aggiornati trovati per "${searchQuery}":

${searchResults}

Utilizza questi dati per rispondere all'utente. Esprimi la tua opinione cinica, spietata e sarcastica basandoti sui fatti riportati qui sopra. Rispondi in italiano in modo sintetico (massimo 300 caratteri). NON usare comandi o tag di ricerca nella risposta.`;

          reply = await this.getAIResponse(messages, finalSystemPrompt, guildAIConfig.model);
          reply = reply.replace(/\[CERCA:\s*.*?\]/gi, '').trim();
        }
      }

      if (!reply || reply.trim().length === 0) {
        reply = "Ho analizzato i dati ma l'elaborazione non ha prodotto un risultato valido. Riformula la richiesta.";
      }

      // Save in DB channel memory
      DatabaseHelper.addChannelLog(channel.id, 'user', `${author.username}: ${question}`);
      DatabaseHelper.addChannelLog(channel.id, 'assistant', reply);

      // Update Quota and check warning threshold
      let quotaNotice = "";
      if (guild) {
        const updatedQuota = DatabaseHelper.incrementAIUsage(guild.id);
        if (updatedQuota.is_warning) {
          quotaNotice = `\n\n> ⚠️ *Nota Quota AI: rimangono solo **${updatedQuota.remaining}** richieste disponibili per oggi (usate ${updatedQuota.used}/${updatedQuota.daily_limit}).*`;

          const warningTarget = Math.floor(updatedQuota.daily_limit * (updatedQuota.threshold_pct / 100));
          if (updatedQuota.warning_channel_id && updatedQuota.used === warningTarget) {
            const staffCh = guild.channels.cache.get(updatedQuota.warning_channel_id);
            if (staffCh) {
              staffCh.send({
                content: `⚠️ **Allerta Quota AI Server**: È stato raggiunto il **${updatedQuota.threshold_pct}%** del limite giornaliero AI (${updatedQuota.used}/${updatedQuota.daily_limit} richieste). Rimangono solo **${updatedQuota.remaining}** richieste prima del blocco.`
              }).catch(() => {});
            }
          }
        }
      }

      await message.reply(reply + quotaNotice).catch(() => {});
    } catch (criticalErr) {
      console.error('[Sentry AI] Errore critico handleMention:', criticalErr);
      await message.reply("Ho riscontrato un'interruzione interna durante l'elaborazione della richiesta. Riformula la tua domanda.").catch(() => {});
    }
  }
};

export default AIManager;

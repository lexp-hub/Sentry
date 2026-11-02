import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

// Polyfill global WebSocket for Node.js LTS (v18/v20) to enable real-time gateway (wss://rt.yapper.website/bot)
if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}

import { Bot, Embed, Row, Button, cleanYapinImageUrl } from './yapper.js';
import dotenv from 'dotenv';
import os from 'os';

// Sentry Modules for Yapin
import { YapinAutoMod } from './src/modules/yapinAutoMod.js';
import { YapinEconomy } from './src/modules/yapinEconomy.js';
import { YapinFishing } from './src/modules/yapinFishing.js';
import { YapinBlackjack } from './src/modules/yapinBlackjack.js';
import { YapinLeveling } from './src/modules/yapinLeveling.js';
import { YapinAI } from './src/modules/yapinAI.js';
import { YapinLiveStats } from './src/modules/yapinLiveStats.js';
import { YapinMinigames } from './src/modules/yapinMinigames.js';
import { DatabaseHelper } from '../src/database/db.js';
import { formatDuration } from '../src/bot/modules/afkManager.js';

dotenv.config();

const token = process.env.YAPPER_BOT_TOKEN;

console.log('====================================================');
console.log('         SENTRY - YAPIN PLATFORM BOT                ');
console.log('====================================================');

export const bot = new Bot(token || '', {
  gateway: 'wss://rt.yapper.website/bot',
  prefixes: ['/', '!', 'sentry '],
  log: true
});

const startTime = Date.now();

// Cache in memoria per AFK su Yapin (grace period e cooldown notifiche menzioni)
const yapinAfkCooldowns = new Map();
const yapinRecentlySetAfk = new Map();

/**
 * Normalizza il payload del messaggio per supportare sia comandi slash che prefix commands,
 * garantendo che server_id, channel_id, author_id, argv e content non siano mai undefined.
 */
function getContextData(ctx) {
  if (!ctx) return { msg: {}, serverId: null, channelId: null, authorId: null, content: '', argv: [], args: '' };
  const msg = ctx.message || ctx || {};
  const serverId = ctx.server_id || msg.server_id || null;
  const channelId = ctx.channel_id || msg.channel_id || null;
  const authorId = ctx.author_id || msg.author_id || null;
  const content = ctx.content || msg.content || '';
  
  let argv = [];
  if (Array.isArray(ctx.argv) && ctx.argv.length > 0) {
    argv = ctx.argv;
  } else if (Array.isArray(msg.argv) && msg.argv.length > 0) {
    argv = msg.argv;
  } else if (typeof ctx.args === 'string' && ctx.args.trim().length > 0) {
    argv = ctx.args.trim().split(/\s+/);
  } else if (content) {
    argv = content.trim().split(/\s+/).slice(1);
  }

  const args = argv.join(' ');
  return { msg, serverId, channelId, authorId, content, argv, args };
}

// ==========================================
// 1. GENERAL & SYSTEM DIAGNOSTICS
// ==========================================

bot.command('ping', 'Verifica i tempi di risposta e lo stato operativo di Sentry', async (ctx) => {
  const { channelId } = getContextData(ctx);
  const start = Date.now();
  const res = await ctx.reply('[Ping] Calcolo latenza Gateway Yapin...');
  const latency = Date.now() - start;
  const content = `[Pong] Latenza Gateway: \`${latency}ms\` | Stato Operativo: **Online**`;
  if (res?.id && channelId) {
    try {
      await bot.edit(channelId, res.id, content);
      return;
    } catch (e) {}
  }
  await ctx.reply(content);
});

/**
 * Genera il menu interattivo di /help suddiviso in categorie,
 * con bottoni di navigazione in-place (1:1 con il centro comandi di Discord).
 */
function buildHelpMenu(activeCategory = 'overview') {
  const dashboardUrl = (process.env.DASHBOARD_URL && !process.env.DASHBOARD_URL.includes('localhost') && !process.env.DASHBOARD_URL.includes('127.0.0.1'))
    ? process.env.DASHBOARD_URL
    : 'https://sentry.wispbyte.app';

  const embed = new Embed();

  if (activeCategory === 'mod') {
    embed
      .title('[Sentry] Modulo Moderazione & Sicurezza')
      .description('Strumenti completi per proteggere la community e gestire le infrazioni dei membri su Yapin.')
      .field('`/kick <user_id> [motivo]`', 'Espelle un membro dal server.')
      .field('`/ban <user_id> [motivo]`', 'Banna permanentemente un membro dal server.')
      .field('`/unban <user_id>`', 'Revoca il ban di un utente tramite il suo ID numerico.')
      .field('`/timeout <user_id> <minuti> [motivo]`', 'Mette in timeout temporaneo un utente (imposta a 0 per revocare).')
      .field('`/warn <user_id> [motivo]`', 'Assegna un avvertimento ufficiale e registra l\'infrazione nel database.')
      .field('`/warnings <user_id>`', 'Visualizza la cronologia sanzioni e avvertimenti registrati per un utente.')
      .field('`/clear <1-50>`', 'Elimina in blocco fino a 50 messaggi recenti nel canale.')
      .field('`/say <messaggio>`', 'Invia un annuncio formattato attraverso Sentry.')
      .field('Protezione AutoMod', 'Filtro parole vietate, blocco inviti non autorizzati e anti-spam attivi 24/7.')
      .color('#ef4444');
  } else if (activeCategory === 'eco') {
    embed
      .title('[Sentry] Modulo Economia, Pesca & Casino')
      .description('Economia virtuale unificata, pesca RPG progressiva e minigiochi con pulsanti interattivi.')
      .field('`/balance` (o `/bal`)', 'Controlla il tuo saldo monete e i Cristalli Frammento Yapin.')
      .field('`/daily`', 'Riscatta la tua ricompensa giornaliera in monete e frammenti preziosi.')
      .field('`/pay <user_id> <importo>`', 'Trasferisci monete in totale sicurezza a un altro utente.')
      .field('`/fish`', 'Lancia la canna da pesca per catturare pesci comuni, rari, leggendari e forzieri.')
      .field('`/inventory` (o `/inv`)', 'Visualizza equipaggiamento da pesca, livello della canna, fortuna e statistiche.')
      .field('`/upgrade-rod`', 'Forgia e potenzia la tua canna da pesca per aumentare le probabilit\u00E0 di cattura.')
      .field('`/blackjack <puntata>` (o `/bj`)', 'Sfida il banco a 21 con pulsanti Carta, Stai e Raddoppia in tempo reale.')
      .field('`/coinflip <testa|croce> [puntata]` (o `/cf`)', 'Lancia una moneta con puntata facoltativa.')
      .field('`/dice [facce]`', 'Lancia un dado personalizzato (da 2 a 100 facce, default: 6).')
      .color('#f59e0b');
  } else if (activeCategory === 'community') {
    embed
      .title('[Sentry] Modulo Community, Livelli & AFK')
      .description('Coinvolgimento della community, progressione XP, gestione assenze e monitoraggio del server.')
      .field('`/rank [user_id]`', 'Mostra la tua scheda livello, punti esperienza (XP) e barra di progressione percentuale.')
      .field('`/leaderboard` (o `/top`)', 'Classifica dei 10 utenti con pi\u00F9 esperienza e messaggi nel server.')
      .field('`/afk [motivo]` (o `/inattivo`)', 'Imposta il tuo stato su assente; avvisa chi ti menziona e ti d\u00E0 il bentornato al ritorno.')
      .field('Canale Counting (1:1 Discord)', 'Scrivi semplicemente il numero successivo nel canale per contare: Sentry convalida e reagisce con emoji!')
      .field('`/autorole`', 'Visualizza lo stato di assegnazione automatica dei ruoli ai nuovi arrivati.')
      .field('`/livecount`', 'Visualizza in tempo reale il rapporto tra membri online e popolazione totale del server.')
      .field('`/realm`', 'Panoramica dettagliata del Reame: canali testuali, canali vocali cifrati E2EE e statistiche.')
      .color('#8b5cf6');
  } else if (activeCategory === 'bridge') {
    embed
      .title('[Sentry] Modulo Ponte Cross-Platform (Discord <-> Yapin)')
      .description('Collegamento bidirezionale continuo e istantaneo tra i server Discord e le chat di Yapin.')
      .field('`/bridge`', 'Verifica lo stato di sincronizzazione del ponte e il canale gemellato.')
      .field('Formato a Lettera Sigillata', 'I messaggi inoltrati vengono incapsulati in lettere sigillate che mostrano mittente e canale d\'origine.')
      .field('Sincronizzazione Reattiva', 'Messaggi, formattazione markdown e allegati viaggiano tra le piattaforme senza ritardo.')
      .field('Configurazione Semplice', 'Associa o dissocia i canali gemellati direttamente dalla Dashboard Web.')
      .color('#06b6d4');
  } else {
    embed
      .title('[Sentry] Centro Comandi \u2022 Panoramica')
      .description(
        'Benvenuto nel centro di controllo e assistenza di **Sentry** su Yapin!\n' +
        'Premi i pulsanti sottostanti per esplorare nel dettaglio i comandi di ogni modulo.\n\n' +
        `\u2022 **Dashboard Web:** ${dashboardUrl}\n` +
        '\u2022 **Integrazione Ponte:** Sincronizzazione cross-platform Discord <-> Yapin attiva\n' +
        '\u2022 **Versione:** `v2.0.0` | Architettura Sicura Multi-Piattaforma'
      )
      .field('[Moderazione & Sicurezza]', '`/kick`, `/ban`, `/unban`, `/timeout`, `/warn`, `/warnings`, `/clear`, `/say`')
      .field('[Auto-Responder & Accoglienza]', 'Trigger automatici dalla Dashboard, Welcomer con schede embed personalizzate e `/autorole`')
      .field('[Economia & Minigiochi]', '`/balance`, `/daily`, `/pay`, `/fish`, `/inventory`, `/upgrade-rod`, `/blackjack`, `/coinflip`, `/dice`')
      .field('[Community & Livelli]', '`/rank`, `/leaderboard`, `/afk` (o `/inattivo`), gioco del Counting nei canali numerici')
      .field('[Ponte Cross-Platform]', '`/bridge`, inoltro automatico a pergamena sigillata bidirezionale')
      .field('[Intelligenza Artificiale]', '`/ai <domanda>` o menzione `@Sentry` per interrogare la rete neurale Llama 3.3 70B')
      .color('#10b981');
  }

  embed.timestamp();

  const makeBtn = (cat, label, customId) => {
    return activeCategory === cat
      ? Button.primary(label, customId)
      : Button.secondary(label, customId);
  };

  const row1 = new Row(
    makeBtn('overview', '[Panoramica]', 'help_cat_overview'),
    makeBtn('mod', '[Moderazione]', 'help_cat_mod'),
    makeBtn('eco', '[Economia]', 'help_cat_eco')
  );

  const row2 = new Row(
    makeBtn('community', '[Community]', 'help_cat_community'),
    makeBtn('bridge', '[Ponte]', 'help_cat_bridge'),
    Button.link('[Dashboard]', dashboardUrl)
  );

  return { embed, components: [row1, row2] };
}

bot.command('help', 'Mostra il centro comandi e la lista completa delle funzionalit\u00E0 di Sentry', (ctx) => {
  const { embed, components } = buildHelpMenu('overview');
  ctx.reply('', { embeds: [embed], components });
});

bot.command('botinfo', 'Display technical statistics, memory and uptime', (ctx) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;
  const memoryMB = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

  const embed = new Embed()
    .title('[Sentry] Technical Specifications')
    .field('Uptime', `\`${hours}h ${minutes}m ${seconds}s\``, true)
    .field('Node.js', `\`${process.version}\``, true)
    .field('RAM Usage', `\`${memoryMB} MB\``, true)
    .field('Gateway Mode', '`Real-Time WebSocket (wss://rt.yapper.website/bot)`', false)
    .field('Host Architecture', `\`${os.type()} (${os.arch()})\``, true)
    .field('Bridge Engine', '`Discord.js v14 <-> Yapper SDK`', true)
    .color('#6366f1');

  ctx.reply('', { embeds: [embed] });
});

bot.command('bridge', 'Check Cross-Platform Discord <-> Yapin bridge status', async (ctx) => {
  try {
    const { BridgeManager } = await import('../src/bot/modules/bridgeManager.js');
    const status = BridgeManager.getStatus();
    const embed = new Embed()
      .title('[Bridge] Cross-Platform Status')
      .field('Discord Gateway', status.discordConnected ? '`Connected [ONLINE]`' : '`Offline [OFFLINE]`', true)
      .field('Yapin Real-Time WS', status.yapinConnected ? '`Connected [ONLINE]`' : '`Offline [OFFLINE]`', true)
      .field('Ponti Attivi', `\`${status.activeBridgesCount}\``, true)
      .description('Tutti i messaggi nei canali collegati vengono sincronizzati bidirezionalmente in tempo reale.')
      .color('#06b6d4');
    ctx.reply('', { embeds: [embed] });
  } catch (err) {
    ctx.reply('[Bridge] Active between Discord and Yapin.');
  }
});

// ==========================================
// 2. REALM & MEMBER INSIGHTS (YAPIN EXCLUSIVE)
// ==========================================

bot.command('livecount', 'View real-time online and total member stats (Exclusive)', async (ctx) => {
  await YapinLiveStats.handleLiveCount(bot, ctx, getContextData);
});

bot.command('realm', 'Detailed Realm Hub: channels, E2EE voice and population', async (ctx) => {
  await YapinLiveStats.handleRealmOverview(bot, ctx, getContextData);
});

bot.command('serverinfo', 'Show server statistics and details', async (ctx) => {
  const { serverId } = getContextData(ctx);
  if (!serverId) return ctx.reply('[Error] Command must be executed inside a server.');

  try {
    const server = await bot.server(serverId);
    if (!server) return ctx.reply('[Error] Unable to retrieve server details.');

    const channels = await bot.channels(serverId).catch(() => []);
    const roles = await bot.roles(serverId).catch(() => []);
    const counts = await bot.memberCounts(serverId).catch(() => null);

    const embed = new Embed()
      .title(`[Server] ${server.name || 'Server Information'}`)
      .description(server.description || '*Nessuna descrizione impostata.*')
      .field('Server ID', `\`${serverId}\``)
      .field('Members', `Totale: \`${counts?.member_count ?? server.member_count ?? 1}\` | Online: \`${counts?.online_count ?? 'N/D'}\``)
      .field('Channels', `\`${channels.length}\` canali`)
      .field('Roles', `\`${roles.length}\` ruoli`)
      .color('#3b82f6');

    if (server.icon_url || server.avatar_url) {
      embed.image(server.icon_url || server.avatar_url);
    }

    ctx.reply('', { embeds: [embed] });
  } catch (err) {
    ctx.reply(`[Error] Error loading server: ${err.message}`);
  }
});

bot.command('userinfo', 'Show information about a user', async (ctx) => {
  const { argv, authorId } = getContextData(ctx);
  const targetId = argv[0]?.replace(/[<@!>]/g, '') || authorId;

  try {
    const user = await bot.user(targetId).catch(() => null);
    if (!user) return ctx.reply(`[Error] User \`${targetId}\` not found on Yapin.`);

    const embed = new Embed()
      .title(`[User Profile] ${user.display_name || user.username}`)
      .field('Username', `@${user.username}`)
      .field('User ID', `\`${user.id}\``)
      .field('Tipo Account', user.bot ? '`Bot`' : '`User`')
      .color('#06b6d4');

    if (user.avatar_url) {
      embed.image(user.avatar_url);
    }

    ctx.reply('', { embeds: [embed] });
  } catch (err) {
    ctx.reply(`[Error] User lookup error: ${err.message}`);
  }
});

bot.command('roles', 'List all configured roles on this server', async (ctx) => {
  const { serverId } = getContextData(ctx);
  if (!serverId) return ctx.reply('[Error] Command available only in servers.');

  try {
    const roles = await bot.roles(serverId).catch(() => []);
    if (roles.length === 0) return ctx.reply('[Info] No custom roles found.');

    const roleList = roles.map(r => `• **${r.name}** (\`${r.id}\`)`).slice(0, 25).join('\n');
    const embed = new Embed()
      .title(`Roles del Realm (${roles.length})`)
      .description(roleList)
      .color('#8b5cf6');

    ctx.reply('', { embeds: [embed] });
  } catch (e) {
    ctx.reply(`[Error] Error loading roles: ${e.message}`);
  }
});

bot.command('channels', 'List all text and voice channels on this server', async (ctx) => {
  const { serverId } = getContextData(ctx);
  if (!serverId) return ctx.reply('[Error] Command available only in servers.');

  try {
    const channels = await bot.channels(serverId).catch(() => []);
    if (channels.length === 0) return ctx.reply('[Info] No channels found.');

    const channelList = channels.map(c => `• **#${c.name}** (\`${c.id}\`) [${c.kind || c.type || 'text'}]`).slice(0, 25).join('\n');
    const embed = new Embed()
      .title(`Channels del Realm (${channels.length})`)
      .description(channelList)
      .color('#06b6d4');

    ctx.reply('', { embeds: [embed] });
  } catch (e) {
    ctx.reply(`[Error] Error loading channels: ${e.message}`);
  }
});

// ==========================================
// 3. MODERATION & AUTOMOD
// ==========================================

bot.command('kick', 'Espelle un membro dal server (richiede ID utente)', async (ctx) => {
  const { serverId, argv } = getContextData(ctx);
  if (!serverId) return ctx.reply('[Errore] Comando utilizzabile solo all\'interno di un server.');

  const targetId = argv[0]?.replace(/[<@!>]/g, '');
  const reason = argv.slice(1).join(' ') || 'Nessun motivo specificato';

  if (!targetId) return ctx.reply('[Uso] `/kick <user_id> [motivo]`');

  try {
    await bot.kick(serverId, targetId);
    ctx.reply(`[Kick] L'utente <@${targetId}> \u00E8 stato espulso dal server. **Motivo:** ${reason}`);
  } catch (e) {
    ctx.reply(`[Errore] Impossibile espellere l'utente: ${e.message}`);
  }
});

bot.command('ban', 'Banna un membro dal server (richiede ID utente)', async (ctx) => {
  const { serverId, argv } = getContextData(ctx);
  if (!serverId) return ctx.reply('[Errore] Comando utilizzabile solo all\'interno di un server.');

  const targetId = argv[0]?.replace(/[<@!>]/g, '');
  const reason = argv.slice(1).join(' ') || 'Nessun motivo specificato';

  if (!targetId) return ctx.reply('[Uso] `/ban <user_id> [motivo]`');

  try {
    await bot.ban(serverId, targetId);
    ctx.reply(`[Ban] L'utente <@${targetId}> \u00E8 stato bannato permanentemente. **Motivo:** ${reason}`);
  } catch (e) {
    ctx.reply(`[Errore] Impossibile bannare l'utente: ${e.message}`);
  }
});

bot.command('unban', 'Revoca il ban di un utente (richiede ID utente)', async (ctx) => {
  const { serverId, argv } = getContextData(ctx);
  if (!serverId) return ctx.reply('[Errore] Comando utilizzabile solo all\'interno di un server.');

  const targetId = argv[0]?.replace(/[<@!>]/g, '');
  if (!targetId) return ctx.reply('[Uso] `/unban <user_id>`');

  try {
    await bot.unban(serverId, targetId);
    ctx.reply(`[Unban] Il ban di <@${targetId}> \u00E8 stato revocato con successo.`);
  } catch (e) {
    ctx.reply(`[Errore] Impossibile revocare il ban: ${e.message}`);
  }
});

bot.command('timeout', 'Imposta un timeout temporaneo in minuti per un utente', async (ctx) => {
  const { serverId, argv } = getContextData(ctx);
  if (!serverId) return ctx.reply('[Errore] Comando utilizzabile solo all\'interno di un server.');

  const targetId = argv[0]?.replace(/[<@!>]/g, '');
  const minutes = parseInt(argv[1], 10);
  const reason = argv.slice(2).join(' ') || 'Timeout applicato da Sentry';

  if (!targetId || isNaN(minutes) || minutes < 0) {
    return ctx.reply('[Uso] `/timeout <user_id> <minuti> [motivo]` (imposta 0 minuti per rimuovere il timeout)');
  }

  try {
    await bot.timeout(serverId, targetId, minutes, reason);
    if (minutes === 0) {
      ctx.reply(`[Timeout] Timeout rimosso per <@${targetId}>.`);
    } else {
      ctx.reply(`[Timeout] <@${targetId}> \u00E8 stato messo in timeout per **${minutes} minuti**. **Motivo:** ${reason}`);
    }
  } catch (e) {
    ctx.reply(`[Errore] Errore applicazione timeout: ${e.message}`);
  }
});

bot.command('warn', 'Assegna un avvertimento ufficiale a un membro', async (ctx) => {
  const { serverId, authorId, argv } = getContextData(ctx);
  const targetId = argv[0]?.replace(/[<@!>]/g, '');
  const reason = argv.slice(1).join(' ').trim() || 'Condotta inappropriata';

  if (!targetId) return ctx.reply('[Uso] `/warn <user_id> [motivo]`');
  if (!serverId) return ctx.reply('[Errore] Comando utilizzabile solo all\'interno di un server.');

  const guildKey = `yapin_${serverId}`;
  try {
    DatabaseHelper.addModerationCase(guildKey, targetId, authorId || 'Staff', 'WARN', reason);
  } catch (e) {
    console.error('[Yapin Warn Log Error]:', e.message);
  }

  const embed = new Embed()
    .title('[Avvertimento Ufficiale]')
    .description(`L'utente <@${targetId}> ha ricevuto un avvertimento formale per:\n\n> **${reason}**\n\n*L'infrazione \u00E8 stata registrata nella cronologia del server.*`)
    .color('#f59e0b')
    .timestamp();

  ctx.reply('', { embeds: [embed] });
});

bot.command('warnings', 'Mostra la cronologia di avvertimenti e sanzioni di un utente', async (ctx) => {
  const { serverId, argv } = getContextData(ctx);
  if (!serverId) return ctx.reply('[Errore] Comando utilizzabile solo all\'interno di un server.');

  const targetId = argv[0]?.replace(/[<@!>]/g, '');
  if (!targetId) return ctx.reply('[Uso] `/warnings <user_id>`');

  const guildKey = `yapin_${serverId}`;
  const cases = DatabaseHelper.getModerationCases(guildKey, targetId, 10);

  if (!cases || cases.length === 0) {
    return ctx.reply(`[Pulito] L'utente <@${targetId}> non ha alcuna infrazione registrata in questo server.`);
  }

  const caseLines = cases.map((c) => {
    const timeStr = c.timestamp ? new Date(c.timestamp * 1000).toLocaleString('it-IT') : 'N/D';
    return `\u2022 **[#${c.id}] ${c.action_type}** (${timeStr}): \`${c.reason || 'Nessun motivo'}\` (Mod: <@${c.moderator_id}>)`;
  }).join('\n');

  const embed = new Embed()
    .title(`[Sanzioni] Cronologia Infrazioni | <@${targetId}>`)
    .description(caseLines)
    .footer(`Totale sanzioni registrate: ${cases.length}`)
    .color('#ef4444')
    .timestamp();

  ctx.reply('', { embeds: [embed] });
});

bot.command('clear', 'Elimina in blocco i messaggi recenti nel canale (1-50)', async (ctx) => {
  const { channelId, argv } = getContextData(ctx);
  if (!channelId) return ctx.reply('[Errore] Canale non identificato.');

  const count = parseInt(argv[0], 10);
  if (isNaN(count) || count < 1 || count > 50) {
    return ctx.reply('[Uso] `/clear <1-50>`');
  }

  try {
    const messages = await bot.messages(channelId, count + 1);
    const ids = messages.map(m => m.id);

    let deleted = 0;
    if (typeof bot.bulkDelete === 'function') {
      try {
        const res = await bot.bulkDelete(channelId, ids);
        deleted = res?.deleted || ids.length;
      } catch (e) {
        for (const msg of messages) {
          try { await bot.delete(channelId, msg.id); deleted++; } catch (err) {}
        }
      }
    } else {
      for (const msg of messages) {
        try { await bot.delete(channelId, msg.id); deleted++; } catch (err) {}
      }
    }

    const confirmMsg = await ctx.say(`[Clear] Eliminati con successo **${deleted}** messaggi.`);
    setTimeout(async () => {
      try { if (confirmMsg?.id) await bot.delete(channelId, confirmMsg.id); } catch (e) {}
    }, 4000);
  } catch (err) {
    ctx.reply(`[Errore] Errore durante l'eliminazione dei messaggi: ${err.message}`);
  }
});

bot.command('say', 'Invia un messaggio o annuncio formattato attraverso Sentry', async (ctx) => {
  const { channelId, argv } = getContextData(ctx);
  const text = argv.join(' ');
  if (!text) return ctx.reply('[Uso] `/say <testo annuncio>`');

  await ctx.say(text);
  if (ctx?.id && channelId) {
    try { await bot.delete(channelId, ctx.id); } catch (e) {}
  }
});

bot.command('autorole', 'Visualizza lo stato del modulo Auto-Role per i nuovi membri', async (ctx) => {
  const { serverId } = getContextData(ctx);
  if (!serverId) return ctx.reply('[Errore] Comando utilizzabile solo all\'interno di un server.');

  const guildKey = `yapin_${serverId}`;
  const config = DatabaseHelper.getAutoroleConfig(guildKey);

  const embed = new Embed()
    .title('[Auto-Role] Configurazione Ruoli Automatici')
    .description(
      `Il modulo Auto-Role assegna automaticamente i ruoli prestabiliti a chi entra nel server.\n\n` +
      `\u2022 **Stato Modulo:** ${config?.enabled ? 'Attivo' : 'Disattivato'}\n` +
      `\u2022 **Ruolo Utenti:** ${config?.user_role_id ? `\`${config.user_role_id}\`` : 'Non configurato'}\n` +
      `\u2022 **Ruolo Bot:** ${config?.bot_role_id ? `\`${config.bot_role_id}\`` : 'Non configurato'}\n\n` +
      `> Gestisci e modifica i ruoli in tempo reale dalla **Dashboard Web** (sezione *Auto-Role*).`
    )
    .color('#6366f1')
    .timestamp();

  ctx.reply('', { embeds: [embed] });
});

// ==========================================
// 4. ECONOMY & YAPIN SHARDS (EXCLUSIVE)
// ==========================================

bot.command('balance', 'Check wallet coins and exclusive Yapin Shards', async (ctx) => {
  await YapinEconomy.handleBalance(ctx, getContextData);
});
bot.command('bal', 'Shortcut for /balance', async (ctx) => {
  await YapinEconomy.handleBalance(ctx, getContextData);
});

bot.command('daily', 'Claim daily coins and exclusive Yapin Shards crystals', async (ctx) => {
  await YapinEconomy.handleDaily(ctx, getContextData);
});

bot.command('pay', 'Transfer coins to another user', async (ctx) => {
  await YapinEconomy.handlePay(ctx, getContextData);
});

// ==========================================
// 5. MINIGAMES & CASINO (ORIGINAL SENTRY)
// ==========================================

bot.command('fish', 'Cast your rod to catch fish and sunken treasures', async (ctx) => {
  await YapinFishing.handleFish(ctx, getContextData);
});

bot.command('inventory', 'View your fishing gear, rod level and stats', async (ctx) => {
  await YapinFishing.handleInventory(ctx, getContextData);
});
bot.command('inv', 'Shortcut for /inventory', async (ctx) => {
  await YapinFishing.handleInventory(ctx, getContextData);
});

bot.command('upgrade-rod', 'Forge and upgrade your fishing rod to next tier', async (ctx) => {
  await YapinFishing.handleUpgrade(ctx, getContextData);
});

bot.command('blackjack', 'Play 21 Casino Blackjack against dealer with interactive buttons', async (ctx) => {
  await YapinBlackjack.handleBlackjack(ctx, getContextData);
});
bot.command('bj', 'Shortcut for /blackjack', async (ctx) => {
  await YapinBlackjack.handleBlackjack(ctx, getContextData);
});

bot.command('coinflip', 'Flip a coin with optional coin betting', async (ctx) => {
  await YapinMinigames.handleCoinflip(ctx, getContextData);
});
bot.command('cf', 'Shortcut for /coinflip', async (ctx) => {
  await YapinMinigames.handleCoinflip(ctx, getContextData);
});

bot.command('dice', 'Roll a die with customizable sides (default: 6)', async (ctx) => {
  await YapinMinigames.handleDice(ctx, getContextData);
});

bot.command('count', 'Participate in counting game in current channel', async (ctx) => {
  await YapinMinigames.handleCount(ctx, getContextData);
});

// ==========================================
// 6. LEVELING & XP
// ==========================================

bot.command('rank', 'Check your current level and XP progress bar', async (ctx) => {
  await YapinLeveling.handleRank(ctx, getContextData);
});

bot.command('leaderboard', 'View top ranked users on this server', async (ctx) => {
  await YapinLeveling.handleLeaderboard(ctx, getContextData);
});
bot.command('top', 'Shortcut for /leaderboard', async (ctx) => {
  await YapinLeveling.handleLeaderboard(ctx, getContextData);
});

bot.command('afk', 'Imposta il tuo stato su AFK (assente) con un motivo facoltativo', async (ctx) => {
  const { serverId, authorId, argv } = getContextData(ctx);
  if (!serverId || !authorId) return ctx.reply('[Errore] Comando utilizzabile solo all\'interno di un server.');

  const reason = argv.join(' ').trim() || 'Nessun motivo specificato';
  const guildKey = `yapin_${serverId}`;
  const now = Date.now();

  DatabaseHelper.setAfk(guildKey, authorId, reason, now);
  yapinRecentlySetAfk.set(`${guildKey}:${authorId}`, now);

  const embed = new Embed()
    .title('[AFK] Stato Inattivo Attivato')
    .description(
      `D'ora in poi risulterai assente per gli altri membri del server.\n\n` +
      `\u2022 **Utente:** <@${authorId}>\n` +
      `\u2022 **Motivo:** ${reason}\n\n` +
      `> Avviser\u00F2 chiunque ti menzioni in chat. Per rimuovere l'AFK ti baster\u00E0 inviare un messaggio qualsiasi!`
    )
    .color('#6366f1')
    .timestamp();

  ctx.reply('', { embeds: [embed] });
});

bot.command('inattivo', 'Alias di /afk per impostare lo stato di assenza', async (ctx) => {
  const { serverId, authorId, argv } = getContextData(ctx);
  if (!serverId || !authorId) return ctx.reply('[Errore] Comando utilizzabile solo all\'interno di un server.');

  const reason = argv.join(' ').trim() || 'Nessun motivo specificato';
  const guildKey = `yapin_${serverId}`;
  const now = Date.now();

  DatabaseHelper.setAfk(guildKey, authorId, reason, now);
  yapinRecentlySetAfk.set(`${guildKey}:${authorId}`, now);

  const embed = new Embed()
    .title('[AFK] Stato Inattivo Attivato')
    .description(
      `D'ora in poi risulterai assente per gli altri membri del server.\n\n` +
      `\u2022 **Utente:** <@${authorId}>\n` +
      `\u2022 **Motivo:** ${reason}\n\n` +
      `> Avviser\u00F2 chiunque ti menzioni in chat. Per rimuovere l'AFK ti baster\u00E0 inviare un messaggio qualsiasi!`
    )
    .color('#6366f1')
    .timestamp();

  ctx.reply('', { embeds: [embed] });
});

// ==========================================
// 7. ARTIFICIAL INTELLIGENCE (LLAMA 3.3 70B)
// ==========================================

bot.command('ai', 'Ask Sentry AI Neural Assistant (Llama 70B)', async (ctx) => {
  const { args } = getContextData(ctx);
  ctx.bot = bot;
  await YapinAI.handleQuery(ctx, args);
});

// ==========================================
// 8. INTERACTIVE BUTTON LISTENERS
// ==========================================

bot.onButton(/^help_cat_/, async (i) => {
  try {
    const cat = i.custom_id.replace('help_cat_', '');
    const { embed, components } = buildHelpMenu(cat);
    await i.update({ embeds: [embed], components });
  } catch (err) {
    console.error('[Yapin Help Button Error]:', err.message);
  }
});

bot.onButton(/^bj_hit_/, async (i) => {
  const authorId = i.custom_id.replace('bj_hit_', '');
  if (i.user_id !== authorId) {
    return i.ephemeral("[Error] You cannot interact with another user's game!");
  }
  await YapinBlackjack.handleAction(bot, i, 'hit', authorId);
});

bot.onButton(/^bj_stand_/, async (i) => {
  const authorId = i.custom_id.replace('bj_stand_', '');
  if (i.user_id !== authorId) {
    return i.ephemeral("[Error] You cannot interact with another user's game!");
  }
  await YapinBlackjack.handleAction(bot, i, 'stand', authorId);
});

// ==========================================
// 9. AUTOMATED EVENT LISTENERS
// ==========================================

// Ascolto di tutti i messaggi per Counting, AutoMod, XP, AFK, Auto-Responder e Menzioni AI
bot.on('message', async (msg) => {
  if (!msg || !msg.author_id) return;
  if (msg.author_id === bot.me?.id) return;

  const guildKey = `yapin_${msg.server_id}`;

  // 1. Counting Minigame Handler (1:1 con Discord: basta scrivere il numero e il bot reagisce con emoji)
  try {
    await YapinMinigames.handleCountingMessage(bot, msg);
  } catch (err) {
    console.error('[Yapin Counting Error]:', err.message);
  }

  // 2. AutoMod Check
  const flagged = await YapinAutoMod.handleMessage(bot, msg);
  if (flagged) return;

  // 3. AFK Check: se l'autore del messaggio era AFK, rimuove lo stato e invia il bentornato
  try {
    const afkData = DatabaseHelper.getAfk(guildKey, msg.author_id);
    if (afkData) {
      const now = Date.now();
      const recentTime = yapinRecentlySetAfk.get(`${guildKey}:${msg.author_id}`);
      if (!recentTime || (now - recentTime >= 1000 && now - afkData.timestamp >= 1000)) {
        DatabaseHelper.removeAfk(guildKey, msg.author_id);
        yapinRecentlySetAfk.delete(`${guildKey}:${msg.author_id}`);

        const elapsedMs = Math.max(0, now - afkData.timestamp);
        const durationFormatted = formatDuration(elapsedMs);
        const reasonPart = (afkData.reason && afkData.reason !== 'Attualmente assente' && afkData.reason !== 'Nessun motivo specificato')
          ? `\n\u2022 **Motivo precedente:** ${afkData.reason}`
          : '';

        const welcomeEmbed = new Embed()
          .title('[Bentornato] Stato AFK Rimosso')
          .description(`Bentornato <@${msg.author_id}>, ho rimosso il tuo stato di assenza!\n\n\u2022 **Durata assenza:** ${durationFormatted}${reasonPart}`)
          .color('#10b981')
          .timestamp();

        await bot.sendEmbed(msg.channel_id, welcomeEmbed).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[Yapin AFK Author Error]:', err.message);
  }

  // 4. AFK Check: notifica a chi menziona un utente attualmente AFK
  try {
    const mentionRegex = /<@([a-zA-Z0-9_\-]+)>/g;
    let match;
    const mentionedUserIds = new Set();
    while ((match = mentionRegex.exec(msg.content || '')) !== null) {
      if (match[1] !== msg.author_id && match[1] !== bot.me?.id) {
        mentionedUserIds.add(match[1]);
      }
    }

    const now = Date.now();
    for (const targetId of mentionedUserIds) {
      const afkData = DatabaseHelper.getAfk(guildKey, targetId);
      if (afkData) {
        const cdKey = `${msg.channel_id}:${targetId}`;
        const lastAlert = yapinAfkCooldowns.get(cdKey) || 0;
        if (now - lastAlert > 4000) {
          yapinAfkCooldowns.set(cdKey, now);
          const durationFormatted = formatDuration(now - afkData.timestamp);
          const alertEmbed = new Embed()
            .title('[AFK] Utente Attualmente Assente')
            .description(`<@${targetId}> \u00E8 attualmente AFK (${durationFormatted} fa).\n\n\u2022 **Motivo:** ${afkData.reason || 'Nessun motivo specificato'}`)
            .color('#f59e0b')
            .timestamp();
          await bot.sendEmbed(msg.channel_id, alertEmbed).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error('[Yapin AFK Mention Error]:', err.message);
  }

  // 5. Auto-Responder Trigger Check (configurato dalla Dashboard Web)
  try {
    const autoresponders = DatabaseHelper.getAutoresponders(guildKey);
    if (autoresponders && autoresponders.length > 0) {
      const content = (msg.content || '').trim();
      const lowerContent = content.toLowerCase();

      for (const ar of autoresponders) {
        if (!ar.enabled) continue;

        if (ar.channels_whitelist && ar.channels_whitelist.length > 0 && !ar.channels_whitelist.includes(msg.channel_id)) {
          continue;
        }

        let matches = false;
        const trigger = (ar.trigger || '').trim();
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
          // Reazioni automatiche se configurate
          if (ar.auto_reactions && Array.isArray(ar.auto_reactions)) {
            for (const em of ar.auto_reactions) {
              if (em) await bot.react(msg.channel_id, msg.id, em).catch(() => {});
            }
          }

          // Risposta testuale
          if (ar.response_text) {
            const replyText = ar.response_text
              .replace(/{user}/g, msg.author_username || msg.author_id)
              .replace(/{user\.mention}/g, `<@${msg.author_id}>`);
            await bot.send(msg.channel_id, replyText).catch(() => {});
          }

          // Risposta embed
          if (ar.response_embed) {
            try {
              const embObj = typeof ar.response_embed === 'string' ? JSON.parse(ar.response_embed) : ar.response_embed;
              const resEmbed = new Embed();
              if (embObj.title) resEmbed.title(embObj.title);
              if (embObj.description) resEmbed.description(embObj.description);
              if (embObj.color) resEmbed.color(embObj.color);
              resEmbed.timestamp();
              await bot.sendEmbed(msg.channel_id, resEmbed).catch(() => {});
            } catch (e) {}
          }
          break;
        }
      }
    }
  } catch (err) {
    console.error('[Yapin AutoResponder Error]:', err.message);
  }

  // 6. XP & Leveling gain
  await YapinLeveling.handleIncomingMessage(bot, msg);

  // 7. AI Mention Responder (@Sentry <question>)
  if (bot.me?.id && msg.content && msg.content.includes(`<@${bot.me.id}>`)) {
    const prompt = msg.content.replace(new RegExp(`<@${bot.me.id}>`, 'g'), '').trim();
    if (prompt) {
      msg.bot = bot;
      await YapinAI.handleQuery(msg, prompt);
    }
  }

  // 8. Saluto amichevole rapido
  const content = (msg.content || '').toLowerCase().trim();
  if (content === 'hi bot' || content === 'hello sentry' || content === 'ciao sentry') {
    if (typeof msg.reply === 'function') {
      msg.reply('Ciao! Sono Sentry per Yapin. Digita `/help` per visualizzare tutti i comandi e moduli integrati.');
    }
  }
});

// Accoglienza nuovi membri e Auto-Role automatico
bot.on('member_join', async (ev) => {
  if (!ev || !ev.server_id || !ev.user_id) return;
  console.log(`[Yapin] Nuovo membro entrato nel server ${ev.server_id}: Utente ${ev.user_id}`);

  const guildKey = `yapin_${ev.server_id}`;

  try {
    // 1. Assegnazione Auto-Role se configurato nel database
    try {
      const autoroleConfig = DatabaseHelper.getAutoroleConfig(guildKey);
      if (autoroleConfig && autoroleConfig.enabled && autoroleConfig.user_role_id) {
        await bot.addRole(ev.server_id, ev.user_id, autoroleConfig.user_role_id).catch(() => {});
        console.log(`[Yapin AutoRole] Assegnato ruolo ${autoroleConfig.user_role_id} all'utente ${ev.user_id}`);
      }
    } catch (e) {}

    // Recupera informazioni sul server
    const servers = await bot.servers().catch(() => []);
    const server = servers.find(s => String(s.id) === String(ev.server_id));
    const serverName = server?.name || 'Reame Yapin';
    const memberCount = server?.member_count || ev.member_count || 1;
    const username = ev.username || ev.user_id;

    const formatText = (template) => {
      if (!template) return '';
      return template
        .replace(/{user}/g, username)
        .replace(/{user\.tag}/g, username)
        .replace(/{user\.name}/g, username)
        .replace(/{user\.id}/g, ev.user_id)
        .replace(/{user\.mention}/g, `<@${ev.user_id}>`)
        .replace(/{user\.avatar}/g, ev.avatar_url || '')
        .replace(/{avatar}/g, ev.avatar_url || '')
        .replace(/{server\.icon}/g, server?.icon_url || server?.avatar_url || '')
        .replace(/{server\.name}/g, serverName)
        .replace(/{server\.memberCount}/g, String(memberCount))
        .replace(/{memberCount}/g, String(memberCount))
        .replace(/{count}/g, String(memberCount));
    };

    // 2. Modulo Welcomer Reale (configurato da dashboard)
    try {
      const welcomerConfig = DatabaseHelper.getWelcomerConfig(guildKey);
      if (welcomerConfig && welcomerConfig.welcome_enabled && welcomerConfig.welcome_channel_id) {
        const embData = welcomerConfig.welcome_embed || {};
        const embed = new Embed();
        const rawTitle = embData.title || 'Benvenuto nel Reame, {user}!';
        embed.title(formatText(rawTitle));
        const rawDesc = embData.description || welcomerConfig.welcome_message || 'Benvenuto {user.mention} in **{server.name}**! Siamo felici di averti tra noi. Sei il membro **#{memberCount}**!';
        embed.description(formatText(rawDesc));

        if (embData.color) embed.color(embData.color);
        else embed.color('#dc2626');

        const rawThumb = embData.thumbnail?.url || (typeof embData.thumbnail === 'string' ? embData.thumbnail : null);
        const cleanThumb = cleanYapinImageUrl(formatText(rawThumb));
        if (cleanThumb) {
          embed.thumbnail(cleanThumb);
        }

        const rawImg = embData.image?.url || (typeof embData.image === 'string' ? embData.image : null);
        const cleanImg = cleanYapinImageUrl(formatText(rawImg));
        if (cleanImg) {
          embed.image(cleanImg);
        }

        const footerText = embData.footer?.text || embData.footer || 'Membro #{memberCount} • {server.name}';
        const rawFooterIcon = embData.footer?.icon_url || null;
        const cleanFooterIcon = cleanYapinImageUrl(formatText(rawFooterIcon));
        embed.footer(formatText(footerText), cleanFooterIcon || undefined);

        if (Array.isArray(embData.fields) && embData.fields.length > 0) {
          embData.fields.forEach(f => {
            if (f.name && f.value) {
              embed.field(formatText(f.name), formatText(f.value), Boolean(f.inline));
            }
          });
        }
        embed.timestamp();

        await bot.sendEmbed(welcomerConfig.welcome_channel_id, embed, `<@${ev.user_id}>`);
        console.log(`[Yapin Welcomer] Inviato embed di benvenuto nel canale ${welcomerConfig.welcome_channel_id}`);

        // Welcome DM se abilitato
        if (welcomerConfig.welcome_dm_enabled && welcomerConfig.welcome_dm_message) {
          const dmText = formatText(welcomerConfig.welcome_dm_message);
          const dmEmbed = new Embed()
            .title(formatText('Benvenuto in {server.name}!'))
            .description(dmText)
            .color(embData.color || '#dc2626')
            .timestamp();
          await bot.dmSend(ev.user_id, '', { embeds: [dmEmbed] }).catch(() => {});
        }
      }
    } catch (e) {
      console.error('[Yapin Welcomer Error]:', e.message);
    }

    // 3. Canale Audit Log (se configurato in Impostazioni Server)
    try {
      const settings = DatabaseHelper.getGuildSettings(guildKey);
      if (settings && settings.log_channel_id) {
        const logEmbed = new Embed()
          .title('[Log] Nuovo Membro Entrato')
          .description(`Diamo il benvenuto a <@${ev.user_id}> nel server!\n\n` +
            `• **Membro n°**: \`${memberCount}\`\n` +
            `• **ID Utente**: \`${ev.user_id}\`\n` +
            `• **Server**: \`${serverName}\``)
          .color('#10b981')
          .timestamp();
        await bot.sendEmbed(settings.log_channel_id, logEmbed).catch(() => {});
      }
    } catch (e) {}

  } catch (err) {
    console.error('[Yapin Member Join Error]:', err.message);
  }
});

// Partenza membri (Member Leave)
bot.on('member_leave', async (ev) => {
  if (!ev || !ev.server_id || !ev.user_id) return;
  const guildKey = `yapin_${ev.server_id}`;

  try {
    const servers = await bot.servers().catch(() => []);
    const server = servers.find(s => String(s.id) === String(ev.server_id));
    const serverName = server?.name || 'Reame Yapin';
    const memberCount = server?.member_count || ev.member_count || '';
    const username = ev.username || ev.user_id;

    const welcomerConfig = DatabaseHelper.getWelcomerConfig(guildKey);
    if (welcomerConfig && welcomerConfig.leave_enabled && welcomerConfig.leave_channel_id) {
      const rawMsg = welcomerConfig.leave_message || '{user} ha lasciato il server.';
      const leaveText = rawMsg
        .replace(/{user}/g, username)
        .replace(/{user\.tag}/g, username)
        .replace(/{user\.mention}/g, `<@${ev.user_id}>`)
        .replace(/{server\.name}/g, serverName)
        .replace(/{memberCount}/g, String(memberCount));

      const leaveEmbed = new Embed()
        .title('[Uscita Membro]')
        .description(leaveText)
        .color('#ef4444')
        .timestamp();

      await bot.sendEmbed(welcomerConfig.leave_channel_id, leaveEmbed).catch(() => {});
    }

    const settings = DatabaseHelper.getGuildSettings(guildKey);
    if (settings && settings.log_channel_id) {
      const logEmbed = new Embed()
        .title('[Log] Membro Uscito')
        .description(`L'utente <@${ev.user_id}> (${username}) ha lasciato il server.`)
        .color('#ef4444')
        .timestamp();
      await bot.sendEmbed(settings.log_channel_id, logEmbed).catch(() => {});
    }
  } catch (e) {}
});

// Function to start the Yapin bot
export function startYapinBot(customToken) {
  const activeToken = customToken || process.env.YAPPER_BOT_TOKEN;
  if (!activeToken) {
    console.warn('[Yapin Bot] No YAPPER_BOT_TOKEN found. Yapin bot will not start.');
    return null;
  }
  bot.token = activeToken;
  console.log('Starting Sentry for Yapin via Real-time WebSocket...');
  bot.start().catch((err) => {
    console.error('[Error] Fatal error starting Yapin bot:', err);
  });
  return bot;
}

// Start immediately if executed directly via `node yapin/bot.js`
try {
  const currentFile = fileURLToPath(import.meta.url);
  const executedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
  if (currentFile === executedFile) {
    startYapinBot();
  }
} catch (e) {}

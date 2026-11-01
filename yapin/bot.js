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

bot.command('ping', 'Check Sentry response time and operational status', async (ctx) => {
  const { channelId } = getContextData(ctx);
  const start = Date.now();
  const res = await ctx.reply('[Ping] Pinging Yapin Gateway...');
  const latency = Date.now() - start;
  const content = `[Pong] Gateway Latency: \`${latency}ms\` | Status: **Operational**`;
  if (res?.id && channelId) {
    try {
      await bot.edit(channelId, res.id, content);
      return;
    } catch (e) {}
  }
  await ctx.reply(content);
});

bot.command('help', 'Display the complete command list across all modules', (ctx) => {
  const embed = new Embed()
    .title('[Sentry] Yapin Command Center')
    .description('Security, moderation, economics, and community features tailored for Yapin.')
    .field('General & Insights', '`/ping` - Latency check\n`/help` - This menu\n`/botinfo` - System metrics\n`/serverinfo` - Server statistics\n`/realm` - Full Realm Hub overview\n`/livecount` - Live online/total member ratio\n`/bridge` - Cross-Platform Discord <-> Yapin bridge')
    .field('Moderation & AutoMod', '`/kick <user> [reason]` - Kick member\n`/ban <user> [reason]` - Ban member\n`/unban <user>` - Unban member\n`/timeout <user> <minutes>` - Timeout user\n`/warn <user> [reason]` - Warn member\n`/clear <1-50>` - Bulk delete messages\n`/say <text>` - Send announcement')
    .field('Economy & Shards (Exclusive)', '`/balance` - Check wallet & Yapin Shards\n`/daily` - Claim daily coins & exclusive crystals\n`/pay <user> <amount>` - Transfer coins')
    .field('Minigames & Casino', '`/fish` - Cast your rod for fish & treasures\n`/inventory` - View fishing gear\n`/upgrade-rod` - Forge better rods\n`/blackjack <bet>` - Play 21 with buttons\n`/coinflip <heads|tails> [bet]` - Flip a coin\n`/dice [sides]` - Roll a die\n`/count <number>` - Counting channel')
    .field('Artificial Intelligence', '`/ai <prompt>` - Ask Llama 3.3 70B neural network\n*Oppure menziona @Sentry in qualsiasi chat!*')
    .color('#10b981');

  ctx.reply('', { embeds: [embed] });
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

bot.command('kick', 'Kick a member from the server (requires user ID)', async (ctx) => {
  const { serverId, argv } = getContextData(ctx);
  if (!serverId) return ctx.reply('[Error] Command can only be used in a server.');

  const targetId = argv[0]?.replace(/[<@!>]/g, '');
  const reason = argv.slice(1).join(' ') || 'Nessun motivo specificato';

  if (!targetId) return ctx.reply('[Warning] Usage: `/kick <user_id> [motivo]`');

  try {
    await bot.kick(serverId, targetId);
    ctx.reply(`[Kick] <@${targetId}> was kicked from the server. **Motivo:** ${reason}`);
  } catch (e) {
    ctx.reply(`[Error] Unable to kick user: ${e.message}`);
  }
});

bot.command('ban', 'Ban a member from the server (requires user ID)', async (ctx) => {
  const { serverId, argv } = getContextData(ctx);
  if (!serverId) return ctx.reply('[Error] Command can only be used in a server.');

  const targetId = argv[0]?.replace(/[<@!>]/g, '');
  const reason = argv.slice(1).join(' ') || 'Nessun motivo specificato';

  if (!targetId) return ctx.reply('[Warning] Usage: `/ban <user_id> [motivo]`');

  try {
    await bot.ban(serverId, targetId);
    ctx.reply(`[Ban] <@${targetId}> was permanently banned. **Motivo:** ${reason}`);
  } catch (e) {
    ctx.reply(`[Error] Unable to ban user: ${e.message}`);
  }
});

bot.command('unban', 'Unban a member from the server (requires user ID)', async (ctx) => {
  const { serverId, argv } = getContextData(ctx);
  if (!serverId) return ctx.reply('[Error] Command can only be used in a server.');

  const targetId = argv[0]?.replace(/[<@!>]/g, '');
  if (!targetId) return ctx.reply('[Warning] Usage: `/unban <user_id>`');

  try {
    await bot.unban(serverId, targetId);
    ctx.reply(`[Unban] <@${targetId}> was unbanned successfully.`);
  } catch (e) {
    ctx.reply(`[Error] Error unbanning: ${e.message}`);
  }
});

bot.command('timeout', 'Time someone out for a duration in minutes', async (ctx) => {
  const { serverId, argv } = getContextData(ctx);
  if (!serverId) return ctx.reply('[Error] Command can only be used in a server.');

  const targetId = argv[0]?.replace(/[<@!>]/g, '');
  const minutes = parseInt(argv[1], 10);
  const reason = argv.slice(2).join(' ') || 'Timeout applicato da Sentry';

  if (!targetId || isNaN(minutes) || minutes < 0) {
    return ctx.reply('[Warning] Usage: `/timeout <user_id> <minuti> [motivo]` (0 minuti per rimuovere il timeout)');
  }

  try {
    await bot.timeout(serverId, targetId, minutes, reason);
    if (minutes === 0) {
      ctx.reply(`[Timeout] Timeout removed for <@${targetId}>.`);
    } else {
      ctx.reply(`[Timeout] <@${targetId}> was timed out for **${minutes} minuti**. **Motivo:** ${reason}`);
    }
  } catch (e) {
    ctx.reply(`[Error] Timeout error: ${e.message}`);
  }
});

bot.command('warn', 'Warn a member for misconduct', (ctx) => {
  const { argv } = getContextData(ctx);
  const targetId = argv[0]?.replace(/[<@!>]/g, '');
  const reason = argv.slice(1).join(' ') || 'Condotta inappropriata';

  if (!targetId) return ctx.reply('[Warning] Usage: `/warn <user_id> [motivo]`');

  ctx.reply(`[Warning] <@${targetId}> received an official warning. **Motivo:** ${reason}`);
});

bot.command('clear', 'Bulk delete messages in the channel (1-50)', async (ctx) => {
  const { channelId, argv } = getContextData(ctx);
  if (!channelId) return ctx.reply('[Error] Channel not identified.');

  const count = parseInt(argv[0], 10);
  if (isNaN(count) || count < 1 || count > 50) {
    return ctx.reply('[Warning] Usage: `/clear <1-50>`');
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

    const confirmMsg = await ctx.say(`[Clear] Successfully deleted **${deleted}** messaggi.`);
    setTimeout(async () => {
      try { if (confirmMsg?.id) await bot.delete(channelId, confirmMsg.id); } catch (e) {}
    }, 4000);
  } catch (err) {
    ctx.reply(`[Error] Error deleting messages: ${err.message}`);
  }
});

bot.command('say', 'Send a broadcast message through Sentry', async (ctx) => {
  const { channelId, argv } = getContextData(ctx);
  const text = argv.join(' ');
  if (!text) return ctx.reply('[Warning] Usage: `/say <testo annuncio>`');

  await ctx.say(text);
  if (ctx?.id && channelId) {
    try { await bot.delete(channelId, ctx.id); } catch (e) {}
  }
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

// Ascolto di tutti i messaggi per Counting, AutoMod, XP e Menzioni AI
bot.on('message', async (msg) => {
  if (!msg || !msg.author_id) return;
  if (msg.author_id === bot.me?.id) return;

  // 1. Counting Minigame Handler (1:1 con Discord: basta scrivere il numero e il bot reagisce con emoji)
  try {
    await YapinMinigames.handleCountingMessage(bot, msg);
  } catch (err) {
    console.error('[Yapin Counting Error]:', err.message);
  }

  // 2. AutoMod Check
  const flagged = await YapinAutoMod.handleMessage(bot, msg);
  if (flagged) return;

  // 2. XP & Leveling gain
  await YapinLeveling.handleIncomingMessage(bot, msg);

  // 3. AI Mention Responder (@Sentry <question>)
  if (bot.me?.id && msg.content && msg.content.includes(`<@${bot.me.id}>`)) {
    const prompt = msg.content.replace(new RegExp(`<@${bot.me.id}>`, 'g'), '').trim();
    if (prompt) {
      msg.bot = bot;
      await YapinAI.handleQuery(msg, prompt);
    }
  }

  // 4. Saluto amichevole rapido
  const content = (msg.content || '').toLowerCase().trim();
  if (content === 'hi bot' || content === 'hello sentry' || content === 'ciao sentry') {
    if (typeof msg.reply === 'function') {
      msg.reply('Hello! I am Sentry for Yapin (Type `/help` or `!help` for command list)');
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

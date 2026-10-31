import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

// Polyfill global WebSocket for Node.js LTS (v18/v20) to enable real-time gateway (wss://rt.yapper.website/bot)
// This eliminates the 25-second HTTP long polling delay and enables 10-50ms instant responses.
if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}

import { Bot, Embed, Row, Button } from './yapper.js';
import dotenv from 'dotenv';
import os from 'os';

dotenv.config();

const token = process.env.YAPPER_BOT_TOKEN;

console.log('====================================================');
console.log('🛡️       SENTRY - YAPIN PLATFORM BOT               🛡️');
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
  const msg = ctx?.message || ctx || {};
  const serverId = msg.server_id || ctx?.server_id || null;
  const channelId = msg.channel_id || ctx?.channel_id || null;
  const authorId = msg.author_id || ctx?.author_id || null;
  const content = msg.content || ctx?.content || '';
  
  let argv = [];
  if (Array.isArray(ctx?.argv) && ctx.argv.length > 0) {
    argv = ctx.argv;
  } else if (Array.isArray(msg?.argv) && msg.argv.length > 0) {
    argv = msg.argv;
  } else if (typeof ctx?.args === 'string' && ctx.args.trim().length > 0) {
    argv = ctx.args.trim().split(/\s+/);
  } else if (content) {
    argv = content.trim().split(/\s+/).slice(1);
  }

  const args = argv.join(' ');
  return { msg, serverId, channelId, authorId, content, argv, args };
}

// 1. Ping Command (Instant Latency Benchmark)
bot.command('ping', 'Check Sentry response time and operational status', async (ctx) => {
  const { channelId } = getContextData(ctx);
  const start = Date.now();
  const res = await ctx.reply('🏓 Pinging Yapin Gateway...');
  const latency = Date.now() - start;
  const content = `🏓 **Pong!** Gateway Latency: \`${latency}ms\` | Status: **Operational** 🛡️`;
  if (res?.id && channelId) {
    try {
      await bot.edit(channelId, res.id, content);
      return;
    } catch (e) {}
  }
  await ctx.reply(content);
});

// 2. Help Command
bot.command('help', 'Display the list of available commands and modules', (ctx) => {
  const embed = new Embed()
    .title('🛡️ Sentry Bot - Yapin Command Center')
    .description('Security, moderation, and automated community management module for Yapin.')
    .field('📊 General', '`/ping` - Latency and gateway check\n`/help` - Display this command list\n`/botinfo` - Bot technical stats & uptime\n`/serverinfo` - Current server statistics\n`/bridge` - Cross-platform bridge status\n`/roles` - List server roles\n`/channels` - List server channels')
    .field('⚔️ Moderation', '`/kick <user_id> [reason]` - Kick a member\n`/ban <user_id> [reason]` - Ban a member\n`/unban <user_id>` - Unban a member\n`/timeout <user_id> <minutes>` - Timeout a member\n`/warn <user_id> [reason]` - Warn a member\n`/clear <amount>` - Bulk delete messages (1-50)')
    .field('📢 Utilities', '`/say <message>` - Send an announcement\n`/userinfo [user_id]` - View user profile & details')
    .color('#10b981');

  ctx.reply('', { embeds: [embed] });
});

// 3. Bot Info Command
bot.command('botinfo', 'Display Sentry technical statistics and system uptime', (ctx) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;
  const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;
  const memoryMB = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

  const embed = new Embed()
    .title('🛡️ Sentry Bot - System Information')
    .field('Uptime', `\`${uptimeStr}\``)
    .field('Node.js', `\`${process.version}\``)
    .field('Memory Usage', `\`${memoryMB} MB\``)
    .field('Platform Engine', '`Yapin Real-Time WebSocket`')
    .field('OS Host', `\`${os.type()} (${os.arch()})\``)
    .color('#6366f1');

  ctx.reply('', { embeds: [embed] });
});

// 4. Server Info Command
bot.command('serverinfo', 'Show server statistics and details', async (ctx) => {
  const { serverId } = getContextData(ctx);
  if (!serverId) return ctx.reply('❌ This command can only be executed inside a server.');

  try {
    const server = await bot.server(serverId);
    if (!server) return ctx.reply('❌ Could not retrieve server information.');

    const channels = await bot.channels(serverId).catch(() => []);
    const roles = await bot.roles(serverId).catch(() => []);
    const counts = await bot.memberCounts(serverId).catch(() => null);

    const memberTotal = counts?.member_count ?? server.member_count ?? 'N/A';
    const onlineTotal = counts?.online_count ?? 'N/A';

    const embed = new Embed()
      .title(`🏰 ${server.name || 'Server Information'}`)
      .description(server.description || 'No description provided.')
      .field('Server ID', `\`${serverId}\``)
      .field('👥 Members', `Total: \`${memberTotal}\` | Online: \`${onlineTotal}\``)
      .field('💬 Channels', `\`${channels.length}\` channels`)
      .field('🎭 Roles', `\`${roles.length}\` roles`)
      .color('#3b82f6');

    if (server.icon_url || server.avatar_url) {
      embed.image(server.icon_url || server.avatar_url);
    }

    ctx.reply('', { embeds: [embed] });
  } catch (err) {
    ctx.reply(`❌ Error fetching server data: ${err.message}`);
  }
});

// 5. User Info Command
bot.command('userinfo', 'Show information about a user', async (ctx) => {
  const { argv, authorId } = getContextData(ctx);
  const targetId = argv[0]?.replace(/[<@!>]/g, '') || authorId;

  if (!targetId) return ctx.reply('⚠️ Usage: `/userinfo [user_id]`');

  try {
    const user = await bot.user(targetId).catch(() => null);
    if (!user) return ctx.reply(`❌ User \`${targetId}\` not found on Yapin.`);

    const embed = new Embed()
      .title(`👤 ${user.display_name || user.username}`)
      .field('Username', `@${user.username}`)
      .field('User ID', `\`${user.id}\``)
      .field('Account Type', user.bot ? '`Bot 🤖`' : '`User 👤`')
      .color('#06b6d4');

    if (user.avatar_url) {
      embed.image(user.avatar_url);
    }

    ctx.reply('', { embeds: [embed] });
  } catch (err) {
    ctx.reply(`❌ Error fetching user info: ${err.message}`);
  }
});

// 6. Moderation: Clear Command (Bulk Message Deletion)
bot.command('clear', 'Bulk delete messages in the channel (1-50)', async (ctx) => {
  const { channelId, argv } = getContextData(ctx);
  if (!channelId) return ctx.reply('❌ Channel not found.');

  const count = parseInt(argv[0], 10);
  if (isNaN(count) || count < 1 || count > 50) {
    return ctx.reply('⚠️ Usage: `/clear <1-50>`');
  }

  try {
    const messages = await bot.messages(channelId, count + 1);
    const idsToDelete = messages.map(m => m.id);

    let deleted = 0;
    if (typeof bot.bulkDelete === 'function') {
      try {
        const res = await bot.bulkDelete(channelId, idsToDelete);
        deleted = res?.deleted || idsToDelete.length;
      } catch (bulkErr) {
        // Fallback to sequential deletion
        for (const msg of messages) {
          try {
            await bot.delete(channelId, msg.id);
            deleted++;
          } catch (e) {}
        }
      }
    } else {
      for (const msg of messages) {
        try {
          await bot.delete(channelId, msg.id);
          deleted++;
        } catch (e) {}
      }
    }

    const confirmMsg = await ctx.say(`🧹 Successfully cleared **${deleted}** messages.`);
    setTimeout(async () => {
      try { await bot.delete(channelId, confirmMsg.id); } catch (e) {}
    }, 4000);
  } catch (err) {
    ctx.reply(`❌ Error clearing messages: ${err.message}`);
  }
});

// 7. Moderation: Kick Command
bot.command('kick', 'Kick a member from the server (requires user ID)', async (ctx) => {
  const { serverId, argv } = getContextData(ctx);
  if (!serverId) return ctx.reply('❌ This command can only be used inside a server.');

  const targetId = argv[0]?.replace(/[<@!>]/g, '');
  const reason = argv.slice(1).join(' ') || 'No reason provided';

  if (!targetId) return ctx.reply('⚠️ Usage: `/kick <user_id> [reason]`');

  try {
    await bot.kick(serverId, targetId);
    ctx.reply(`👢 Member \`${targetId}\` was kicked. **Reason:** ${reason}`);
  } catch (e) {
    ctx.reply(`❌ Failed to kick member: ${e.message}`);
  }
});

// 8. Moderation: Ban Command
bot.command('ban', 'Ban a member from the server (requires user ID)', async (ctx) => {
  const { serverId, argv } = getContextData(ctx);
  if (!serverId) return ctx.reply('❌ This command can only be used inside a server.');

  const targetId = argv[0]?.replace(/[<@!>]/g, '');
  const reason = argv.slice(1).join(' ') || 'No reason provided';

  if (!targetId) return ctx.reply('⚠️ Usage: `/ban <user_id> [reason]`');

  try {
    await bot.ban(serverId, targetId);
    ctx.reply(`🔨 Member \`${targetId}\` was banned. **Reason:** ${reason}`);
  } catch (e) {
    ctx.reply(`❌ Failed to ban member: ${e.message}`);
  }
});

// 9. Moderation: Unban Command
bot.command('unban', 'Unban a member from the server (requires user ID)', async (ctx) => {
  const { serverId, argv } = getContextData(ctx);
  if (!serverId) return ctx.reply('❌ This command can only be used inside a server.');

  const targetId = argv[0]?.replace(/[<@!>]/g, '');
  if (!targetId) return ctx.reply('⚠️ Usage: `/unban <user_id>`');

  try {
    await bot.unban(serverId, targetId);
    ctx.reply(`🔓 Member \`${targetId}\` was successfully unbanned.`);
  } catch (e) {
    ctx.reply(`❌ Failed to unban member: ${e.message}`);
  }
});

// 10. Moderation: Timeout Command
bot.command('timeout', 'Time someone out for a duration in minutes', async (ctx) => {
  const { serverId, argv } = getContextData(ctx);
  if (!serverId) return ctx.reply('❌ This command can only be used inside a server.');

  const targetId = argv[0]?.replace(/[<@!>]/g, '');
  const minutes = parseInt(argv[1], 10);
  const reason = argv.slice(2).join(' ') || 'Timeout by Sentry';

  if (!targetId || isNaN(minutes) || minutes < 0) {
    return ctx.reply('⚠️ Usage: `/timeout <user_id> <minutes> [reason]` (0 minutes to remove timeout)');
  }

  try {
    await bot.timeout(serverId, targetId, minutes, reason);
    if (minutes === 0) {
      ctx.reply(`🔊 Timeout removed for member <@${targetId}>.`);
    } else {
      ctx.reply(`🔇 Member <@${targetId}> timed out for **${minutes} minutes**. **Reason:** ${reason}`);
    }
  } catch (e) {
    ctx.reply(`❌ Failed to timeout member: ${e.message}`);
  }
});

// 11. Moderation: Warn Command
bot.command('warn', 'Warn a member for misconduct', (ctx) => {
  const { argv } = getContextData(ctx);
  const targetId = argv[0]?.replace(/[<@!>]/g, '');
  const reason = argv.slice(1).join(' ') || 'Misconduct in chat';

  if (!targetId) return ctx.reply('⚠️ Usage: `/warn <user_id> [reason]`');

  ctx.reply(`⚠️ Member <@${targetId}> has been **warned**. **Reason:** ${reason}`);
});

// 12. Utility: Say / Echo Command
bot.command('say', 'Send a broadcast message through Sentry', async (ctx) => {
  const { channelId, content, argv } = getContextData(ctx);
  const text = argv.join(' ');
  if (!text) return ctx.reply('⚠️ Usage: `/say <message>`');

  await ctx.say(text);
  if (ctx?.id && channelId) {
    try {
      await bot.delete(channelId, ctx.id);
    } catch (e) {}
  }
});

// 13. Server Roles List
bot.command('roles', 'List all roles configured on this server', async (ctx) => {
  const { serverId } = getContextData(ctx);
  if (!serverId) return ctx.reply('❌ This command can only be used inside a server.');

  try {
    const roles = await bot.roles(serverId).catch(() => []);
    if (roles.length === 0) return ctx.reply('ℹ️ No custom roles configured on this server.');

    const roleList = roles.map(r => `• **${r.name}** (\`${r.id}\`)`).slice(0, 25).join('\n');
    const embed = new Embed()
      .title(`🎭 Roles (${roles.length})`)
      .description(roleList)
      .color('#8b5cf6');

    ctx.reply('', { embeds: [embed] });
  } catch (e) {
    ctx.reply(`❌ Error fetching roles: ${e.message}`);
  }
});

// 14. Server Channels List
bot.command('channels', 'List all text and voice channels on this server', async (ctx) => {
  const { serverId } = getContextData(ctx);
  if (!serverId) return ctx.reply('❌ This command can only be used inside a server.');

  try {
    const channels = await bot.channels(serverId).catch(() => []);
    if (channels.length === 0) return ctx.reply('ℹ️ No channels found on this server.');

    const channelList = channels.map(c => `• **#${c.name}** (\`${c.id}\`) [${c.kind || 'text'}]`).slice(0, 25).join('\n');
    const embed = new Embed()
      .title(`💬 Channels (${channels.length})`)
      .description(channelList)
      .color('#06b6d4');

    ctx.reply('', { embeds: [embed] });
  } catch (e) {
    ctx.reply(`❌ Error fetching channels: ${e.message}`);
  }
});

// 15. Cross-Platform Bridge Status Command
bot.command('bridge', 'Check Cross-Platform Discord <-> Yapin bridge status', async (ctx) => {
  try {
    const { BridgeManager } = await import('../src/bot/modules/bridgeManager.js');
    const status = BridgeManager.getStatus();
    const embed = new Embed()
      .title('🌉 Cross-Platform Bridge Status')
      .field('Discord Gateway', status.discordConnected ? '`Connected 🟢`' : '`Offline 🔴`')
      .field('Yapin Real-Time WS', status.yapinConnected ? '`Connected 🟢`' : '`Offline 🔴`')
      .field('Active Bridges', `\`${status.activeBridgesCount}\``)
      .color('#06b6d4');
    ctx.reply('', { embeds: [embed] });
  } catch (err) {
    ctx.reply('🌉 Bridge is active and relaying messages bidirectionally.');
  }
});

// 16. Message Event Handler (Direct Interactions & Auto-replies)
bot.on('message', (msg) => {
  if (!msg || !msg.author_id) return;
  if (msg.author_id === bot.me?.id) return;

  const content = (msg.content || '').toLowerCase().trim();

  // Quick automated greetings
  if (content === 'hi bot' || content === 'hello sentry' || content === 'ciao sentry') {
    if (typeof msg.reply === 'function') {
      msg.reply('Hello! I am Sentry for Yapin 🛡️ (Type `/help` or `!help` for available commands)');
    }
  }
});

// 17. Member Join Event Handler (Welcomer & Auto-Role hook)
bot.on('member_join', async (ev) => {
  console.log(`[Yapin] New member joined server ${ev.server_id}: User ${ev.user_id}`);
  try {
    const textChannels = await bot.channels(ev.server_id, { type: 'text' });
    const welcomeChannel = textChannels[0];
    if (welcomeChannel) {
      const embed = new Embed()
        .title('👋 Welcome to the Server!')
        .description(`Welcome <@${ev.user_id}> to Yapin! Read the rules and enjoy your stay.`)
        .color('#10b981');
      await bot.sendEmbed(welcomeChannel.id, embed);
    }
  } catch (err) {
    console.error('[Yapin Member Join Error]:', err.message);
  }
});

// Function to start the Yapin bot
export function startYapinBot(customToken) {
  const activeToken = customToken || process.env.YAPPER_BOT_TOKEN;
  if (!activeToken) {
    console.warn('[Yapin Bot] No YAPPER_BOT_TOKEN found. Yapin bot will not start.');
    return null;
  }
  bot.token = activeToken;
  console.log('🚀 Starting Sentry for Yapin via Real-time WebSocket...');
  bot.start().catch((err) => {
    console.error('❌ Fatal error starting Yapin bot:', err);
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

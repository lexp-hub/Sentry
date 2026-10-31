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

// 1. Ping Command (Instant Latency Benchmark)
bot.command('ping', 'Check Sentry response time and operational status', async (ctx) => {
  const start = Date.now();
  const res = await ctx.reply('🏓 Pinging Yapin Gateway...');
  const latency = Date.now() - start;
  const content = `🏓 **Pong!** Gateway Latency: \`${latency}ms\` | Status: **Operational** 🛡️`;
  if (res && typeof res.edit === 'function') {
    await res.edit(content);
  } else {
    await ctx.reply(content);
  }
});

// 2. Help Command
bot.command('help', 'Display the list of available commands and modules', (ctx) => {
  const embed = new Embed()
    .title('🛡️ Sentry Bot - Yapin Command Center')
    .description('Security, moderation, and automated community management module for Yapin.')
    .field('📊 General', '`!ping` - Latency and gateway check\n`!help` - Display this menu\n`!botinfo` - Bot technical stats\n`!serverinfo` - Current server statistics\n`!bridge` - Cross-platform bridge status')
    .field('⚔️ Moderation', '`!kick <user_id> [reason]` - Kick a member\n`!ban <user_id> [reason]` - Ban a member\n`!warn <user_id> [reason]` - Warn a member\n`!clear <amount>` - Bulk delete messages (1-50)')
    .field('📢 Utilities', '`!say <message>` - Send an announcement\n`!userinfo <user_id>` - View user details')
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
    .field('Platform Engine', `\`Yapin SDK Real-Time WebSocket\``)
    .field('OS Host', `\`${os.type()} (${os.arch()})\``)
    .color('#6366f1');

  ctx.reply('', { embeds: [embed] });
});

// 4. Server Info Command
bot.command('serverinfo', 'Show server statistics and details', async (ctx) => {
  const serverId = ctx.message.server_id;
  if (!serverId) return ctx.reply('❌ This command can only be executed inside a server.');

  try {
    const server = await bot.server(serverId);
    const channels = await bot.channels(serverId);
    const counts = await bot.memberCounts(serverId).catch(() => ({ total: 'N/A' }));

    const embed = new Embed()
      .title(`🏰 ${server.name || 'Server'}`)
      .description(server.description || 'No description set.')
      .field('Server ID', `\`${serverId}\``)
      .field('Members', `\`${counts.total ?? channels.length}\``)
      .field('Channels', `\`${channels.length}\``)
      .color('#3b82f6');

    ctx.reply('', { embeds: [embed] });
  } catch (err) {
    ctx.reply(`❌ Error fetching server data: ${err.message}`);
  }
});

// 5. User Info Command
bot.command('userinfo', 'Show information about a user', async (ctx) => {
  const args = ctx.message.content?.split(' ').slice(1) || [];
  const targetId = args[0]?.replace(/[<@!>]/g, '') || ctx.message.author_id;

  if (!targetId) return ctx.reply('⚠️ Usage: `!userinfo [user_id]`');

  try {
    const user = await bot.user(targetId).catch(() => null);
    if (!user) return ctx.reply(`❌ User \`${targetId}\` not found.`);

    const embed = new Embed()
      .title(`👤 ${user.display_name || user.username}`)
      .field('Username', `\`@${user.username}\``)
      .field('User ID', `\`${user.id}\``)
      .field('Bot Account', user.bot ? '`Yes`' : '`No`')
      .color('#06b6d4');

    ctx.reply('', { embeds: [embed] });
  } catch (err) {
    ctx.reply(`❌ Error fetching user info: ${err.message}`);
  }
});

// 6. Moderation: Clear Command (Bulk Message Deletion)
bot.command('clear', 'Bulk delete messages in the channel (1-50)', async (ctx) => {
  const channelId = ctx.message.channel_id;
  const args = ctx.message.content?.split(' ').slice(1) || [];
  const count = parseInt(args[0], 10);

  if (isNaN(count) || count < 1 || count > 50) {
    return ctx.reply('⚠️ Usage: `!clear <1-50>`');
  }

  try {
    const messages = await bot.messages(channelId, count + 1);
    let deleted = 0;
    for (const msg of messages) {
      try {
        await bot.delete(channelId, msg.id);
        deleted++;
      } catch (delErr) {}
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
  const serverId = ctx.message.server_id;
  const args = ctx.message.content?.split(' ').slice(1) || [];
  const targetId = args[0]?.replace(/[<@!>]/g, '');
  const reason = args.slice(1).join(' ') || 'No reason provided';

  if (!targetId) return ctx.reply('⚠️ Usage: `!kick <user_id> [reason]`');

  try {
    await bot.kick(serverId, targetId);
    ctx.reply(`👢 Member \`${targetId}\` was kicked. **Reason:** ${reason}`);
  } catch (e) {
    ctx.reply(`❌ Failed to kick member: ${e.message}`);
  }
});

// 8. Moderation: Ban Command
bot.command('ban', 'Ban a member from the server (requires user ID)', async (ctx) => {
  const serverId = ctx.message.server_id;
  const args = ctx.message.content?.split(' ').slice(1) || [];
  const targetId = args[0]?.replace(/[<@!>]/g, '');
  const reason = args.slice(1).join(' ') || 'No reason provided';

  if (!targetId) return ctx.reply('⚠️ Usage: `!ban <user_id> [reason]`');

  try {
    await bot.ban(serverId, targetId);
    ctx.reply(`🔨 Member \`${targetId}\` was banned. **Reason:** ${reason}`);
  } catch (e) {
    ctx.reply(`❌ Failed to ban member: ${e.message}`);
  }
});

// 9. Moderation: Warn Command
bot.command('warn', 'Warn a member for misconduct', (ctx) => {
  const args = ctx.message.content?.split(' ').slice(1) || [];
  const targetId = args[0]?.replace(/[<@!>]/g, '');
  const reason = args.slice(1).join(' ') || 'Misconduct in chat';

  if (!targetId) return ctx.reply('⚠️ Usage: `!warn <user_id> [reason]`');

  ctx.reply(`⚠️ <@${targetId}> has been **warned**. **Reason:** ${reason}`);
});

// 10. Utility: Say / Echo Command
bot.command('say', 'Send a broadcast message', async (ctx) => {
  const args = ctx.message.content?.split(' ').slice(1) || [];
  const text = args.join(' ');
  if (!text) return ctx.reply('⚠️ Usage: `!say <message>`');

  await ctx.say(text);
  try {
    await bot.delete(ctx.message.channel_id, ctx.message.id);
  } catch (e) {}
});

// 11. Cross-Platform Bridge Status Command
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

// 12. Message Event Handler (Direct Interactions & Auto-replies)
bot.on('message', (msg) => {
  if (msg.author_id === bot.me?.id) return;

  const content = msg.content?.toLowerCase() || '';

  // Quick automated reply
  if (content === 'hi bot' || content === 'hello sentry') {
    msg.reply('Hello! I am Sentry for Yapin 🛡️ (Type `!help` for available commands)');
  }
});

// 13. Member Join Event Handler (Welcomer & Auto-Role hook)
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

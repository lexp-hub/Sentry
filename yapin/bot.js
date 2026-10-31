import path from 'path';
import { fileURLToPath } from 'url';
import { Bot, Embed, Row, Button } from './yapper.js';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.YAPPER_BOT_TOKEN;

console.log('====================================================');
console.log('🛡️       SENTRY - YAPIN PLATFORM BOT               🛡️');
console.log('====================================================');

export const bot = new Bot(token || '');

// 1. Ping Command
bot.command('ping', 'Check if Sentry is active and responsive', (ctx) => {
  ctx.reply('🏓 Pong! Sentry for Yapin is online and operational.');
});

// 2. Help Command
bot.command('help', 'Display the list of available commands', (ctx) => {
  const embed = new Embed()
    .title('🛡️ Sentry Bot - Yapin Edition')
    .description('Security, moderation, and automated community management module for Yapin.')
    .field('`!ping`', 'Check Sentry latency and online status.')
    .field('`!help`', 'Display this help menu.')
    .field('`!serverinfo`', 'Display current server information and stats.')
    .field('`!kick <user_id>`', 'Kick a member from the server.')
    .field('`!ban <user_id>`', 'Ban a member from the server.')
    .color('#10b981');

  ctx.reply('', { embeds: [embed] });
});

// 3. Server Info Command
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

// 4. Moderation: Kick Command
bot.command('kick', 'Kick a member from the server (requires user ID)', async (ctx) => {
  const serverId = ctx.message.server_id;
  const args = ctx.message.content?.split(' ').slice(1) || [];
  const targetId = args[0]?.replace(/[<@!>]/g, '');

  if (!targetId) return ctx.reply('⚠️ Usage: `!kick <user_id>`');

  try {
    await bot.kick(serverId, targetId);
    ctx.reply(`👢 Member \`${targetId}\` was successfully kicked from the server.`);
  } catch (e) {
    ctx.reply(`❌ Failed to kick member: ${e.message}`);
  }
});

// 5. Moderation: Ban Command
bot.command('ban', 'Ban a member from the server (requires user ID)', async (ctx) => {
  const serverId = ctx.message.server_id;
  const args = ctx.message.content?.split(' ').slice(1) || [];
  const targetId = args[0]?.replace(/[<@!>]/g, '');

  if (!targetId) return ctx.reply('⚠️ Usage: `!ban <user_id>`');

  try {
    await bot.ban(serverId, targetId);
    ctx.reply(`🔨 Member \`${targetId}\` was successfully banned from the server.`);
  } catch (e) {
    ctx.reply(`❌ Failed to ban member: ${e.message}`);
  }
});

// 6. Message Event Handler
bot.on('message', (msg) => {
  if (msg.author_id === bot.me?.id) return;

  const content = msg.content?.toLowerCase() || '';

  // Quick automated reply
  if (content === 'hi bot' || content === 'hello sentry') {
    msg.reply('Hello! I am Sentry for Yapin 🛡️');
  }
});

// 7. Member Join Event Handler (Welcomer & Auto-Role hook)
bot.on('member_join', async (ev) => {
  console.log(`[Yapin] New member joined server ${ev.server_id}: User ${ev.user_id}`);
  try {
    const textChannels = await bot.channels(ev.server_id, { type: 'text' });
    const welcomeChannel = textChannels[0];
    if (welcomeChannel) {
      const embed = new Embed()
        .title('👋 Welcome to Yapin!')
        .description(`Welcome <@${ev.user_id}> to the server!`)
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
  console.log('🚀 Starting Sentry for Yapin...');
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

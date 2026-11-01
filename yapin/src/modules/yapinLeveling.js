import { DatabaseHelper } from '../../../src/database/db.js';
import { Embed } from '../yapper.js';

const xpCooldowns = new Map(); // `${guildKey}_${userId}` -> timestamp

function calculateLevel(xp) {
  return Math.floor(0.1 * Math.sqrt(Math.max(0, xp)));
}

function calculateNextLevelXP(level) {
  return Math.pow((level + 1) / 0.1, 2);
}

export const YapinLeveling = {
  async handleIncomingMessage(bot, msg) {
    if (!msg || !msg.server_id || !msg.author_id) return;
    if (msg.author_bot || msg.author_id === bot.me?.id) return;

    const guildKey = `yapin_${msg.server_id}`;
    const key = `${guildKey}_${msg.author_id}`;
    const now = Date.now();
    const last = xpCooldowns.get(key) || 0;

    if (now - last < 45000) return; // 45s cooldown
    xpCooldowns.set(key, now);

    const xpGain = Math.floor(Math.random() * 11) + 15; // 15-25 XP

    try {
      const prevData = DatabaseHelper.getUserLevels(guildKey, msg.author_id) || { xp: 0, level: 0 };
      const newXP = (prevData.xp || 0) + xpGain;
      const newLevel = calculateLevel(newXP);

      DatabaseHelper.addUserXP(guildKey, msg.author_id, xpGain);

      // Level up announcement
      if (newLevel > (prevData.level || 0)) {
        await bot.send(msg.channel_id, `[Level Up] Bravo <@${msg.author_id}>! You reached **Level ${newLevel}** on Yapin!`);
      }
    } catch (e) {}
  },

  async handleRank(ctx, getContextData) {
    const { serverId, authorId, argv } = getContextData(ctx);
    if (!serverId) return ctx.reply('[Error] Comando disponibile solo nei server.');

    const targetId = argv[0]?.replace(/[<@!>]/g, '') || authorId;
    const guildKey = `yapin_${serverId}`;

    let data = { xp: 0, level: 0 };
    try {
      data = DatabaseHelper.getUserLevels(guildKey, targetId) || data;
    } catch (e) {}

    const level = data.level || calculateLevel(data.xp || 0);
    const currentXP = data.xp || 0;
    const nextLevelXP = Math.floor(calculateNextLevelXP(level));

    // Progress bar ASCII
    const progress = Math.min(1, Math.max(0, currentXP / nextLevelXP));
    const filled = Math.round(progress * 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

    const embed = new Embed()
      .title(`[Level Card] <@${targetId}>`)
      .field('Livello Attuale', `\`Livello ${level}\``, true)
      .field('Esperienza XP', `\`${currentXP.toLocaleString()} / ${nextLevelXP.toLocaleString()} XP\``, true)
      .field('Progresso', `\`[${bar}] ${Math.round(progress * 100)}%\``, false)
      .color('#8b5cf6');

    ctx.reply('', { embeds: [embed] });
  },

  async handleLeaderboard(ctx, getContextData) {
    const { serverId } = getContextData(ctx);
    if (!serverId) return ctx.reply('[Error] Comando disponibile solo nei server.');

    const guildKey = `yapin_${serverId}`;
    let list = [];
    try {
      list = DatabaseHelper.getLeaderboard(guildKey, 10);
    } catch (e) {}

    const rows = (!list || list.length === 0)
      ? '*No users have earned XP in this Realm yet. Be the first to chat!*'
      : list.map((item, idx) => {
          const medal = `#${idx + 1}`;
          return `${medal} **<@${item.user_id}>** — Level \`${item.level || 0}\` (\`${(item.xp || 0).toLocaleString()} XP\`)`;
        }).join('\n');

    const embed = new Embed()
      .title('[Leaderboard] Realm Level Rankings')
      .description(rows)
      .color('#eab308');

    ctx.reply('', { embeds: [embed] });
  }
};

import { Embed } from '../yapper.js';

export const YapinLiveStats = {
  async handleLiveCount(bot, ctx, getContextData) {
    const { serverId } = getContextData(ctx);
    if (!serverId) return ctx.reply('❌ Il comando deve essere eseguito all\'interno di un server.');

    try {
      const counts = await bot.memberCounts(serverId);
      const server = await bot.server(serverId);

      const total = counts?.member_count ?? server?.member_count ?? 0;
      const online = counts?.online_count ?? 0;
      const offline = Math.max(0, total - online);
      const ratio = total > 0 ? Math.round((online / total) * 100) : 0;

      const embed = new Embed()
        .title(`📊 Statistiche Live Realm | ${server?.name || 'Yapin'}`)
        .field('🟢 Membri Online', `\`${online.toLocaleString()}\``, true)
        .field('⚪ Membri Offline', `\`${offline.toLocaleString()}\``, true)
        .field('👥 Totale Iscritti', `\`${total.toLocaleString()}\``, true)
        .field('🔥 Percentuale Attività', `\`${ratio}% dei membri è online adesso\``, false)
        .color('#10b981');

      ctx.reply('', { embeds: [embed] });
    } catch (err) {
      ctx.reply(`❌ Errore nel recupero delle statistiche live: ${err.message}`);
    }
  },

  async handleRealmOverview(bot, ctx, getContextData) {
    const { serverId } = getContextData(ctx);
    if (!serverId) return ctx.reply('❌ Comando disponibile solo nei server.');

    try {
      const server = await bot.server(serverId);
      const channels = await bot.channels(serverId).catch(() => []);
      const roles = await bot.roles(serverId).catch(() => []);
      const counts = await bot.memberCounts(serverId).catch(() => null);

      const textChans = channels.filter(c => (c.kind || c.type) === 'text');
      const voiceChans = channels.filter(c => (c.kind || c.type) === 'voice');

      const embed = new Embed()
        .title(`🏰 Realm Hub | ${server?.name}`)
        .description(server?.description || '*Nessuna descrizione impostata per questo Realm.*')
        .field('🆔 Realm ID', `\`${serverId}\``, true)
        .field('👑 Proprietario', `<@${server?.owner_id}>`, true)
        .field('💬 Canali Testuali', `\`${textChans.length}\` chat`, true)
        .field('🔊 Canali Vocali E2EE', `\`${voiceChans.length}\` stanze LiveKit`, true)
        .field('🎭 Ruoli Server', `\`${roles.length}\` ruoli`, true)
        .field('👥 Popolazione', `\`${counts?.member_count ?? server?.member_count ?? 0}\` cittadini`, true)
        .color('#3b82f6');

      if (server?.icon_url || server?.avatar_url) {
        embed.image(server.icon_url || server.avatar_url);
      }

      ctx.reply('', { embeds: [embed] });
    } catch (e) {
      ctx.reply(`❌ Errore caricamento Realm Hub: ${e.message}`);
    }
  }
};

import express from 'express';
import { ChannelType, PermissionsBitField } from 'discord.js';
import { DatabaseHelper } from '../../database/db.js';
import { CONFIG } from '../../config.js';

export function createGuildsRouter(botClient) {
  const router = express.Router();

  const requireModAuth = async (req, res, next) => {
    const user = req.user || req.session?.user;
    if (!user) {
      return res.status(401).json({ error: 'Accesso negato. Effettua prima il login con Discord.' });
    }
    next();
  };

  router.get('/', requireModAuth, async (req, res) => {
    const user = req.user || req.session?.user;

    if (!botClient?.isReady() || botClient.guilds.cache.size === 0) {
      return res.json([]);
    }

    const botGuilds = botClient.guilds.cache;
    const isCreator = user?.id === CONFIG.CREATOR_ID || user?.isAdmin;
    const accessibleGuilds = [];

    for (const [id, guild] of botGuilds.entries()) {
      if (isCreator) {
        accessibleGuilds.push(guild);
        continue;
      }

      try {
        const member = await guild.members.fetch(user.id);
        const isMod = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                      member.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
                      member.permissions.has(PermissionsBitField.Flags.BanMembers) ||
                      member.permissions.has(PermissionsBitField.Flags.KickMembers) ||
                      member.permissions.has(PermissionsBitField.Flags.ManageMessages) ||
                      guild.ownerId === user.id;

        if (isMod) {
          accessibleGuilds.push(guild);
        }
      } catch (e) {}
    }

    const result = accessibleGuilds.map(g => {
      const iconUrl = g.iconURL ? g.iconURL({ size: 128 }) : null;
      const settings = DatabaseHelper.getGuildSettings(g.id);
      const activeCount = settings ? Object.values(settings.modules_enabled || {}).filter(Boolean).length : 8;
      return {
        id: g.id,
        name: g.name,
        icon: iconUrl,
        memberCount: g.memberCount,
        botJoined: true,
        permissions: 'Moderatore',
        activeModulesCount: activeCount
      };
    });

    res.json(result);
  });

  router.get('/:guildId', requireModAuth, async (req, res) => {
    const guildId = req.params.guildId;
    const user = req.user || req.session?.user;

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(404).json({ error: 'Server non trovato nel bot' });
    }

    const guild = botClient.guilds.cache.get(guildId);
    const isCreator = user?.id === CONFIG.CREATOR_ID || user?.isAdmin;

    if (!isCreator && user?.id) {
      try {
        const member = await guild.members.fetch(user.id);
        const isMod = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                      member.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
                      member.permissions.has(PermissionsBitField.Flags.BanMembers) ||
                      member.permissions.has(PermissionsBitField.Flags.KickMembers) ||
                      member.permissions.has(PermissionsBitField.Flags.ManageMessages) ||
                      guild.ownerId === user.id;

        if (!isMod) {
          return res.status(403).json({ error: 'Accesso riservato esclusivamente ai Moderatori e Amministratori di questo server.' });
        }
      } catch (e) {
        return res.status(403).json({ error: 'Non fai parte di questo server o non possiedi i permessi di moderatore.' });
      }
    }

    try {
      await guild.channels.fetch();
      await guild.roles.fetch();
    } catch (e) {
      console.warn('[Guilds] Cache refresh notice:', e.message);
    }

    const channels = guild.channels.cache
      .map(c => {
        let normalizedType = 'text';
        const isVoice = (c.isVoiceBased && c.isVoiceBased()) || c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice || c.type === 2 || c.type === 13;
        const isCat = (c.type === ChannelType.GuildCategory || c.type === 4);
        
        if (isCat) normalizedType = 'category';
        else if (isVoice) normalizedType = 'voice';
        else normalizedType = 'text';

        return {
          id: c.id,
          name: c.name,
          type: normalizedType,
          rawType: c.type,
          parentId: c.parentId,
          position: c.rawPosition ?? c.position ?? 0
        };
      })
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

    const roles = guild.roles.cache
      .filter(r => r.name !== '@everyone')
      .map(r => ({
        id: r.id,
        name: r.name,
        color: r.hexColor,
        position: r.position
      }))
      .sort((a, b) => b.position - a.position);

    const mapMember = (m) => {
      let coins = 0;
      try {
        coins = DatabaseHelper.getUserCoins(guild.id, m.id);
      } catch (err) {
        coins = 0;
      }
      return {
        id: m.id,
        name: m.user?.username || m.id,
        displayName: m.displayName || m.user?.username || m.id,
        avatar: m.user?.displayAvatarURL ? m.user.displayAvatarURL({ size: 64 }) : null,
        coins: coins
      };
    };

    let members = [];
    try {
      const fetched = await guild.members.fetch().catch(() => guild.members.cache);
      const memberCollection = (fetched && typeof fetched.values === 'function') ? fetched : guild.members.cache;
      members = Array.from(memberCollection.values())
        .filter(m => !m.user?.bot)
        .map(mapMember)
        .sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));
    } catch (e) {
      console.warn('[Guilds] Member fetch fallback notice:', e.message);
      members = Array.from(guild.members.cache.values())
        .filter(m => !m.user?.bot)
        .map(mapMember)
        .sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));
    }

    // Merge any registered members from database so user lists are always populated
    try {
      const dbUsers = DatabaseHelper.db.prepare(
        'SELECT DISTINCT user_id FROM (SELECT user_id FROM levels WHERE guild_id = ? UNION SELECT user_id FROM fishing_profiles WHERE guild_id = ?)'
      ).all(guild.id, guild.id);

      for (const u of dbUsers) {
        if (!members.some(m => m.id === u.user_id)) {
          let coins = 0;
          try {
            coins = DatabaseHelper.getUserCoins(guild.id, u.user_id);
          } catch (err) {
            coins = 0;
          }
          members.push({
            id: u.user_id,
            name: `Utente ${u.user_id.slice(-4)}`,
            displayName: `Utente ${u.user_id.slice(-4)}`,
            avatar: null,
            coins: coins
          });
        }
      }
    } catch (e) {}

    const settings = DatabaseHelper.getGuildSettings(guild.id);

    res.json({
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL ? guild.iconURL({ size: 128 }) : null,
      memberCount: guild.memberCount,
      channels,
      roles,
      members,
      settings
    });
  });

  return router;
}

export default createGuildsRouter;

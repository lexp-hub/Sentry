import express from 'express';
import { ChannelType, PermissionsBitField } from 'discord.js';
import { DatabaseHelper } from '../../database/db.js';
import { CONFIG } from '../../config.js';

export async function verifyGuildAccess(guild, user) {
  if (!guild || !user?.id) return false;

  // 1. Creatore del bot o Super Admin (accesso garantito)
  const isCreator = user.id === CONFIG.CREATOR_ID || user.isAdmin;
  if (isCreator) return true;

  // 2. Proprietario del server Discord
  if (guild.ownerId === user.id) return true;

  // 3. Verifica membro in cache o via fetch
  let member = guild.members.cache.get(user.id);
  if (!member) {
    try {
      member = await guild.members.fetch(user.id);
    } catch (e) {
      member = null;
    }
  }

  if (member) {
    // Ha almeno un ruolo assegnato diverso da @everyone
    const hasRole = member.roles?.cache?.some(r => r.id !== guild.id);
    if (hasRole) return true;

    // Permessi Discord (moderazione / amministrazione estesi)
    if (member.permissions) {
      const isMod = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                    member.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
                    member.permissions.has(PermissionsBitField.Flags.BanMembers) ||
                    member.permissions.has(PermissionsBitField.Flags.KickMembers) ||
                    member.permissions.has(PermissionsBitField.Flags.ManageMessages) ||
                    member.permissions.has(PermissionsBitField.Flags.ModerateMembers) ||
                    member.permissions.has(PermissionsBitField.Flags.ManageRoles) ||
                    member.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
                    member.permissions.has(PermissionsBitField.Flags.ViewAuditLog);
      if (isMod) return true;
    }
  }

  // 4. Fallback tramite user.guilds dalla sessione OAuth Discord
  if (Array.isArray(user.guilds)) {
    const oAuthGuild = user.guilds.find(g => g.id === guild.id);
    if (oAuthGuild) {
      if (oAuthGuild.owner) return true;
      if (oAuthGuild.permissions) {
        try {
          const perms = new PermissionsBitField(BigInt(oAuthGuild.permissions));
          if (perms.has(PermissionsBitField.Flags.Administrator) ||
              perms.has(PermissionsBitField.Flags.ManageGuild) ||
              perms.has(PermissionsBitField.Flags.BanMembers) ||
              perms.has(PermissionsBitField.Flags.KickMembers) ||
              perms.has(PermissionsBitField.Flags.ManageMessages) ||
              perms.has(PermissionsBitField.Flags.ModerateMembers) ||
              perms.has(PermissionsBitField.Flags.ManageRoles) ||
              perms.has(PermissionsBitField.Flags.ManageChannels)) {
            return true;
          }
        } catch (e) {}
      }
    }
  }

  return false;
}

export function createGuildsRouter(botClient, yapinBot) {
  const router = express.Router();

  const requireModAuth = async (req, res, next) => {
    const user = req.user || req.session?.user;
    if (!user) {
      return res.status(401).json({ error: 'Accesso negato. Effettua prima il login.' });
    }
    next();
  };

  router.get('/', requireModAuth, async (req, res) => {
    const user = req.user || req.session?.user;
    const isCreator = user?.id === CONFIG.CREATOR_ID || user?.isAdmin;
    const targetPlatform = req.query.platform || user?.activePlatform || 'all';
    const result = [];

    // 1. Server Discord (se richiesto dal profilo attivo)
    if (targetPlatform === 'all' || targetPlatform === 'discord') {
      if (botClient?.isReady() && botClient.guilds.cache.size > 0) {
        const botGuilds = botClient.guilds.cache;
        const accessibleDiscord = [];

        for (const [id, guild] of botGuilds.entries()) {
          const hasAccess = await verifyGuildAccess(guild, user);
          if (hasAccess) {
            accessibleDiscord.push(guild);
          }
        }

        accessibleDiscord.forEach(g => {
          const iconUrl = g.iconURL ? g.iconURL({ size: 128 }) : null;
          const settings = DatabaseHelper.getGuildSettings(g.id);
          const activeCount = settings ? Object.values(settings.modules_enabled || {}).filter(Boolean).length : 8;
          result.push({
            id: g.id,
            name: `[Discord] ${g.name}`,
            rawName: g.name,
            platform: 'discord',
            icon: iconUrl,
            memberCount: g.memberCount,
            botJoined: true,
            permissions: isCreator ? 'Creatore / Admin' : 'Moderatore',
            activeModulesCount: activeCount
          });
        });
      }
    }

    // 2. Server Yapin (se richiesto dal profilo attivo)
    if (targetPlatform === 'all' || targetPlatform === 'yapin') {
      if (yapinBot && typeof yapinBot.servers === 'function') {
        try {
          const yapinServers = await yapinBot.servers().catch(() => []);
          if (Array.isArray(yapinServers)) {
            for (const s of yapinServers) {
              let hasPermission = isCreator;
              if (!hasPermission && user?.id) {
                // Se l'utente è loggato con Yapin, verifica se è l'owner o membro autorizzato
                if (s.owner_id === user.id || user.isAdmin) {
                  hasPermission = true;
                } else {
                  try {
                    const member = await yapinBot.member(s.id, user.id).catch(() => null);
                    if (member && (member.owner || member.is_owner || member.permissions?.administrator || member.permissions?.manage_server)) {
                      hasPermission = true;
                    }
                  } catch (e) {}
                }
              }

              // Se profilo Yapin attivo e non è admin, salta (proprio come su Discord)
              if (user?.platform === 'yapin' && !isCreator && !hasPermission) {
                continue;
              }

              const guildKey = `yapin_${s.id}`;
              const settings = DatabaseHelper.getGuildSettings(guildKey);
              const activeCount = settings ? Object.values(settings.modules_enabled || {}).filter(Boolean).length : 6;
              result.push({
                id: guildKey,
                name: `[Yapin] ${s.name}`,
                rawName: s.name,
                platform: 'yapin',
                icon: s.avatar_url || s.banner_url || null,
                memberCount: s.member_count || 1,
                botJoined: true,
                permissions: 'Admin Yapin',
                activeModulesCount: activeCount
              });
            }
          }
        } catch (err) {
          console.warn('[Guilds Router] Errore lettura server Yapin:', err.message);
        }
      }
    }

    res.json(result);
  });

  router.get('/:guildId', requireModAuth, async (req, res) => {
    const guildId = req.params.guildId;
    const user = req.user || req.session?.user;
    const isCreator = user?.id === CONFIG.CREATOR_ID || user?.isAdmin;

    // Gestione Server Yapin
    if (guildId.startsWith('yapin_')) {
      const yapinServerId = guildId.replace('yapin_', '');
      if (!yapinBot) {
        return res.status(404).json({ error: 'Modulo Yapin non attivo sul server.' });
      }

      try {
        const server = await yapinBot.server(yapinServerId).catch(() => null);
        if (!server) {
          return res.status(404).json({ error: 'Server Yapin non trovato.' });
        }

        const rawChannels = await yapinBot.channels(yapinServerId).catch(() => []);
        const rawRoles = await yapinBot.roles(yapinServerId).catch(() => []);
        const rawMembers = await yapinBot.members(yapinServerId).catch(() => []);

        const channels = (rawChannels || []).map(c => ({
          id: c.id,
          name: c.name,
          type: c.kind === 'voice' ? 'voice' : 'text',
          rawType: c.kind === 'voice' ? 2 : 0,
          parentId: c.category_id || null,
          position: 0
        }));

        const roles = (rawRoles || []).map(r => ({
          id: r.id,
          name: r.name,
          color: r.color || '#9ca3af',
          position: r.position || 0
        }));

        const members = (rawMembers || []).map(m => ({
          id: m.id || m.user_id,
          name: m.user?.username || m.username || 'Membro',
          displayName: m.user?.display_name || m.nickname || m.user?.username || 'Membro',
          avatar: m.user?.avatar_url || null,
          coins: 100
        }));

        const settings = DatabaseHelper.getGuildSettings(guildId);

        return res.json({
          id: guildId,
          name: `[Yapin] ${server.name}`,
          rawName: server.name,
          platform: 'yapin',
          icon: server.avatar_url || null,
          memberCount: server.member_count || members.length,
          channels,
          roles,
          members,
          settings
        });
      } catch (err) {
        return res.status(500).json({ error: `Errore recupero server Yapin: ${err.message}` });
      }
    }

    // Gestione Server Discord
    if (!botClient?.isReady()) {
      return res.status(503).json({ error: 'Bot non connesso a Discord' });
    }
    let guild = botClient.guilds.cache.get(guildId);
    if (!guild) {
      guild = await botClient.guilds.fetch(guildId).catch(() => null);
    }
    if (!guild) {
      return res.status(404).json({ error: 'Server non trovato nel bot' });
    }

    const hasAccess = await verifyGuildAccess(guild, user);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Accesso riservato esclusivamente ai Moderatori, Amministratori o membri con ruolo di questo server.' });
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

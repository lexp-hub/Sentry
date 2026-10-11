import express from 'express';
import fs from 'fs';
import path from 'path';
import { DatabaseHelper } from '../../database/db.js';
import { MysqlSync } from '../../database/mysqlSync.js';
import { PartnershipManager } from '../../bot/modules/partnershipManager.js';
import { PresentationManager } from '../../bot/modules/presentationManager.js';
import { SetupShowcaseManager } from '../../bot/modules/setupShowcaseManager.js';
import { FishingManager } from '../../bot/modules/fishingManager.js';
import { BlackjackManager } from '../../bot/modules/blackjackManager.js';
import { WelcomerManager } from '../../bot/modules/welcomerManager.js';
import { BoostManager } from '../../bot/modules/boostManager.js';
import { GiveawayManager } from '../../bot/modules/giveawayManager.js';
import { TempChannelManager } from '../../bot/modules/tempChannelManager.js';
import { MusicManager } from '../../bot/modules/musicManager.js';
import { exportChannelsToCSV } from '../../bot/modules/channelExporter.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } from 'discord.js';
import { CONFIG } from '../../config.js';

export function createApiRouter(botClient, broadcastToGuild = () => {}) {
  const router = express.Router();

  const notifySync = (guildId, module, req, extraData = {}) => {
    try {
      const user = req?.user || req?.session?.user;
      const senderClientId = req?.headers ? req.headers['x-client-id'] : null;
      broadcastToGuild(guildId, {
        type: 'GUILD_UPDATED',
        guildId,
        module,
        updatedBy: user?.username || 'Moderatore',
        senderClientId,
        timestamp: Date.now(),
        ...extraData
      });
    } catch (e) {
      console.error('[API Sync Notify Error]:', e.message);
    }
  };

  const requireModAuth = async (req, res, next) => {
    const user = req.user || req.session.user;
    if (!user) {
      return res.status(401).json({ error: 'Accesso negato. Effettua il login con Discord.' });
    }

    const isCreator = user?.id === CONFIG.CREATOR_ID || user?.isAdmin;
    const guildId = req.params.guildId;

    if (!isCreator && guildId && botClient?.isReady() && botClient.guilds.cache.has(guildId)) {
      const guild = botClient.guilds.cache.get(guildId);
      try {
        const member = await guild.members.fetch(user.id);
        const isMod = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                      member.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
                      member.permissions.has(PermissionsBitField.Flags.BanMembers) ||
                      member.permissions.has(PermissionsBitField.Flags.KickMembers) ||
                      member.permissions.has(PermissionsBitField.Flags.ManageMessages) ||
                      guild.ownerId === user.id;

        if (!isMod) {
          return res.status(403).json({ error: 'Accesso vietato: Solo i moderatori e cavalieri autorizzati possono modificare questo Reame.' });
        }
      } catch (e) {
        return res.status(403).json({ error: 'Non fai parte di questo server.' });
      }
    }

    next();
  };

  router.get('/status', (req, res) => {
    const isReady = Boolean(botClient?.isReady());
    res.json({
      online: isReady,
      botName: botClient?.user?.tag || CONFIG.BOT_NAME,
      avatar: botClient?.user?.displayAvatarURL() || null,
      guildsCount: isReady ? botClient.guilds.cache.size : 0,
      usersCount: isReady ? botClient.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0) : 0,
      ping: isReady ? Math.round(botClient.ws.ping) : 0,
      uptime: process.uptime(),
      demoMode: !isReady,
      aiModel: CONFIG.CLOUDFLARE_MODEL
    });
  });

  router.get('/guilds/:guildId/settings', requireModAuth, (req, res) => {
    const settings = DatabaseHelper.getGuildSettings(req.params.guildId);
    res.json(settings);
  });

  router.post('/guilds/:guildId/settings', requireModAuth, (req, res) => {
    const updated = DatabaseHelper.updateGuildSettings(req.params.guildId, req.body);
    notifySync(req.params.guildId, 'settings', req);
    res.json({ success: true, settings: updated });
  });

  // Wispbyte Persistence & Backup Endpoints
  router.post('/guilds/:guildId/backup/flush', requireModAuth, (req, res) => {
    const success = DatabaseHelper.flushToDisk();
    const backupFile = DatabaseHelper.createBackup('manual');
    res.json({ success, backupFile: backupFile ? path.basename(backupFile) : null });
  });

  router.get('/guilds/:guildId/backup/export', requireModAuth, (req, res) => {
    const config = DatabaseHelper.exportGuildConfig(req.params.guildId);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="sentry-config-${req.params.guildId}.json"`);
    res.send(JSON.stringify(config, null, 2));
  });

  router.get('/guilds/:guildId/export/channels.csv', requireModAuth, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const guild = botClient?.guilds?.cache?.get(guildId);
      if (!guild) {
        return res.status(404).json({ error: 'Server Discord non trovato o bot non presente.' });
      }

      await guild.channels.fetch();
      const csvContent = exportChannelsToCSV(guild);
      const cleanName = guild.name.replace(/[^a-zA-Z0-9_-]/g, '_');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${cleanName}_canali_${Date.now()}.csv"`);
      res.send(Buffer.from(csvContent, 'utf-8'));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/guilds/:guildId/backup/import', requireModAuth, (req, res) => {
    try {
      DatabaseHelper.importGuildConfig(req.params.guildId, req.body);
      notifySync(req.params.guildId, 'all', req);
      res.json({ success: true, message: 'Configurazione importata e salvata con successo su disco!' });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/system/backup/latest', (req, res) => {
    const user = req.user || req.session?.user;
    if (user?.id !== CONFIG.CREATOR_ID && !user?.isAdmin) {
      return res.status(403).json({ error: 'Accesso riservato al proprietario.' });
    }
    const latest = DatabaseHelper.getLatestBackup();
    if (!latest || !fs.existsSync(latest)) {
      return res.status(404).json({ error: 'Nessun backup trovato.' });
    }
    res.download(latest);
  });

  router.get('/system/cloud-status', async (req, res) => {
    const status = await MysqlSync.getCloudStatus();
    res.json(status);
  });

  router.post('/system/cloud-sync', async (req, res) => {
    DatabaseHelper.flushToDisk();
    const result = await MysqlSync.pushCloudSnapshot('manual_dashboard');
    if (result) {
      res.json({ success: true, message: 'Database sincronizzato con successo nel cloud MySQL di Wispbyte!', result });
    } else {
      res.status(500).json({ success: false, error: 'Impossibile caricare lo snapshot su MySQL.' });
    }
  });

  // Modulo AI disabilitato da Dashboard Web per motivi di sicurezza (impedisce modifiche a prompt/modello e abusi di quota)
  router.get('/guilds/:guildId/ai', requireModAuth, (req, res) => {
    res.status(403).json({ error: 'La visualizzazione della configurazione AI dalla Dashboard Web è disabilitata per motivi di sicurezza.' });
  });

  router.post('/guilds/:guildId/ai', requireModAuth, (req, res) => {
    res.status(403).json({ error: 'La modifica dell\'AI dalla Dashboard Web è disabilitata per motivi di sicurezza.' });
  });

  router.post('/guilds/:guildId/ai/chat', requireModAuth, (req, res) => {
    res.status(403).json({ error: 'Il playground AI dalla Dashboard Web è disabilitato per motivi di sicurezza.' });
  });

  router.get('/guilds/:guildId/partnerships', requireModAuth, (req, res) => {
    const config = DatabaseHelper.getPartnershipConfig(req.params.guildId);
    const stats = DatabaseHelper.getPartnershipStats(req.params.guildId);
    const list = DatabaseHelper.getPartnerships(req.params.guildId, 25);
    res.json({ config, stats, partnerships: list });
  });

  router.post('/guilds/:guildId/partnerships/config', requireModAuth, (req, res) => {
    const updated = DatabaseHelper.updatePartnershipConfig(req.params.guildId, req.body);
    notifySync(req.params.guildId, 'partnerships', req);
    res.json({ success: true, config: updated });
  });

  router.post('/guilds/:guildId/partnerships/add', requireModAuth, async (req, res) => {
    const { invite, repId, notes, banner } = req.body;
    const guildId = req.params.guildId;

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Il bot non è presente in questo server.' });
    }

    const guild = botClient.guilds.cache.get(guildId);
    let user = req.session.user;
    if (repId) {
      try {
        user = await botClient.users.fetch(repId);
      } catch (e) {}
    }

    const channel = guild.channels.cache.find(c => c.type === 0);
    const result = await PartnershipManager.processPartnership(guild, channel, user, invite, notes, banner);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, result });
  });

  router.post('/guilds/:guildId/partnerships/panel', requireModAuth, async (req, res) => {
    const { channelId, title, description, color, image } = req.body;
    const guildId = req.params.guildId;

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Il bot non è presente in questo server.' });
    }

    try {
      const guild = botClient.guilds.cache.get(guildId);
      const config = DatabaseHelper.getPartnershipConfig(guildId);
      const targetChannelId = channelId || config.channel_id;

      if (!targetChannelId) {
        return res.status(400).json({ error: 'Nessun canale partnership selezionato o configurato.' });
      }

      await PartnershipManager.sendPartnershipPanel(guild, targetChannelId, title, description, color, image);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // === Community Presentations (Presentazioni) Routes ===
  router.get('/guilds/:guildId/presentations', requireModAuth, (req, res) => {
    const config = DatabaseHelper.getPresentationConfig(req.params.guildId);
    const list = DatabaseHelper.getPresentations(req.params.guildId, 25);
    res.json({ config, presentations: list });
  });

  router.post('/guilds/:guildId/presentations/config', requireModAuth, (req, res) => {
    const updated = DatabaseHelper.updatePresentationConfig(req.params.guildId, req.body);
    notifySync(req.params.guildId, 'presentations', req);
    res.json({ success: true, config: updated });
  });

  router.post('/guilds/:guildId/presentations/panel', requireModAuth, async (req, res) => {
    const { channelId, title, description, color, image } = req.body;
    const guildId = req.params.guildId;

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Il bot non è presente in questo server.' });
    }

    try {
      const guild = botClient.guilds.cache.get(guildId);
      const config = DatabaseHelper.getPresentationConfig(guildId);
      const targetChannelId = channelId || config.channel_id;

      if (!targetChannelId) {
        return res.status(400).json({ error: 'Nessun canale presentazioni selezionato o configurato.' });
      }

      await PresentationManager.sendPresentationPanel(guild, targetChannelId, title, description, color || '#6366f1', image);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // === Community Setup Showcase (Postazioni) Routes ===
  router.get('/guilds/:guildId/setup-showcase', requireModAuth, (req, res) => {
    const config = DatabaseHelper.getSetupShowcaseConfig(req.params.guildId);
    const list = DatabaseHelper.getSetupSubmissions(req.params.guildId, 25);
    res.json({ config, submissions: list });
  });

  router.post('/guilds/:guildId/setup-showcase/config', requireModAuth, (req, res) => {
    const updated = DatabaseHelper.updateSetupShowcaseConfig(req.params.guildId, req.body);
    notifySync(req.params.guildId, 'setups', req);
    res.json({ success: true, config: updated });
  });

  router.post('/guilds/:guildId/setup-showcase/panel', requireModAuth, async (req, res) => {
    const { channelId, title, description, color, image } = req.body;
    const guildId = req.params.guildId;

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Il bot non è presente in questo server.' });
    }

    try {
      const guild = botClient.guilds.cache.get(guildId);
      const config = DatabaseHelper.getSetupShowcaseConfig(guildId);
      const targetChannelId = channelId || config.channel_id;

      if (!targetChannelId) {
        return res.status(400).json({ error: 'Nessun canale showcase selezionato o configurato.' });
      }

      await SetupShowcaseManager.sendShowcaseInfoPanel(guild, targetChannelId, {
        title,
        description,
        color: color || '#dc2626',
        image
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/guilds/:guildId/setup-showcase/convert', requireModAuth, async (req, res) => {
    const { channelId, limit } = req.body;
    const guildId = req.params.guildId;

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Il bot non è presente in questo server.' });
    }

    try {
      const guild = botClient.guilds.cache.get(guildId);
      const config = DatabaseHelper.getSetupShowcaseConfig(guildId);
      const targetChannelId = channelId || config.channel_id;

      if (!targetChannelId) {
        return res.status(400).json({ error: 'Nessun canale showcase configurato o selezionato.' });
      }

      const result = await SetupShowcaseManager.convertChannelMessages(guild, targetChannelId, limit || 50);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/guilds/:guildId/embeds', requireModAuth, (req, res) => {
    const templates = DatabaseHelper.getEmbedTemplates(req.params.guildId);
    res.json(templates);
  });

  router.post('/guilds/:guildId/embeds/save', requireModAuth, (req, res) => {
    const { id, name, embedData, componentsData } = req.body;
    const templateId = id || `template_${Date.now()}`;
    const saved = DatabaseHelper.saveEmbedTemplate(
      req.params.guildId,
      templateId,
      name || 'Nuovo Template',
      embedData,
      componentsData || [],
      req.session.user?.username || 'Moderatore'
    );
    res.json({ success: true, template: saved });
  });

  router.post('/guilds/:guildId/embeds/send', requireModAuth, async (req, res) => {
    const { channelId, embedData, componentsData } = req.body;
    const guildId = req.params.guildId;

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Bot non collegato al server o offline.' });
    }

    try {
      const guild = botClient.guilds.cache.get(guildId);
      const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) return res.status(404).json({ error: 'Canale non trovato nel server' });

      const embed = new EmbedBuilder();
      if (embedData.title) embed.setTitle(embedData.title);
      if (embedData.description) embed.setDescription(embedData.description);
      if (embedData.url) embed.setURL(embedData.url);
      if (embedData.color !== undefined) {
        try { embed.setColor(embedData.color); } catch (e) { embed.setColor('#dc2626'); }
      }
      if (embedData.author?.name) {
        embed.setAuthor({
          name: embedData.author.name,
          iconURL: embedData.author.icon_url || undefined,
          url: embedData.author.url || undefined
        });
      }
      if (embedData.image?.url) embed.setImage(embedData.image.url);
      if (embedData.thumbnail?.url) embed.setThumbnail(embedData.thumbnail.url);
      if (embedData.footer?.text) {
        embed.setFooter({
          text: embedData.footer.text,
          iconURL: embedData.footer.icon_url || undefined
        });
      }
      if (embedData.timestamp) embed.setTimestamp();
      if (Array.isArray(embedData.fields) && embedData.fields.length > 0) {
        embedData.fields.forEach(f => {
          if (f.name && f.value) {
            embed.addFields({
              name: String(f.name),
              value: String(f.value),
              inline: Boolean(f.inline)
            });
          }
        });
      }

      const rows = [];

      if (componentsData && componentsData.length > 0) {
        const row = new ActionRowBuilder();
        for (const btn of componentsData.slice(0, 5)) {
          const button = new ButtonBuilder()
            .setLabel(btn.label || 'Pulsante')
            .setStyle(btn.style === 'LINK' ? ButtonStyle.Link : ButtonStyle[btn.style] || ButtonStyle.Primary);

          if (btn.emoji) button.setEmoji(btn.emoji);
          if (btn.style === 'LINK' && btn.url) {
            button.setURL(btn.url);
          } else {
            button.setCustomId(btn.custom_id || `btn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
          }
          row.addComponents(button);
        }
        rows.push(row);
      }

      await channel.send({ embeds: [embed], components: rows });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/guilds/:guildId/embeds/:id', requireModAuth, (req, res) => {
    DatabaseHelper.deleteEmbedTemplate(req.params.id);
    res.json({ success: true });
  });

  router.get('/guilds/:guildId/reaction-roles', requireModAuth, (req, res) => {
    const list = DatabaseHelper.getReactionRoles(req.params.guildId);
    res.json(list);
  });

  router.post('/guilds/:guildId/reaction-roles', requireModAuth, async (req, res) => {
    const { channelId, roleId, label, emoji, style, title, description } = req.body;
    const guildId = req.params.guildId;

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Bot non collegato al server.' });
    }

    try {
      const guild = botClient.guilds.cache.get(guildId);
      const channel = guild.channels.cache.get(channelId);
      const role = guild.roles.cache.get(roleId);

      if (!channel || !role) {
        return res.status(400).json({ error: 'Canale o ruolo non valido.' });
      }

      const button = new ButtonBuilder()
        .setCustomId(`rr_btn_${role.id}`)
        .setLabel(label || role.name)
        .setStyle(ButtonStyle[style] || ButtonStyle.Primary);

      if (emoji) button.setEmoji(emoji);

      const row = new ActionRowBuilder().addComponents(button);

      const embed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_COLOR)
        .setTitle(title || '🎭 Selezione Ruolo')
        .setDescription(description || `Clicca sul pulsante per ricevere o toglierti il ruolo ${role}.`)
        .setFooter({ text: 'Sentry • Reaction Roles' })
        .setTimestamp();

      const msg = await channel.send({ embeds: [embed], components: [row] });

      const saved = DatabaseHelper.addReactionRole(
        guildId,
        channel.id,
        msg.id,
        'BUTTON',
        role.id,
        emoji,
        label,
        style
      );

      res.json({ success: true, reactionRole: saved });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/guilds/:guildId/reaction-roles/:id', requireModAuth, (req, res) => {
    DatabaseHelper.deleteReactionRole(req.params.id);
    res.json({ success: true });
  });

  router.get('/guilds/:guildId/welcomer', requireModAuth, (req, res) => {
    const config = DatabaseHelper.getWelcomerConfig(req.params.guildId);
    res.json(config);
  });

  router.post('/guilds/:guildId/welcomer', requireModAuth, (req, res) => {
    const updated = DatabaseHelper.updateWelcomerConfig(req.params.guildId, req.body);
    notifySync(req.params.guildId, 'welcomer', req);
    res.json({ success: true, config: updated });
  });

  router.post('/guilds/:guildId/welcomer/test', requireModAuth, async (req, res) => {
    const guildId = req.params.guildId;
    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Bot non collegato.' });
    }

    try {
      const guild = botClient.guilds.cache.get(guildId);
      const config = DatabaseHelper.getWelcomerConfig(guildId);
      const channelId = config.welcome_channel_id;
      if (!channelId) return res.status(400).json({ error: 'Nessun canale di benvenuto configurato.' });

      const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) return res.status(400).json({ error: 'Canale di benvenuto non trovato su Discord.' });

      const fakeMember = guild.members.me;
      const embed = WelcomerManager.buildDiscordEmbed(config.welcome_embed, config.welcome_message, fakeMember);

      await channel.send({ content: `<@${fakeMember.id}>`, embeds: [embed] });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/guilds/:guildId/boost', requireModAuth, (req, res) => {
    const config = DatabaseHelper.getBoostConfig(req.params.guildId);
    let boostCount = 0;
    let boostTier = 0;
    if (botClient?.isReady() && botClient.guilds.cache.has(req.params.guildId)) {
      const g = botClient.guilds.cache.get(req.params.guildId);
      boostCount = g.premiumSubscriptionCount || 0;
      boostTier = g.premiumTier || 0;
    }
    res.json({ config, boostCount, boostTier });
  });

  router.post('/guilds/:guildId/boost', requireModAuth, (req, res) => {
    const updated = DatabaseHelper.updateBoostConfig(req.params.guildId, req.body);
    notifySync(req.params.guildId, 'boost', req);
    res.json({ success: true, config: updated });
  });

  router.post('/guilds/:guildId/boost/test', requireModAuth, async (req, res) => {
    const guildId = req.params.guildId;
    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Bot non collegato.' });
    }

    try {
      const guild = botClient.guilds.cache.get(guildId);
      const targetChanId = req.body?.channel_id;
      await BoostManager.sendTestBoost(guild, targetChanId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/guilds/:guildId/autoresponders', requireModAuth, (req, res) => {
    const list = DatabaseHelper.getAutoresponders(req.params.guildId);
    const channels = DatabaseHelper.getAutoreactionChannels(req.params.guildId);
    res.json({ autoresponders: list, autoreactionChannels: channels });
  });

  router.post('/guilds/:guildId/autoresponders', requireModAuth, (req, res) => {
    const created = DatabaseHelper.addAutoresponder(req.params.guildId, req.body);
    res.json({ success: true, autoresponder: created });
  });

  router.delete('/guilds/:guildId/autoresponders/:id', requireModAuth, (req, res) => {
    DatabaseHelper.deleteAutoresponder(req.params.id);
    res.json({ success: true });
  });

  router.post('/guilds/:guildId/autoreaction-channel', requireModAuth, (req, res) => {
    const { channelId, emojis, enabled } = req.body;
    const id = DatabaseHelper.setAutoreactionChannel(req.params.guildId, channelId, emojis, enabled);
    res.json({ success: true, id });
  });

  router.get('/guilds/:guildId/automod', requireModAuth, (req, res) => {
    const config = DatabaseHelper.getAutomodConfig(req.params.guildId);
    const cases = DatabaseHelper.getModerationCases(req.params.guildId, null, 25);
    res.json({ config, recentCases: cases });
  });

  router.post('/guilds/:guildId/automod', requireModAuth, (req, res) => {
    const updated = DatabaseHelper.updateAutomodConfig(req.params.guildId, req.body);
    notifySync(req.params.guildId, 'automod', req);
    res.json({ success: true, config: updated });
  });

  router.get('/guilds/:guildId/tickets', requireModAuth, (req, res) => {
    const panels = DatabaseHelper.getTicketPanels(req.params.guildId);
    const tickets = DatabaseHelper.db.prepare('SELECT * FROM tickets WHERE guild_id = ? ORDER BY created_at DESC LIMIT 20').all(req.params.guildId);
    res.json({ panels, tickets });
  });

  router.post('/guilds/:guildId/tickets/panel', requireModAuth, async (req, res) => {
    const {
      channelId, title, description, color, image, footer,
      buttonLabel, buttonEmoji, buttonStyle, categoryId, supportRoleId,
      welcomeMessage, namingScheme, logChannelId
    } = req.body;
    const guildId = req.params.guildId;
    const panelId = `panel_${Date.now()}`;

    if (botClient?.isReady() && botClient.guilds.cache.has(guildId)) {
      try {
        const guild = botClient.guilds.cache.get(guildId);
        const channel = guild.channels.cache.get(channelId);
        if (channel) {
          const btn = new ButtonBuilder()
            .setCustomId(`ticket_open_${panelId}`)
            .setLabel(buttonLabel || 'Apri Ticket')
            .setEmoji(buttonEmoji || '📩')
            .setStyle(ButtonStyle[buttonStyle] || ButtonStyle.Primary);

          const row = new ActionRowBuilder().addComponents(btn);

          const embed = new EmbedBuilder()
            .setColor(color || CONFIG.EMBED_COLOR || '#ea580c')
            .setTitle(title || '🎫 Centro Supporto & Assistenza')
            .setDescription(description || 'Clicca sul pulsante sottostante per aprire una richiesta di supporto privata.')
            .setFooter({ text: footer || `${guild.name} • Sistema Ticket`, iconURL: guild.iconURL() })
            .setTimestamp();

          if (image) embed.setImage(image);

          // Check if editing existing message
          let targetMsg = null;
          if (req.body.panelId || req.body.messageId) {
            const existingPanel = req.body.panelId ? DatabaseHelper.getTicketPanel(req.body.panelId) : null;
            const targetMsgId = req.body.messageId || existingPanel?.message_id;
            if (targetMsgId) {
              try {
                targetMsg = await channel.messages.fetch(targetMsgId);
              } catch (e) {}
            }
          }

          let sent = null;
          if (targetMsg) {
            await targetMsg.edit({ embeds: [embed], components: [row] });
            sent = targetMsg;
          } else {
            sent = await channel.send({ embeds: [embed], components: [row] });
          }

          const saved = DatabaseHelper.saveTicketPanel({
            id: req.body.panelId || panelId,
            guild_id: guildId,
            channel_id: channel.id,
            message_id: sent.id,
            title,
            description,
            color: color || '#ea580c',
            image: image || null,
            footer: footer || null,
            button_style: buttonStyle || 'Primary',
            category_id: categoryId,
            button_label: buttonLabel,
            button_emoji: buttonEmoji,
            support_role_id: supportRoleId,
            welcome_message: welcomeMessage,
            naming_scheme: namingScheme || 'ticket-{user}',
            log_channel_id: logChannelId || null
          });

          return res.json({ success: true, panel: saved, edited: Boolean(targetMsg) });
        }
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    res.status(400).json({ error: 'Server non raggiungibile.' });
  });

  // Universal Live Embed Message Editor: Edit ANY message previously sent by the bot on Discord
  router.post('/guilds/:guildId/embeds/edit-message', requireModAuth, async (req, res) => {
    const { channelId, messageId, embed, content } = req.body;
    const guildId = req.params.guildId;

    if (!channelId || !messageId) {
      return res.status(400).json({ error: 'ID Canale e ID Messaggio sono obbligatori.' });
    }

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Bot Discord non connesso o server non trovato.' });
    }

    try {
      const guild = botClient.guilds.cache.get(guildId);
      const channel = await guild.channels.fetch(channelId);
      if (!channel) return res.status(404).json({ error: 'Canale non trovato su Discord.' });

      const message = await channel.messages.fetch(messageId);
      if (!message) return res.status(404).json({ error: 'Messaggio non trovato in questo canale.' });

      if (message.author.id !== botClient.user.id) {
        return res.status(403).json({ error: 'Puoi modificare solo i messaggi inviati da Sentry.' });
      }

      const editPayload = {};
      if (content !== undefined) editPayload.content = content;
      if (embed) {
        const discordEmbed = new EmbedBuilder();
        if (embed.title) discordEmbed.setTitle(embed.title);
        if (embed.description) discordEmbed.setDescription(embed.description);
        if (embed.color) discordEmbed.setColor(embed.color);
        if (embed.url) discordEmbed.setURL(embed.url);
        if (embed.image) discordEmbed.setImage(embed.image);
        if (embed.thumbnail) discordEmbed.setThumbnail(embed.thumbnail);
        if (embed.footer) discordEmbed.setFooter({ text: embed.footer });
        if (embed.timestamp) discordEmbed.setTimestamp();
        if (embed.fields && Array.isArray(embed.fields)) {
          embed.fields.forEach(f => {
            if (f.name && f.value) discordEmbed.addFields({ name: f.name, value: f.value, inline: Boolean(f.inline) });
          });
        }
        editPayload.embeds = [discordEmbed];
      }

      await message.edit(editPayload);
      return res.json({ success: true, messageId: message.id, channelId: channel.id });
    } catch (err) {
      return res.status(500).json({ error: `Impossibile modificare il messaggio: ${err.message}` });
    }
  });

  // Universal Live Embed Message Fetcher: Load ANY bot message directly into the Embed Builder
  router.post('/guilds/:guildId/embeds/fetch-message', requireModAuth, async (req, res) => {
    let { channelId, messageId, url } = req.body;
    const guildId = req.params.guildId;

    if (url) {
      const match = url.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
      if (match) {
        channelId = match[2];
        messageId = match[3];
      }
    }

    if (!channelId || !messageId) {
      return res.status(400).json({ error: 'Specifica Canale e Messaggio o un link valido di Discord.' });
    }

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Bot Discord non connesso.' });
    }

    try {
      const guild = botClient.guilds.cache.get(guildId);
      const channel = await guild.channels.fetch(channelId);
      if (!channel) return res.status(404).json({ error: 'Canale non trovato.' });

      const message = await channel.messages.fetch(messageId);
      if (!message) return res.status(404).json({ error: 'Messaggio non trovato.' });

      const firstEmbed = message.embeds[0];
      const data = {
        content: message.content || '',
        channelId: channel.id,
        messageId: message.id,
        embed: firstEmbed ? {
          title: firstEmbed.title || '',
          description: firstEmbed.description || '',
          color: firstEmbed.hexColor || '#ea580c',
          url: firstEmbed.url || '',
          image: firstEmbed.image?.url || '',
          thumbnail: firstEmbed.thumbnail?.url || '',
          footer: firstEmbed.footer?.text || '',
          timestamp: Boolean(firstEmbed.timestamp),
          fields: firstEmbed.fields ? firstEmbed.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline })) : []
        } : null
      };

      return res.json({ success: true, data });
    } catch (err) {
      return res.status(500).json({ error: `Errore recupero messaggio: ${err.message}` });
    }
  });

  // Counting Game API Endpoints
  router.get('/guilds/:guildId/counting', requireModAuth, (req, res) => {
    const config = DatabaseHelper.getCountingConfig(req.params.guildId);
    const leaderboard = DatabaseHelper.getCountingLeaderboard(req.params.guildId, 15);
    res.json({ config, leaderboard });
  });

  router.post('/guilds/:guildId/counting', requireModAuth, (req, res) => {
    const saved = DatabaseHelper.saveCountingConfig(req.params.guildId, req.body);
    notifySync(req.params.guildId, 'counting', req);
    res.json({ success: true, config: DatabaseHelper.getCountingConfig(req.params.guildId) });
  });

  // === Fishing & Medieval Economy API Endpoints ===
  router.get('/guilds/:guildId/fishing', requireModAuth, (req, res) => {
    const config = DatabaseHelper.getFishingConfig(req.params.guildId);
    const leaderboard = DatabaseHelper.getFishingLeaderboard(req.params.guildId, 20);
    res.json({ config, leaderboard });
  });

  router.post('/guilds/:guildId/fishing/config', requireModAuth, (req, res) => {
    const saved = DatabaseHelper.updateFishingConfig(req.params.guildId, req.body);
    notifySync(req.params.guildId, 'fishing', req);
    res.json({ success: true, config: saved });
  });

  router.post('/guilds/:guildId/economy/coins', requireModAuth, (req, res) => {
    const { userId, amount, operation } = req.body;
    const guildId = req.params.guildId;

    if (!userId) {
      return res.status(400).json({ error: 'Specifica l\'ID dell\'utente o membro.' });
    }

    const cleanUserId = userId.replace(/[<@!>]/g, '').trim();
    if (!cleanUserId || cleanUserId.length < 5) {
      return res.status(400).json({ error: 'ID utente non valido.' });
    }

    const parsedAmount = Math.max(0, Math.floor(Number(amount) || 0));
    if (parsedAmount > 1000000000000000) {
      return res.status(400).json({ error: 'L\'importo non può superare 1.000.000.000.000.000 monete.' });
    }

    try {
      const profile = DatabaseHelper.modifyUserCoins(guildId, cleanUserId, parsedAmount, operation || 'add');
      res.json({ success: true, profile });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/guilds/:guildId/economy/reset', requireModAuth, (req, res) => {
    const guildId = req.params.guildId;
    try {
      DatabaseHelper.resetEconomy(guildId);
      res.json({ success: true, message: 'Economia e ricchezza del server azzerate con successo!' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/guilds/:guildId/my-profile', (req, res) => {
    const user = req.user || req.session?.user;
    if (!user) {
      return res.status(401).json({ error: 'Non autenticato' });
    }
    const guildId = req.params.guildId;
    const profile = DatabaseHelper.getFishingProfile(guildId, user.id);
    const level = DatabaseHelper.getUserLevel(guildId, user.id);
    const bjStats = DatabaseHelper.getMinigameStats(guildId, user.id, 'blackjack');
    const slotStats = DatabaseHelper.getMinigameStats(guildId, user.id, 'slots');

    res.json({
      user,
      profile,
      level,
      stats: {
        blackjack: bjStats,
        slots: slotStats
      }
    });
  });

  router.get('/guilds/:guildId/economy/user/:userId', requireModAuth, (req, res) => {
    const guildId = req.params.guildId;
    const userId = req.params.userId.replace(/[<@!>]/g, '').trim();
    const profile = DatabaseHelper.getFishingProfile(guildId, userId);
    const level = DatabaseHelper.getUserLevel(guildId, userId);
    const bjStats = DatabaseHelper.getMinigameStats(guildId, userId, 'blackjack');
    const slotStats = DatabaseHelper.getMinigameStats(guildId, userId, 'slots');

    res.json({
      profile,
      level,
      stats: {
        blackjack: bjStats,
        slots: slotStats
      }
    });
  });

  router.post('/guilds/:guildId/fishing/panel', requireModAuth, async (req, res) => {
    const { channelId, title, description, image } = req.body;
    const guildId = req.params.guildId;

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Bot non collegato a questo server.' });
    }

    try {
      const guild = botClient.guilds.cache.get(guildId);
      const config = DatabaseHelper.getFishingConfig(guildId);
      const targetChannelId = channelId || config.channel_id;

      if (!targetChannelId) {
        return res.status(400).json({ error: 'Seleziona prima il canale in cui inviare il pannello di pesca.' });
      }

      await FishingManager.sendFishingPanel(guild, targetChannelId, { title, description, image });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // === Minigames & Casino Hub API Endpoints ===
  router.get('/guilds/:guildId/minigames', requireModAuth, (req, res) => {
    const config = DatabaseHelper.getMinigamesConfig(req.params.guildId);
    res.json({ config });
  });

  router.post('/guilds/:guildId/minigames/config', requireModAuth, (req, res) => {
    const saved = DatabaseHelper.updateMinigamesConfig(req.params.guildId, req.body);
    notifySync(req.params.guildId, 'minigames', req);
    res.json({ success: true, config: saved });
  });

  router.post('/guilds/:guildId/minigames/panel', requireModAuth, async (req, res) => {
    const { channelId, title, description, gameType } = req.body;
    const guildId = req.params.guildId;

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Bot non collegato a questo server.' });
    }

    try {
      const guild = botClient.guilds.cache.get(guildId);
      const config = DatabaseHelper.getMinigamesConfig(guildId);
      const targetChannelId = channelId || config.general_channel_id;

      if (!targetChannelId) {
        return res.status(400).json({ error: 'Seleziona prima il canale in cui inviare il pannello.' });
      }

      if (gameType === 'blackjack') {
        await BlackjackManager.sendBlackjackPanel(guild, targetChannelId, { title, description });
      } else {
        const channel = guild.channels.cache.get(targetChannelId) || await guild.channels.fetch(targetChannelId).catch(() => null);
        if (!channel) return res.status(400).json({ error: 'Canale non trovato.' });

        const embed = new EmbedBuilder()
          .setColor('#eab308')
          .setTitle(title || '🏰 Sala Giochi & Casinò del Regno')
          .setDescription(description ||
            `Benvenuto nella **Sala Giochi Ufficiale** di **${guild.name}**!\n\n` +
            `Metti alla prova la tua fortuna e abilità nei minigiochi medievali di Sentry!\n\n` +
            `🎮 **Attività Disponibili:**\n` +
            `• 🎣 **Pesca Medievale**: Lancia l'amo nel Lago Sacro per pescare oltre 25 specie e tesori sommersi.\n` +
            `• 🃏 **Tavolo da Blackjack**: Sfida il Banco a 21 con raddoppio e vincite reali.\n` +
            `• 🎰 **Slot Machine**: Gira i rulli alla ricerca del Tris Reale (Jackpot x10).\n` +
            `• 🎁 **Ricompensa Giornaliera**: Riscatta le tue monete quotidiane gratuite ogni 24h!`
          )
          .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
          .setImage('https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=1200&q=80')
          .setFooter({ text: `${guild.name} • Sentry Game Hub`, iconURL: guild.iconURL() })
          .setTimestamp();

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('btn_hub_fishing').setLabel('Pesca Medievale').setEmoji('🎣').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('btn_hub_blackjack').setLabel('Blackjack (50 🪙)').setEmoji('🃏').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('btn_hub_slots').setLabel('Slot Machine (50 🪙)').setEmoji('🎰').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('btn_hub_daily').setLabel('Daily Reward').setEmoji('🎁').setStyle(ButtonStyle.Secondary)
        );

        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('btn_hub_profile').setLabel('Controlla Saldo & Forziere').setEmoji('🪙').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('btn_hub_top').setLabel('Classifica Ricchezza').setEmoji('🏆').setStyle(ButtonStyle.Secondary)
        );

        await channel.send({ embeds: [embed], components: [row1, row2] });
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/guilds/:guildId/giveaways', requireModAuth, (req, res) => {
    const list = DatabaseHelper.db.prepare('SELECT * FROM giveaways WHERE guild_id = ? ORDER BY id DESC LIMIT 20').all(req.params.guildId);
    res.json(list);
  });

  router.post('/guilds/:guildId/giveaways/start', requireModAuth, async (req, res) => {
    const { channelId, prize, winnerCount, durationSeconds } = req.body;
    const guildId = req.params.guildId;

    if (botClient?.isReady() && botClient.guilds.cache.has(guildId)) {
      try {
        const guild = botClient.guilds.cache.get(guildId);
        const channel = guild.channels.cache.get(channelId);
        if (!channel) return res.status(400).json({ error: 'Canale non trovato' });

        await GiveawayManager.startGiveaway(channel, prize, parseInt(winnerCount, 10) || 1, parseInt(durationSeconds, 10) || 60, req.session.user);
        return res.json({ success: true });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    res.status(400).json({ error: 'Server non raggiungibile.' });
  });

  router.get('/guilds/:guildId/leveling', requireModAuth, (req, res) => {
    const config = DatabaseHelper.getLevelConfig(req.params.guildId);
    const leaderboard = DatabaseHelper.getLeaderboard(req.params.guildId, 20);
    const rewards = DatabaseHelper.getLevelRewards(req.params.guildId);
    res.json({ config, leaderboard, rewards });
  });

  router.post('/guilds/:guildId/leveling', requireModAuth, (req, res) => {
    const updated = DatabaseHelper.updateLevelConfig(req.params.guildId, req.body);
    notifySync(req.params.guildId, 'leveling', req);
    res.json({ success: true, config: updated });
  });

  router.post('/guilds/:guildId/leveling/config', requireModAuth, (req, res) => {
    const updated = DatabaseHelper.updateLevelConfig(req.params.guildId, req.body);
    res.json({ success: true, config: updated });
  });

  router.get('/guilds/:guildId/emoji-stats', requireModAuth, (req, res) => {
    const stats = DatabaseHelper.getEmojiStats(req.params.guildId, 30);
    res.json(stats);
  });

  // === Temporary & Private Channels API Endpoints ===
  router.get('/guilds/:guildId/tempchannels', requireModAuth, (req, res) => {
    const config = DatabaseHelper.getTempChannelConfig(req.params.guildId);
    const activeRooms = DatabaseHelper.getActiveTempChannels(req.params.guildId);
    res.json({ config, activeRooms });
  });

  router.post('/guilds/:guildId/tempchannels/config', requireModAuth, (req, res) => {
    const updated = DatabaseHelper.updateTempChannelConfig(req.params.guildId, req.body);
    res.json({ success: true, config: updated });
  });

  router.post('/guilds/:guildId/tempchannels/panel', requireModAuth, async (req, res) => {
    const { channelId, title, description, image } = req.body;
    const guildId = req.params.guildId;

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Bot non connesso a questo server.' });
    }

    try {
      const guild = botClient.guilds.cache.get(guildId);
      const config = DatabaseHelper.getTempChannelConfig(guildId);
      const targetChannelId = channelId || config.panel_channel_id;

      if (!targetChannelId) {
        return res.status(400).json({ error: 'Seleziona prima il canale in cui inviare il pannello.' });
      }

      await TempChannelManager.sendHubPanel(guild, targetChannelId, { title, description, image });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/guilds/:guildId/tempchannels/:id', requireModAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const guildId = req.params.guildId;
    const activeRooms = DatabaseHelper.getActiveTempChannels(guildId);
    const record = activeRooms.find(r => r.id === id);

    if (!record) {
      return res.status(404).json({ error: 'Stanza temporanea non trovata.' });
    }

    if (botClient?.isReady() && botClient.guilds.cache.has(guildId)) {
      const guild = botClient.guilds.cache.get(guildId);
      if (record.voice_channel_id) {
        const voice = guild.channels.cache.get(record.voice_channel_id);
        if (voice) await voice.delete('Eliminazione forzata da dashboard').catch(() => {});
      }
      if (record.text_channel_id) {
        const text = guild.channels.cache.get(record.text_channel_id);
        if (text) await text.delete('Eliminazione forzata da dashboard').catch(() => {});
      }
    }

    DatabaseHelper.deleteTempChannelRecord(id);
    res.json({ success: true });
  });

  // === Sentry Music API Routes ===
  router.get('/guilds/:guildId/music/status', requireModAuth, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const queue = MusicManager.getQueue(guildId);

      if (!queue || (!queue.currentTrack && queue.queue.length === 0)) {
        return res.json({
          active: false,
          isPlaying: false,
          isPaused: false,
          currentTrack: null,
          queue: [],
          volume: 100,
          loopMode: 'off',
          voiceChannel: null
        });
      }

      res.json({
        active: true,
        isPlaying: !queue.isPaused && Boolean(queue.currentTrack),
        isPaused: queue.isPaused,
        currentTrack: queue.currentTrack,
        queue: queue.queue,
        volume: queue.volume,
        loopMode: queue.loopMode,
        voiceChannel: queue.voiceChannel ? { id: queue.voiceChannel.id, name: queue.voiceChannel.name } : null
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/guilds/:guildId/music/play', requireModAuth, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const { query, voiceChannelId, textChannelId } = req.body;

      if (!query) return res.status(400).json({ error: 'Inserisci un brano o link da riprodurre.' });
      if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
        return res.status(400).json({ error: 'Bot Sentry non disponibile.' });
      }

      const guild = botClient.guilds.cache.get(guildId);
      let voiceChannel;
      if (voiceChannelId) {
        voiceChannel = await guild.channels.fetch(voiceChannelId).catch(() => null);
      }
      if (!voiceChannel) {
        // Find first voice channel with members or available
        voiceChannel = guild.channels.cache.find(c => c.isVoiceBased() && c.members.size > 0) || guild.channels.cache.find(c => c.isVoiceBased());
      }

      if (!voiceChannel) {
        return res.status(400).json({ error: 'Nessun canale vocale trovato in cui riprodurre la musica.' });
      }

      let textChannel = null;
      if (textChannelId) {
        textChannel = await guild.channels.fetch(textChannelId).catch(() => null);
      }

      const searchResult = await MusicManager.searchTrack(query, req.user?.username || 'Dashboard');
      const queue = MusicManager.getOrCreateQueue(guildId, botClient);

      await queue.connect(voiceChannel, textChannel);

      if (searchResult.isPlaylist) {
        queue.queue.push(...searchResult.tracks);
        if (!queue.currentTrack) {
          const first = queue.queue.shift();
          await queue.playTrack(first);
        }
        res.json({ success: true, isPlaylist: true, count: searchResult.tracks.length, title: searchResult.title });
      } else {
        const track = searchResult.track;
        if (!queue.currentTrack) {
          await queue.playTrack(track);
        } else {
          queue.queue.push(track);
        }
        res.json({ success: true, isPlaylist: false, track });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/guilds/:guildId/music/control', requireModAuth, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const { action, value } = req.body;
      const queue = MusicManager.getQueue(guildId);

      if (!queue) {
        return res.status(400).json({ error: 'Nessuna riproduzione musicale attiva in questo server.' });
      }

      switch (action) {
        case 'pause':
          queue.pause();
          break;
        case 'resume':
          queue.resume();
          break;
        case 'skip':
          queue.skip();
          break;
        case 'stop':
          queue.stop();
          break;
        case 'volume':
          if (value !== undefined) queue.setVolume(Number(value));
          break;
        case 'loop':
          queue.toggleLoop();
          break;
        case 'shuffle':
          queue.shuffle();
          break;
        default:
          return res.status(400).json({ error: 'Azione non valida.' });
      }

      res.json({
        success: true,
        action,
        isPlaying: !queue.isPaused && Boolean(queue.currentTrack),
        isPaused: queue.isPaused,
        volume: queue.volume,
        loopMode: queue.loopMode
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

export default createApiRouter;

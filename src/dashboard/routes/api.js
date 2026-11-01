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
import { AutoroleManager } from '../../bot/modules/autoroleManager.js';
import { BoostManager } from '../../bot/modules/boostManager.js';
import { GiveawayManager } from '../../bot/modules/giveawayManager.js';
import { TempChannelManager } from '../../bot/modules/tempChannelManager.js';
import { MusicManager } from '../../bot/modules/musicManager.js';
import { exportChannelsToCSV } from '../../bot/modules/channelExporter.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } from 'discord.js';
import { CONFIG } from '../../config.js';

export function createApiRouter(botClient, broadcastToGuild = () => {}, yapinBot = null) {
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
      online: Boolean(isReady || yapinBot),
      botName: botClient?.user?.tag || (yapinBot ? 'Sentry (Yapin)' : CONFIG.BOT_NAME),
      avatar: botClient?.user?.displayAvatarURL() || 'https://www.yapin.gg/favicon.ico',
      guildsCount: (isReady ? botClient.guilds.cache.size : 0) + (yapinBot ? 1 : 0),
      usersCount: isReady ? botClient.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0) : 0,
      ping: isReady ? Math.round(botClient.ws.ping) : 20,
      uptime: process.uptime(),
      demoMode: !isReady && !yapinBot,
      aiModel: CONFIG.CLOUDFLARE_MODEL,
      yapinConnected: Boolean(yapinBot)
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

    if (guildId.startsWith('yapin_')) {
      const config = DatabaseHelper.getPartnershipConfig(guildId);
      const saved = DatabaseHelper.addPartnership(guildId, invite, repId || 'yapin_user', req.session?.user?.id || 'admin', banner, notes);
      notifySync(guildId, 'partnerships', req);
      return res.json({ success: true, partnership: saved, platform: 'yapin' });
    }

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Bot Discord non presente in questo server o offline.' });
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

    if (guildId.startsWith('yapin_')) {
      if (!yapinBot) return res.status(400).json({ error: 'Yapin bot non collegato o offline.' });
      const config = DatabaseHelper.getPartnershipConfig(guildId);
      const targetChannelId = channelId || config.channel_id;
      if (!targetChannelId) return res.status(400).json({ error: 'Nessun canale partnership selezionato o configurato.' });
      try {
        await yapinBot.send(targetChannelId, `**[${title || 'Partnership'}]**\n${description || ''}`);
        return res.json({ success: true, platform: 'yapin' });
      } catch (err) {
        return res.status(500).json({ error: `Errore Yapin: ${err.message}` });
      }
    }

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Bot Discord non presente in questo server o offline.' });
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

    if (guildId.startsWith('yapin_')) {
      if (!yapinBot) return res.status(400).json({ error: 'Yapin bot non collegato o offline.' });
      const config = DatabaseHelper.getPresentationConfig(guildId);
      const targetChannelId = channelId || config.channel_id;
      if (!targetChannelId) return res.status(400).json({ error: 'Nessun canale presentazioni selezionato.' });
      try {
        await yapinBot.send(targetChannelId, `**[${title || 'Presentazioni'}]**\n${description || ''}`);
        return res.json({ success: true, platform: 'yapin' });
      } catch (err) {
        return res.status(500).json({ error: `Errore Yapin: ${err.message}` });
      }
    }

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Bot Discord non presente in questo server o offline.' });
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

    if (guildId.startsWith('yapin_')) {
      if (!yapinBot) return res.status(400).json({ error: 'Yapin bot non collegato o offline.' });
      const config = DatabaseHelper.getSetupShowcaseConfig(guildId);
      const targetChannelId = channelId || config.channel_id;
      if (!targetChannelId) return res.status(400).json({ error: 'Nessun canale showcase selezionato.' });
      try {
        await yapinBot.send(targetChannelId, `**[${title || 'Setup Showcase'}]**\n${description || ''}`);
        return res.json({ success: true, platform: 'yapin' });
      } catch (err) {
        return res.status(500).json({ error: `Errore Yapin: ${err.message}` });
      }
    }

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Bot Discord non presente in questo server o offline.' });
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

    if (guildId.startsWith('yapin_')) {
      if (!yapinBot) return res.status(400).json({ error: 'Yapin bot non collegato o offline.' });
      if (!channelId) return res.status(400).json({ error: 'Seleziona un canale prima di inviare.' });
      try {
        const yapinEmbed = {
          title: embedData?.title || undefined,
          description: embedData?.description || undefined,
          url: embedData?.url || undefined,
          color: embedData?.color !== undefined ? (typeof embedData.color === 'string' ? parseInt(embedData.color.replace('#', ''), 16) : embedData.color) : 0xdc2626,
          author: embedData?.author?.name ? {
            name: embedData.author.name,
            icon_url: embedData.author.icon_url || undefined,
            url: embedData.author.url || undefined
          } : undefined,
          image: embedData?.image?.url ? { url: embedData.image.url } : (typeof embedData?.image === 'string' ? { url: embedData.image } : undefined),
          thumbnail: embedData?.thumbnail?.url ? { url: embedData.thumbnail.url } : (typeof embedData?.thumbnail === 'string' ? { url: embedData.thumbnail } : undefined),
          footer: embedData?.footer?.text ? {
            text: embedData.footer.text,
            icon_url: embedData.footer.icon_url || undefined
          } : undefined,
          fields: Array.isArray(embedData?.fields) ? embedData.fields.filter(f => f.name && f.value).map(f => ({
            name: String(f.name),
            value: String(f.value),
            inline: Boolean(f.inline)
          })) : undefined,
          timestamp: embedData?.timestamp ? new Date().toISOString() : undefined
        };

        const sentMsg = await yapinBot.send(channelId, '', { embeds: [yapinEmbed] });
        return res.json({ success: true, platform: 'yapin', messageId: sentMsg?.id });
      } catch (err) {
        return res.status(500).json({ error: `Errore Yapin: ${err.message}` });
      }
    }

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Bot Discord non collegato al server o offline.' });
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

    if (guildId.startsWith('yapin_')) {
      const saved = DatabaseHelper.addReactionRole(
        guildId,
        channelId,
        `yap_rr_${Date.now()}`,
        'BUTTON',
        roleId,
        emoji,
        label,
        style
      );
      notifySync(guildId, 'reaction_roles', req);
      return res.json({ success: true, reactionRole: saved, platform: 'yapin' });
    }

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Bot Discord non collegato al server o offline.' });
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
        .setTitle(title || 'Role Selection')
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

  // Dedicated Auto-Role Endpoints
  router.get('/guilds/:guildId/autorole', requireModAuth, async (req, res) => {
    const guildId = req.params.guildId;
    const config = DatabaseHelper.getAutoroleConfig(guildId);
    let diagnostics = null;
    if (botClient?.isReady() && botClient.guilds.cache.has(guildId)) {
      const guild = botClient.guilds.cache.get(guildId);
      diagnostics = await AutoroleManager.diagnose(guild);
    }
    res.json({ config, diagnostics });
  });

  router.post('/guilds/:guildId/autorole', requireModAuth, async (req, res) => {
    const guildId = req.params.guildId;
    const updated = DatabaseHelper.updateAutoroleConfig(guildId, req.body);
    notifySync(guildId, 'autorole', req);

    let diagnostics = null;
    if (botClient?.isReady() && botClient.guilds.cache.has(guildId)) {
      const guild = botClient.guilds.cache.get(guildId);
      diagnostics = await AutoroleManager.diagnose(guild);
    }
    res.json({ success: true, config: updated, diagnostics });
  });

  router.post('/guilds/:guildId/autorole/test', requireModAuth, async (req, res) => {
    const guildId = req.params.guildId;

    if (guildId.startsWith('yapin_')) {
      const config = DatabaseHelper.getAutoroleConfig(guildId);
      if (!config.user_role_id) {
        return res.status(400).json({ error: 'Nessun ruolo utenti configurato nell\'Auto-Role.' });
      }
      if (!yapinBot) return res.status(400).json({ error: 'Yapin bot non collegato o offline.' });
      try {
        const yapinServerId = guildId.replace('yapin_', '');
        const roles = await yapinBot.roles(yapinServerId).catch(() => []);
        const role = roles.find(r => r.id === config.user_role_id);
        if (!role) return res.status(400).json({ error: 'Ruolo non trovato su Yapin.' });
        return res.json({ success: true, message: `Ruolo "${role.name}" verificato con successo su Yapin!` });
      } catch (err) {
        return res.status(500).json({ error: `Errore Yapin: ${err.message}` });
      }
    }

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Bot Discord non collegato a questo server o offline.' });
    }
    const guild = botClient.guilds.cache.get(guildId);
    const config = DatabaseHelper.getAutoroleConfig(guildId);
    if (!config.user_role_id) {
      return res.status(400).json({ error: 'Nessun ruolo utenti configurato nell\'Auto-Role.' });
    }

    const check = await AutoroleManager.validateRole(guild, config.user_role_id);
    if (!check.valid) {
      return res.status(400).json({ error: check.error });
    }
    res.json({ success: true, message: `Ruolo "${check.role.name}" verificato con successo! Permessi e gerarchia OK.` });
  });

  // ==========================================
  // CROSS-PLATFORM BRIDGE ENDPOINTS
  // ==========================================
  router.get('/bridges', requireModAuth, (req, res) => {
    const bridges = DatabaseHelper.getAllBridges();
    res.json({
      bridges,
      status: {
        discordConnected: Boolean(botClient?.isReady()),
        yapinConnected: Boolean(yapinBot),
        discordGuildCount: botClient?.guilds?.cache?.size || 0
      }
    });
  });

  router.post('/bridges', requireModAuth, (req, res) => {
    const { name, discord_guild_id, discord_channel_id, yapin_server_id, yapin_channel_id } = req.body;
    if (!discord_channel_id || !yapin_channel_id) {
      return res.status(400).json({ error: 'Specificare sia il canale Discord che il canale Yapin.' });
    }
    const created = DatabaseHelper.createBridge({
      name: name || 'Ponte Cross-Platform',
      discord_guild_id: discord_guild_id || '',
      discord_channel_id,
      yapin_server_id: yapin_server_id || '',
      yapin_channel_id,
      enabled: true,
      sync_messages: true,
      sync_embeds: true
    });
    res.json({ success: true, bridge: created });
  });

  router.delete('/bridges/:id', requireModAuth, (req, res) => {
    DatabaseHelper.deleteBridge(req.params.id);
    res.json({ success: true });
  });

  router.patch('/bridges/:id/toggle', requireModAuth, (req, res) => {
    const { enabled } = req.body;
    const updated = DatabaseHelper.toggleBridge(req.params.id, enabled);
    res.json({ success: true, bridge: updated });
  });

  router.post('/bridges/:id/test', requireModAuth, async (req, res) => {
    const bridge = DatabaseHelper.getAllBridges().find(b => b.id == req.params.id);
    if (!bridge) return res.status(404).json({ error: 'Ponte non trovato.' });

    let discordOk = false;
    let yapinOk = false;

    // Invia test a Discord
    if (botClient?.isReady()) {
      try {
        const chan = botClient.channels.cache.get(bridge.discord_channel_id) || await botClient.channels.fetch(bridge.discord_channel_id);
        if (chan?.isTextBased()) {
          await chan.send('**[Sentry Bridge Test]** Verifica connessione cross-platform completata con successo!');
          discordOk = true;
        }
      } catch (e) {}
    }

    // Invia test a Yapin
    if (yapinBot) {
      try {
        await yapinBot.send(bridge.yapin_channel_id, '**[Sentry Bridge Test]** Cross-platform connection verified successfully!');
        yapinOk = true;
      } catch (e) {}
    }

    res.json({ success: true, discordOk, yapinOk });
  });

  router.post('/guilds/:guildId/welcomer/test', requireModAuth, async (req, res) => {
    const guildId = req.params.guildId;

    if (guildId.startsWith('yapin_')) {
      if (!yapinBot) {
        return res.status(400).json({ error: 'Yapin bot non collegato o offline.' });
      }
      try {
        const config = DatabaseHelper.getWelcomerConfig(guildId);
        const channelId = config.welcome_channel_id || req.body?.welcome_channel_id;
        if (!channelId) {
          return res.status(400).json({ error: 'Seleziona prima un canale di benvenuto e clicca Salva.' });
        }

        const serverId = guildId.replace('yapin_', '');
        const servers = await yapinBot.servers().catch(() => []);
        const srv = servers.find(s => String(s.id) === String(serverId));
        const memberCount = srv?.member_count || 128;
        const serverName = srv?.name || 'Reame Yapin';
        const botUser = yapinBot.user || { id: 'sentry', username: 'Sentry' };

        const formatText = (str) => {
          if (!str) return '';
          return str
            .replace(/{user}/g, botUser.username || 'NuovoMembro')
            .replace(/{user\.tag}/g, botUser.username || 'NuovoMembro')
            .replace(/{user\.name}/g, botUser.username || 'NuovoMembro')
            .replace(/{user\.id}/g, botUser.id || '123456')
            .replace(/{user\.mention}/g, `<@${botUser.id || '123456'}>`)
            .replace(/{server\.name}/g, serverName)
            .replace(/{server\.memberCount}/g, String(memberCount))
            .replace(/{memberCount}/g, String(memberCount))
            .replace(/{count}/g, String(memberCount));
        };

        const embData = config.welcome_embed || {};
        const rawColor = embData.color !== undefined ? (typeof embData.color === 'string' ? parseInt(embData.color.replace('#', ''), 16) : embData.color) : 0xdc2626;

        const yapinEmbed = {
          title: formatText(embData.title || 'Benvenuto nel Reame, {user}!'),
          description: formatText(embData.description || config.welcome_message || 'Benvenuto {user.mention} in **{server.name}**! Siamo felici di averti tra noi. Sei il membro **#{memberCount}**!'),
          color: rawColor,
          fields: Array.isArray(embData.fields) && embData.fields.length > 0 ? embData.fields.filter(f => f.name && f.value).map(f => ({
            name: formatText(f.name),
            value: formatText(f.value),
            inline: Boolean(f.inline)
          })) : undefined,
          footer: embData.footer?.text ? {
            text: formatText(embData.footer.text),
            icon_url: embData.footer.icon_url || undefined
          } : { text: formatText('Membro #{memberCount} • {server.name}') },
          image: embData.image?.url ? { url: formatText(embData.image.url) } : (typeof embData.image === 'string' ? { url: formatText(embData.image) } : undefined),
          thumbnail: embData.thumbnail?.url ? { url: formatText(embData.thumbnail.url) } : (typeof embData.thumbnail === 'string' ? { url: formatText(embData.thumbnail) } : undefined),
          timestamp: new Date().toISOString()
        };

        await yapinBot.send(channelId, `<@${botUser.id}>`, { embeds: [yapinEmbed] });
        return res.json({ success: true, platform: 'yapin' });
      } catch (e) {
        return res.status(500).json({ error: `Errore invio Yapin: ${e.message}` });
      }
    }

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Bot Discord non collegato a questo server o offline.' });
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

    if (guildId.startsWith('yapin_')) {
      const config = DatabaseHelper.getBoostConfig(guildId);
      const targetChanId = req.body?.channel_id || config.boost_channel_id;
      if (!targetChanId) return res.status(400).json({ error: 'Seleziona prima un canale per il test del Boost.' });
      if (!yapinBot) return res.status(400).json({ error: 'Yapin bot non collegato o offline.' });
      try {
        await yapinBot.send(targetChanId, '**[Sentry Boost Test]** Un membro ha potenziato il server!');
        return res.json({ success: true, platform: 'yapin' });
      } catch (e) {
        return res.status(500).json({ error: `Errore invio Yapin: ${e.message}` });
      }
    }

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Bot Discord non collegato a questo server o offline.' });
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
            .setEmoji(buttonEmoji || null)
            .setStyle(ButtonStyle[buttonStyle] || ButtonStyle.Primary);

          const row = new ActionRowBuilder().addComponents(btn);

          const embed = new EmbedBuilder()
            .setColor(color || CONFIG.EMBED_COLOR || '#ea580c')
            .setTitle(title || 'Support & Help Center')
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

  // Universal Live Embed Message Editor: Edit ANY message previously sent by the bot on Discord or Yapin
  router.post('/guilds/:guildId/embeds/edit-message', requireModAuth, async (req, res) => {
    const { channelId, messageId, embed, content } = req.body;
    const guildId = req.params.guildId;

    if (!channelId || !messageId) {
      return res.status(400).json({ error: 'ID Canale e ID Messaggio sono obbligatori.' });
    }

    if (guildId.startsWith('yapin_')) {
      if (!yapinBot) return res.status(400).json({ error: 'Yapin bot non collegato o offline.' });
      try {
        const rawColor = embed?.color !== undefined ? (typeof embed.color === 'string' ? parseInt(embed.color.replace('#', ''), 16) : embed.color) : 0xdc2626;
        const yapinEmbed = embed ? {
          title: embed.title || undefined,
          description: embed.description || undefined,
          color: rawColor,
          url: embed.url || undefined,
          image: embed.image ? (typeof embed.image === 'string' ? { url: embed.image } : embed.image) : undefined,
          thumbnail: embed.thumbnail ? (typeof embed.thumbnail === 'string' ? { url: embed.thumbnail } : embed.thumbnail) : undefined,
          footer: embed.footer ? (typeof embed.footer === 'string' ? { text: embed.footer } : embed.footer) : undefined,
          fields: Array.isArray(embed.fields) ? embed.fields.filter(f => f.name && f.value) : undefined,
          timestamp: embed.timestamp ? new Date().toISOString() : undefined
        } : undefined;

        await yapinBot.edit(channelId, messageId, content !== undefined ? content : '', {
          embeds: yapinEmbed ? [yapinEmbed] : undefined
        });
        return res.json({ success: true, messageId, channelId });
      } catch (err) {
        return res.status(500).json({ error: `Impossibile modificare il messaggio su Yapin: ${err.message}` });
      }
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
      return res.status(400).json({ error: 'Specifica Canale e Messaggio o un link valido.' });
    }

    if (guildId.startsWith('yapin_')) {
      if (!yapinBot) return res.status(400).json({ error: 'Yapin bot non collegato o offline.' });
      try {
        const msg = await yapinBot.message(channelId, messageId);
        if (!msg) return res.status(404).json({ error: 'Messaggio non trovato su Yapin.' });
        const firstEmbed = (msg.embeds && msg.embeds[0]) || null;
        return res.json({
          success: true,
          platform: 'yapin',
          data: {
            content: msg.content || '',
            channelId,
            messageId,
            embed: firstEmbed ? {
              title: firstEmbed.title || '',
              description: firstEmbed.description || '',
              color: firstEmbed.color !== undefined ? ('#' + Number(firstEmbed.color).toString(16).padStart(6, '0')) : '#dc2626',
              url: firstEmbed.url || '',
              image: firstEmbed.image?.url || firstEmbed.image || '',
              thumbnail: firstEmbed.thumbnail?.url || firstEmbed.thumbnail || '',
              footer: firstEmbed.footer?.text || firstEmbed.footer || '',
              fields: firstEmbed.fields || []
            } : null
          }
        });
      } catch (err) {
        return res.status(500).json({ error: `Errore caricamento messaggio Yapin: ${err.message}` });
      }
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

    if (guildId.startsWith('yapin_')) {
      if (!yapinBot) return res.status(400).json({ error: 'Yapin bot non collegato o offline.' });
      const config = DatabaseHelper.getFishingConfig(guildId);
      const targetChannelId = channelId || config.channel_id;
      if (!targetChannelId) return res.status(400).json({ error: 'Seleziona prima il canale in cui inviare il pannello di pesca.' });
      try {
        await yapinBot.send(targetChannelId, `**[${title || 'Laghetto di Pesca Sentry'}]**\n${description || 'Usa il comando /pesca per catturare pesci rari e scalare la classifica!'}`);
        return res.json({ success: true, platform: 'yapin' });
      } catch (err) {
        return res.status(500).json({ error: `Errore Yapin: ${err.message}` });
      }
    }

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Bot Discord non collegato a questo server o offline.' });
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

    if (guildId.startsWith('yapin_')) {
      if (!yapinBot) return res.status(400).json({ error: 'Yapin bot non collegato o offline.' });
      const config = DatabaseHelper.getMinigamesConfig(guildId);
      const targetChannelId = channelId || config.general_channel_id;
      if (!targetChannelId) return res.status(400).json({ error: 'Seleziona prima il canale in cui inviare il pannello.' });
      try {
        await yapinBot.send(targetChannelId, `**[${title || 'Sala Giochi & Minigames Sentry'}]**\n${description || 'Divertiti con i minigiochi medievali del server!'}`);
        return res.json({ success: true, platform: 'yapin' });
      } catch (err) {
        return res.status(500).json({ error: `Errore Yapin: ${err.message}` });
      }
    }

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Bot Discord non collegato a questo server o offline.' });
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
          .setTitle(title || 'Gaming & Casino Hub')
          .setDescription(description ||
            `Benvenuto nella **Sala Giochi Ufficiale** di **${guild.name}**!\n\n` +
            `Metti alla prova la tua fortuna e abilità nei minigiochi medievali di Sentry!\n\n` +
            `**Available Games:**\n` +
            `• **Medieval Fishing**: Lancia l'amo nel Lago Sacro per pescare oltre 25 specie e tesori sommersi.\n` +
            `• **Blackjack Table**: Sfida il Banco a 21 con raddoppio e vincite reali.\n` +
            `• **Slot Machine**: Gira i rulli alla ricerca del Tris Reale (Jackpot x10).\n` +
            `• **Daily Reward**: Riscatta le tue monete quotidiane gratuite ogni 24h!`
          )
          .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
          .setImage('https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=1200&q=80')
          .setFooter({ text: `${guild.name} • Sentry Game Hub`, iconURL: guild.iconURL() })
          .setTimestamp();

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('btn_hub_fishing').setLabel('Pesca Medievale').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('btn_hub_blackjack').setLabel('Blackjack (50 Coins)').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('btn_hub_slots').setLabel('Slot Machine (50 Coins)').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('btn_hub_daily').setLabel('Daily Reward').setStyle(ButtonStyle.Secondary)
        );

        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('btn_hub_profile').setLabel('Controlla Saldo & Forziere').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('btn_hub_top').setLabel('Classifica Ricchezza').setStyle(ButtonStyle.Secondary)
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

    if (guildId.startsWith('yapin_')) {
      if (!yapinBot) return res.status(400).json({ error: 'Yapin bot non collegato o offline.' });
      const config = DatabaseHelper.getTempChannelConfig(guildId);
      const targetChannelId = channelId || config.panel_channel_id;
      if (!targetChannelId) return res.status(400).json({ error: 'Seleziona prima il canale in cui inviare il pannello.' });
      try {
        await yapinBot.send(targetChannelId, `**[${title || 'Stanze Vocali Temporanee'}]**\n${description || 'Entra nella stanza per creare il tuo canale vocale privato!'}`);
        return res.json({ success: true, platform: 'yapin' });
      } catch (err) {
        return res.status(500).json({ error: `Errore Yapin: ${err.message}` });
      }
    }

    if (!botClient?.isReady() || !botClient.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Bot Discord non connesso a questo server o offline.' });
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

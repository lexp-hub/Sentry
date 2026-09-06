import path from 'path';
import fs from 'fs';
import { CONFIG } from '../config.js';
import { SCHEMA } from './schema.js';

const dbDir = path.dirname(CONFIG.DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let rawDb = null;
let isNodeSqlite = false;

try {
  const { DatabaseSync } = await import('node:sqlite');
  rawDb = new DatabaseSync(CONFIG.DB_PATH);
  rawDb.exec('PRAGMA foreign_keys = ON;');
  rawDb.exec('PRAGMA journal_mode = WAL;');
  rawDb.exec('PRAGMA synchronous = FULL;');
  rawDb.exec('PRAGMA busy_timeout = 10000;');
  rawDb.exec('PRAGMA wal_autocheckpoint = 100;');
  isNodeSqlite = true;
  console.log(`[Database] Connected using built-in node:sqlite (Node 22+) to ${CONFIG.DB_PATH}`);
} catch (e1) {
  try {
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    rawDb = new BetterSqlite3(CONFIG.DB_PATH);
    rawDb.pragma('journal_mode = WAL');
    rawDb.pragma('foreign_keys = ON');
    rawDb.pragma('synchronous = FULL');
    rawDb.pragma('busy_timeout = 10000');
    rawDb.pragma('wal_autocheckpoint = 100');
    console.log(`[Database] Connected using better-sqlite3 to ${CONFIG.DB_PATH}`);
  } catch (e2) {
    console.error('[Database Error] Failed to initialize SQLite database:', e2.message);
  }
}

const sanitizeRow = (row) => {
  if (!row || typeof row !== 'object') return row;
  for (const key of Object.keys(row)) {
    const val = row[key];
    if (typeof val === 'bigint') {
      if (val >= -9007199254740991n && val <= 9007199254740991n) {
        row[key] = Number(val);
      } else {
        row[key] = val > 0n ? Number.MAX_SAFE_INTEGER : -Number.MAX_SAFE_INTEGER;
      }
    }
  }
  return row;
};

class UniversalDatabase {
  constructor(instance, isNode) {
    this.raw = instance;
    this.isNode = isNode;
  }

  pragma(str) {
    if (this.raw?.pragma) {
      return this.raw.pragma(str);
    }
    return this.raw?.exec(`PRAGMA ${str}`);
  }

  exec(sql) {
    return this.raw?.exec(sql);
  }

  prepare(sql) {
    const stmt = this.raw.prepare(sql);
    if (typeof stmt.setReadBigInts === 'function') {
      try {
        stmt.setReadBigInts(true);
      } catch (e) {}
    }

    if (!this.isNode) {
      return {
        get: (...args) => {
          try {
            return sanitizeRow(stmt.get(...args));
          } catch (err) {
            console.warn('[Database] Statement get warning:', err.message);
            return undefined;
          }
        },
        all: (...args) => {
          try {
            const rows = stmt.all(...args);
            if (Array.isArray(rows)) {
              for (let i = 0; i < rows.length; i++) {
                sanitizeRow(rows[i]);
              }
            }
            return rows;
          } catch (err) {
            console.warn('[Database] Statement all warning:', err.message);
            return [];
          }
        },
        run: (...args) => stmt.run(...args),
        raw: stmt
      };
    }

    return {
      get: (...args) => {
        try {
          return sanitizeRow(stmt.get(...args));
        } catch (err) {
          console.warn('[Database] Statement get warning:', err.message);
          return undefined;
        }
      },
      all: (...args) => {
        try {
          const rows = stmt.all(...args);
          if (Array.isArray(rows)) {
            for (let i = 0; i < rows.length; i++) {
              sanitizeRow(rows[i]);
            }
          }
          return rows;
        } catch (err) {
          console.warn('[Database] Statement all warning:', err.message);
          return [];
        }
      },
      run: (...args) => {
        const res = stmt.run(...args);
        return {
          changes: Number(res?.changes || 0),
          lastInsertRowid: Number(res?.lastInsertRowid || 0)
        };
      },
      raw: stmt
    };
  }
}

export const db = new UniversalDatabase(rawDb, isNodeSqlite);
db.exec(SCHEMA);

// Safe data sanitization to prevent SQLite 64-bit integer overflow issues
try {
  db.exec(`
    UPDATE fishing_profiles 
    SET coins = 1000000000000000 
    WHERE coins > 1000000000000000;

    UPDATE fishing_profiles 
    SET coins = 0 
    WHERE coins < 0;

    UPDATE levels 
    SET xp = 1000000000000000 
    WHERE xp > 1000000000000000;
  `);
} catch (e) {}

// Safe dynamic column migrations for ticket_panels
try { db.exec("ALTER TABLE ticket_panels ADD COLUMN color TEXT DEFAULT '#ea580c';"); } catch (e) {}
try { db.exec("ALTER TABLE ticket_panels ADD COLUMN image TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE ticket_panels ADD COLUMN footer TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE ticket_panels ADD COLUMN button_style TEXT DEFAULT 'Primary';"); } catch (e) {}
try { db.exec("ALTER TABLE ticket_panels ADD COLUMN log_channel_id TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE ticket_panels ADD COLUMN welcome_message TEXT DEFAULT 'Benvenuto {user.mention}! Lo staff ti risponderà a breve.';"); } catch (e) {}
try { db.exec("ALTER TABLE ticket_panels ADD COLUMN naming_scheme TEXT DEFAULT 'ticket-{user}';"); } catch (e) {}
try { db.exec("ALTER TABLE level_configs ADD COLUMN coins_per_level INTEGER DEFAULT 100;"); } catch (e) {}
try { db.exec("ALTER TABLE counting_configs ADD COLUMN allow_consecutive INTEGER DEFAULT 1;"); } catch (e) {}
try { db.exec("ALTER TABLE counting_configs ADD COLUMN zen_mode INTEGER DEFAULT 1;"); } catch (e) {}
try { db.exec("ALTER TABLE ai_configs ADD COLUMN daily_limit INTEGER DEFAULT 100;"); } catch (e) {}
try { db.exec("ALTER TABLE ai_configs ADD COLUMN warning_threshold INTEGER DEFAULT 80;"); } catch (e) {}
try { db.exec("ALTER TABLE ai_configs ADD COLUMN daily_requests INTEGER DEFAULT 0;"); } catch (e) {}
try { db.exec("ALTER TABLE ai_configs ADD COLUMN last_reset_date TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE ai_configs ADD COLUMN warning_channel_id TEXT;"); } catch (e) {}
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS boost_configs (
      guild_id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 1,
      channel_id TEXT,
      message TEXT DEFAULT 'Grazie per il boost {user.mention}! 🚀',
      embed TEXT
    );
  `);
} catch (e) {}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS afk_users (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reason TEXT DEFAULT 'Attualmente assente',
      timestamp INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    );
  `);
} catch (e) {}

export const DatabaseHelper = {
  db,

  getGuildSettings(guildId) {
    const row = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
    if (!row) {
      this.initGuildSettings(guildId);
      return this.getGuildSettings(guildId);
    }
    const defaultModules = {
      partnerships: true,
      embeds: true,
      reaction_roles: true,
      welcomer: true,
      autoresponder: true,
      moderation: true,
      tickets: true,
      giveaways: true,
      leveling: true,
      starboard: true,
      ai: true,
      setups: true
    };
    const parsed = JSON.parse(row.modules_enabled || '{}');
    return {
      ...row,
      modules_enabled: { ...defaultModules, ...parsed }
    };
  },

  initGuildSettings(guildId) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO guild_settings (guild_id, prefix, language, modules_enabled)
      VALUES (?, '!', 'it', '{"partnerships":true,"embeds":true,"reaction_roles":true,"welcomer":true,"autoresponder":true,"moderation":true,"tickets":true,"giveaways":true,"leveling":true,"starboard":true,"ai":true,"setups":true}')
    `);
    stmt.run(guildId);
  },

  updateGuildSettings(guildId, data) {
    this.initGuildSettings(guildId);
    const current = this.getGuildSettings(guildId);
    const updated = { ...current, ...data };
    const modulesJson = typeof updated.modules_enabled === 'object' ? JSON.stringify(updated.modules_enabled) : updated.modules_enabled;

    const stmt = db.prepare(`
      UPDATE guild_settings
      SET prefix = ?, language = ?, log_channel_id = ?, mute_role_id = ?, auto_role_user = ?, auto_role_bot = ?, modules_enabled = ?
      WHERE guild_id = ?
    `);
    stmt.run(
      updated.prefix,
      updated.language,
      updated.log_channel_id,
      updated.mute_role_id,
      updated.auto_role_user,
      updated.auto_role_bot,
      modulesJson,
      guildId
    );
    return this.getGuildSettings(guildId);
  },

  getAIConfig(guildId) {
    let row = db.prepare('SELECT * FROM ai_configs WHERE guild_id = ?').get(guildId);
    if (!row) {
      db.prepare(`
        INSERT INTO ai_configs (guild_id, enabled, model, web_search_enabled, max_chars, daily_limit, warning_threshold, daily_requests)
        VALUES (?, 1, '@cf/meta/llama-3.3-70b-instruct-fp8-fast', 1, 300, 100, 80, 0)
      `).run(guildId);
      row = db.prepare('SELECT * FROM ai_configs WHERE guild_id = ?').get(guildId);
    }
    return {
      ...row,
      enabled: Boolean(row.enabled),
      web_search_enabled: Boolean(row.web_search_enabled),
      channels_whitelist: JSON.parse(row.channels_whitelist || '[]'),
      roles_whitelist: JSON.parse(row.roles_whitelist || '[]'),
      daily_limit: row.daily_limit !== undefined && row.daily_limit !== null ? Number(row.daily_limit) : 100,
      warning_threshold: row.warning_threshold !== undefined && row.warning_threshold !== null ? Number(row.warning_threshold) : 80,
      daily_requests: row.daily_requests !== undefined && row.daily_requests !== null ? Number(row.daily_requests) : 0,
      last_reset_date: row.last_reset_date || null,
      warning_channel_id: row.warning_channel_id || null
    };
  },

  updateAIConfig(guildId, data) {
    const current = this.getAIConfig(guildId);
    const updated = { ...current, ...data };

    db.prepare(`
      INSERT INTO ai_configs (guild_id, enabled, model, system_prompt, web_search_enabled, max_chars, channels_whitelist, roles_whitelist, daily_limit, warning_threshold, daily_requests, last_reset_date, warning_channel_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        enabled = excluded.enabled,
        model = excluded.model,
        system_prompt = excluded.system_prompt,
        web_search_enabled = excluded.web_search_enabled,
        max_chars = excluded.max_chars,
        channels_whitelist = excluded.channels_whitelist,
        roles_whitelist = excluded.roles_whitelist,
        daily_limit = excluded.daily_limit,
        warning_threshold = excluded.warning_threshold,
        daily_requests = excluded.daily_requests,
        last_reset_date = excluded.last_reset_date,
        warning_channel_id = excluded.warning_channel_id
    `).run(
      guildId,
      updated.enabled ? 1 : 0,
      updated.model || CONFIG.CLOUDFLARE_MODEL,
      updated.system_prompt || null,
      updated.web_search_enabled ? 1 : 0,
      updated.max_chars || 300,
      JSON.stringify(updated.channels_whitelist || []),
      JSON.stringify(updated.roles_whitelist || []),
      updated.daily_limit !== undefined ? Number(updated.daily_limit) : 100,
      updated.warning_threshold !== undefined ? Number(updated.warning_threshold) : 80,
      updated.daily_requests !== undefined ? Number(updated.daily_requests) : 0,
      updated.last_reset_date || null,
      updated.warning_channel_id || null
    );
    return this.getAIConfig(guildId);
  },

  getTodayDateString() {
    return new Date().toISOString().split('T')[0];
  },

  getAIQuotaStatus(guildId) {
    const config = this.getAIConfig(guildId);
    const today = this.getTodayDateString();

    // Auto-reset if date changed (at midnight)
    if (config.last_reset_date !== today) {
      db.prepare(`
        UPDATE ai_configs SET
          daily_requests = 0,
          last_reset_date = ?
        WHERE guild_id = ?
      `).run(today, guildId);
      config.daily_requests = 0;
      config.last_reset_date = today;
    }

    const dailyLimit = config.daily_limit !== undefined ? Number(config.daily_limit) : 100;
    const used = Number(config.daily_requests || 0);
    const thresholdPct = config.warning_threshold !== undefined ? Number(config.warning_threshold) : 80;

    const isUnlimited = dailyLimit <= 0;
    const remaining = isUnlimited ? Infinity : Math.max(0, dailyLimit - used);
    const isBlocked = !isUnlimited && used >= dailyLimit;

    // Warning threshold (e.g. at 80% or when remaining <= 5)
    const warningCount = Math.floor(dailyLimit * (thresholdPct / 100));
    const isWarning = !isUnlimited && !isBlocked && (used >= warningCount || remaining <= 5);

    return {
      used,
      daily_limit: dailyLimit,
      remaining,
      threshold_pct: thresholdPct,
      is_unlimited: isUnlimited,
      is_warning: isWarning,
      is_blocked: isBlocked,
      last_reset_date: today,
      warning_channel_id: config.warning_channel_id || null
    };
  },

  incrementAIUsage(guildId) {
    const today = this.getTodayDateString();
    const current = this.getAIQuotaStatus(guildId);
    const newUsed = current.used + 1;

    db.prepare(`
      UPDATE ai_configs SET
        daily_requests = ?,
        last_reset_date = ?
      WHERE guild_id = ?
    `).run(newUsed, today, guildId);

    return this.getAIQuotaStatus(guildId);
  },

  getChannelMemory(channelId) {
    let row = db.prepare('SELECT * FROM ai_channel_memories WHERE channel_id = ?').get(channelId);
    if (!row) {
      db.prepare("INSERT INTO ai_channel_memories (channel_id, reset_timestamp, logs) VALUES (?, 0, '[]')").run(channelId);
      row = db.prepare('SELECT * FROM ai_channel_memories WHERE channel_id = ?').get(channelId);
    }
    return {
      channel_id: row.channel_id,
      reset_timestamp: row.reset_timestamp,
      logs: JSON.parse(row.logs || '[]')
    };
  },

  addChannelLog(channelId, role, content) {
    const memory = this.getChannelMemory(channelId);
    const logs = memory.logs;
    logs.push({ role, content, timestamp: Date.now() });
    if (logs.length > 50) logs.splice(0, logs.length - 50);

    db.prepare('UPDATE ai_channel_memories SET logs = ? WHERE channel_id = ?').run(
      JSON.stringify(logs),
      channelId
    );
  },

  resetChannelMemory(channelId) {
    db.prepare("UPDATE ai_channel_memories SET reset_timestamp = ?, logs = '[]' WHERE channel_id = ?").run(
      Date.now(),
      channelId
    );
  },

  getPartnershipConfig(guildId) {
    let row = db.prepare('SELECT * FROM partnership_configs WHERE guild_id = ?').get(guildId);
    if (!row) {
      db.prepare(`
        INSERT INTO partnership_configs (guild_id, enabled, min_members, cooldown_minutes)
        VALUES (?, 1, 0, 60)
      `).run(guildId);
      row = db.prepare('SELECT * FROM partnership_configs WHERE guild_id = ?').get(guildId);
    }
    return {
      ...row,
      enabled: Boolean(row.enabled),
      embed_template: row.embed_template ? JSON.parse(row.embed_template) : null
    };
  },

  updatePartnershipConfig(guildId, data) {
    const current = this.getPartnershipConfig(guildId);
    const updated = { ...current, ...data };
    const templateJson = updated.embed_template ? JSON.stringify(updated.embed_template) : null;

    db.prepare(`
      INSERT OR REPLACE INTO partnership_configs (guild_id, channel_id, ping_role_id, min_members, cooldown_minutes, embed_template, log_channel_id, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      guildId,
      updated.channel_id || null,
      updated.ping_role_id || null,
      updated.min_members || 0,
      updated.cooldown_minutes || 60,
      templateJson,
      updated.log_channel_id || null,
      updated.enabled ? 1 : 0
    );
    return this.getPartnershipConfig(guildId);
  },

  addPartnership(guildId, data) {
    const stmt = db.prepare(`
      INSERT INTO partnerships (guild_id, partner_guild_id, partner_name, invite_url, rep_user_id, partner_count, timestamp, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      guildId,
      data.partner_guild_id || null,
      data.partner_name || 'Partner Server',
      data.invite_url || null,
      data.rep_user_id || null,
      data.partner_count || 0,
      data.timestamp || Math.floor(Date.now() / 1000),
      data.notes || null
    );
    return { id: info.lastInsertRowid, ...data };
  },

  getPartnerships(guildId, limit = 50) {
    return db.prepare('SELECT * FROM partnerships WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?').all(guildId, limit);
  },

  getPartnershipStats(guildId) {
    const total = db.prepare('SELECT COUNT(*) as count FROM partnerships WHERE guild_id = ?').get(guildId).count;
    const leaderboard = db.prepare(`
      SELECT rep_user_id, COUNT(*) as count
      FROM partnerships
      WHERE guild_id = ? AND rep_user_id IS NOT NULL
      GROUP BY rep_user_id
      ORDER BY count DESC
      LIMIT 10
    `).all(guildId);
    return { total, leaderboard };
  },

  saveEmbedTemplate(guildId, templateId, name, embedData, componentsData = [], createdBy = null) {
    db.prepare(`
      INSERT OR REPLACE INTO embed_templates (id, guild_id, name, created_by, embed_data, components_data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      templateId,
      guildId,
      name,
      createdBy,
      JSON.stringify(embedData),
      JSON.stringify(componentsData),
      Math.floor(Date.now() / 1000)
    );
    return this.getEmbedTemplate(templateId);
  },

  getEmbedTemplate(templateId) {
    const row = db.prepare('SELECT * FROM embed_templates WHERE id = ?').get(templateId);
    if (!row) return null;
    return {
      ...row,
      embed_data: JSON.parse(row.embed_data || '{}'),
      components_data: JSON.parse(row.components_data || '[]')
    };
  },

  getEmbedTemplates(guildId) {
    const rows = db.prepare('SELECT * FROM embed_templates WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
    return rows.map(r => ({
      ...r,
      embed_data: JSON.parse(r.embed_data || '{}'),
      components_data: JSON.parse(r.components_data || '[]')
    }));
  },

  deleteEmbedTemplate(templateId) {
    return db.prepare('DELETE FROM embed_templates WHERE id = ?').run(templateId);
  },

  addReactionRole(guildId, channelId, messageId, type, roleId, emoji, label = null, style = 'SECONDARY', groupName = 'default') {
    const info = db.prepare(`
      INSERT INTO reaction_roles (guild_id, channel_id, message_id, type, role_id, emoji, label, style, group_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, channelId, messageId, type, roleId, emoji, label, style, groupName);
    return { id: info.lastInsertRowid };
  },

  getReactionRolesForMessage(messageId) {
    return db.prepare('SELECT * FROM reaction_roles WHERE message_id = ?').all(messageId);
  },

  getReactionRoles(guildId) {
    return db.prepare('SELECT * FROM reaction_roles WHERE guild_id = ?').all(guildId);
  },

  deleteReactionRole(id) {
    return db.prepare('DELETE FROM reaction_roles WHERE id = ?').run(id);
  },

  deleteReactionRolesForMessage(messageId) {
    return db.prepare('DELETE FROM reaction_roles WHERE message_id = ?').run(messageId);
  },

  getWelcomerConfig(guildId) {
    let row = db.prepare('SELECT * FROM welcomer_configs WHERE guild_id = ?').get(guildId);
    if (!row) {
      db.prepare('INSERT INTO welcomer_configs (guild_id) VALUES (?)').run(guildId);
      row = db.prepare('SELECT * FROM welcomer_configs WHERE guild_id = ?').get(guildId);
    }
    let parsedWelcomeEmbed = null;
    let parsedLeaveEmbed = null;
    try {
      if (row.welcome_embed) {
        parsedWelcomeEmbed = typeof row.welcome_embed === 'string' ? JSON.parse(row.welcome_embed) : row.welcome_embed;
      }
    } catch (e) {
      parsedWelcomeEmbed = null;
    }
    try {
      if (row.leave_embed) {
        parsedLeaveEmbed = typeof row.leave_embed === 'string' ? JSON.parse(row.leave_embed) : row.leave_embed;
      }
    } catch (e) {
      parsedLeaveEmbed = null;
    }

    return {
      ...row,
      welcome_enabled: Boolean(row.welcome_enabled),
      welcome_dm_enabled: Boolean(row.welcome_dm_enabled),
      leave_enabled: Boolean(row.leave_enabled),
      card_enabled: Boolean(row.card_enabled),
      welcome_embed: parsedWelcomeEmbed,
      leave_embed: parsedLeaveEmbed
    };
  },

  updateWelcomerConfig(guildId, data) {
    const current = this.getWelcomerConfig(guildId);
    const updated = { ...current, ...data };
    
    let welcomeEmbStr = null;
    if (updated.welcome_embed) {
      welcomeEmbStr = typeof updated.welcome_embed === 'string' ? updated.welcome_embed : JSON.stringify(updated.welcome_embed);
    }
    let leaveEmbStr = null;
    if (updated.leave_embed) {
      leaveEmbStr = typeof updated.leave_embed === 'string' ? updated.leave_embed : JSON.stringify(updated.leave_embed);
    }

    db.prepare(`
      INSERT OR REPLACE INTO welcomer_configs (
        guild_id, welcome_enabled, welcome_channel_id, welcome_message, welcome_embed,
        welcome_dm_enabled, welcome_dm_message, leave_enabled, leave_channel_id,
        leave_message, leave_embed, card_enabled, card_bg_color, auto_role_user, auto_role_bot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      guildId,
      updated.welcome_enabled ? 1 : 0,
      updated.welcome_channel_id || null,
      updated.welcome_message || '',
      welcomeEmbStr,
      updated.welcome_dm_enabled ? 1 : 0,
      updated.welcome_dm_message || '',
      updated.leave_enabled ? 1 : 0,
      updated.leave_channel_id || null,
      updated.leave_message || '',
      leaveEmbStr,
      updated.card_enabled ? 1 : 0,
      updated.card_bg_color || '#1e1b4b',
      updated.auto_role_user || null,
      updated.auto_role_bot || null
    );
    return this.getWelcomerConfig(guildId);
  },

  getBoostConfig(guildId) {
    let row = db.prepare('SELECT * FROM boost_configs WHERE guild_id = ?').get(guildId);
    if (!row) {
      db.prepare(`
        INSERT INTO boost_configs (guild_id, enabled, message)
        VALUES (?, 1, 'Grazie per il boost {user.mention}! 🚀')
      `).run(guildId);
      row = db.prepare('SELECT * FROM boost_configs WHERE guild_id = ?').get(guildId);
    }
    let parsedEmbed = null;
    try {
      if (row.embed) {
        parsedEmbed = typeof row.embed === 'string' ? JSON.parse(row.embed) : row.embed;
      }
    } catch (e) {
      parsedEmbed = null;
    }

    return {
      ...row,
      enabled: Boolean(row.enabled),
      embed: parsedEmbed
    };
  },

  updateBoostConfig(guildId, data) {
    const current = this.getBoostConfig(guildId);
    const updated = { ...current, ...data };

    let embStr = null;
    if (updated.embed) {
      embStr = typeof updated.embed === 'string' ? updated.embed : JSON.stringify(updated.embed);
    }

    db.prepare(`
      INSERT INTO boost_configs (guild_id, enabled, channel_id, message, embed)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        enabled = excluded.enabled,
        channel_id = excluded.channel_id,
        message = excluded.message,
        embed = excluded.embed
    `).run(
      guildId,
      updated.enabled ? 1 : 0,
      updated.channel_id || null,
      updated.message || 'Grazie per il boost {user.mention}! 🚀',
      embStr
    );
    return this.getBoostConfig(guildId);
  },

  // ============================================================
  // AFK STATUS SYSTEM METHODS
  // ============================================================
  setAfk(guildId, userId, reason = 'Attualmente assente', timestamp = Date.now()) {
    db.prepare(`
      INSERT INTO afk_users (guild_id, user_id, reason, timestamp)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET
        reason = excluded.reason,
        timestamp = excluded.timestamp
    `).run(guildId, userId, reason, timestamp);

    return this.getAfk(guildId, userId);
  },

  getAfk(guildId, userId) {
    const row = db.prepare('SELECT * FROM afk_users WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
    return row || null;
  },

  removeAfk(guildId, userId) {
    const existing = this.getAfk(guildId, userId);
    if (existing) {
      db.prepare('DELETE FROM afk_users WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
    }
    return existing;
  },

  getAllAfk(guildId) {
    return db.prepare('SELECT * FROM afk_users WHERE guild_id = ?').all(guildId);
  },

  getAutoresponders(guildId) {
    const rows = db.prepare('SELECT * FROM autoresponders WHERE guild_id = ?').all(guildId);
    return rows.map(r => ({
      ...r,
      enabled: Boolean(r.enabled),
      response_embed: r.response_embed ? JSON.parse(r.response_embed) : null,
      auto_reactions: JSON.parse(r.auto_reactions || '[]'),
      channels_whitelist: JSON.parse(r.channels_whitelist || '[]'),
      roles_whitelist: JSON.parse(r.roles_whitelist || '[]')
    }));
  },

  addAutoresponder(guildId, data) {
    const info = db.prepare(`
      INSERT INTO autoresponders (
        guild_id, trigger, match_type, response_text, response_embed, auto_reactions, channels_whitelist, roles_whitelist, enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      guildId,
      data.trigger,
      data.match_type || 'CONTAINS',
      data.response_text || null,
      data.response_embed ? JSON.stringify(data.response_embed) : null,
      JSON.stringify(data.auto_reactions || []),
      JSON.stringify(data.channels_whitelist || []),
      JSON.stringify(data.roles_whitelist || []),
      data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1
    );
    return { id: info.lastInsertRowid, ...data };
  },

  deleteAutoresponder(id) {
    return db.prepare('DELETE FROM autoresponders WHERE id = ?').run(id);
  },

  getAutoreactionChannels(guildId) {
    const rows = db.prepare('SELECT * FROM autoreaction_channels WHERE guild_id = ?').all(guildId);
    return rows.map(r => ({
      ...r,
      enabled: Boolean(r.enabled),
      emojis: JSON.parse(r.emojis || '[]')
    }));
  },

  setAutoreactionChannel(guildId, channelId, emojis, enabled = true) {
    const existing = db.prepare('SELECT id FROM autoreaction_channels WHERE guild_id = ? AND channel_id = ?').get(guildId, channelId);
    if (existing) {
      db.prepare('UPDATE autoreaction_channels SET emojis = ?, enabled = ? WHERE id = ?').run(
        JSON.stringify(emojis),
        enabled ? 1 : 0,
        existing.id
      );
      return existing.id;
    } else {
      const info = db.prepare('INSERT INTO autoreaction_channels (guild_id, channel_id, emojis, enabled) VALUES (?, ?, ?, ?)').run(
        guildId,
        channelId,
        JSON.stringify(emojis),
        enabled ? 1 : 0
      );
      return info.lastInsertRowid;
    }
  },

  deleteAutoreactionChannel(id) {
    return db.prepare('DELETE FROM autoreaction_channels WHERE id = ?').run(id);
  },

  getAutomodConfig(guildId) {
    let row = db.prepare('SELECT * FROM automod_configs WHERE guild_id = ?').get(guildId);
    if (!row) {
      db.prepare('INSERT INTO automod_configs (guild_id) VALUES (?)').run(guildId);
      row = db.prepare('SELECT * FROM automod_configs WHERE guild_id = ?').get(guildId);
    }
    return {
      ...row,
      anti_invite: Boolean(row.anti_invite),
      anti_link: Boolean(row.anti_link),
      anti_spam: Boolean(row.anti_spam),
      anti_caps: Boolean(row.anti_caps),
      bad_words: JSON.parse(row.bad_words || '[]'),
      ignored_channels: JSON.parse(row.ignored_channels || '[]'),
      ignored_roles: JSON.parse(row.ignored_roles || '[]')
    };
  },

  updateAutomodConfig(guildId, data) {
    const current = this.getAutomodConfig(guildId);
    const updated = { ...current, ...data };

    db.prepare(`
      INSERT OR REPLACE INTO automod_configs (
        guild_id, anti_invite, anti_link, anti_spam, anti_caps, max_mentions, bad_words, ignored_channels, ignored_roles, action
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      guildId,
      updated.anti_invite ? 1 : 0,
      updated.anti_link ? 1 : 0,
      updated.anti_spam ? 1 : 0,
      updated.anti_caps ? 1 : 0,
      updated.max_mentions || 5,
      JSON.stringify(updated.bad_words || []),
      JSON.stringify(updated.ignored_channels || []),
      JSON.stringify(updated.ignored_roles || []),
      updated.action || 'DELETE'
    );
    return this.getAutomodConfig(guildId);
  },

  addModerationCase(guildId, userId, moderatorId, actionType, reason, duration = 0) {
    const info = db.prepare(`
      INSERT INTO moderation_cases (guild_id, user_id, moderator_id, action_type, reason, duration, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      guildId,
      userId,
      moderatorId,
      actionType,
      reason || 'Nessun motivo specificato',
      duration,
      Math.floor(Date.now() / 1000)
    );
    return { id: info.lastInsertRowid };
  },

  getModerationCases(guildId, userId = null, limit = 20) {
    if (userId) {
      return db.prepare('SELECT * FROM moderation_cases WHERE guild_id = ? AND user_id = ? ORDER BY timestamp DESC LIMIT ?').all(guildId, userId, limit);
    }
    return db.prepare('SELECT * FROM moderation_cases WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?').all(guildId, limit);
  },

  getTicketPanels(guildId) {
    return db.prepare('SELECT * FROM ticket_panels WHERE guild_id = ?').all(guildId);
  },

  getTicketPanel(panelId) {
    return db.prepare('SELECT * FROM ticket_panels WHERE id = ?').get(panelId);
  },

  saveTicketPanel(panelData) {
    db.prepare(`
      INSERT OR REPLACE INTO ticket_panels (
        id, guild_id, channel_id, message_id, title, description, color, image, footer, button_style, category_id, button_label, button_emoji, support_role_id, welcome_message, naming_scheme, log_channel_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      panelData.id,
      panelData.guild_id,
      panelData.channel_id || null,
      panelData.message_id || null,
      panelData.title || 'Crea un Ticket',
      panelData.description || 'Clicca sul pulsante sottostante per aprire un ticket.',
      panelData.color || '#ea580c',
      panelData.image || null,
      panelData.footer || null,
      panelData.button_style || 'Primary',
      panelData.category_id || null,
      panelData.button_label || 'Apri Ticket',
      panelData.button_emoji || '📩',
      panelData.support_role_id || null,
      panelData.welcome_message || 'Benvenuto {user.mention}! Lo staff ti risponderà a breve.',
      panelData.naming_scheme || 'ticket-{user}',
      panelData.log_channel_id || null
    );
    return this.getTicketPanel(panelData.id);
  },

  createTicket(guildId, channelId, userId, panelId = null) {
    const info = db.prepare(`
      INSERT INTO tickets (guild_id, channel_id, user_id, panel_id, status, created_at)
      VALUES (?, ?, ?, ?, 'OPEN', ?)
    `).run(guildId, channelId, userId, panelId, Math.floor(Date.now() / 1000));
    return { id: info.lastInsertRowid };
  },

  getTicketByChannel(channelId) {
    return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId);
  },

  closeTicket(channelId, transcript = null) {
    return db.prepare(`
      UPDATE tickets
      SET status = 'CLOSED', closed_at = ?, transcript_text = ?
      WHERE channel_id = ?
    `).run(Math.floor(Date.now() / 1000), transcript, channelId);
  },

  claimTicket(channelId, staffId) {
    return db.prepare(`
      UPDATE tickets
      SET status = 'CLAIMED', claimed_by = ?
      WHERE channel_id = ?
    `).run(staffId, channelId);
  },

  createGiveaway(guildId, channelId, messageId, prize, winnerCount, endTime, hostId) {
    const info = db.prepare(`
      INSERT INTO giveaways (guild_id, channel_id, message_id, prize, winner_count, end_time, host_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, channelId, messageId, prize, winnerCount, endTime, hostId);
    return { id: info.lastInsertRowid };
  },

  getActiveGiveaways() {
    return db.prepare('SELECT * FROM giveaways WHERE ended = 0').all();
  },

  getGiveaway(messageId) {
    const row = db.prepare('SELECT * FROM giveaways WHERE message_id = ?').get(messageId);
    if (!row) return null;
    return {
      ...row,
      winners: JSON.parse(row.winners || '[]')
    };
  },

  endGiveaway(messageId, winners = []) {
    return db.prepare(`
      UPDATE giveaways
      SET ended = 1, winners = ?
      WHERE message_id = ?
    `).run(JSON.stringify(winners), messageId);
  },

  getLevelConfig(guildId) {
    let row = db.prepare('SELECT * FROM level_configs WHERE guild_id = ?').get(guildId);
    if (!row) {
      db.prepare('INSERT INTO level_configs (guild_id) VALUES (?)').run(guildId);
      row = db.prepare('SELECT * FROM level_configs WHERE guild_id = ?').get(guildId);
    }
    return {
      ...row,
      enabled: Boolean(row.enabled),
      dm_notifications: Boolean(row.dm_notifications),
      xp_rate: Number(row.xp_rate || 1.0),
      coins_per_level: Number(row.coins_per_level !== undefined && row.coins_per_level !== null ? row.coins_per_level : 100)
    };
  },

  updateLevelConfig(guildId, data) {
    const current = this.getLevelConfig(guildId);
    const updated = { ...current, ...data };
    db.prepare(`
      INSERT OR REPLACE INTO level_configs (guild_id, enabled, xp_rate, channel_id, dm_notifications, coins_per_level)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      guildId,
      updated.enabled ? 1 : 0,
      updated.xp_rate || 1.0,
      updated.channel_id || null,
      updated.dm_notifications ? 1 : 0,
      updated.coins_per_level !== undefined ? Number(updated.coins_per_level) : 100
    );
    return this.getLevelConfig(guildId);
  },

  getUserLevel(guildId, userId) {
    let row = db.prepare('SELECT * FROM levels WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
    if (!row) {
      db.prepare('INSERT INTO levels (guild_id, user_id) VALUES (?, ?)').run(guildId, userId);
      row = db.prepare('SELECT * FROM levels WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
    }
    return row;
  },

  addXp(guildId, userId, amount) {
    const user = this.getUserLevel(guildId, userId);
    const newXp = user.xp + amount;
    const newLevel = Math.floor(0.1 * Math.sqrt(newXp));
    const leveledUp = newLevel > user.level;

    db.prepare(`
      UPDATE levels
      SET xp = ?, level = ?, total_messages = total_messages + 1, last_message_time = ?
      WHERE guild_id = ? AND user_id = ?
    `).run(newXp, newLevel, Math.floor(Date.now() / 1000), guildId, userId);

    return {
      previousLevel: user.level,
      newLevel,
      leveledUp,
      currentXp: newXp
    };
  },

  getLeaderboard(guildId, limit = 10) {
    return db.prepare(`
      SELECT user_id, xp, level, total_messages
      FROM levels
      WHERE guild_id = ?
      ORDER BY xp DESC
      LIMIT ?
    `).all(guildId, limit);
  },

  getLevelRewards(guildId) {
    return db.prepare('SELECT * FROM level_rewards WHERE guild_id = ? ORDER BY level ASC').all(guildId);
  },

  addLevelReward(guildId, level, roleId) {
    return db.prepare('INSERT INTO level_rewards (guild_id, level, role_id) VALUES (?, ?, ?)').run(guildId, level, roleId);
  },

  deleteLevelReward(id) {
    return db.prepare('DELETE FROM level_rewards WHERE id = ?').run(id);
  },

  trackEmojiUse(guildId, emojiId, emojiName, isAnimated = false) {
    db.prepare(`
      INSERT INTO emoji_stats (guild_id, emoji_id, emoji_name, is_animated, use_count, last_used)
      VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(guild_id, emoji_id) DO UPDATE SET
        use_count = use_count + 1,
        last_used = ?
    `).run(
      guildId,
      emojiId,
      emojiName,
      isAnimated ? 1 : 0,
      Math.floor(Date.now() / 1000),
      Math.floor(Date.now() / 1000)
    );
  },

  getEmojiStats(guildId, limit = 20) {
    return db.prepare('SELECT * FROM emoji_stats WHERE guild_id = ? ORDER BY use_count DESC LIMIT ?').all(guildId, limit);
  },

  // === Counting Game Helpers ===
  getCountingConfig(guildId) {
    const row = db.prepare('SELECT * FROM counting_configs WHERE guild_id = ?').get(guildId);
    if (!row) {
      db.prepare('INSERT INTO counting_configs (guild_id, current_number, highest_streak, allow_ruin_reset, allow_consecutive, zen_mode, enabled) VALUES (?, 0, 0, 0, 1, 1, 0)').run(guildId);
      return { guild_id: guildId, channel_id: null, current_number: 0, last_user_id: null, highest_streak: 0, allow_ruin_reset: 0, allow_consecutive: 1, zen_mode: 1, enabled: 0 };
    }
    return {
      ...row,
      allow_ruin_reset: row.allow_ruin_reset !== undefined ? row.allow_ruin_reset : 0,
      allow_consecutive: row.allow_consecutive !== undefined ? row.allow_consecutive : 1,
      zen_mode: row.zen_mode !== undefined ? row.zen_mode : 1
    };
  },

  saveCountingConfig(guildId, config) {
    return db.prepare(`
      INSERT INTO counting_configs (guild_id, channel_id, current_number, last_user_id, highest_streak, allow_ruin_reset, allow_consecutive, zen_mode, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        current_number = excluded.current_number,
        last_user_id = excluded.last_user_id,
        highest_streak = excluded.highest_streak,
        allow_ruin_reset = excluded.allow_ruin_reset,
        allow_consecutive = excluded.allow_consecutive,
        zen_mode = excluded.zen_mode,
        enabled = excluded.enabled
    `).run(
      guildId,
      config.channel_id ?? null,
      config.current_number ?? 0,
      config.last_user_id ?? null,
      config.highest_streak ?? 0,
      config.allow_ruin_reset !== undefined ? (config.allow_ruin_reset ? 1 : 0) : 0,
      config.allow_consecutive !== undefined ? (config.allow_consecutive ? 1 : 0) : 1,
      config.zen_mode !== undefined ? (config.zen_mode ? 1 : 0) : 1,
      config.enabled !== undefined ? (config.enabled ? 1 : 0) : 0
    );
  },

  recordCountSuccess(guildId, userId, nextNumber) {
    const cfg = this.getCountingConfig(guildId);
    const newStreak = Math.max(cfg.highest_streak || 0, nextNumber);
    
    db.prepare(`
      UPDATE counting_configs SET
        current_number = ?,
        last_user_id = ?,
        highest_streak = ?
      WHERE guild_id = ?
    `).run(nextNumber, userId, newStreak, guildId);

    db.prepare(`
      INSERT INTO counting_scores (guild_id, user_id, counts, correct_counts, ruined_counts)
      VALUES (?, ?, 1, 1, 0)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET
        counts = counts + 1,
        correct_counts = correct_counts + 1
    `).run(guildId, userId);
  },

  recordCountRuin(guildId, userId) {
    db.prepare(`
      UPDATE counting_configs SET
        current_number = 0,
        last_user_id = NULL
      WHERE guild_id = ?
    `).run(guildId);

    db.prepare(`
      INSERT INTO counting_scores (guild_id, user_id, counts, correct_counts, ruined_counts)
      VALUES (?, ?, 1, 0, 1)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET
        counts = counts + 1,
        ruined_counts = ruined_counts + 1
    `).run(guildId, userId);
  },

  getCountingLeaderboard(guildId, limit = 10) {
    return db.prepare('SELECT * FROM counting_scores WHERE guild_id = ? ORDER BY correct_counts DESC LIMIT ?').all(guildId, limit);
  },

  // === Fishing & Medieval Economy Helpers ===
  getFishingProfile(guildId, userId) {
    let row;
    try {
      row = db.prepare('SELECT * FROM fishing_profiles WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
    } catch (e) {
      console.warn(`[Database] Error querying fishing_profiles for ${userId}:`, e.message);
    }
    if (!row) {
      try {
        db.prepare('INSERT INTO fishing_profiles (guild_id, user_id, rod_level, coins, total_fish_caught, last_fished, last_daily, inventory) VALUES (?, ?, 1, 100, 0, 0, 0, ?)').run(guildId, userId, JSON.stringify([]));
      } catch (e) {}
      row = { guild_id: guildId, user_id: userId, rod_level: 1, coins: 100, total_fish_caught: 0, last_fished: 0, last_daily: 0, inventory: '[]' };
    }
    let parsedInventory = [];
    try {
      parsedInventory = typeof row.inventory === 'string' ? JSON.parse(row.inventory || '[]') : (row.inventory || []);
    } catch (e) {
      parsedInventory = [];
    }
    return {
      ...row,
      coins: Math.max(0, Math.min(1000000000000000, Number(row.coins) || 0)),
      rod_level: Math.max(1, Number(row.rod_level) || 1),
      total_fish_caught: Math.max(0, Number(row.total_fish_caught) || 0),
      inventory: parsedInventory
    };
  },

  saveFishingProfile(guildId, userId, profile) {
    const safeCoins = Math.max(0, Math.min(1000000000000000, Math.floor(Number(profile.coins) || 0)));
    return db.prepare(`
      INSERT INTO fishing_profiles (guild_id, user_id, rod_level, coins, total_fish_caught, last_fished, last_daily, inventory)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET
        rod_level = excluded.rod_level,
        coins = excluded.coins,
        total_fish_caught = excluded.total_fish_caught,
        last_fished = excluded.last_fished,
        last_daily = excluded.last_daily,
        inventory = excluded.inventory
    `).run(
      guildId,
      userId,
      Math.max(1, Math.floor(Number(profile.rod_level) || 1)),
      safeCoins,
      Math.max(0, Math.floor(Number(profile.total_fish_caught) || 0)),
      Math.max(0, Math.floor(Number(profile.last_fished) || 0)),
      Math.max(0, Math.floor(Number(profile.last_daily) || 0)),
      JSON.stringify(profile.inventory || [])
    );
  },

  getFishingLeaderboard(guildId, limit = 10) {
    const rows = db.prepare('SELECT * FROM fishing_profiles WHERE guild_id = ? ORDER BY coins DESC, total_fish_caught DESC LIMIT ?').all(guildId, limit);
    return rows.map(r => ({
      ...r,
      coins: Math.max(0, Math.min(1000000000000000, Number(r.coins) || 0))
    }));
  },

  modifyUserCoins(guildId, userId, amount, operation = 'add') {
    const profile = this.getFishingProfile(guildId, userId);
    let numAmount = Math.max(0, Math.floor(Number(amount) || 0));
    const MAX_COINS = 1000000000000000;
    if (!Number.isFinite(numAmount) || numAmount > MAX_COINS) {
      numAmount = MAX_COINS;
    }

    if (operation === 'add') {
      profile.coins = Math.min(MAX_COINS, (Number(profile.coins) || 0) + numAmount);
    } else if (operation === 'remove') {
      profile.coins = Math.max(0, (Number(profile.coins) || 0) - numAmount);
    } else if (operation === 'set') {
      profile.coins = Math.min(MAX_COINS, numAmount);
    }

    this.saveFishingProfile(guildId, userId, profile);
    return profile;
  },

  getUserCoins(guildId, userId) {
    try {
      const profile = this.getFishingProfile(guildId, userId);
      return Math.max(0, Math.floor(Number(profile?.coins) || 0));
    } catch (e) {
      return 0;
    }
  },

  addCoins(guildId, userId, amount) {
    return this.modifyUserCoins(guildId, userId, amount, 'add');
  },

  removeCoins(guildId, userId, amount) {
    return this.modifyUserCoins(guildId, userId, amount, 'remove');
  },

  resetEconomy(guildId) {
    if (guildId) {
      db.prepare('DELETE FROM fishing_profiles WHERE guild_id = ?').run(guildId);
      db.prepare('DELETE FROM minigame_stats WHERE guild_id = ?').run(guildId);
      db.prepare('DELETE FROM rpg_duels WHERE guild_id = ?').run(guildId);
    } else {
      db.prepare('DELETE FROM fishing_profiles').run();
      db.prepare('DELETE FROM minigame_stats').run();
      db.prepare('DELETE FROM rpg_duels').run();
    }
    return true;
  },

  // === Ticket Automation Helpers ===
  getTicketAutomation(guildId) {
    const row = db.prepare('SELECT * FROM ticket_automations WHERE guild_id = ?').get(guildId);
    if (!row) {
      db.prepare('INSERT INTO ticket_automations (guild_id) VALUES (?)').run(guildId);
      return { guild_id: guildId, auto_close_hours: 48, auto_transcript_dm: 1, auto_tag_staff: 1, inactivity_warning_hours: 24 };
    }
    return row;
  },

  saveTicketAutomation(guildId, config) {
    return db.prepare(`
      INSERT INTO ticket_automations (guild_id, auto_close_hours, auto_transcript_dm, auto_tag_staff, inactivity_warning_hours)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        auto_close_hours = excluded.auto_close_hours,
        auto_transcript_dm = excluded.auto_transcript_dm,
        auto_tag_staff = excluded.auto_tag_staff,
        inactivity_warning_hours = excluded.inactivity_warning_hours
    `).run(
      guildId,
      config.auto_close_hours || 48,
      config.auto_transcript_dm !== undefined ? (config.auto_transcript_dm ? 1 : 0) : 1,
      config.auto_tag_staff !== undefined ? (config.auto_tag_staff ? 1 : 0) : 1,
      config.inactivity_warning_hours || 24
    );
  },

  // === Community Presentations (Presentazioni) Helpers ===
  getPresentationConfig(guildId) {
    let row = db.prepare('SELECT * FROM presentation_configs WHERE guild_id = ?').get(guildId);
    if (!row) {
      db.prepare('INSERT INTO presentation_configs (guild_id) VALUES (?)').run(guildId);
      row = db.prepare('SELECT * FROM presentation_configs WHERE guild_id = ?').get(guildId);
    }
    return {
      ...row,
      enabled: Boolean(row.enabled)
    };
  },

  updatePresentationConfig(guildId, data) {
    const current = this.getPresentationConfig(guildId);
    const updated = { ...current, ...data };
    db.prepare(`
      INSERT OR REPLACE INTO presentation_configs (guild_id, channel_id, reward_role_id, xp_reward, title, color, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      guildId,
      updated.channel_id || null,
      updated.reward_role_id || null,
      updated.xp_reward !== undefined ? updated.xp_reward : 100,
      updated.title || '📜 Presentazione del Cavaliere',
      updated.color || '#6366f1',
      updated.enabled ? 1 : 0
    );
    return this.getPresentationConfig(guildId);
  },

  savePresentationConfig(guildId, data) {
    return this.updatePresentationConfig(guildId, data);
  },

  addPresentation(guildId, data) {
    const info = db.prepare(`
      INSERT INTO presentations (guild_id, user_id, name, age_pronouns, hobbies, bio, social_media, message_id, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      guildId,
      data.user_id,
      data.name,
      data.age_pronouns || null,
      data.hobbies,
      data.bio,
      data.social_media || null,
      data.message_id || null,
      data.timestamp || Math.floor(Date.now() / 1000)
    );
    return { id: info.lastInsertRowid, ...data };
  },

  getPresentations(guildId, limit = 20) {
    return db.prepare('SELECT * FROM presentations WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?').all(guildId, limit);
  },

  getUserPresentation(guildId, userId) {
    return db.prepare('SELECT * FROM presentations WHERE guild_id = ? AND user_id = ? ORDER BY timestamp DESC LIMIT 1').get(guildId, userId);
  },

  getSetupShowcaseConfig(guildId) {
    const row = db.prepare('SELECT * FROM setup_showcase_configs WHERE guild_id = ?').get(guildId);
    if (!row) {
      db.prepare(`
        INSERT OR IGNORE INTO setup_showcase_configs (guild_id, title, color, auto_reactions, auto_thread, xp_reward, delete_invalid, enabled)
        VALUES (?, '🖥️ Setup & Postazione', '#dc2626', '["🔥","⭐","❤️"]', 1, 50, 0, 0)
      `).run(guildId);
      return this.getSetupShowcaseConfig(guildId);
    }
    return {
      ...row,
      enabled: Boolean(row.enabled),
      auto_thread: Boolean(row.auto_thread),
      require_text: Boolean(row.require_text),
      delete_invalid: Boolean(row.delete_invalid),
      auto_reactions: JSON.parse(row.auto_reactions || '["🔥","⭐","❤️"]')
    };
  },

  updateSetupShowcaseConfig(guildId, data) {
    this.getSetupShowcaseConfig(guildId);
    const autoReactions = Array.isArray(data.auto_reactions)
      ? JSON.stringify(data.auto_reactions)
      : (typeof data.auto_reactions === 'string' ? data.auto_reactions : '["🔥","⭐","❤️"]');

    db.prepare(`
      UPDATE setup_showcase_configs
      SET channel_id = ?,
          title = ?,
          color = ?,
          auto_reactions = ?,
          auto_thread = ?,
          reward_role_id = ?,
          xp_reward = ?,
          require_text = ?,
          delete_invalid = ?,
          enabled = ?
      WHERE guild_id = ?
    `).run(
      data.channel_id || null,
      data.title || '🖥️ Setup & Postazione',
      data.color || '#dc2626',
      autoReactions,
      data.auto_thread ? 1 : 0,
      data.reward_role_id || null,
      data.xp_reward !== undefined ? Number(data.xp_reward) : 50,
      data.require_text ? 1 : 0,
      data.delete_invalid ? 1 : 0,
      data.enabled ? 1 : 0,
      guildId
    );
    return this.getSetupShowcaseConfig(guildId);
  },

  saveSetupSubmission(guildId, data) {
    const info = db.prepare(`
      INSERT INTO setup_submissions (guild_id, user_id, image_url, description, embed_message_id, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      guildId,
      data.user_id,
      data.image_url,
      data.description || null,
      data.embed_message_id || null,
      data.timestamp || Math.floor(Date.now() / 1000)
    );
    return { id: info.lastInsertRowid, ...data };
  },

  getSetupSubmissions(guildId, limit = 20) {
    return db.prepare('SELECT * FROM setup_submissions WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?').all(guildId, limit);
  },

  saveAuthSession(token, userData, accessToken) {
    try {
      db.prepare(`
        INSERT OR REPLACE INTO auth_sessions (token, user_data, access_token, created_at)
        VALUES (?, ?, ?, ?)
      `).run(token, JSON.stringify(userData), accessToken || '', Date.now());
    } catch (e) {
      console.error('[DB] Error saving auth session:', e.message);
    }
  },

  getAuthSession(token) {
    try {
      const row = db.prepare('SELECT user_data, created_at FROM auth_sessions WHERE token = ?').get(token);
      if (!row) return null;
      if (Date.now() - Number(row.created_at || 0) > 90 * 24 * 60 * 60 * 1000) {
        db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
        return null;
      }
      return JSON.parse(row.user_data);
    } catch (e) {
      console.error('[DB] Error getting auth session:', e.message);
      return null;
    }
  },

  deleteAuthSession(token) {
    try {
      db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
    } catch (e) {}
  },

  // === FISHING MODULE CONFIG ===
  getFishingConfig(guildId) {
    let row = db.prepare('SELECT * FROM fishing_configs WHERE guild_id = ?').get(guildId);
    if (!row) {
      db.prepare(`
        INSERT OR IGNORE INTO fishing_configs (guild_id, title, color, cooldown_seconds, enabled)
        VALUES (?, '🎣 Pesca Medievale dei Cavalieri', '#38bdf8', 15, 1)
      `).run(guildId);
      return this.getFishingConfig(guildId);
    }
    return {
      ...row,
      enabled: Boolean(row.enabled),
      cooldown_seconds: Number(row.cooldown_seconds || 15)
    };
  },

  updateFishingConfig(guildId, data) {
    this.getFishingConfig(guildId);
    db.prepare(`
      UPDATE fishing_configs
      SET channel_id = ?,
          title = ?,
          color = ?,
          cooldown_seconds = ?,
          enabled = ?
      WHERE guild_id = ?
    `).run(
      data.channel_id ?? null,
      data.title ?? '🎣 Pesca Medievale dei Cavalieri',
      data.color ?? '#38bdf8',
      data.cooldown_seconds !== undefined ? Number(data.cooldown_seconds) : 15,
      data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
      guildId
    );
    return this.getFishingConfig(guildId);
  },

  // === MINIGAMES & CASINO CONFIG ===
  getMinigamesConfig(guildId) {
    let row = db.prepare('SELECT * FROM minigames_configs WHERE guild_id = ?').get(guildId);
    if (!row) {
      db.prepare(`
        INSERT OR IGNORE INTO minigames_configs (guild_id, max_bet, min_bet, daily_reward, enabled)
        VALUES (?, 5000, 10, 150, 1)
      `).run(guildId);
      return this.getMinigamesConfig(guildId);
    }
    return {
      ...row,
      enabled: Boolean(row.enabled),
      max_bet: Number(row.max_bet || 5000),
      min_bet: Number(row.min_bet || 10),
      daily_reward: Number(row.daily_reward || 150)
    };
  },

  updateMinigamesConfig(guildId, data) {
    this.getMinigamesConfig(guildId);
    db.prepare(`
      UPDATE minigames_configs
      SET general_channel_id = ?,
          blackjack_channel_id = ?,
          slots_channel_id = ?,
          dice_channel_id = ?,
          max_bet = ?,
          min_bet = ?,
          daily_reward = ?,
          enabled = ?
      WHERE guild_id = ?
    `).run(
      data.general_channel_id ?? null,
      data.blackjack_channel_id ?? null,
      data.slots_channel_id ?? null,
      data.dice_channel_id ?? null,
      data.max_bet !== undefined ? Number(data.max_bet) : 5000,
      data.min_bet !== undefined ? Number(data.min_bet) : 10,
      data.daily_reward !== undefined ? Number(data.daily_reward) : 150,
      data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
      guildId
    );
    return this.getMinigamesConfig(guildId);
  },

  getMinigameStats(guildId, userId, gameType) {
    let row = db.prepare('SELECT * FROM minigame_stats WHERE guild_id = ? AND user_id = ? AND game_type = ?').get(guildId, userId, gameType);
    if (!row) {
      return {
        guild_id: guildId,
        user_id: userId,
        game_type: gameType,
        games_played: 0,
        games_won: 0,
        total_won_coins: 0,
        total_lost_coins: 0,
        highest_win: 0
      };
    }
    return row;
  },

  recordMinigameResult(guildId, userId, gameType, won, coinsDelta) {
    const stats = this.getMinigameStats(guildId, userId, gameType);
    const newPlayed = stats.games_played + 1;
    const newWon = won ? stats.games_won + 1 : stats.games_won;
    const wonDelta = won && coinsDelta > 0 ? coinsDelta : 0;
    const lostDelta = !won && coinsDelta < 0 ? Math.abs(coinsDelta) : 0;
    const newTotalWon = stats.total_won_coins + wonDelta;
    const newTotalLost = stats.total_lost_coins + lostDelta;
    const newHighest = Math.max(stats.highest_win, wonDelta);

    db.prepare(`
      INSERT INTO minigame_stats (guild_id, user_id, game_type, games_played, games_won, total_won_coins, total_lost_coins, highest_win)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, user_id, game_type) DO UPDATE SET
        games_played = excluded.games_played,
        games_won = excluded.games_won,
        total_won_coins = excluded.total_won_coins,
        total_lost_coins = excluded.total_lost_coins,
        highest_win = excluded.highest_win
    `).run(guildId, userId, gameType, newPlayed, newWon, newTotalWon, newTotalLost, newHighest);
  },

  // === Temporary & Private Channels Helpers ===
  getTempChannelConfig(guildId) {
    let row = db.prepare('SELECT * FROM temp_channel_configs WHERE guild_id = ?').get(guildId);
    if (!row) {
      db.prepare(`
        INSERT INTO temp_channel_configs (guild_id, enabled, naming_scheme_voice, naming_scheme_text, default_user_limit, default_bitrate, auto_delete_delay)
        VALUES (?, 1, '🔊 Stanza di {user}', '💬 chat-{user}', 0, 64000, 0)
      `).run(guildId);
      row = db.prepare('SELECT * FROM temp_channel_configs WHERE guild_id = ?').get(guildId);
    }
    return {
      ...row,
      enabled: Boolean(row.enabled)
    };
  },

  updateTempChannelConfig(guildId, config) {
    const current = this.getTempChannelConfig(guildId);
    const updated = { ...current, ...config };
    db.prepare(`
      INSERT INTO temp_channel_configs (
        guild_id, enabled, voice_generator_id, category_id, panel_channel_id,
        default_user_limit, default_bitrate, naming_scheme_voice, naming_scheme_text, auto_delete_delay
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        enabled = excluded.enabled,
        voice_generator_id = excluded.voice_generator_id,
        category_id = excluded.category_id,
        panel_channel_id = excluded.panel_channel_id,
        default_user_limit = excluded.default_user_limit,
        default_bitrate = excluded.default_bitrate,
        naming_scheme_voice = excluded.naming_scheme_voice,
        naming_scheme_text = excluded.naming_scheme_text,
        auto_delete_delay = excluded.auto_delete_delay
    `).run(
      guildId,
      updated.enabled ? 1 : 0,
      updated.voice_generator_id || null,
      updated.category_id || null,
      updated.panel_channel_id || null,
      updated.default_user_limit || 0,
      updated.default_bitrate || 64000,
      updated.naming_scheme_voice || '🔊 Stanza di {user}',
      updated.naming_scheme_text || '💬 chat-{user}',
      updated.auto_delete_delay || 0
    );
    return this.getTempChannelConfig(guildId);
  },

  createTempChannelRecord(guildId, ownerId, voiceChannelId = null, textChannelId = null, userLimit = 0) {
    const info = db.prepare(`
      INSERT INTO temp_channels (guild_id, owner_id, voice_channel_id, text_channel_id, is_locked, is_hidden, user_limit, created_at)
      VALUES (?, ?, ?, ?, 1, 1, ?, ?)
    `).run(guildId, ownerId, voiceChannelId, textChannelId, userLimit, Math.floor(Date.now() / 1000));
    return {
      id: info.lastInsertRowid,
      guild_id: guildId,
      owner_id: ownerId,
      voice_channel_id: voiceChannelId,
      text_channel_id: textChannelId,
      is_locked: 1,
      is_hidden: 1,
      user_limit: userLimit
    };
  },

  getTempChannelByChannelId(channelId) {
    return db.prepare('SELECT * FROM temp_channels WHERE voice_channel_id = ? OR text_channel_id = ?').get(channelId, channelId);
  },

  getTempChannelByVoiceId(voiceChannelId) {
    return db.prepare('SELECT * FROM temp_channels WHERE voice_channel_id = ?').get(voiceChannelId);
  },

  getTempChannelByTextId(textChannelId) {
    return db.prepare('SELECT * FROM temp_channels WHERE text_channel_id = ?').get(textChannelId);
  },

  getActiveTempChannels(guildId) {
    if (guildId) {
      return db.prepare('SELECT * FROM temp_channels WHERE guild_id = ? ORDER BY id DESC').all(guildId);
    }
    return db.prepare('SELECT * FROM temp_channels ORDER BY id DESC').all();
  },

  updateTempChannelState(id, updates) {
    const fields = [];
    const values = [];
    for (const [k, v] of Object.entries(updates)) {
      fields.push(`${k} = ?`);
      values.push(v);
    }
    if (fields.length === 0) return;
    values.push(id);
    db.prepare(`UPDATE temp_channels SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  },

  deleteTempChannelRecord(id) {
    return db.prepare('DELETE FROM temp_channels WHERE id = ?').run(id);
  },

  deleteTempChannelByChannelId(channelId) {
    return db.prepare('DELETE FROM temp_channels WHERE voice_channel_id = ? OR text_channel_id = ?').run(channelId, channelId);
  },

  // ============================================================
  // STOPWATCHES (CRONOMETRO DIGITALE)
  // ============================================================
  createStopwatch(data) {
    const stmt = db.prepare(`
      INSERT INTO stopwatches (
        guild_id, channel_id, message_id, title, custom_text,
        start_offset_seconds, start_time, paused_at, total_paused_seconds,
        status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      data.guild_id,
      data.channel_id,
      data.message_id,
      data.title || '⏱️ Cronometro Live',
      data.custom_text || null,
      Number(data.start_offset_seconds || 0),
      data.start_time || now,
      data.paused_at || null,
      Number(data.total_paused_seconds || 0),
      data.status || 'running',
      data.created_by || null,
      now
    );
    return res.lastInsertRowid;
  },

  getStopwatch(id) {
    return db.prepare('SELECT * FROM stopwatches WHERE id = ?').get(id);
  },

  getStopwatchByMessage(messageId) {
    return db.prepare('SELECT * FROM stopwatches WHERE message_id = ?').get(messageId);
  },

  getActiveStopwatches(guildId = null) {
    if (guildId) {
      return db.prepare("SELECT * FROM stopwatches WHERE guild_id = ? AND status != 'stopped' ORDER BY id DESC").all(guildId);
    }
    return db.prepare("SELECT * FROM stopwatches WHERE status != 'stopped' ORDER BY id DESC").all();
  },

  getActiveStopwatchByChannel(guildId, channelId) {
    return db.prepare("SELECT * FROM stopwatches WHERE guild_id = ? AND channel_id = ? AND status != 'stopped' ORDER BY id DESC LIMIT 1").get(guildId, channelId);
  },

  updateStopwatch(id, updates) {
    const fields = [];
    const values = [];
    for (const [k, v] of Object.entries(updates)) {
      fields.push(`${k} = ?`);
      values.push(v);
    }
    if (fields.length === 0) return;
    values.push(id);
    db.prepare(`UPDATE stopwatches SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getStopwatch(id);
  },

  deleteStopwatch(id) {
    return db.prepare('DELETE FROM stopwatches WHERE id = ?').run(id);
  },

  // ============================================================
  // WEBHOOK & BOT MESSAGE REPLACER CHANNELS
  // ============================================================
  getWebhookReplacerChannels(guildId) {
    return db.prepare('SELECT * FROM webhook_replacer_channels WHERE guild_id = ?').all(guildId);
  },

  isWebhookReplacerChannel(guildId, channelId) {
    const row = db.prepare('SELECT * FROM webhook_replacer_channels WHERE guild_id = ? AND channel_id = ? AND enabled = 1').get(guildId, channelId);
    return Boolean(row);
  },

  setWebhookReplacerChannel(guildId, channelId, enabled = 1, preserveAuthor = 1) {
    const existing = db.prepare('SELECT * FROM webhook_replacer_channels WHERE guild_id = ? AND channel_id = ?').get(guildId, channelId);
    if (existing) {
      db.prepare('UPDATE webhook_replacer_channels SET enabled = ?, preserve_author = ? WHERE guild_id = ? AND channel_id = ?')
        .run(enabled ? 1 : 0, preserveAuthor ? 1 : 0, guildId, channelId);
    } else {
      db.prepare('INSERT INTO webhook_replacer_channels (guild_id, channel_id, enabled, preserve_author) VALUES (?, ?, ?, ?)')
        .run(guildId, channelId, enabled ? 1 : 0, preserveAuthor ? 1 : 0);
    }
    return db.prepare('SELECT * FROM webhook_replacer_channels WHERE guild_id = ? AND channel_id = ?').get(guildId, channelId);
  },

  removeWebhookReplacerChannel(guildId, channelId) {
    return db.prepare('DELETE FROM webhook_replacer_channels WHERE guild_id = ? AND channel_id = ?').run(guildId, channelId);
  },

  // ============================================================
  // CAPTCHA VERIFICATION SYSTEM
  // ============================================================
  getVerificationConfig(guildId) {
    let row = db.prepare('SELECT * FROM verification_configs WHERE guild_id = ?').get(guildId);
    if (!row) {
      db.prepare(`
        INSERT INTO verification_configs (guild_id, enabled, panel_title, panel_description)
        VALUES (?, 1, '🛡️ Portale di Verifica • Sentry', 'Benvenuto nel server! Clicca sul pulsante sottostante per avviare la verifica con Captcha visivo e sbloccare tutti i canali.')
      `).run(guildId);
      row = db.prepare('SELECT * FROM verification_configs WHERE guild_id = ?').get(guildId);
    }
    return row;
  },

  setVerificationConfig(guildId, data) {
    this.getVerificationConfig(guildId);
    const fields = [];
    const values = [];
    for (const [k, v] of Object.entries(data)) {
      fields.push(`${k} = ?`);
      values.push(v);
    }
    if (fields.length === 0) return this.getVerificationConfig(guildId);
    values.push(guildId);
    db.prepare(`UPDATE verification_configs SET ${fields.join(', ')} WHERE guild_id = ?`).run(...values);
    return this.getVerificationConfig(guildId);
  },

  // ============================================================
  // WISPBYTE PERSISTENCE & AUTO-BACKUP SYSTEM
  // ============================================================
  flushToDisk() {
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      return true;
    } catch (e) {
      console.warn('[Database] WAL Checkpoint flush warning:', e.message);
      return false;
    }
  },

  createBackup(tag = 'auto') {
    try {
      const backupsDir = path.join(dbDir, 'backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }

      this.flushToDisk();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(backupsDir, `cavaliere_backup_${tag}_${timestamp}.db`);

      db.exec(`VACUUM INTO '${backupFile}';`);
      console.log(`[Database Backup] Snapshot creato con successo in: ${backupFile}`);

      // Keep only the 5 most recent backups
      try {
        const files = fs.readdirSync(backupsDir)
          .filter(f => f.startsWith('cavaliere_backup_') && f.endsWith('.db'))
          .map(f => ({ name: f, path: path.join(backupsDir, f), mtime: fs.statSync(path.join(backupsDir, f)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime);

        if (files.length > 5) {
          files.slice(5).forEach(f => {
            try { fs.unlinkSync(f.path); } catch (e) {}
          });
        }
      } catch (e) {}

      return backupFile;
    } catch (err) {
      console.error('[Database Backup Error]:', err.message);
      return null;
    }
  },

  getLatestBackup() {
    const backupsDir = path.join(dbDir, 'backups');
    if (!fs.existsSync(backupsDir)) return null;
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.startsWith('cavaliere_backup_') && f.endsWith('.db'))
      .map(f => ({ name: f, path: path.join(backupsDir, f), mtime: fs.statSync(path.join(backupsDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return files[0] ? files[0].path : null;
  },

  exportGuildConfig(guildId) {
    return {
      guild_id: guildId,
      exported_at: Date.now(),
      version: '2.0',
      settings: this.getGuildSettings(guildId),
      ai: this.getAIConfig(guildId),
      welcomer: this.getWelcomerConfig(guildId),
      partnerships: this.getPartnershipConfig(guildId),
      automod: this.getAutomodConfig(guildId),
      leveling: this.getLevelConfig(guildId),
      counting: this.getCountingConfig(guildId),
      presentations: this.getPresentationConfig(guildId),
      setups: this.getSetupShowcaseConfig(guildId),
      temp_channels: this.getTempChannelConfig(guildId),
      autoresponders: this.getAutoresponders(guildId),
      reaction_roles: this.getReactionRoles(guildId)
    };
  },

  importGuildConfig(guildId, config) {
    if (!config || typeof config !== 'object') throw new Error('Configurazione non valida');

    if (config.settings) this.updateGuildSettings(guildId, config.settings);
    if (config.ai) this.updateAIConfig(guildId, config.ai);
    if (config.welcomer) this.updateWelcomerConfig(guildId, config.welcomer);
    if (config.partnerships) this.updatePartnershipConfig(guildId, config.partnerships);
    if (config.automod) this.updateAutomodConfig(guildId, config.automod);
    if (config.leveling) this.updateLevelConfig(guildId, config.leveling);
    if (config.counting) this.saveCountingConfig(guildId, config.counting);
    if (config.presentations) this.updatePresentationConfig(guildId, config.presentations);
    if (config.setups) this.updateSetupShowcaseConfig(guildId, config.setups);
    if (config.temp_channels) this.updateTempChannelConfig(guildId, config.temp_channels);

    this.flushToDisk();
    return true;
  }
};

// Periodic Background Flush & Snapshot (every 60 seconds flush, every 6 hours snapshot)
setInterval(() => {
  DatabaseHelper.flushToDisk();
}, 60000);

setInterval(() => {
  DatabaseHelper.createBackup('periodic');
}, 6 * 3600 * 1000);

export default DatabaseHelper;

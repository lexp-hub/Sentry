export const SCHEMA = `

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  prefix TEXT DEFAULT '!',
  language TEXT DEFAULT 'it',
  log_channel_id TEXT,
  mute_role_id TEXT,
  auto_role_user TEXT,
  auto_role_bot TEXT,
  modules_enabled TEXT DEFAULT '{"partnerships":true,"embeds":true,"reaction_roles":true,"welcomer":true,"autoresponder":true,"moderation":true,"tickets":true,"giveaways":true,"leveling":true,"starboard":true,"ai":true}'
);


CREATE TABLE IF NOT EXISTS ai_configs (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 1,
  model TEXT DEFAULT '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  system_prompt TEXT,
  web_search_enabled INTEGER DEFAULT 1,
  max_chars INTEGER DEFAULT 300,
  channels_whitelist TEXT DEFAULT '[]',
  roles_whitelist TEXT DEFAULT '[]',
  daily_limit INTEGER DEFAULT 100,
  warning_threshold INTEGER DEFAULT 80,
  daily_requests INTEGER DEFAULT 0,
  last_reset_date TEXT,
  warning_channel_id TEXT
);

CREATE TABLE IF NOT EXISTS ai_channel_memories (
  channel_id TEXT PRIMARY KEY,
  reset_timestamp INTEGER DEFAULT 0,
  logs TEXT DEFAULT '[]'
);


CREATE TABLE IF NOT EXISTS partnership_configs (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT,
  ping_role_id TEXT,
  min_members INTEGER DEFAULT 0,
  cooldown_minutes INTEGER DEFAULT 60,
  embed_template TEXT,
  log_channel_id TEXT,
  enabled INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS partnerships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  partner_guild_id TEXT,
  partner_name TEXT,
  invite_url TEXT,
  rep_user_id TEXT,
  partner_count INTEGER DEFAULT 0,
  timestamp INTEGER DEFAULT (strftime('%s', 'now')),
  notes TEXT
);


CREATE TABLE IF NOT EXISTS embed_templates (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_by TEXT,
  embed_data TEXT NOT NULL,
  components_data TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);


CREATE TABLE IF NOT EXISTS reaction_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  type TEXT DEFAULT 'BUTTON', 
  role_id TEXT NOT NULL,
  emoji TEXT,
  label TEXT,
  style TEXT DEFAULT 'SECONDARY',
  group_name TEXT DEFAULT 'default'
);


CREATE TABLE IF NOT EXISTS welcomer_configs (
  guild_id TEXT PRIMARY KEY,
  welcome_enabled INTEGER DEFAULT 0,
  welcome_channel_id TEXT,
  welcome_message TEXT DEFAULT 'Benvenuto {user.mention} in **{server.name}**! Siamo ora in **{server.memberCount}**!',
  welcome_embed TEXT,
  welcome_dm_enabled INTEGER DEFAULT 0,
  welcome_dm_message TEXT DEFAULT 'Benvenuto in {server.name}!',
  leave_enabled INTEGER DEFAULT 0,
  leave_channel_id TEXT,
  leave_message TEXT DEFAULT '{user.tag} ha lasciato il server. Siamo rimasti in {server.memberCount}.',
  leave_embed TEXT,
  card_enabled INTEGER DEFAULT 1,
  card_bg_color TEXT DEFAULT '#1e1b4b',
  auto_role_user TEXT,
  auto_role_bot TEXT
);


CREATE TABLE IF NOT EXISTS boost_configs (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 1,
  channel_id TEXT,
  message TEXT DEFAULT 'Grazie per il boost {user.mention}! 🚀',
  embed TEXT
);


CREATE TABLE IF NOT EXISTS autoresponders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  match_type TEXT DEFAULT 'CONTAINS',
  response_text TEXT,
  response_embed TEXT,
  auto_reactions TEXT DEFAULT '[]',
  channels_whitelist TEXT DEFAULT '[]',
  roles_whitelist TEXT DEFAULT '[]',
  enabled INTEGER DEFAULT 1
);


CREATE TABLE IF NOT EXISTS autoreaction_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  emojis TEXT NOT NULL DEFAULT '["👍","👎"]',
  enabled INTEGER DEFAULT 1
);


CREATE TABLE IF NOT EXISTS starboards (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT,
  emoji TEXT DEFAULT '⭐',
  min_stars INTEGER DEFAULT 3,
  enabled INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS starboard_messages (
  guild_id TEXT NOT NULL,
  original_message_id TEXT NOT NULL,
  starboard_message_id TEXT NOT NULL,
  star_count INTEGER DEFAULT 0,
  PRIMARY KEY (guild_id, original_message_id)
);


CREATE TABLE IF NOT EXISTS automod_configs (
  guild_id TEXT PRIMARY KEY,
  anti_invite INTEGER DEFAULT 1,
  anti_link INTEGER DEFAULT 0,
  anti_spam INTEGER DEFAULT 1,
  anti_caps INTEGER DEFAULT 0,
  anti_stickers INTEGER DEFAULT 0,
  youtube_whitelist_channels TEXT DEFAULT '[]',
  stickers_whitelist_channels TEXT DEFAULT '[]',
  max_mentions INTEGER DEFAULT 5,
  bad_words TEXT DEFAULT '[]',
  ignored_channels TEXT DEFAULT '[]',
  ignored_roles TEXT DEFAULT '[]',
  action TEXT DEFAULT 'DELETE'
);

CREATE TABLE IF NOT EXISTS moderation_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  reason TEXT DEFAULT 'Nessun motivo specificato',
  duration INTEGER DEFAULT 0,
  timestamp INTEGER DEFAULT (strftime('%s', 'now'))
);


CREATE TABLE IF NOT EXISTS ticket_panels (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT,
  message_id TEXT,
  title TEXT DEFAULT 'Crea un Ticket',
  description TEXT DEFAULT 'Clicca sul pulsante sottostante per aprire un ticket di supporto.',
  color TEXT DEFAULT '#ea580c',
  image TEXT,
  footer TEXT,
  button_style TEXT DEFAULT 'Primary',
  category_id TEXT,
  button_label TEXT DEFAULT 'Apri Ticket',
  button_emoji TEXT DEFAULT '📩',
  support_role_id TEXT,
  welcome_message TEXT DEFAULT 'Benvenuto {user.mention}! Lo staff ti risponderà a breve.',
  naming_scheme TEXT DEFAULT 'ticket-{user}',
  log_channel_id TEXT
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  panel_id TEXT,
  status TEXT DEFAULT 'OPEN',
  claimed_by TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  closed_at INTEGER,
  transcript_text TEXT
);


CREATE TABLE IF NOT EXISTS giveaways (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  prize TEXT NOT NULL,
  winner_count INTEGER DEFAULT 1,
  end_time INTEGER NOT NULL,
  host_id TEXT NOT NULL,
  winners TEXT DEFAULT '[]',
  ended INTEGER DEFAULT 0
);


CREATE TABLE IF NOT EXISTS level_configs (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 1,
  xp_rate REAL DEFAULT 1.0,
  channel_id TEXT,
  dm_notifications INTEGER DEFAULT 0,
  coins_per_level INTEGER DEFAULT 100
);

CREATE TABLE IF NOT EXISTS levels (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  last_message_time INTEGER DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS level_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  role_id TEXT NOT NULL
);


CREATE TABLE IF NOT EXISTS emoji_stats (
  guild_id TEXT NOT NULL,
  emoji_id TEXT NOT NULL,
  emoji_name TEXT NOT NULL,
  is_animated INTEGER DEFAULT 0,
  use_count INTEGER DEFAULT 0,
  last_used INTEGER DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (guild_id, emoji_id)
);


CREATE TABLE IF NOT EXISTS counting_configs (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT,
  current_number INTEGER DEFAULT 0,
  last_user_id TEXT,
  highest_streak INTEGER DEFAULT 0,
  allow_ruin_reset INTEGER DEFAULT 0,
  allow_consecutive INTEGER DEFAULT 1,
  zen_mode INTEGER DEFAULT 1,
  enabled INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS counting_scores (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  counts INTEGER DEFAULT 0,
  correct_counts INTEGER DEFAULT 0,
  ruined_counts INTEGER DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);


CREATE TABLE IF NOT EXISTS fishing_profiles (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rod_level INTEGER DEFAULT 1,
  coins INTEGER DEFAULT 100,
  total_fish_caught INTEGER DEFAULT 0,
  last_fished INTEGER DEFAULT 0,
  last_daily INTEGER DEFAULT 0,
  inventory TEXT DEFAULT '[]',
  PRIMARY KEY (guild_id, user_id)
);


CREATE TABLE IF NOT EXISTS rpg_duels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  challenger_id TEXT NOT NULL,
  opponent_id TEXT NOT NULL,
  bet_coins INTEGER DEFAULT 0,
  winner_id TEXT,
  timestamp INTEGER DEFAULT (strftime('%s', 'now'))
);


CREATE TABLE IF NOT EXISTS ticket_automations (
  guild_id TEXT PRIMARY KEY,
  auto_close_hours INTEGER DEFAULT 48,
  auto_transcript_dm INTEGER DEFAULT 1,
  auto_tag_staff INTEGER DEFAULT 1,
  inactivity_warning_hours INTEGER DEFAULT 24
);

-- ============================================================
-- PRESENTATIONS / PRESENTAZIONI COMMUNITY MODULE
-- ============================================================
CREATE TABLE IF NOT EXISTS presentation_configs (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT,
  reward_role_id TEXT,
  xp_reward INTEGER DEFAULT 100,
  title TEXT DEFAULT '📜 Presentazione del Cavaliere',
  color TEXT DEFAULT '#6366f1',
  enabled INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS presentations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  age_pronouns TEXT,
  hobbies TEXT NOT NULL,
  bio TEXT NOT NULL,
  social_media TEXT,
  message_id TEXT,
  timestamp INTEGER DEFAULT (strftime('%s', 'now'))
);

-- ============================================================
-- SETUP SHOWCASE / POSTAZIONI MODULE
-- ============================================================
CREATE TABLE IF NOT EXISTS setup_showcase_configs (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT,
  title TEXT DEFAULT '🖥️ Setup & Postazione',
  color TEXT DEFAULT '#dc2626',
  auto_reactions TEXT DEFAULT '["🔥","⭐","❤️"]',
  auto_thread INTEGER DEFAULT 1,
  reward_role_id TEXT,
  xp_reward INTEGER DEFAULT 50,
  require_text INTEGER DEFAULT 0,
  delete_invalid INTEGER DEFAULT 1,
  enabled INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS setup_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  description TEXT,
  embed_message_id TEXT,
  timestamp INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token TEXT PRIMARY KEY,
  user_data TEXT,
  access_token TEXT,
  created_at INTEGER
);

-- ============================================================
-- FISHING & MINIGAMES CONFIGS
-- ============================================================
CREATE TABLE IF NOT EXISTS fishing_configs (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT,
  cooldown_seconds INTEGER DEFAULT 15,
  title TEXT DEFAULT '🎣 Pesca Medievale dei Cavalieri',
  color TEXT DEFAULT '#38bdf8',
  enabled INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS minigames_configs (
  guild_id TEXT PRIMARY KEY,
  general_channel_id TEXT,
  blackjack_channel_id TEXT,
  slots_channel_id TEXT,
  dice_channel_id TEXT,
  max_bet INTEGER DEFAULT 5000,
  min_bet INTEGER DEFAULT 10,
  daily_reward INTEGER DEFAULT 150,
  enabled INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS minigame_stats (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  game_type TEXT NOT NULL,
  games_played INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  total_won_coins INTEGER DEFAULT 0,
  total_lost_coins INTEGER DEFAULT 0,
  highest_win INTEGER DEFAULT 0,
  PRIMARY KEY (guild_id, user_id, game_type)
);

-- ============================================================
-- PRIVATE & TEMPORARY CHANNELS (VOICE & TEXT)
-- ============================================================
CREATE TABLE IF NOT EXISTS temp_channel_configs (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 1,
  voice_generator_id TEXT,
  category_id TEXT,
  panel_channel_id TEXT,
  default_user_limit INTEGER DEFAULT 0,
  default_bitrate INTEGER DEFAULT 64000,
  naming_scheme_voice TEXT DEFAULT '🔊 Stanza di {user}',
  naming_scheme_text TEXT DEFAULT '💬 chat-{user}',
  auto_delete_delay INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS temp_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  voice_channel_id TEXT,
  text_channel_id TEXT,
  is_locked INTEGER DEFAULT 0,
  is_hidden INTEGER DEFAULT 0,
  user_limit INTEGER DEFAULT 0,
  created_at INTEGER
);

-- ============================================================
-- LIVE DIGITAL STOPWATCHES (CRONOMETRI LIVE HH:MM:SS)
-- ============================================================
CREATE TABLE IF NOT EXISTS stopwatches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  title TEXT DEFAULT '⏱️ Cronometro Live',
  custom_text TEXT,
  start_offset_seconds INTEGER DEFAULT 0,
  start_time INTEGER NOT NULL,
  paused_at INTEGER,
  total_paused_seconds INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running',
  created_by TEXT,
  created_at INTEGER
);

-- ============================================================
-- WEBHOOK & BOT MESSAGE REPLACER (IMAGE PRESERVATION & EMBED REPOST)
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_replacer_channels (
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  preserve_author INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (guild_id, channel_id)
);

-- ============================================================
-- CAPTCHA VERIFICATION SYSTEM
-- ============================================================
CREATE TABLE IF NOT EXISTS verification_configs (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 1,
  verified_role_id TEXT,
  unverified_role_id TEXT,
  panel_channel_id TEXT,
  log_channel_id TEXT,
  panel_title TEXT DEFAULT '🛡️ Portale di Verifica • Sentry',
  panel_description TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- ============================================================
-- AFK STATUS SYSTEM (ASSENZA / INATTIVITÀ UTENTI)
-- ============================================================
CREATE TABLE IF NOT EXISTS afk_users (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reason TEXT DEFAULT 'Attualmente assente',
  timestamp INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);
`;

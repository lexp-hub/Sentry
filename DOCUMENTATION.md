# SENTRY — ARCHITECTURE & TECHNICAL DOCUMENTATION
# Modular Discord security, moderation bot & standalone dark monospace dashboard.

================================================================================
TABLE OF CONTENTS
================================================================================
1. Architecture Overview
2. Core Modules & Subsystems
3. AutoMod & Enforcement Engine
4. Live Embed Builder & Markdown Engine
5. Web Dashboard & Real-Time Sync
6. Slash Commands Reference
7. REST API Endpoints
8. Deployment & Environment Variables

================================================================================
1. ARCHITECTURE OVERVIEW
================================================================================
Sentry is structured as a dual-runtime application:
- Discord Gateway Client: Powered by discord.js v14, handling events, interactions,
  moderation enforcement, and voice connections.
- Dashboard HTTP Server: Native Express.js service providing OAuth2 authentication,
  REST APIs for server configuration, and a WebSocket layer for multi-tab live sync.
- Data Layer: Embedded SQLite with WAL (Write-Ahead Logging) for local deterministic
  performance, with optional background synchronization to external MySQL instances.

================================================================================
2. CORE MODULES & SUBSYSTEMS
================================================================================
- AutoMod: Real-time message inspection for invites, unauthorized links, excessive
  caps, spam bursts, and forbidden word triggers.
- Partnerships: Automated modal application form, invite resolver to verify member
  thresholds, and staff manager leaderboard tracking.
- Live Embed Builder: Column-based visual layout generator (1, 2, or 3 columns),
  variable interpolation, and draft persistence.
- Welcomer & Auto-Role: Customizable welcome embeds, direct message greetings,
  and role provisioning on member join.
- Ticket System: On-demand private support channels, role permissions, and transcript
  generation.
- Neural AI: Integration with Llama 3.3 70B (via Cloudflare Workers AI) and Google Gemini
  for contextual chat, web search, and administrative queries.
- Community Subsystems: Voice room temporary channels, reaction roles, starboard,
  XP leveling, and minigames (counting, blackjack, duels, slots).

================================================================================
3. AUTOMOD & ENFORCEMENT ENGINE
================================================================================
The AutoMod engine processes incoming messages through sequential rule filters:
1. Anti-Invite: Regular expression matching against discord.gg, discord.com/invite.
2. Anti-Link: Whitelist-aware domain filtering with channel-specific exceptions (e.g. YouTube).
3. Anti-Spam: Leaky bucket rate limiter per user/channel.
4. Anti-Caps: Percentage-based uppercase threshold verification.
5. Anti-Stickers: Rejection of sticker attachments outside designated channels.
6. Forbidden Words: Substring and regex dictionary matching.

Violations trigger immediate message removal, an ephemeral warning to the offender,
and structured event logging in the designated audit channel.

================================================================================
4. LIVE EMBED BUILDER & MARKDOWN ENGINE
================================================================================
The dashboard includes an on-device preview parser for Discord markdown:
- Supported formatting: Bold (**), Italic (*), Strikethrough (~~), Inline code (`),
  code blocks (```), blockquotes (>), and masked hyperlinks.
- Mentions: Dynamic resolution of channels (<#id>), roles (<@&id>), and users (<@id>).
- Layout: Up to 25 embed fields with inline flag support for 2-column or 3-column rows.
- Performance: Input event listeners utilize requestAnimationFrame debouncing to prevent
  DOM recalculation freezes during live typing.

================================================================================
5. WEB DASHBOARD & REAL-TIME SYNC
================================================================================
- Design System: Monospace theme using JetBrains Mono, dark surfaces (#0c0d12, #13151c),
  and emerald accent (#10b981).
- Authentication: Discord OAuth2 with localStorage token persistence compatible with
  strict tracking protection and privacy browsers.
- WebSocket Sync: When settings are updated from any tab or operator, an update event
  is broadcast to connected clients to refresh active views without full page reloads.

================================================================================
6. SLASH COMMANDS REFERENCE
================================================================================
Moderation:
- /ban <user> [reason] [days]       : Ban a user from the guild
- /kick <user> [reason]              : Kick a user from the guild
- /timeout <user> <duration> [reason]: Apply a timeout to a user
- /warn <user> <reason>              : Record a formal infraction warning
- /warnings <user>                   : View past warnings for a user
- /clear <count>                     : Bulk delete messages
- /nuke                              : Recreate the current channel to purge history
- /slowmode <seconds>                : Adjust channel rate limit

AI:
- /ai ask <prompt>                   : Query the neural model
- /ai search <query>                 : Query with live web search results
- /ai reset                          : Clear conversation context for the channel

Management:
- /partnership                       : Open partnership registration modal
- /partner config                    : Configure partnership criteria and log channels
- /embed                             : Send a formatted announcement embed
- /reactionrole button               : Deploy a persistent button role panel
- /welcomer config                   : Set welcome channel and embed parameters
- /ticket panel                      : Deploy a support ticket opening panel

================================================================================
7. REST API ENDPOINTS
================================================================================
Authentication:
- GET  /auth/login                   : Redirect to Discord OAuth2
- GET  /auth/discord/callback        : OAuth2 authorization code handler
- GET  /auth/me                      : Current authenticated user session
- GET  /auth/logout                  : Invalidate session

Guild Operations:
- GET  /api/guilds                   : List accessible administrator/moderator guilds
- GET  /api/guilds/:guildId          : Guild details, channels, roles, and settings
- POST /api/guilds/:guildId/settings : Update general guild configuration & module flags

Module Configuration:
- GET  /api/guilds/:guildId/automod  : Retrieve AutoMod parameters
- POST /api/guilds/:guildId/automod  : Update AutoMod rules & whitelists
- GET  /api/guilds/:guildId/embeds   : List saved embed templates
- POST /api/guilds/:guildId/embeds   : Create or update an embed template
- POST /api/guilds/:guildId/embeds/send: Dispatch an embed to a Discord channel
- GET  /api/guilds/:guildId/partnerships: Partnership statistics and logs
- POST /api/guilds/:guildId/partnerships/config: Save partnership requirements

================================================================================
8. DEPLOYMENT & ENVIRONMENT VARIABLES
================================================================================
Required configuration variables in .env:

DISCORD_BOT_TOKEN       : Bot token obtained from the Discord Developer Portal
DISCORD_CLIENT_ID       : Application Client ID
DISCORD_CLIENT_SECRET   : OAuth2 Client Secret
CREATOR_ID              : Discord user ID of the primary administrator
PORT                    : HTTP server port (default: 9272)
DASHBOARD_URL           : Base public URL of the dashboard
OAUTH2_CALLBACK_URL     : Configured OAuth2 redirect URI in Discord Developer Portal
SESSION_SECRET          : Secret string used to sign session cookies
DB_PATH                 : Path to local SQLite database file

Optional AI & sync variables:
CLOUDFLARE_ACCOUNT_ID   : Cloudflare account ID for Workers AI
CLOUDFLARE_API_TOKEN    : API token with Workers AI read/write permissions
CLOUDFLARE_MODEL        : Model slug (default: @cf/meta/llama-3.3-70b-instruct-fp8-fast)
MYSQL_ENABLED           : Set true to enable background MySQL replication
MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE: MySQL connection parameters

Start locally:
$ npm install
$ node src/index.js

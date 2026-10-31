# SENTRY (YAPIN EDITION) — ARCHITECTURE & TECHNICAL DOCUMENTATION
# Modular Yapin security, moderation bot & community management engine.

================================================================================
TABLE OF CONTENTS
================================================================================
1. Architecture Overview
2. Core Modules & Subsystems
3. Yapin SDK & Gateway Runtime
4. AutoMod & Enforcement Engine
5. Dedicated Auto-Role & Welcomer Engine
6. Commands Reference
7. REST API Endpoints & Gateway Events
8. Deployment & Environment Variables

================================================================================
1. ARCHITECTURE OVERVIEW
================================================================================
Sentry for Yapin is built on the official zero-dependency Yapin SDK (`yapper.js`):
- Long-Polling & Gateway Client: Directly connects to the Yapin API infrastructure,
  fetching live server events (messages, member joins/leaves, interactions) with
  automatic backoff retry and jitter handling.
- Command Dispatcher: Handles native command registration with metadata, descriptions,
  and contextual execution callbacks (`ctx.reply`, `ctx.message`).
- Modular Subsystems: Decoupled business logic allowing seamless porting of Sentry's
  core features (Auto-Role, AutoMod, Welcomer, Server Analytics).
- Shared Data Layer: Compatible with Sentry's SQLite WAL database and web dashboard
  for unified server management.

================================================================================
2. CORE MODULES & SUBSYSTEMS
================================================================================
- AutoMod: Real-time message inspection for unauthorized server invites, spam
  bursts, and forbidden keyword triggers.
- Dedicated Auto-Role: Independent role provisioning engine supporting human
  members and invited bots, with configurable assignment delays.
- Welcomer System: Automated channel greetings, leave notifications, and custom
  embed announcements on member entry.
- Server Management: Detailed server telemetry, channel queries, role hierarchy
  inspection, and member count tracking.
- Interactive Components: Support for Yapin rich embeds, action rows, and buttons
  (`IS_COMPONENTS_V2`).

================================================================================
3. YAPIN SDK & GATEWAY RUNTIME
================================================================================
The bot operates using the standalone `yapper.js` engine:
- Event Loop: Continuous long-polling via `/events?after=<seq>&wait=25` with 45s
  timeout protection.
- State Persistence: Tracks incoming sequence markers (`this.last`) to guarantee
  zero dropped events during momentary network interruptions.
- Rate Limiting: Automatic exponential backoff (1s, 2s, 4s... up to 30s) on API
  rate limits and transient 5xx errors.
- Self-Hosting: Runs directly on standard Node.js (18+) environments without
  requiring reverse proxies or open inbound ports.

================================================================================
4. AUTOMOD & ENFORCEMENT ENGINE
================================================================================
The Yapin AutoMod engine evaluates messages through sequential filters:
1. Anti-Invite: Pattern detection matching external server invite codes.
2. Anti-Spam: Rate limiter tracking rapid consecutive messages per user.
3. Keyword Blacklist: Substring and regex dictionary matching for prohibited terms.

Enforcement actions:
- Immediate message deletion (`bot.delete(channelId, messageId)`).
- Member kick (`bot.kick(serverId, userId)`).
- Member ban (`bot.ban(serverId, userId)`).
- Timed disciplinary mute (`bot.timeout(serverId, userId, minutes)`).

================================================================================
5. DEDICATED AUTO-ROLE & WELCOMER ENGINE
================================================================================
Auto-Role Architecture:
- Dispatched independently upon receiving `member_join` gateway payloads.
- Role Hierarchy Check: Verifies bot role position before attempting role assignment
  to prevent unprivileged assignment failures.
- Human vs. Bot Segregation: Configures separate target role IDs for human users
  and external bot accounts.
- Configurable Delay: Implements optional delayed assignment (0-300 seconds) to
  mitigate rapid spam or automated raid attempts.

Welcomer Architecture:
- Channel Detection: Automatically identifies designated system or text channels
  (`bot.channels(serverId, { type: 'text' })`).
- Visual Cards: Dispatches structured `Embed` objects containing member tags,
  avatar references, and total guild counts.

================================================================================
6. COMMANDS REFERENCE
================================================================================
General & Utility:
- !ping                              : Check Sentry latency and gateway responsiveness
- !help                              : Display the list of available commands and modules
- !serverinfo                        : Display server metadata, channel count, and stats

Moderation:
- !kick <user_id>                    : Kick a member from the current server
- !ban <user_id>                     : Ban a member from the current server

Automated Event Triggers:
- hi bot / hello sentry              : Automated greeting response trigger

================================================================================
7. REST API ENDPOINTS & GATEWAY EVENTS
================================================================================
Gateway Events Handled:
- READY                              : Bot session initialized, cached `me` user object
- message                            : New message published in a subscribed channel
- member_join                        : New member entered the server (triggers Welcomer/Autorole)
- member_leave                       : Member departed or was removed from the server

Yapin REST Endpoints:
- GET    /me                         : Current authenticated bot identity
- GET    /servers                    : List of servers where the bot is installed
- GET    /servers/:id                : Fetch specific server metadata
- GET    /servers/:id/channels       : Fetch all channels and categories
- POST   /channels/:id/messages      : Dispatch text, embeds, or interactive buttons
- DELETE /channels/:id/messages/:id  : Delete a targeted message
- POST   /servers/:id/kick           : Kick a member from the server
- POST   /servers/:id/bans           : Ban a user ID from the server
- PUT    /servers/:id/members/:uid/roles/:rid : Assign a role to a member

================================================================================
8. DEPLOYMENT & ENVIRONMENT VARIABLES
================================================================================
Required configuration variables in `yapin/.env`:

YAPPER_BOT_TOKEN : Bot token obtained from Yapin (Settings -> Developer)
DEFAULT_PREFIX   : Command trigger prefix (default: '!')

Start locally:
$ cd yapin
$ npm install
$ npm start

Development mode (auto-reload on code change):
$ npm run dev


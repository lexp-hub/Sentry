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
All commands support both `/` slash command format and `!` / `sentry ` prefix format.

General & Diagnostics:
- /ping                              : Check Sentry latency and WebSocket responsiveness
- /help                              : Display interactive command center and categories
- /botinfo                           : Technical metrics (RAM, Node.js, Host OS, Uptime)
- /serverinfo                        : Server metadata, member counts, and statistics
- /userinfo [@user|id]               : Inspect user profile, account type and avatar
- /roles                             : List all configured roles in the realm
- /channels                          : List all text and voice channels in the realm
- /bridge                            : Cross-Platform Discord <-> Yapin bridge status

Realm Insights (Yapin Exclusive):
- /livecount                         : Real-time online/total member ratio in the Realm
- /realm                             : Complete Realm Hub overview (channels, E2EE voice, population)

Moderation & AutoMod:
- /kick <user_id> [reason]           : Kick a member from the server
- /ban <user_id> [reason]            : Ban a member permanently
- /unban <user_id>                   : Remove a ban for a member
- /timeout <user_id> <min> [reason]  : Mute/timeout a member (0 min to remove)
- /warn <user_id> [reason]           : Issue an official disciplinary warning
- /clear <1-50>                      : Bulk purge messages in the channel
- /say <text>                        : Broadcast an announcement through Sentry

Economy & Yapin Shards:
- /balance (or /bal)                 : Check wallet coins and exclusive Yapin Shards
- /daily                             : Claim daily coin rewards and crystal bonuses
- /pay <@user> <amount>              : Transfer coins to another member

Minigames & Casino:
- /fish                              : Cast fishing rod for 16 fish types and sunken chests
- /inventory (or /inv)               : View rod tier, caught fish and statistics
- /upgrade-rod                       : Forge a higher tier rod (up to Mythic Rod)
- /blackjack <bet> (or /bj)          : Play 21 with interactive [Hit] and [Stand] buttons
- /coinflip <heads|tails> [bet]      : Flip a coin with optional coin wagering
- /dice [sides]                      : Roll a customizable die (default 6 sides)
- /count <number>                    : Counting game in designated channel

Leveling & XP:
- /rank [@user]                      : Check level card with ASCII progress bar
- /leaderboard (or /top)             : Top 10 ranked users in the server

Artificial Intelligence:
- /ai <question>                     : Query Llama 3.3 70B neural model
- @Sentry <question>                 : Mention Sentry in any channel for AI response

================================================================================
7. UNIVERSAL DASHBOARD & AUTHENTICATION
================================================================================
The Sentry dashboard at https://sentry.wispbyte.app provides a universal bridge:
- Instagram-Style Profile Switcher: Easily switch between Discord and Yapin servers.
- Yapin OAuth2 & Direct ID Sign-In: Authenticate with Yapin credentials or user ID.
- Permission Verification: Only realm owners or administrators can configure settings.
- Real-Time Synchronization: Updates configured on the dashboard take effect immediately.

================================================================================
8. DEPLOYMENT & ENVIRONMENT VARIABLES
================================================================================
Required configuration variables in `.env`:
- YAPPER_BOT_TOKEN                   : Bot token starting with yb_...
- YAPIN_CLIENT_ID                    : OAuth2 Client ID from Yapin Developer settings
- YAPIN_CLIENT_SECRET                : OAuth2 Client Secret
- YAPIN_REDIRECT_URI                 : https://sentry.wispbyte.app/auth/yapin/callback
- DISCORD_TOKEN                      : Token for Discord bot instance
- CLOUDFLARE_API_KEY & ACCOUNT_ID    : Workers AI neural assistant credentials

Start locally:
$ npm start               # Starts Discord bot & Dashboard
$ cd yapin && npm start   # Starts Yapin bot instance


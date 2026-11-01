<div align="center">
  <img src="../src/dashboard/public/banner.svg" alt="Sentry Banner" width="100%" />
  <p align="center">
    <strong>Yapin security, moderation and modular community management</strong>
  </p>
  <p align="center">
    <a href="https://sentry.wispbyte.app"><img src="https://img.shields.io/badge/Dashboard-sentry.wispbyte.app-10b981?style=flat-square" alt="Dashboard" /></a>
    <img src="https://img.shields.io/badge/Runtime-Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/Platform-Yapin.gg-f59e0b?style=flat-square" alt="Yapin" />
    <img src="https://img.shields.io/badge/Protocol-WebSocket_&_REST-3b82f6?style=flat-square" alt="Protocol" />
    <img src="https://img.shields.io/badge/License-MIT-emerald?style=flat-square" alt="License" />
  </p>
  <p align="center">
    <strong><a href="https://sentry.wispbyte.app">Open Web Dashboard &rarr;</a></strong>
  </p>
</div>

---

Sentry (Yapin Edition) is an open-source, privacy-first security and moderation bot tailored for the **Yapin** ecosystem (`yapin.gg` / Yapper). It ports Sentry's modular architecture to Yapin communities, providing dedicated auto-role provisioning, automated moderation filters, custom welcomer greetings, and real-time WebSocket communication.

### Features

- **Automated moderation**: Anti-invite, forbidden keyword triggers, spam protection, caps limiter, and automated timeout discipline.
- **Dedicated Auto-Role & Welcomer**: Configurable role provisioning for human members and invited bots with welcoming cards.
- **Economy & Yapin Shards (Exclusive)**: Daily streaks, wallet management, peer coin transfers, and Yapin Shard crystals.
- **Minigames & Casino**: 5-tier fishing simulator with 16 catches, rod upgrades, 21 Blackjack with interactive buttons, coinflip, dice, and counting channel.
- **Leveling & XP Engine**: Chat-based XP progression, dynamic rank cards with ASCII progress bars, and server leaderboards.
- **AI Neural Assistant**: Powered by Llama 3.3 70B via `/ai <query>` or `@Sentry` mentions in any chat.
- **Realm Telemetry & LiveStats (Exclusive)**: `/livecount` for live online/total ratios and `/realm` for E2EE voice channels and realm health.
- **Cross-Platform Bridge**: Synchronizes messages bidirectionally in real-time between Discord and Yapin channels.
- **Native Real-Time Gateway**: Zero-delay WebSocket connection (`wss://rt.yapper.website/bot`) with automated failover.
- **Unified Dashboard**: Instagram-style profile switcher between Discord and Yapin with OAuth2 & ID sign-in at [sentry.wispbyte.app](https://sentry.wispbyte.app).

For detailed architecture, commands reference, module workflows, and headless API endpoints, see [DOCUMENTATION.md](DOCUMENTATION.md).

---

## License

[MIT](../LICENSE) &bull; Inspired by [Skew](https://github.com/lexp-hub/Skew)

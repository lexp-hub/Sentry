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

- **Automated moderation**: Anti-invite, forbidden keyword triggers, spam protection, and server audit logging.
- **Dedicated Auto-Role**: Configurable role provisioning for human members and invited bots with custom assignment delay.
- **Welcomer system**: Customizable greetings, server leave notifications, and member milestone tracking.
- **Native Gateway connection**: Low-latency WebSocket event handling with automatic heartbeat and reconnection recovery.
- **Dashboard ready**: Extensible REST endpoints and shared database synchronization with the Sentry web dashboard.

For detailed architecture, commands reference, module workflows, and headless API endpoints, see [DOCUMENTATION.md](DOCUMENTATION.md).

---

## License

[MIT](../LICENSE) &bull; Inspired by [Skew](https://github.com/lexp-hub/Skew)

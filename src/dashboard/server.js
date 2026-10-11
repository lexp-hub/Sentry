import express from 'express';
import session from 'express-session';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from '../config.js';
import { authRouter, validateAuthToken } from './routes/auth.js';
import { createGuildsRouter } from './routes/guilds.js';
import { createApiRouter } from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createDashboardServer(botClient) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Cloudflare keep-alive optimizations to prevent Error 522 / timeouts
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  app.set('trust proxy', 1);

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use(
    session({
      secret: CONFIG.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 90 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax'
      }
    })
  );

  app.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const user = validateAuthToken(token);
      if (user) {
        req.session.user = user;
        req.user = user;
      }
    }

    if (!req.session?.user && req.headers.cookie) {
      const match = req.headers.cookie.match(/cav_auth_token=([^;]+)/);
      if (match) {
        const token = match[1];
        const user = validateAuthToken(token);
        if (user) {
          req.session.user = user;
          req.user = user;
        }
      }
    }
    next();
  });

  // Disable HTTP caching completely for all static assets, HTML, and API responses
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  app.use(express.static(path.join(__dirname, 'public'), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }));

  // Real-Time WebSocket Broadcaster for Multi-User Live Sync
  const broadcastToGuild = (guildId, payload) => {
    const message = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === 1) { // OPEN
        if (!guildId || client.currentGuildId === guildId || payload.type === 'GLOBAL_SYNC') {
          try {
            client.send(message);
          } catch (e) {
            console.error('[WebSocket] Error broadcasting to client:', e.message);
          }
        }
      }
    }
  };

  app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'terms.html'));
  });

  app.get('/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
  });

  app.use('/auth', authRouter);
  app.use('/api/guilds', createGuildsRouter(botClient));
  app.use('/api', createApiRouter(botClient, broadcastToGuild));

  // WebSocket Connection Handling & Heartbeat Keepalive
  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.currentGuildId = null;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (msg) => {
      try {
        const parsed = JSON.parse(msg.toString());
        if (parsed.type === 'SUBSCRIBE_GUILD') {
          ws.currentGuildId = parsed.guildId;
          ws.send(JSON.stringify({ type: 'SUBSCRIBED', guildId: parsed.guildId }));
        } else if (parsed.type === 'PING') {
          ws.isAlive = true;
          ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
        }
      } catch (e) {}
    });

    ws.send(JSON.stringify({
      type: 'INIT',
      botOnline: Boolean(botClient?.isReady()),
      botName: botClient?.user?.tag || CONFIG.BOT_NAME,
      timestamp: Date.now()
    }));
  });

  // Keep-alive ping interval every 25 seconds
  const heartbeatInterval = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 25000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  return { app, server, wss, broadcastToGuild };
}

export default createDashboardServer;

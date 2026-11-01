import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { CONFIG } from './config.js';

export class YapinClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.token = options.token || CONFIG.BOT_TOKEN;
    this.apiUrl = options.apiUrl || CONFIG.API_URL;
    this.gatewayUrl = options.gatewayUrl || CONFIG.GATEWAY_URL;
    this.ws = null;
    this.heartbeatInterval = null;
    this.commands = new Map();
    this.user = null;
    this.servers = new Map();
  }

  /**
   * Executes a REST API request to Yapin
   */
  async request(endpoint, options = {}) {
    const url = `${this.apiUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bot ${this.token}`,
      ...(options.headers || {})
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`[Yapin API Error ${response.status}] ${errorText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }
    return response.text();
  }

  /**
   * Connects to the Yapin WebSocket Gateway
   */
  login(token) {
    if (token) this.token = token;

    if (!this.token) {
      console.warn('[Yapin Client] No YAPIN_BOT_TOKEN provided. Running in Standalone / Mock mode.');
      return;
    }

    console.log(`[Yapin Client] Connecting to gateway ${this.gatewayUrl}...`);

    try {
      this.ws = new WebSocket(this.gatewayUrl);

      this.ws.on('open', () => {
        console.log('[Yapin Gateway] Connected to WebSocket!');
        this.identify();
      });

      this.ws.on('message', (data) => {
        try {
          const payload = JSON.parse(data.toString());
          this.handlePayload(payload);
        } catch (e) {
          console.error('[Yapin Gateway] Error parsing payload:', e);
        }
      });

      this.ws.on('close', (code, reason) => {
        console.warn(`[Yapin Gateway] Connection closed (Code: ${code}). Reconnecting in 5s...`);
        this.cleanupHeartbeat();
        setTimeout(() => this.login(), 5000);
      });

      this.ws.on('error', (err) => {
        console.error('[Yapin Gateway Error]:', err.message);
      });
    } catch (err) {
      console.error('[Yapin Gateway] Unable to initialize connection:', err.message);
    }
  }

  /**
   * Authenticates against the Gateway
   */
  identify() {
    this.send({
      op: 'IDENTIFY',
      d: {
        token: this.token
      }
    });
  }

  /**
   * Sends a WebSocket payload
   */
  send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  /**
   * Handles incoming Gateway events
   */
  handlePayload(payload) {
    const { op, t: eventType, d: data } = payload;

    switch (op) {
      case 'HELLO':
        this.startHeartbeat(data.heartbeat_interval || 41250);
        break;

      case 'HEARTBEAT_ACK':
        if (CONFIG.DEBUG) console.log('[Yapin Gateway] Heartbeat ACK received.');
        break;

      case 'EVENT':
      default:
        if (eventType) {
          this.emit(eventType, data);
        }
        break;
    }
  }

  startHeartbeat(intervalMs) {
    this.cleanupHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.send({ op: 'HEARTBEAT', d: Date.now() });
    }, intervalMs);
  }

  cleanupHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Registers a command handler
   */
  registerCommand(command) {
    if (command?.name && typeof command?.execute === 'function') {
      this.commands.set(command.name, command);
      console.log(`[Yapin Commands] Registered command: ${command.name}`);
    }
  }
}

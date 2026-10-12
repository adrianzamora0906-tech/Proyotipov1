const { WebSocketServer, WebSocket } = require('ws');
const { Client } = require('pg');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const TOPICS = new Set(['students','payments','schedules','documents','notifications','admin','referrals','activity','authorization','resources']);

class RealtimeService {
  constructor({ authenticate = authMiddleware, createClient = () => new Client(db.pool.options) } = {}) {
    this.authenticate = authenticate;
    this.createClient = createClient;
    this.pending = new Set();
    this.ready = false;
    this.stopped = false;
  }

  attach(server, originAllowed) {
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false });
    this.upgrade = (req, socket, head) => {
      if (req.url !== '/api/realtime' || !originAllowed(req.headers.origin) || !this.ready) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        return;
      }
      this.wss.handleUpgrade(req, socket, head, ws => this.accept(ws));
    };
    server.on('upgrade', this.upgrade);
    this.server = server;
    this.heartbeat = setInterval(() => {
      for (const ws of this.wss.clients) {
        if (ws.alive === false || ws.bufferedAmount > 65536) { ws.terminate(); continue; }
        ws.alive = false;
        ws.ping();
      }
    }, 30000);
    this.heartbeat.unref();
    this.connectDatabase();
    return this;
  }

  verify(token) {
    return new Promise((resolve, reject) => {
      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = { status: () => res, json: () => reject(new Error('Unauthorized')) };
      Promise.resolve(this.authenticate(req, res, () => resolve(req.user))).catch(reject);
    });
  }

  accept(ws) {
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('error', () => ws.terminate());
    const timeout = setTimeout(() => ws.close(4001,'Authentication required'),5000);
    ws.on('close', () => { clearTimeout(timeout); clearTimeout(ws.expiry); });
    ws.once('message', async (raw, binary) => {
      try {
        const message = binary ? null : JSON.parse(raw.toString());
        if (message?.type !== 'authenticate' || typeof message.token !== 'string') throw new Error('Unauthorized');
        const user = await this.verify(message.token);
        if (ws.readyState !== WebSocket.OPEN) return;
        clearTimeout(timeout);
        ws.user = user;
        ws.token = message.token;
        const lifetime = (Number(user.exp) * 1000) - Date.now();
        if (!Number.isFinite(lifetime) || lifetime <= 0) throw new Error('Unauthorized');
        ws.expiry = setTimeout(() => ws.close(4001,'Authentication expired'),Math.min(lifetime,2147483647));
        ws.send(JSON.stringify({ type:'ready' }));
        // Clients can authenticate but cannot publish changes or execute writes.
        ws.on('message', () => ws.close(1008,'Unexpected message'));
      } catch (_) { ws.close(4001,'Unauthorized'); }
    });
  }

  async connectDatabase() {
    if (this.stopped) return;
    const client = this.createClient();
    this.listener = client;
    let failed = false;
    const retry = () => {
      if (failed || this.stopped) return;
      failed = true;
      this.ready = false;
      for (const ws of this.wss.clients) ws.close(1012,'Database reconnecting');
      client.end().catch(() => {});
      this.retry = setTimeout(() => this.connectDatabase(),5000);
      this.retry.unref();
    };
    client.on('error', retry);
    client.on('end', retry);
    client.on('notification', message => {
      if (message.channel === 'erp_changes') this.publish(message.payload);
    });
    try {
      await client.connect();
      const migration = await client.query("SELECT 1 FROM schema_migrations WHERE migration_name='108_realtime_notifications.sql'");
      if (!migration.rows.length) throw new Error('Apply migration 108_realtime_notifications.sql');
      await client.query('LISTEN erp_changes');
      if (!failed && !this.stopped) this.ready = true;
    } catch (error) {
      console.warn('WebSocket database listener unavailable:',error.message);
      retry();
    }
  }

  publish(topic) {
    if (!TOPICS.has(topic) || this.stopped) return;
    this.pending.add(topic);
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(async () => {
      const topics = [...this.pending];
      this.pending.clear();
      this.flushTimer = null;
      if (topics.includes('authorization')) {
        await Promise.all([...this.wss.clients].filter(ws => ws.user).map(async ws => {
          try { ws.user = await this.verify(ws.token); } catch (_) { ws.close(4001,'Session revoked'); }
        }));
      }
      const payload = JSON.stringify({ type:'changed', topics });
      for (const ws of this.wss.clients) {
        if (ws.user && ws.readyState === WebSocket.OPEN) {
          if (ws.bufferedAmount > 65536) ws.terminate();
          else ws.send(payload);
        }
      }
    },150);
  }

  async close() {
    this.stopped = true;
    this.ready = false;
    clearInterval(this.heartbeat);
    clearTimeout(this.retry);
    clearTimeout(this.flushTimer);
    this.server?.removeListener('upgrade',this.upgrade);
    for (const ws of this.wss?.clients || []) ws.terminate();
    this.wss?.close();
    await this.listener?.end().catch(() => {});
  }
}

module.exports = RealtimeService;

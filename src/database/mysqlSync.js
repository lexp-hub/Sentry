import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';

let pool = null;
let isConnected = false;
let syncTimer = null;

export const MysqlSync = {
  get isConnected() {
    return isConnected;
  },

  async init() {
    if (!CONFIG.MYSQL_ENABLED) {
      console.log('[Wispbyte Cloud MySQL] Disattivato via configurazione (MYSQL_ENABLED=false).');
      return false;
    }

    try {
      pool = mysql.createPool({
        host: CONFIG.MYSQL_HOST,
        port: CONFIG.MYSQL_PORT,
        user: CONFIG.MYSQL_USER,
        password: CONFIG.MYSQL_PASSWORD,
        database: CONFIG.MYSQL_DATABASE,
        waitForConnections: true,
        connectionLimit: 4,
        connectTimeout: 10000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        maxIdle: 2,
        idleTimeout: 60000
      });

      // Verifica connessione
      const conn = await pool.getConnection();
      isConnected = true;
      console.log(`🌐 [Wispbyte Cloud MySQL] Connesso con successo al server MySQL (${CONFIG.MYSQL_HOST}:${CONFIG.MYSQL_PORT})!`);

      // Creazione tabella snapshot
      await conn.query(`
        CREATE TABLE IF NOT EXISTS sentry_cloud_snapshots (
          id INT AUTO_INCREMENT PRIMARY KEY,
          tag VARCHAR(64) NOT NULL,
          db_bytes LONGBLOB NOT NULL,
          size_bytes INT NOT NULL,
          config_json LONGTEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      conn.release();

      // Ripristino automatico se il database locale e mancante o vuoto (ad es. dopo reset container)
      const dbFile = CONFIG.DB_PATH;
      const needsRestore = !fs.existsSync(dbFile) || fs.statSync(dbFile).size < 1000;
      if (needsRestore) {
        console.log('[Wispbyte Cloud MySQL] Database locale assente o vuoto. Avvio ripristino dal cloud MySQL...');
        await this.restoreFromCloud();
      } else {
        // Esegui uno snapshot iniziale per garantire che il cloud sia aggiornato
        await this.pushCloudSnapshot('startup');
      }

      // Sincronizzazione automatica periodica ogni 15 minuti
      if (!syncTimer) {
        syncTimer = setInterval(async () => {
          try {
            await MysqlSync.pushCloudSnapshot('periodic_cloud');
          } catch (e) {
            console.warn('[Wispbyte Cloud MySQL] Errore sincronizzazione periodica:', e.message);
          }
        }, 15 * 60 * 1000);
      }

      return true;
    } catch (err) {
      isConnected = false;
      console.error('❌ [Wispbyte Cloud MySQL Error] Impossibile connettersi al database MySQL:', err.message);
      return false;
    }
  },

  async pushCloudSnapshot(tag = 'auto') {
    if (!pool || !isConnected) return null;

    try {
      const dbFile = CONFIG.DB_PATH;
      if (!fs.existsSync(dbFile)) return null;

      // Legge il database fisico
      const dbBuffer = fs.readFileSync(dbFile);
      if (dbBuffer.length < 1000) return null;

      const [result] = await pool.query(
        'INSERT INTO sentry_cloud_snapshots (tag, db_bytes, size_bytes, config_json) VALUES (?, ?, ?, ?)',
        [tag, dbBuffer, dbBuffer.length, JSON.stringify({ tag, timestamp: Date.now(), version: '2.0' })]
      );

      console.log(`☁️ [Wispbyte Cloud MySQL] Snapshot salvato in Cloud (ID: ${result.insertId}, Tag: ${tag}, Size: ${(dbBuffer.length / 1024).toFixed(1)} KB)`);

      // Mantieni solo gli ultimi 10 snapshot nel cloud
      try {
        await pool.query(`
          DELETE FROM sentry_cloud_snapshots 
          WHERE id NOT IN (
            SELECT id FROM (
              SELECT id FROM sentry_cloud_snapshots ORDER BY id DESC LIMIT 10
            ) as t
          )
        `);
      } catch (pruneErr) {}

      return { success: true, insertId: result.insertId, size: dbBuffer.length };
    } catch (err) {
      console.error('[Wispbyte Cloud MySQL] Errore salvataggio snapshot in cloud:', err.message);
      return null;
    }
  },

  async restoreFromCloud() {
    if (!pool || !isConnected) return false;

    try {
      const [rows] = await pool.query(
        'SELECT id, tag, db_bytes, size_bytes, created_at FROM sentry_cloud_snapshots ORDER BY id DESC LIMIT 1'
      );

      if (!rows || rows.length === 0) {
        console.log('[Wispbyte Cloud MySQL] Nessuno snapshot presente nel cloud da ripristinare.');
        return false;
      }

      const snapshot = rows[0];
      const dbDir = path.dirname(CONFIG.DB_PATH);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      fs.writeFileSync(CONFIG.DB_PATH, snapshot.db_bytes);
      console.log(`✅ [Wispbyte Cloud MySQL] Database ripristinato con successo dal Cloud (ID: ${snapshot.id}, Tag: ${snapshot.tag}, Data: ${snapshot.created_at})!`);
      return true;
    } catch (err) {
      console.error('[Wispbyte Cloud MySQL] Errore durante il ripristino dal cloud:', err.message);
      return false;
    }
  },

  async getCloudStatus() {
    if (!pool || !isConnected) {
      return { connected: false, message: 'Non connesso al database MySQL di Wispbyte' };
    }

    try {
      const [rows] = await pool.query(
        'SELECT id, tag, size_bytes, created_at FROM sentry_cloud_snapshots ORDER BY id DESC LIMIT 1'
      );
      const [countRows] = await pool.query('SELECT COUNT(*) as total FROM sentry_cloud_snapshots');

      return {
        connected: true,
        host: CONFIG.MYSQL_HOST,
        database: CONFIG.MYSQL_DATABASE,
        totalSnapshots: countRows[0]?.total || 0,
        latestSnapshot: rows[0] || null
      };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  },

  async close() {
    if (syncTimer) clearInterval(syncTimer);
    if (pool) {
      try {
        await this.pushCloudSnapshot('shutdown');
        await pool.end();
        console.log('[Wispbyte Cloud MySQL] Connessione chiusa in sicurezza.');
      } catch (e) {}
    }
  }
};

export default MysqlSync;


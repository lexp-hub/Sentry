import { createBotClient, loadCommandsAndEvents, registerSlashCommands } from './src/bot/client.js';
import { createDashboardServer } from './src/dashboard/server.js';
import { CONFIG } from './src/config.js';
import { MysqlSync } from './src/database/mysqlSync.js';
import { DatabaseHelper } from './src/database/db.js';

async function main() {
  console.log('====================================================');
  console.log('🛡️       SENTRY - DISCORD BOT & DASHBOARD          🛡️');
  console.log('====================================================');

  try {
    console.log('[System] Inizializzazione sincronizzazione Cloud MySQL Wispbyte...');
    await MysqlSync.init();
  } catch (mysqlErr) {
    console.warn('[System Warning] Inizializzazione MySQL non riuscita:', mysqlErr.message);
  }

  const botClient = createBotClient();

  try {
    console.log('[System] Caricamento comandi slash ed eventi Discord...');
    await loadCommandsAndEvents(botClient);
  } catch (error) {
    console.error('[System] Errore nel caricamento dei comandi:', error);
  }

  const { server } = createDashboardServer(botClient);
  
  server.listen(CONFIG.PORT, '0.0.0.0', () => {
    console.log(`\n🌐 [Dashboard] Web Server attivo con successo su Wispbyte!`);
    console.log(`🔗 In ascolto su: Sentry.wispbyte.app`);
    console.log(`🛡️ Sentry Management Dashboard Online\n`);
  });

  if (CONFIG.BOT_TOKEN && CONFIG.BOT_TOKEN.trim().length > 10) {
    console.log('[Bot] Connessione al gateway Discord in corso...');
    botClient.login(CONFIG.BOT_TOKEN)
      .then(async () => {
        await registerSlashCommands(botClient);
      })
      .catch((err) => {
        console.error('[Bot] Errore di login con il token Discord fornito:', err.message);
        console.log('[Bot] La dashboard continuerà ad essere attiva in modalità Standalone / Preview.');
      });
  } else {
    console.log('\x1b[33m[Bot Avviso] DISCORD_BOT_TOKEN non impostato nelle variabili d\'ambiente.\x1b[0m');
    console.log('\x1b[32m[Dashboard] La Dashboard è pienamente accessibile all\'indirizzo: Sentry.wispbyte.app \x1b[0m\n');
  }
}

process.on('unhandledRejection', (reason) => {
  if (reason && (reason.code === 10062 || reason.code === 40060)) {
    console.warn(`[Discord Warning] Interazione scaduta ignorata (codice ${reason.code})`);
    return;
  }
  console.error('[Unhandled Rejection]', reason);
});

process.on('uncaughtException', (err) => {
  if (err && (err.code === 10062 || err.code === 40060)) {
    console.warn(`[Discord Warning] Interazione scaduta ignorata (codice ${err.code})`);
    return;
  }
  console.error('[Uncaught Exception]', err);
});

// Wispbyte & Pterodactyl Container Shutdown / Restart handlers
let isShuttingDown = false;
const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[Wispbyte System] Ricevuto segnale di arresto (${signal}). Salvataggio forzato in corso...`);
  try {
    DatabaseHelper.flushToDisk();
    DatabaseHelper.createBackup('shutdown');
    await MysqlSync.close();
    console.log('✅ [Wispbyte System] Database sincronizzato e protetto su disco e Cloud MySQL con successo.');
  } catch (err) {
    console.error('❌ [Wispbyte System] Errore durante il flush del database:', err.message);
  }
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('beforeExit', () => gracefulShutdown('beforeExit'));

main();

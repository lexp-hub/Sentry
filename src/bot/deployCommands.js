import { createBotClient, loadCommandsAndEvents, registerSlashCommands } from './client.js';

async function deploy() {
  console.log('🚀 Avvio deploy manuale dei comandi slash per Sentry...');
  const client = createBotClient();
  await loadCommandsAndEvents(client);
  await registerSlashCommands(client);
  process.exit(0);
}

deploy().catch(err => {
  console.error('❌ Errore durante il deploy:', err);
  process.exit(1);
});

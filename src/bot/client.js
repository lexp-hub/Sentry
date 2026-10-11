import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  REST,
  Routes
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createBotClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildEmojisAndStickers,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildModeration
    ],
    partials: [
      Partials.Message,
      Partials.Channel,
      Partials.Reaction,
      Partials.User,
      Partials.GuildMember
    ]
  });

  client.commands = new Collection();
  client.commandList = [];

  // Robust Gateway Lifecycle & Error Listeners to prevent silent disconnects
  client.on('error', (err) => {
    console.error('[Discord Client Error]', err?.message || err);
  });

  client.on('warn', (warning) => {
    console.warn('[Discord Client Warning]', warning);
  });

  client.on('shardDisconnect', (event, shardId) => {
    console.warn(`[Discord Gateway] Shard ${shardId} disconnesso (Codice: ${event?.code || 'N/D'}). In attesa di riconnessione automatica...`);
  });

  client.on('shardError', (error, shardId) => {
    console.error(`[Discord Gateway Error] Errore su shard ${shardId}:`, error?.message || error);
  });

  client.on('shardReconnecting', (shardId) => {
    console.log(`🔄 [Discord Gateway] Riconnessione in corso per shard ${shardId}...`);
  });

  client.on('shardResume', (shardId, replayedEvents) => {
    console.log(`✅ [Discord Gateway] Connessione ripristinata con successo per shard ${shardId} (${replayedEvents} eventi sincronizzati).`);
  });

  if (client.rest) {
    client.rest.on('rateLimited', (info) => {
      console.warn(`⏳ [Discord REST RateLimit] Superato rate limit per ${info.timeToReset}ms sulla rotta: ${info.route}`);
    });
  }

  return client;
}

export async function loadCommandsAndEvents(client) {
  
  const commandsPath = path.join(__dirname, 'commands');
  const commandFolders = fs.readdirSync(commandsPath);

  client.commandList = [];
  client.commands.clear();

  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      const commandModule = await import(`file://${filePath}`);
      const command = commandModule.default;

      if (command && 'data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        client.commandList.push(command.data.toJSON());
      } else {
        console.warn(`[Commands] Il file in ${filePath} non contiene le proprietà "data" o "execute" richieste.`);
      }
    }
  }

  console.log(`[Commands] Caricati ${client.commands.size} comandi slash.`);

  const eventsPath = path.join(__dirname, 'events');
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const eventModule = await import(`file://${filePath}`);
    const event = eventModule.default;

    if (event && event.name && event.execute) {
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }
    }
  }

  console.log(`[Events] Caricati ${eventFiles.length} listener di eventi.`);
}

export async function registerSlashCommands(client) {
  if (!CONFIG.BOT_TOKEN || !CONFIG.CLIENT_ID) {
    console.log('[Commands Deploy] DISCORD_BOT_TOKEN o DISCORD_CLIENT_ID non configurati. Deploy saltato.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(CONFIG.BOT_TOKEN);

  try {
    console.log(`[Commands Deploy] Inizio registrazione di ${client.commandList.length} comandi slash globali...`);

    const data = await rest.put(
      Routes.applicationCommands(CONFIG.CLIENT_ID),
      { body: client.commandList }
    );

    console.log(`[Commands Deploy] Registrati con successo ${data.length} comandi slash globali.`);
  } catch (error) {
    console.error('[Commands Deploy] Errore durante la registrazione dei comandi slash:', error);
  }
}

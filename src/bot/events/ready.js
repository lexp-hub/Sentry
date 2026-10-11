import { ActivityType, Events } from 'discord.js';
import { GiveawayManager } from '../modules/giveawayManager.js';
import { StopwatchManager } from '../modules/stopwatchManager.js';
import { CONFIG } from '../../config.js';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`\n🛡️ [Sentry] Bot avviato con successo come ${client.user.tag}!`);
    console.log(`🌐 Connesso a ${client.guilds.cache.size} server e ${client.users.cache.size} utenti.`);
    console.log(`📊 Dashboard attiva su: ${CONFIG.DASHBOARD_URL}\n`);

    const updatePresence = () => {
      const activities = [
        {
          name: 'la sicurezza del server | /help',
          type: ActivityType.Watching
        },
        {
          name: 'Sentry AI 70B | /ai',
          type: ActivityType.Playing
        },
        {
          name: `${client.guilds.cache.size} Server | /help`,
          type: ActivityType.Watching
        }
      ];

      const randomActivity = activities[Math.floor(Math.random() * activities.length)];

      client.user.setPresence({
        activities: [randomActivity],
        status: 'online'
      });
    };

    updatePresence();
    setInterval(updatePresence, 60 * 1000);

    GiveawayManager.init(client);
    StopwatchManager.initAllActiveStopwatches(client);
  }
};

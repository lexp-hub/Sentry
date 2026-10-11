import { DatabaseHelper } from '../../database/db.js';
import { EmbedBuilder } from 'discord.js';
import { CONFIG } from '../../config.js';

export const GiveawayManager = {
  activeTimers: new Map(),

  init(client) {
    
    const activeGiveaways = DatabaseHelper.getActiveGiveaways();
    const now = Math.floor(Date.now() / 1000);

    for (const ga of activeGiveaways) {
      const remainingMs = Math.max(0, (ga.end_time - now) * 1000);
      const timer = setTimeout(() => {
        this.endGiveaway(client, ga.message_id);
      }, remainingMs);
      this.activeTimers.set(ga.message_id, timer);
    }
  },

  async startGiveaway(channel, prize, winnerCount, durationSeconds, host) {
    const endTime = Math.floor(Date.now() / 1000) + durationSeconds;

    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_COLOR)
      .setTitle(`🎉 GIVEAWAY: ${prize}`)
      .setDescription(
        `Reagisci con 🎉 per partecipare!\n\n` +
        `🏆 **Vincitori:** \`${winnerCount}\`\n` +
        `👑 **Host:** ${host}\n` +
        `⏳ **Termina:** <t:${endTime}:R> (<t:${endTime}:f>)`
      )
      .setFooter({ text: `Termina il` })
      .setTimestamp(new Date(endTime * 1000));

    const message = await channel.send({ embeds: [embed] });
    await message.react('🎉');

    DatabaseHelper.createGiveaway(
      channel.guild.id,
      channel.id,
      message.id,
      prize,
      winnerCount,
      endTime,
      host.id
    );

    const timer = setTimeout(() => {
      this.endGiveaway(channel.client, message.id);
    }, durationSeconds * 1000);

    this.activeTimers.set(message.id, timer);
    return message;
  },

  async endGiveaway(client, messageId) {
    const ga = DatabaseHelper.getGiveaway(messageId);
    if (!ga || ga.ended) return;

    try {
      const guild = client.guilds.cache.get(ga.guild_id);
      if (!guild) return;
      const channel = guild.channels.cache.get(ga.channel_id);
      if (!channel) return;
      const message = await channel.messages.fetch(ga.message_id).catch(() => null);
      if (!message) return;

      const reaction = message.reactions.cache.get('🎉');
      let users = [];
      if (reaction) {
        const fetchedUsers = await reaction.users.fetch();
        users = fetchedUsers.filter(u => !u.bot).map(u => u);
      }

      const winners = [];
      const winnerCount = Math.min(ga.winner_count, users.length);

      if (users.length > 0) {
        
        const pool = [...users];
        for (let i = 0; i < winnerCount; i++) {
          const randomIndex = Math.floor(Math.random() * pool.length);
          winners.push(pool.splice(randomIndex, 1)[0]);
        }
      }

      DatabaseHelper.endGiveaway(messageId, winners.map(w => w.id));

      const winnerMentions = winners.length > 0 ? winners.map(w => `${w}`).join(', ') : 'Nessun partecipante valido';

      const endEmbed = new EmbedBuilder()
        .setColor(winners.length > 0 ? CONFIG.EMBED_SUCCESS_COLOR : CONFIG.EMBED_ERROR_COLOR)
        .setTitle(`🎉 GIVEAWAY TERMINATO: ${ga.prize}`)
        .setDescription(
          `🏆 **Vincitore/i:** ${winnerMentions}\n` +
          `👑 **Host:** <@${ga.host_id}>\n` +
          `📊 **Partecipanti totali:** \`${users.length}\``
        )
        .setFooter({ text: 'Giveaway Terminato' })
        .setTimestamp();

      await message.edit({ embeds: [endEmbed] });

      if (winners.length > 0) {
        await channel.send(`🎉 Congratulazioni ${winnerMentions}! Avete vinto **${ga.prize}**!`);
      } else {
        await channel.send(`😢 Il giveaway per **${ga.prize}** si è concluso senza partecipanti.`);
      }
    } catch (err) {
      console.error('[GiveawayManager] Error ending giveaway:', err);
    }
  },

  async rerollGiveaway(client, messageId) {
    const ga = DatabaseHelper.getGiveaway(messageId);
    if (!ga) return { success: false, error: 'Giveaway non trovato.' };

    const guild = client.guilds.cache.get(ga.guild_id);
    const channel = guild?.channels.cache.get(ga.channel_id);
    const message = await channel?.messages.fetch(ga.message_id).catch(() => null);
    if (!message) return { success: false, error: 'Messaggio giveaway non trovato.' };

    const reaction = message.reactions.cache.get('🎉');
    if (!reaction) return { success: false, error: 'Nessuna reazione trovata.' };

    const fetchedUsers = await reaction.users.fetch();
    const validUsers = fetchedUsers.filter(u => !u.bot).map(u => u);
    if (validUsers.length === 0) return { success: false, error: 'Nessun partecipante valido per il reroll.' };

    const randomWinner = validUsers[Math.floor(Math.random() * validUsers.length)];
    await channel.send(`🎉 **Nuovo Vincitore Reroll:** ${randomWinner}! Hai vinto **${ga.prize}**!`);
    return { success: true, winner: randomWinner };
  }
};

export default GiveawayManager;

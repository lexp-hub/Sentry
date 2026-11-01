import { DatabaseHelper } from '../../../src/database/db.js';
import { FISHING_RODS, FISH_TABLE } from '../../../src/bot/modules/fishingManager.js';
import { YapinEconomy } from './yapinEconomy.js';
import { Embed } from '../yapper.js';

const fishCooldowns = new Map(); // `${guildId}_${userId}` -> timestamp

export const YapinFishing = {
  getProfile(guildId, userId) {
    const guildKey = guildId?.startsWith('yapin_') ? guildId : `yapin_${guildId}`;
    try {
      return DatabaseHelper.getUserFishingProfile(userId, guildKey);
    } catch (e) {
      return { user_id: userId, rod_level: 1, fish_caught: 0, bait_count: 5 };
    }
  },

  getRandomCatch(rodLevel = 1) {
    const rod = FISHING_RODS[rodLevel] || FISHING_RODS[1];
    const bonus = rod.catchBonus || 0;

    const pool = FISH_TABLE.map(item => {
      let modWeight = item.weight;
      if (item.rarity === 'Raro') modWeight += bonus * 0.15;
      if (item.rarity === 'Epico') modWeight += bonus * 0.08;
      if (item.rarity === 'Mitico') modWeight += bonus * 0.03;
      if (item.rarity === 'Tesoro') modWeight += bonus * 0.04;
      if (item.rarity === 'Spazzatura') modWeight = Math.max(1, modWeight - bonus * 0.1);
      return { ...item, modWeight: Math.max(0.5, modWeight) };
    });

    const totalWeight = pool.reduce((acc, i) => acc + i.modWeight, 0);
    let rand = Math.random() * totalWeight;

    for (const item of pool) {
      if (rand < item.modWeight) return item;
      rand -= item.modWeight;
    }
    return pool[0];
  },

  async handleFish(ctx, getContextData) {
    const { serverId, authorId } = getContextData(ctx);
    if (!serverId) return ctx.reply('[Error] Puoi pescare solo all\'interno di un server.');

    const key = `${serverId}_${authorId}`;
    const now = Date.now();
    const last = fishCooldowns.get(key) || 0;
    const cooldownMs = 25 * 1000; // 25 secondi

    if (now - last < cooldownMs) {
      const waitSec = Math.ceil((cooldownMs - (now - last)) / 1000);
      return ctx.reply(`Stai ancora riavvolgendo la lenza! Attendi **${waitSec}s** prima di lanciare di nuovo.`);
    }

    fishCooldowns.set(key, now);
    const profile = this.getProfile(serverId, authorId);
    const rodLevel = profile.rod_level || 1;
    const rod = FISHING_RODS[rodLevel] || FISHING_RODS[1];

    const catchItem = this.getRandomCatch(rodLevel);
    const coinsEarned = catchItem.value || 10;
    YapinEconomy.addCoins(serverId, authorId, coinsEarned);

    const embed = new Embed()
      .title(`Battuta di Pesca | <@${authorId}>`)
      .description(`Hai lanciato la tua **${rod.name}** nelle acque del Realm...\n\n` +
        `**Hai catturato:** ${catchItem.emoji} **${catchItem.name}**!\n` +
        `• **Rarità:** \`${catchItem.rarity}\`\n` +
        `• **Valore di Vendita:** \`+${coinsEarned} Coins Monete\`\n\n` +
        `*Le monete sono state accreditate istantaneamente al tuo portafoglio.*`)
      .color(catchItem.color || '#3b82f6');

    ctx.reply('', { embeds: [embed] });
  },

  async handleInventory(ctx, getContextData) {
    const { serverId, authorId } = getContextData(ctx);
    const profile = this.getProfile(serverId, authorId);
    const rodLevel = profile.rod_level || 1;
    const rod = FISHING_RODS[rodLevel] || FISHING_RODS[1];
    const nextRod = FISHING_RODS[rodLevel + 1];

    const embed = new Embed()
      .title(`Equipaggiamento da Pesca | <@${authorId}>`)
      .field('Current Rod', `${rod.emoji} **${rod.name}** (Livello ${rod.level})\n> ${rod.desc}`, false)
      .field('Bonus Fortuna', `\`+${rod.catchBonus}% probabilità oggetti rari e leggendari\``, true)
      .field('Pesci Pescati', `\`${profile.fish_caught || 0}\``, true);

    if (nextRod) {
      embed.field('Prossimo Upgrade', `Compra **${nextRod.name}** per **${nextRod.cost} Coins** con il comando \`/upgrade-rod\`!`, false);
    } else {
      embed.field('Stato Canna', `Possiedi la canna massima celestiale!`, false);
    }

    embed.color('#06b6d4');
    ctx.reply('', { embeds: [embed] });
  },

  async handleUpgrade(ctx, getContextData) {
    const { serverId, authorId } = getContextData(ctx);
    if (!serverId) return ctx.reply('[Error] Comando disponibile solo nei server.');

    const profile = this.getProfile(serverId, authorId);
    const currentLevel = profile.rod_level || 1;
    const nextRod = FISHING_RODS[currentLevel + 1];

    if (!nextRod) {
      return ctx.reply('Possiedi già la canna di livello massimo! Nessun upgrade disponibile.');
    }

    const econProfile = YapinEconomy.getProfile(serverId, authorId);
    if ((econProfile.balance || 0) < nextRod.cost) {
      return ctx.reply(`[Error] Ti mancano monete. Il potenziamento a **${nextRod.name}** costa **${nextRod.cost} Coins** (Hai: ${econProfile.balance || 0} Coins).`);
    }

    YapinEconomy.addCoins(serverId, authorId, -nextRod.cost);
    try {
      const guildKey = serverId.startsWith('yapin_') ? serverId : `yapin_${serverId}`;
      DatabaseHelper.saveUserFishingProfile(authorId, guildKey, { rod_level: currentLevel + 1 });
    } catch (e) {}

    const embed = new Embed()
      .title('Potenziamento Canna Completato!')
      .description(`Congratulazioni <@${authorId}>! La tua canna è stata forgiata a **${nextRod.name}**!\n\n` +
        `• **Nuovo Bonus:** \`+${nextRod.catchBonus}%\` fortuna su creature leggendarie.\n` +
        `• **Monete Spese:** \`${nextRod.cost} Coins\``)
      .color('#10b981');

    ctx.reply('', { embeds: [embed] });
  }
};

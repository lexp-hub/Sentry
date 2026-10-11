import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { DatabaseHelper } from '../../database/db.js';
import { CONFIG } from '../../config.js';

// Rod Configurations
export const FISHING_RODS = {
  1: { level: 1, name: 'Canna di Legno Grezzo', cost: 0, catchBonus: 0, emoji: '🪵', desc: 'Una semplice canna di legno intagliata a mano.' },
  2: { level: 2, name: 'Canna in Ferro Rinforzato', cost: 300, catchBonus: 12, emoji: '⚔️', desc: 'Filo in canapa resistente e amo d\'acciaio temperato.' },
  3: { level: 3, name: 'Canna d\'Argento Crociato', cost: 1000, catchBonus: 28, emoji: '🛡️', desc: 'Benedetta con amuleti, aumenta la probabilità di tesori e pesci rari.' },
  4: { level: 4, name: 'Canna Sacra del Reale Cavaliere', cost: 3500, catchBonus: 55, emoji: '👑', desc: 'Forgiata nel fuoco crociato, cattura leggende e mostri marini.' },
  5: { level: 5, name: 'Canna Celestiale di Excalibur', cost: 8500, catchBonus: 90, emoji: '⚡', desc: 'Artefatto divino con aura luminosa che attrae tesori sommersi inestimabili.' }
};

// Catch Loot Table
export const FISH_TABLE = [
  // Common (45%)
  { name: 'Trota di Fiume', rarity: 'Comune', value: 15, weight: 30, emoji: '🐟', color: '#94a3b8' },
  { name: 'Carpa Medievale', rarity: 'Comune', value: 20, weight: 25, emoji: '🐟', color: '#94a3b8' },
  { name: 'Pesce Gatto Melmoso', rarity: 'Comune', value: 18, weight: 20, emoji: '🐡', color: '#94a3b8' },
  { name: 'Persico del Fossato', rarity: 'Comune', value: 22, weight: 18, emoji: '🐟', color: '#94a3b8' },

  // Junk (12%)
  { name: 'Vecchio Stivale di Cuoio', rarity: 'Spazzatura', value: 2, weight: 10, emoji: '👢', color: '#78716c' },
  { name: 'Alga Fradicia', rarity: 'Spazzatura', value: 1, weight: 10, emoji: '🌿', color: '#78716c' },
  { name: 'Scatoletta Arrugginita', rarity: 'Spazzatura', value: 3, weight: 8, emoji: '🥫', color: '#78716c' },

  // Uncommon (20%)
  { name: 'Luccio Argenteo', rarity: 'Non Comune', value: 45, weight: 18, emoji: '🐠', color: '#38bdf8' },
  { name: 'Spigola Reale', rarity: 'Non Comune', value: 50, weight: 16, emoji: '🐟', color: '#38bdf8' },

  // Rare (13%)
  { name: 'Salmone Dorato', rarity: 'Raro', value: 85, weight: 12, emoji: '✨', color: '#fbbf24' },
  { name: 'Anguilla Elettrica', rarity: 'Raro', value: 110, weight: 10, emoji: '⚡', color: '#fbbf24' },
  { name: 'Astice del Castello Reale', rarity: 'Raro', value: 135, weight: 8, emoji: '🦞', color: '#fbbf24' },

  // Epic & Mythic (6%)
  { name: 'Squalo dei Laghi Sacri', rarity: 'Epico', value: 350, weight: 4, emoji: '🦈', color: '#a855f7' },
  { name: 'Calamaro Abissale Gigante', rarity: 'Epico', value: 420, weight: 3, emoji: '🦑', color: '#a855f7' },
  { name: 'Piccolo Leviatano dei Crociati', rarity: 'Mitico', value: 850, weight: 1.5, emoji: '🐉', color: '#f43f5e' },

  // Treasures (4%)
  { name: 'Rubino dei Cavalieri', rarity: 'Tesoro', value: 300, weight: 3, emoji: '💎', color: '#ec4899' },
  { name: 'Corona Perduta nel Fiume', rarity: 'Tesoro', value: 650, weight: 1.5, emoji: '👑', color: '#ec4899' },
  { name: 'Forziere Misterioso Antico', rarity: 'Tesoro', value: 1200, weight: 0.8, emoji: '🗝️', color: '#ec4899' }
];

export const FishingManager = {
  /**
   * Generates a random catch based on rod level bonus
   */
  getRandomCatch(rodLevel = 1) {
    const rod = FISHING_RODS[rodLevel] || FISHING_RODS[1];
    const bonus = rod.catchBonus;

    const pool = FISH_TABLE.map(item => {
      let w = item.weight;
      if (item.rarity === 'Non Comune') w += bonus * 0.15;
      if (item.rarity === 'Raro') w += bonus * 0.25;
      if (item.rarity === 'Epico' || item.rarity === 'Mitico' || item.rarity === 'Tesoro') w += bonus * 0.20;
      if (item.rarity === 'Spazzatura') w = Math.max(1, w - bonus * 0.20);
      return { ...item, calculatedWeight: w };
    });

    const totalWeight = pool.reduce((sum, item) => sum + item.calculatedWeight, 0);
    let random = Math.random() * totalWeight;

    for (const item of pool) {
      if (random < item.calculatedWeight) {
        return item;
      }
      random -= item.calculatedWeight;
    }
    return pool[0];
  },

  /**
   * Validates whether a command or interaction is executed in the designated channel
   */
  checkChannel(guildId, channelId) {
    const config = DatabaseHelper.getFishingConfig(guildId);
    if (!config.enabled) {
      return { allowed: false, reason: 'Il modulo di Pesca è attualmente disattivato in questo server.' };
    }
    if (config.channel_id && config.channel_id !== channelId) {
      return {
        allowed: false,
        reason: `⚠️ Puoi pescare solo nel canale dedicato: <#${config.channel_id}>!`
      };
    }
    return { allowed: true, config };
  },

  /**
   * Performs the fishing action for a user
   */
  async castRod(guild, user, channelId) {
    const channelCheck = this.checkChannel(guild.id, channelId);
    if (!channelCheck.allowed) {
      return { success: false, message: channelCheck.reason, ephemeral: true };
    }

    const config = channelCheck.config;
    const profile = DatabaseHelper.getFishingProfile(guild.id, user.id);
    const now = Math.floor(Date.now() / 1000);
    const cooldownSec = config.cooldown_seconds || 15;

    if (now - profile.last_fished < cooldownSec) {
      const waitLeft = cooldownSec - (now - profile.last_fished);
      return {
        success: false,
        message: `⏳ Devi attendere **${waitLeft} secondi** prima di lanciare di nuovo la canna!`,
        ephemeral: true
      };
    }

    const caught = this.getRandomCatch(profile.rod_level);
    const rod = FISHING_RODS[profile.rod_level] || FISHING_RODS[1];

    // Add caught item to inventory
    const inventory = Array.isArray(profile.inventory) ? profile.inventory : [];
    inventory.push({
      name: caught.name,
      rarity: caught.rarity,
      value: caught.value,
      emoji: caught.emoji,
      timestamp: now
    });

    profile.inventory = inventory;
    profile.total_fish_caught = (profile.total_fish_caught || 0) + 1;
    profile.last_fished = now;
    DatabaseHelper.saveFishingProfile(guild.id, user.id, profile);

    const rarityBadge = {
      'Spazzatura': '⚪ Spazzatura',
      'Comune': '🟢 Comune',
      'Non Comune': '🔵 Non Comune',
      'Raro': '🟡 Raro',
      'Epico': '🟣 Epico',
      'Mitico': '🔴 MITICO',
      'Tesoro': '💎 TESORO SOMMERSO'
    }[caught.rarity] || caught.rarity;

    const embed = new EmbedBuilder()
      .setColor(caught.color || config.color || '#38bdf8')
      .setAuthor({
        name: `🎣 Battuta di Pesca • ${user.displayName || user.username}`,
        iconURL: user.displayAvatarURL({ dynamic: true })
      })
      .setTitle(`${caught.emoji} Hai pescato: ${caught.name}!`)
      .setDescription(
        `> **Rarità:** \`${rarityBadge}\`\n` +
        `> **Valore di Mercato:** \`${caught.value}\` 🪙 monete\n` +
        `> **Equipaggiamento:** ${rod.emoji} \`${rod.name}\`\n\n` +
        `🎒 *Aggiunto al tuo cestino. Usa il pulsante **Vendi Pescato** o \`/pesca vendi\` per incassare monete!*`
      )
      .setFooter({ text: `${guild.name} • Pesca Medievale`, iconURL: guild.iconURL() })
      .setTimestamp();

    return { success: true, embed, caught, profile };
  },

  /**
   * Generates Inventory & Profile Embed
   */
  getInventoryEmbed(guild, user) {
    const profile = DatabaseHelper.getFishingProfile(guild.id, user.id);
    const rod = FISHING_RODS[profile.rod_level] || FISHING_RODS[1];
    const inventory = Array.isArray(profile.inventory) ? profile.inventory : [];

    const totalValue = inventory.reduce((sum, item) => sum + (item.value || 0), 0);

    // Group items by name
    const grouped = {};
    inventory.forEach(item => {
      grouped[item.name] = grouped[item.name] || { count: 0, value: item.value, emoji: item.emoji, rarity: item.rarity };
      grouped[item.name].count++;
    });

    const itemList = Object.keys(grouped).length > 0
      ? Object.entries(grouped).map(([name, data]) => `• ${data.emoji} **${name}** x${data.count} — \`${data.count * data.value} 🪙\` (${data.rarity})`).join('\n')
      : '*Il tuo cestino è vuoto. Lancia la canna per pescare!*';

    return new EmbedBuilder()
      .setColor('#38bdf8')
      .setAuthor({
        name: `🎒 Cestino & Profilo • ${user.displayName || user.username}`,
        iconURL: user.displayAvatarURL({ dynamic: true })
      })
      .setTitle('🎣 Equipaggiamento & Pescato')
      .addFields(
        { name: '🪙 Monete Reali', value: `**${profile.coins.toLocaleString()}** 🪙`, inline: true },
        { name: '🎣 Canna Attuale', value: `${rod.emoji} **${rod.name}**\n*(+${rod.catchBonus}% Fortuna)*`, inline: true },
        { name: '📊 Totale Pescati', value: `**${profile.total_fish_caught}** prede`, inline: true },
        { name: `🐟 Pescato nel Cestino (${inventory.length} oggetti - Valore: ${totalValue} 🪙)`, value: itemList }
      )
      .setFooter({ text: `${guild.name} • Sentry Pesca`, iconURL: guild.iconURL() })
      .setTimestamp();
  },

  /**
   * Sells all items in the user's inventory
   */
  sellCatch(guild, user) {
    const profile = DatabaseHelper.getFishingProfile(guild.id, user.id);
    const inventory = Array.isArray(profile.inventory) ? profile.inventory : [];

    if (inventory.length === 0) {
      return {
        success: false,
        message: '🎒 Il tuo cestino è vuoto! Lancia prima la canna per pescare qualcosa da vendere.',
        ephemeral: true
      };
    }

    const totalCoins = inventory.reduce((sum, item) => sum + (item.value || 0), 0);
    const count = inventory.length;

    profile.coins = (profile.coins || 0) + totalCoins;
    profile.inventory = [];
    DatabaseHelper.saveFishingProfile(guild.id, user.id, profile);

    const embed = new EmbedBuilder()
      .setColor('#10b981')
      .setAuthor({
        name: `🪙 Mercato Ittico Reale • ${user.displayName || user.username}`,
        iconURL: user.displayAvatarURL({ dynamic: true })
      })
      .setTitle('🤝 Vendita Completata con Successo!')
      .setDescription(
        `Hai venduto **${count}** prede al mercante del regno per un totale di **+${totalCoins.toLocaleString()} 🪙** monete!\n\n` +
        `💰 **Nuovo Saldo Totale:** \`${profile.coins.toLocaleString()}\` 🪙 monete`
      )
      .setFooter({ text: `${guild.name} • Sentry Economia`, iconURL: guild.iconURL() })
      .setTimestamp();

    return { success: true, embed, totalCoins, count, profile };
  },

  /**
   * Upgrades the user's fishing rod
   */
  upgradeRod(guild, user) {
    const profile = DatabaseHelper.getFishingProfile(guild.id, user.id);
    const nextLevel = (profile.rod_level || 1) + 1;
    const nextRod = FISHING_RODS[nextLevel];

    if (!nextRod) {
      return {
        success: false,
        message: '👑 Possiedi già la **Canna Celestiale di Excalibur**, il livello massimo assoluto!',
        ephemeral: true
      };
    }

    if (profile.coins < nextRod.cost) {
      const missing = nextRod.cost - profile.coins;
      return {
        success: false,
        message: `❌ Non hai abbastanza monete! Ti mancano **${missing.toLocaleString()} 🪙** per acquistare la **${nextRod.name}** (Costo: \`${nextRod.cost.toLocaleString()} 🪙\`).`,
        ephemeral: true
      };
    }

    profile.coins -= nextRod.cost;
    profile.rod_level = nextLevel;
    DatabaseHelper.saveFishingProfile(guild.id, user.id, profile);

    const embed = new EmbedBuilder()
      .setColor('#eab308')
      .setAuthor({
        name: `🛒 Bottega Reale • ${user.displayName || user.username}`,
        iconURL: user.displayAvatarURL({ dynamic: true })
      })
      .setTitle('✨ Canna da Pesca Potenziata!')
      .setDescription(
        `Complimenti! Hai acquistato la **${nextRod.emoji} ${nextRod.name}**!\n\n` +
        `> 🌟 **Nuovo Bonus Fortuna:** \`+${nextRod.catchBonus}%\` probabilità pesci rari e tesori\n` +
        `> 💸 **Costo:** \`${nextRod.cost.toLocaleString()}\` 🪙 monete\n` +
        `> 💰 **Saldo Rimanente:** \`${profile.coins.toLocaleString()}\` 🪙 monete`
      )
      .setFooter({ text: `${guild.name} • Sentry Pesca`, iconURL: guild.iconURL() })
      .setTimestamp();

    return { success: true, embed, nextRod, profile };
  },

  /**
   * Returns Fishing Shop Embed
   */
  getShopEmbed(guild, user) {
    const profile = DatabaseHelper.getFishingProfile(guild.id, user.id);

    const embed = new EmbedBuilder()
      .setColor('#38bdf8')
      .setTitle('🛒 Bottega delle Canne da Pesca Medievali')
      .setDescription(
        'Acquista canne migliori per aumentare la tua fortuna e pescare creature leggendarie e tesori sommersi!\n\n' +
        `💰 **Il tuo Saldo Attuale:** \`${profile.coins.toLocaleString()}\` 🪙 monete\n` +
        `🎣 **Canna Equipaggiata:** \`${FISHING_RODS[profile.rod_level]?.name || 'Legno'}\`\n\n` +
        Object.values(FISHING_RODS).map(r => {
          const isOwned = profile.rod_level >= r.level;
          const status = isOwned ? '✅ *(Posseduta)*' : `💸 **${r.cost.toLocaleString()} 🪙**`;
          return `${r.emoji} **Livello ${r.level}: ${r.name}** — ${status}\n> *${r.desc}* (+${r.catchBonus}% fortuna)`;
        }).join('\n\n')
      )
      .setFooter({ text: 'Usa il pulsante "Acquista Prossima Canna" o /pesca upgrade per acquistare!', iconURL: guild.iconURL() })
      .setTimestamp();

    return embed;
  },

  /**
   * Returns Leaderboard Embed
   */
  getLeaderboardEmbed(guild) {
    const leaders = DatabaseHelper.getFishingLeaderboard(guild.id, 10);

    if (leaders.length === 0) {
      return new EmbedBuilder()
        .setColor('#38bdf8')
        .setTitle('🏆 Classifica Reale dei Pescatori')
        .setDescription('*Nessun pescatore ha ancora lanciato la canna in questo server!*');
    }

    const desc = leaders.map((p, idx) => {
      const medals = ['🥇', '🥈', '🥉'];
      const rank = medals[idx] || `**#${idx + 1}**`;
      const rod = FISHING_RODS[p.rod_level] || FISHING_RODS[1];
      return `${rank} <@${p.user_id}>\n> 🪙 **${(p.coins || 0).toLocaleString()}** monete • 🐟 **${p.total_fish_caught || 0}** catture • ${rod.emoji} *${rod.name}*`;
    }).join('\n\n');

    return new EmbedBuilder()
      .setColor('#eab308')
      .setTitle('🏆 Classifica Ufficiale dei Pescatori del Regno')
      .setDescription(desc)
      .setFooter({ text: `${guild.name} • Classifica Pesca`, iconURL: guild.iconURL() })
      .setTimestamp();
  },

  /**
   * Sends the full Interactive Persistent Fishing Panel in the designated channel
   */
  async sendFishingPanel(guild, channelId, options = {}) {
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) throw new Error('Canale di pesca non trovato.');

    const config = DatabaseHelper.getFishingConfig(guild.id);
    const title = options.title || config.title || '🎣 Pesca Medievale dei Cavalieri';
    const color = options.color || config.color || '#38bdf8';

    const desc = options.description ||
      `Benvenuto al **Lago Sacro del Regno** di **${guild.name}**!\n\n` +
      `Qui puoi lanciare la tua canna da pesca, scoprire oltre **25 specie di pesci e tesori sommersi**, vendere il tuo pescato al mercante e scalare la classifica del regno!\n\n` +
      `🌊 **Come Giocare:**\n` +
      `• Clicca su **🎣 Lancia la Canna** per pescare.\n` +
      `• Controlla il tuo bottino con **🎒 Cestino & Profilo**.\n` +
      `• Vendi tutto il pesce per monete con **🪙 Vendi Pescato**.\n` +
      `• Potenzia la tua canna alla **🛒 Bottega Reale** per pescare creature leggendarie e tesori sommersi!`;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(desc)
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .setImage(options.image || 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80')
      .setFooter({ text: `${guild.name} • Sentry Fishing Station`, iconURL: guild.iconURL() })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_fish_cast')
        .setLabel('Lancia la Canna')
        .setEmoji('🎣')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('btn_fish_inv')
        .setLabel('Cestino & Profilo')
        .setEmoji('🎒')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('btn_fish_sell')
        .setLabel('Vendi Pescato')
        .setEmoji('🪙')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('btn_fish_shop')
        .setLabel('Bottega Canne')
        .setEmoji('🛒')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('btn_fish_top')
        .setLabel('Classifica')
        .setEmoji('🏆')
        .setStyle(ButtonStyle.Secondary)
    );

    return await channel.send({ embeds: [embed], components: [row] });
  },

  /**
   * Handles button interactions coming from the fishing panel
   */
  async handleButtonInteraction(interaction) {
    const { customId, guild, user, channelId } = interaction;

    if (customId === 'btn_fish_cast') {
      const result = await this.castRod(guild, user, channelId);
      if (!result.success) {
        return interaction.reply({ content: result.message, ephemeral: true });
      }
      return interaction.reply({ embeds: [result.embed], ephemeral: true });
    }

    if (customId === 'btn_fish_inv') {
      const embed = this.getInventoryEmbed(guild, user);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (customId === 'btn_fish_sell') {
      const result = this.sellCatch(guild, user);
      if (!result.success) {
        return interaction.reply({ content: result.message, ephemeral: true });
      }
      return interaction.reply({ embeds: [result.embed], ephemeral: true });
    }

    if (customId === 'btn_fish_shop') {
      const embed = this.getShopEmbed(guild, user);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_fish_upgrade_now')
          .setLabel('Acquista Prossima Canna')
          .setEmoji('✨')
          .setStyle(ButtonStyle.Success)
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (customId === 'btn_fish_upgrade_now') {
      const result = this.upgradeRod(guild, user);
      if (!result.success) {
        return interaction.reply({ content: result.message, ephemeral: true });
      }
      return interaction.reply({ embeds: [result.embed], ephemeral: true });
    }

    if (customId === 'btn_fish_top') {
      const embed = this.getLeaderboardEmbed(guild);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    return false;
  }
};

export default FishingManager;

import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';
import { FishingManager } from '../../modules/fishingManager.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('saldo')
    .setDescription('Mostra il tuo saldo monete d\'oro, patrimonio, canna da pesca e statistiche')
    .addUserOption(opt =>
      opt
        .setName('utente')
        .setDescription('Utente di cui visualizzare il saldo (opzionale)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('utente') || interaction.user;
    const guild = interaction.guild;

    const profile = DatabaseHelper.getFishingProfile(guild.id, targetUser.id);
    const userLevel = DatabaseHelper.getUserLevel(guild.id, targetUser.id);
    const bjStats = DatabaseHelper.getMinigameStats(guild.id, targetUser.id, 'blackjack');
    const slotStats = DatabaseHelper.getMinigameStats(guild.id, targetUser.id, 'slots');

    // Calculate inventory value
    const inventory = profile.inventory || [];
    const inventoryValue = inventory.reduce((sum, item) => sum + (Number(item.value) || 0), 0);

    // Leaderboard ranking
    const allProfiles = DatabaseHelper.getFishingLeaderboard(guild.id, 1000);
    const rankPos = allProfiles.findIndex(p => p.user_id === targetUser.id) + 1 || allProfiles.length + 1;

    // Rod details
    const ROD_TIERS = [
      { level: 1, name: 'Canna di Legno Grezza' },
      { level: 2, name: 'Canna di Quercia Rinforzata' },
      { level: 3, name: 'Canna d\'Argento Lucido' },
      { level: 4, name: 'Canna d\'Oro Regale' },
      { level: 5, name: 'Canna Mitica del Leviatano' }
    ];
    const rodInfo = ROD_TIERS.find(r => r.level === (profile.rod_level || 1)) || ROD_TIERS[0];

    const embed = new EmbedBuilder()
      .setColor('#eab308')
      .setAuthor({
        name: `Forziere Reale • ${targetUser.displayName || targetUser.username}`,
        iconURL: targetUser.displayAvatarURL({ dynamic: true })
      })
      .setTitle('🪙 Patrimonio & Tesoro del Cavaliere')
      .setDescription(
        `### 💰 Saldo Disponibile: **\`${(profile.coins || 0).toLocaleString()}\` Monete d'Oro 🪙**\n` +
        `> 🏆 **Posizione nel Reame:** \`#${rankPos}\` su ${allProfiles.length} cavalieri\n` +
        `> ⭐ **Livello Attuale:** \`Livello ${userLevel.level}\` (${userLevel.xp.toLocaleString()} XP)\n` +
        `> 🎣 **Equipaggiamento:** \`${rodInfo.name}\` (Liv. ${profile.rod_level || 1})\n` +
        `> 🎒 **Pescato nel Cestino:** \`${inventory.length} prede\` (Valore stimato: **${inventoryValue.toLocaleString()} 🪙**)`
      )
      .addFields(
        {
          name: '🃏 Casinò & Blackjack',
          value: `Partite: **${bjStats.games_played}** (Vinte: **${bjStats.games_won}**)\nVincite: **+${bjStats.total_won_coins.toLocaleString()} 🪙**`,
          inline: true
        },
        {
          name: '🎰 Slot Machine',
          value: `Giri: **${slotStats.games_played}** (Vinti: **${slotStats.games_won}**)\nRecord: **${slotStats.highest_win.toLocaleString()} 🪙**`,
          inline: true
        },
        {
          name: '🎣 Lago di Pesca',
          value: `Prede Totali: **${profile.total_fish_caught || 0}**\nCanna: **Livello ${profile.rod_level || 1}/5**`,
          inline: true
        }
      )
      .setFooter({ text: `${guild.name} • Sentry Economia Medievale`, iconURL: guild.iconURL() })
      .setTimestamp();

    const isSelf = targetUser.id === interaction.user.id;

    if (isSelf) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_hub_fishing')
          .setLabel('Pesca Subito')
          .setEmoji('🎣')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('btn_hub_blackjack')
          .setLabel('Gioca Blackjack')
          .setEmoji('🃏')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('btn_hub_slots')
          .setLabel('Gira la Slot')
          .setEmoji('🎰')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('btn_hub_daily')
          .setLabel('Daily Reward')
          .setEmoji('🎁')
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};


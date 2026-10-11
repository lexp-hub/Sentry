import {
  SlashCommandBuilder,
  ChannelType,
  PermissionsBitField
} from 'discord.js';
import { BlackjackManager } from '../../modules/blackjackManager.js';
import { DatabaseHelper } from '../../../database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Gioca a Blackjack contro il Banco sfidando la sorte per vincere monete!')
    .addSubcommand(sub =>
      sub
        .setName('gioca')
        .setDescription('Avvia una nuova partita di Blackjack con la tua puntata')
        .addIntegerOption(opt =>
          opt
            .setName('puntata')
            .setDescription('Quantità di monete da scommettere (es. 50)')
            .setMinValue(10)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('statistiche')
        .setDescription('Mostra le tue statistiche di vittoria e vincite a Blackjack')
    )
    .addSubcommand(sub =>
      sub
        .setName('panel')
        .setDescription('Invia il tavolo interattivo di Blackjack con pulsanti di puntata rapida')
        .addChannelOption(opt =>
          opt
            .setName('canale')
            .setDescription('Canale in cui inviare il tavolo da Blackjack')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('titolo')
            .setDescription('Titolo personalizzato per il tavolo')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('descrizione')
            .setDescription('Descrizione personalizzata per il tavolo')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('config')
        .setDescription('Configura il canale dedicato e i limiti di puntata per il Blackjack')
        .addChannelOption(opt =>
          opt
            .setName('canale')
            .setDescription('Canale dedicato al Blackjack / Casinò')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt
            .setName('min_bet')
            .setDescription('Puntata minima consentita (default: 10)')
            .setMinValue(1)
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt
            .setName('max_bet')
            .setDescription('Puntata massima consentita (default: 5000)')
            .setMinValue(50)
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const user = interaction.user;
    const channelId = interaction.channelId;

    // 1. PLAY BLACKJACK
    if (subcommand === 'gioca') {
      const bet = interaction.options.getInteger('puntata');
      const result = await BlackjackManager.startGame(guild, user, channelId, bet);

      if (!result.success) {
        return interaction.reply({ content: result.message, ephemeral: true });
      }

      const components = result.row ? [result.row] : [];
      return interaction.reply({ embeds: [result.embed], components, ephemeral: true });
    }

    // 2. STATS
    if (subcommand === 'statistiche') {
      const profile = DatabaseHelper.getFishingProfile(guild.id, user.id);
      const stats = DatabaseHelper.getMinigameStats(guild.id, user.id, 'blackjack');
      const winRate = stats.games_played > 0 ? ((stats.games_won / stats.games_played) * 100).toFixed(1) : '0.0';

      return interaction.reply({
        embeds: [{
          color: 0x3b82f6,
          title: `🃏 Statistiche Blackjack • ${user.displayName || user.username}`,
          fields: [
            { name: '🪙 Saldo Monete', value: `**${(profile.coins || 0).toLocaleString()} 🪙**`, inline: true },
            { name: '🎮 Partite Giocate', value: `**${stats.games_played}**`, inline: true },
            { name: '🏆 Vittorie', value: `**${stats.games_won}** (${winRate}%)`, inline: true },
            { name: '💸 Monete Vinte', value: `+${stats.total_won_coins.toLocaleString()} 🪙`, inline: true },
            { name: '📉 Monete Perse', value: `-${stats.total_lost_coins.toLocaleString()} 🪙`, inline: true },
            { name: '👑 Miglior Vincita', value: `${stats.highest_win.toLocaleString()} 🪙`, inline: true }
          ],
          footer: { text: `${guild.name} • Sentry Casino` },
          timestamp: new Date()
        }],
        ephemeral: true
      });
    }

    // 3. PANEL (Admin)
    if (subcommand === 'panel') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return interaction.reply({ content: '❌ Solo gli amministratori possono inviare il pannello Blackjack.', ephemeral: true });
      }

      const targetChannel = interaction.options.getChannel('canale') || interaction.channel;
      const title = interaction.options.getString('titolo');
      const description = interaction.options.getString('descrizione');

      try {
        await BlackjackManager.sendBlackjackPanel(guild, targetChannel.id, { title, description });
        return interaction.reply({
          content: `✅ Tavolo da Blackjack inviato con successo in <#${targetChannel.id}>!`,
          ephemeral: true
        });
      } catch (err) {
        return interaction.reply({
          content: `❌ Errore durante l'invio del tavolo: ${err.message}`,
          ephemeral: true
        });
      }
    }

    // 4. CONFIG (Admin)
    if (subcommand === 'config') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return interaction.reply({ content: '❌ Solo gli amministratori possono configurare il Blackjack.', ephemeral: true });
      }

      const channel = interaction.options.getChannel('canale');
      const minBet = interaction.options.getInteger('min_bet');
      const maxBet = interaction.options.getInteger('max_bet');

      const updates = {};
      if (channel) updates.blackjack_channel_id = channel.id;
      if (minBet !== null) updates.min_bet = minBet;
      if (maxBet !== null) updates.max_bet = maxBet;

      const newConfig = DatabaseHelper.updateMinigamesConfig(guild.id, updates);

      return interaction.reply({
        content: `✅ **Configurazione Blackjack Aggiornata:**\n` +
                 `• **Canale Dedicato:** ${newConfig.blackjack_channel_id ? `<#${newConfig.blackjack_channel_id}>` : '*Tutti i canali permessi*'}\n` +
                 `• **Puntata Minima:** \`${newConfig.min_bet} 🪙\`\n` +
                 `• **Puntata Massima:** \`${newConfig.max_bet} 🪙\``,
        ephemeral: true
      });
    }
  }
};

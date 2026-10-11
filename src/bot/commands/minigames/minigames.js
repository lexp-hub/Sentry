import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField
} from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('minigames')
    .setDescription('Gestione generale dei minigiochi, casinò medievale e assegnazione canali')
    .addSubcommand(sub =>
      sub
        .setName('panel')
        .setDescription('Invia l\'Hub interattivo dei Minigiochi con pulsanti rapidi per tutti i giochi')
        .addChannelOption(opt =>
          opt
            .setName('canale')
            .setDescription('Canale in cui inviare l\'Hub dei Minigiochi')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('titolo')
            .setDescription('Titolo personalizzato per l\'Hub')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('descrizione')
            .setDescription('Descrizione personalizzata')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('config')
        .setDescription('Configura i canali dedicati per ciascun minigioco e i limiti economici')
        .addChannelOption(opt =>
          opt
            .setName('canale_generale')
            .setDescription('Canale predefinito per tutti i minigiochi')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addChannelOption(opt =>
          opt
            .setName('canale_pesca')
            .setDescription('Canale dedicato alla Pesca')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addChannelOption(opt =>
          opt
            .setName('canale_blackjack')
            .setDescription('Canale dedicato al Blackjack')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addChannelOption(opt =>
          opt
            .setName('canale_slot')
            .setDescription('Canale dedicato alle Slot Machine')
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
        .addIntegerOption(opt =>
          opt
            .setName('ricompensa_daily')
            .setDescription('Monete assegnate con il comando /daily (default: 150)')
            .setMinValue(10)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('statistiche')
        .setDescription('Panoramica completa del tuo profilo economico e di gioco')
    )
    .addSubcommand(sub =>
      sub
        .setName('saldo')
        .setDescription('Mostra il tuo saldo monete d\'oro e patrimonio attuale')
    )
    .addSubcommand(sub =>
      sub
        .setName('setcoins')
        .setDescription('Aggiungi, rimuovi o imposta le monete di un utente (Solo Amministratori)')
        .addUserOption(opt =>
          opt
            .setName('utente')
            .setDescription('Utente a cui modificare il saldo monete')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName('quantita')
            .setDescription('Quantità di monete')
            .setMinValue(0)
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('operazione')
            .setDescription('Operazione da eseguire')
            .addChoices(
              { name: '➕ Aggiungi (+)', value: 'add' },
              { name: '➖ Rimuovi (-)', value: 'remove' },
              { name: '🟰 Imposta Saldo Esatto (=)', value: 'set' }
            )
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('reset')
        .setDescription('Azzera completamente l\'economia e le monete di tutti i membri (Solo Amministratori)')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const user = interaction.user;

    // 1. STATS & SALDO
    if (subcommand === 'statistiche' || subcommand === 'saldo') {
      const profile = DatabaseHelper.getFishingProfile(guild.id, user.id);
      const bjStats = DatabaseHelper.getMinigameStats(guild.id, user.id, 'blackjack');
      const slotStats = DatabaseHelper.getMinigameStats(guild.id, user.id, 'slots');

      const embed = new EmbedBuilder()
        .setColor('#eab308')
        .setAuthor({
          name: `🛡️ Sala Giochi • Profilo di ${user.displayName || user.username}`,
          iconURL: user.displayAvatarURL({ dynamic: true })
        })
        .setTitle('📜 Registro Reale delle Imprese di Gioco')
        .addFields(
          { name: '🪙 Monete Possedute', value: `**${(profile.coins || 0).toLocaleString()} 🪙**`, inline: true },
          { name: '🎣 Pesci Totali Catturati', value: `**${profile.total_fish_caught || 0}** prede`, inline: true },
          { name: '🎒 Oggetti nel Cestino', value: `**${(profile.inventory || []).length}** oggetti`, inline: true },
          {
            name: '🃏 Blackjack',
            value: `> Partite: **${bjStats.games_played}** (Vinte: **${bjStats.games_won}**)\n> Saldo: **+${bjStats.total_won_coins.toLocaleString()} 🪙** / **-${bjStats.total_lost_coins.toLocaleString()} 🪙**`,
            inline: false
          },
          {
            name: '🎰 Slot Machine',
            value: `> Giri: **${slotStats.games_played}** (Vinti: **${slotStats.games_won}**)\n> Record Vincita: **${slotStats.highest_win.toLocaleString()} 🪙**`,
            inline: false
          }
        )
        .setFooter({ text: `${guild.name} • Sentry Minigiochi`, iconURL: guild.iconURL() })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      setTimeout(() => { interaction.deleteReply().catch(() => {}); }, 15000);
      return;
    }

    // 2. PANEL (Admin)
    if (subcommand === 'panel') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return interaction.reply({ content: '❌ Solo gli amministratori possono inviare l\'Hub Minigiochi.', ephemeral: true });
      }

      const targetChannel = interaction.options.getChannel('canale') || interaction.channel;
      const title = interaction.options.getString('titolo') || '🏰 Sala Giochi & Casinò del Regno';
      const desc = interaction.options.getString('descrizione') ||
        `Benvenuto nella **Sala Giochi Ufficiale** di **${guild.name}**!\n\n` +
        `Metti alla prova la tua fortuna e abilità nei minigiochi medievali di Sentry!\n\n` +
        `🎮 **Attività Disponibili:**\n` +
        `• 🎣 **Pesca Medievale**: Lancia l'amo nel Lago Sacro per pescare oltre 25 specie e tesori sommersi.\n` +
        `• 🃏 **Tavolo da Blackjack**: Sfida il Banco a 21 con raddoppio e vincite reali.\n` +
        `• 🎰 **Slot Machine**: Gira i rulli alla ricerca del Tris Reale (Jackpot x10).\n` +
        `• 🎁 **Ricompensa Giornaliera**: Riscatta le tue monete quotidiane gratuite ogni 24h!`;

      const embed = new EmbedBuilder()
        .setColor('#eab308')
        .setTitle(title)
        .setDescription(desc)
        .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
        .setImage('https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=1200&q=80')
        .setFooter({ text: `${guild.name} • Sentry Game Hub`, iconURL: guild.iconURL() })
        .setTimestamp();

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_hub_fishing')
          .setLabel('Pesca Medievale')
          .setEmoji('🎣')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('btn_hub_blackjack')
          .setLabel('Blackjack (50 🪙)')
          .setEmoji('🃏')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('btn_hub_slots')
          .setLabel('Slot Machine (50 🪙)')
          .setEmoji('🎰')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('btn_hub_daily')
          .setLabel('Daily Reward')
          .setEmoji('🎁')
          .setStyle(ButtonStyle.Secondary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_hub_profile')
          .setLabel('Controlla Saldo & Forziere')
          .setEmoji('🪙')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('btn_hub_top')
          .setLabel('Classifica Ricchezza')
          .setEmoji('🏆')
          .setStyle(ButtonStyle.Secondary)
      );

      await targetChannel.send({ embeds: [embed], components: [row1, row2] });

      return interaction.reply({
        content: `✅ Hub dei Minigiochi inviato con successo in <#${targetChannel.id}>!`,
        ephemeral: true
      });
    }

    // 3. CONFIG (Admin)
    if (subcommand === 'config') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return interaction.reply({ content: '❌ Solo gli amministratori possono configurare i canali dei minigiochi.', ephemeral: true });
      }

      const generalChannel = interaction.options.getChannel('canale_generale');
      const fishingChannel = interaction.options.getChannel('canale_pesca');
      const bjChannel = interaction.options.getChannel('canale_blackjack');
      const slotChannel = interaction.options.getChannel('canale_slot');
      const minBet = interaction.options.getInteger('min_bet');
      const maxBet = interaction.options.getInteger('max_bet');
      const dailyReward = interaction.options.getInteger('ricompensa_daily');

      const mgUpdates = {};
      if (generalChannel) mgUpdates.general_channel_id = generalChannel.id;
      if (bjChannel) mgUpdates.blackjack_channel_id = bjChannel.id;
      if (slotChannel) mgUpdates.slots_channel_id = slotChannel.id;
      if (minBet !== null) mgUpdates.min_bet = minBet;
      if (maxBet !== null) mgUpdates.max_bet = maxBet;
      if (dailyReward !== null) mgUpdates.daily_reward = dailyReward;

      const newMgConfig = DatabaseHelper.updateMinigamesConfig(guild.id, mgUpdates);

      if (fishingChannel) {
        DatabaseHelper.updateFishingConfig(guild.id, { channel_id: fishingChannel.id });
      }

      const fishConfig = DatabaseHelper.getFishingConfig(guild.id);

      return interaction.reply({
        content: `✅ **Configurazione Minigiochi & Assegnazione Canali Salvata:**\n\n` +
                 `• 🎮 **Canale Generale Giochi:** ${newMgConfig.general_channel_id ? `<#${newMgConfig.general_channel_id}>` : '*Nessuno (Tutti i canali)*'}\n` +
                 `• 🎣 **Canale Pesca Dedicato:** ${fishConfig.channel_id ? `<#${fishConfig.channel_id}>` : '*Nessuno (Tutti i canali)*'}\n` +
                 `• 🃏 **Canale Blackjack Dedicato:** ${newMgConfig.blackjack_channel_id ? `<#${newMgConfig.blackjack_channel_id}>` : '*Nessuno (Canale Generale)*'}\n` +
                 `• 🎰 **Canale Slot Machine Dedicato:** ${newMgConfig.slots_channel_id ? `<#${newMgConfig.slots_channel_id}>` : '*Nessuno (Canale Generale)*'}\n` +
                 `• 💸 **Limiti Puntata:** \`${newMgConfig.min_bet} 🪙\` min — \`${newMgConfig.max_bet} 🪙\` max\n` +
                 `• 🎁 **Ricompensa Daily:** \`+${newMgConfig.daily_reward} 🪙\` monete`,
        ephemeral: true
      });
    }

    // 4. SETCOINS (Admin)
    if (subcommand === 'setcoins') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return interaction.reply({ content: '❌ Solo gli amministratori possono gestire la tesoreria.', ephemeral: true });
      }

      const targetUser = interaction.options.getUser('utente');
      const amount = interaction.options.getInteger('quantita');
      const op = interaction.options.getString('operazione') || 'add';

      const profile = DatabaseHelper.modifyUserCoins(guild.id, targetUser.id, amount, op);

      const opLabels = {
        add: `accreditato **+${amount.toLocaleString()} 🪙** monete a`,
        remove: `sottratto **-${amount.toLocaleString()} 🪙** monete da`,
        set: `impostato il saldo a **${amount.toLocaleString()} 🪙** per`
      };

      return interaction.reply({
        content: `✅ **Tesoreria Aggiornata:** Hai ${opLabels[op] || 'modificato le monete di'} ${targetUser}.\n💰 **Nuovo Saldo:** \`${profile.coins.toLocaleString()}\` 🪙 monete.`,
        ephemeral: true
      });
    }

    // 5. RESET (Admin)
    if (subcommand === 'reset') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '❌ Solo gli amministratori del server possono azzerare l\'economia.', ephemeral: true });
      }

      DatabaseHelper.resetEconomy(guild.id);

      const embed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle('🔄 Economia del Server Azzerata')
        .setDescription('Tutti i forzieri, monete e statistiche dei minigiochi sono stati azzerati con successo per tutti i cavalieri.')
        .setFooter({ text: `${guild.name} • Sentry Economia`, iconURL: guild.iconURL() })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  }
};

import {
  SlashCommandBuilder,
  ChannelType,
  PermissionsBitField
} from 'discord.js';
import { FishingManager, FISHING_RODS } from '../../modules/fishingManager.js';
import { DatabaseHelper } from '../../../database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pesca')
    .setDescription('Minigioco medievale di pesca: cattura pesci, trova tesori e potenzia la tua canna!')
    .addSubcommand(sub =>
      sub
        .setName('lancia')
        .setDescription('Lancia l\'amo nelle acque del regno e pesca!')
    )
    .addSubcommand(sub =>
      sub
        .setName('inventario')
        .setDescription('Mostra il tuo cestino di pesci, monete e canna da pesca')
    )
    .addSubcommand(sub =>
      sub
        .setName('vendi')
        .setDescription('Vendi tutti i pesci e tesori del tuo cestino al mercante del regno')
    )
    .addSubcommand(sub =>
      sub
        .setName('shop')
        .setDescription('Negozio reale delle canne da pesca ed equipaggiamento')
    )
    .addSubcommand(sub =>
      sub
        .setName('upgrade')
        .setDescription('Acquista il prossimo livello della canna da pesca')
    )
    .addSubcommand(sub =>
      sub
        .setName('classifica')
        .setDescription('Classifica dei pescatori più ricchi del server')
    )
    .addSubcommand(sub =>
      sub
        .setName('saldo')
        .setDescription('Mostra il tuo saldo monete d\'oro, canna attuale e valore del pescato')
    )
    .addSubcommand(sub =>
      sub
        .setName('panel')
        .setDescription('Invia il pannello interattivo permanente di pesca con pulsanti')
        .addChannelOption(opt =>
          opt
            .setName('canale')
            .setDescription('Canale in cui inviare il pannello di pesca')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('titolo')
            .setDescription('Titolo personalizzato del pannello')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('descrizione')
            .setDescription('Descrizione personalizzata del pannello')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('immagine')
            .setDescription('URL del banner o immagine del pannello')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('config')
        .setDescription('Configura il canale dedicato e i parametri del modulo pesca')
        .addChannelOption(opt =>
          opt
            .setName('canale')
            .setDescription('Canale dedicato alla pesca')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt
            .setName('attivo')
            .setDescription('Abilita o disabilita il modulo di pesca nel server')
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt
            .setName('cooldown')
            .setDescription('Secondi di attesa tra un lancio e l\'altro (es. 15)')
            .setMinValue(3)
            .setMaxValue(300)
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('titolo')
            .setDescription('Titolo personalizzato per il modulo pesca')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('colore')
            .setDescription('Colore HEX del modulo (es. #38bdf8)')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const user = interaction.user;
    const channelId = interaction.channelId;

    // 1. CAST ROD
    if (subcommand === 'lancia') {
      const result = await FishingManager.castRod(guild, user, channelId);
      if (!result.success) {
        return interaction.reply({ content: result.message, ephemeral: true });
      }
      return interaction.reply({ embeds: [result.embed], ephemeral: true });
    }

    // 2. INVENTORY
    if (subcommand === 'inventario') {
      const embed = FishingManager.getInventoryEmbed(guild, user);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 3. SELL
    if (subcommand === 'vendi') {
      const result = FishingManager.sellCatch(guild, user);
      if (!result.success) {
        return interaction.reply({ content: result.message, ephemeral: true });
      }
      return interaction.reply({ embeds: [result.embed], ephemeral: true });
    }

    // 4. SHOP
    if (subcommand === 'shop') {
      const embed = FishingManager.getShopEmbed(guild, user);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 5. UPGRADE
    if (subcommand === 'upgrade') {
      const result = FishingManager.upgradeRod(guild, user);
      if (!result.success) {
        return interaction.reply({ content: result.message, ephemeral: true });
      }
      return interaction.reply({ embeds: [result.embed], ephemeral: true });
    }

    // 6. LEADERBOARD
    if (subcommand === 'classifica') {
      const embed = FishingManager.getLeaderboardEmbed(guild);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 7. BALANCE / SALDO
    if (subcommand === 'saldo') {
      const profile = DatabaseHelper.getFishingProfile(guild.id, user.id);
      const inventory = profile.inventory || [];
      const inventoryValue = inventory.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
      const ROD_TIERS = [
        { level: 1, name: 'Canna di Legno Grezza' },
        { level: 2, name: 'Canna di Quercia Rinforzata' },
        { level: 3, name: 'Canna d\'Argento Lucido' },
        { level: 4, name: 'Canna d\'Oro Regale' },
        { level: 5, name: 'Canna Mitica del Leviatano' }
      ];
      const rodInfo = ROD_TIERS.find(r => r.level === (profile.rod_level || 1)) || ROD_TIERS[0];

      const embed = new EmbedBuilder()
        .setColor('#38bdf8')
        .setAuthor({
          name: `🎣 Saldo Pesca • ${user.displayName || user.username}`,
          iconURL: user.displayAvatarURL({ dynamic: true })
        })
        .setTitle('🪙 Forziere & Equipaggiamento da Pesca')
        .setDescription(
          `💰 **Monete Possedute:** \`${(profile.coins || 0).toLocaleString()}\` 🪙\n` +
          `🎣 **Canna da Pesca:** \`${rodInfo.name}\` (Liv. ${profile.rod_level || 1})\n` +
          `🎒 **Pescato nel Cestino:** \`${inventory.length} prede\` (Valore stimato: **${inventoryValue.toLocaleString()} 🪙**)\n` +
          `🐟 **Catture Totali di Sempre:** \`${profile.total_fish_caught || 0}\` prede`
        )
        .setFooter({ text: `${guild.name} • Sentry Pesca`, iconURL: guild.iconURL() })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 7. PANEL (Admin)
    if (subcommand === 'panel') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return interaction.reply({ content: '❌ Solo gli amministratori possono inviare il pannello di pesca.', ephemeral: true });
      }

      const targetChannel = interaction.options.getChannel('canale') || interaction.channel;
      const title = interaction.options.getString('titolo');
      const description = interaction.options.getString('descrizione');
      const image = interaction.options.getString('immagine');

      try {
        await FishingManager.sendFishingPanel(guild, targetChannel.id, { title, description, image });
        return interaction.reply({
          content: `✅ Pannello interattivo di pesca inviato con successo in <#${targetChannel.id}>!`,
          ephemeral: true
        });
      } catch (err) {
        return interaction.reply({
          content: `❌ Errore durante l'invio del pannello: ${err.message}`,
          ephemeral: true
        });
      }
    }

    // 8. CONFIG (Admin)
    if (subcommand === 'config') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return interaction.reply({ content: '❌ Solo gli amministratori possono configurare la pesca.', ephemeral: true });
      }

      const channel = interaction.options.getChannel('canale');
      const enabled = interaction.options.getBoolean('attivo');
      const cooldown = interaction.options.getInteger('cooldown');
      const title = interaction.options.getString('titolo');
      const color = interaction.options.getString('colore');

      const updates = {};
      if (channel) updates.channel_id = channel.id;
      if (enabled !== null) updates.enabled = enabled;
      if (cooldown !== null) updates.cooldown_seconds = cooldown;
      if (title) updates.title = title;
      if (color) updates.color = color;

      const newConfig = DatabaseHelper.updateFishingConfig(guild.id, updates);

      return interaction.reply({
        content: `✅ **Configurazione Pesca Aggiornata:**\n` +
                 `• **Stato:** ${newConfig.enabled ? '🟢 Attivo' : '🔴 Disattivato'}\n` +
                 `• **Canale Dedicato:** ${newConfig.channel_id ? `<#${newConfig.channel_id}>` : '*Tutti i canali permessi*'}\n` +
                 `• **Cooldown:** \`${newConfig.cooldown_seconds}s\`\n` +
                 `• **Titolo:** \`${newConfig.title}\``,
        ephemeral: true
      });
    }
  }
};

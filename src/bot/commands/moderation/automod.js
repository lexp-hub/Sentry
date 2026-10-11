import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType
} from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configura le regole di protezione automatica e le whitelist di AutoMod')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Mostra lo stato e le regole attive di AutoMod')
    )
    .addSubcommand(sub =>
      sub
        .setName('youtube_whitelist')
        .setDescription('Aggiungi o rimuovi un canale dalla whitelist per i link YouTube')
        .addStringOption(opt =>
          opt
            .setName('azione')
            .setDescription('Azione da compiere')
            .setRequired(true)
            .addChoices(
              { name: '➕ Aggiungi Canale', value: 'ADD' },
              { name: '➖ Rimuovi Canale', value: 'REMOVE' }
            )
        )
        .addChannelOption(opt =>
          opt
            .setName('canale')
            .setDescription('Il canale da gestire nella whitelist YouTube')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('sticker_whitelist')
        .setDescription('Aggiungi o rimuovi un canale dalla whitelist per gli Sticker')
        .addStringOption(opt =>
          opt
            .setName('azione')
            .setDescription('Azione da compiere')
            .setRequired(true)
            .addChoices(
              { name: '➕ Aggiungi Canale', value: 'ADD' },
              { name: '➖ Rimuovi Canale', value: 'REMOVE' }
            )
        )
        .addChannelOption(opt =>
          opt
            .setName('canale')
            .setDescription('Il canale da gestire nella whitelist Sticker')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('toggle')
        .setDescription('Attiva o disattiva un modulo di protezione AutoMod')
        .addStringOption(opt =>
          opt
            .setName('modulo')
            .setDescription('Il modulo AutoMod da modificare')
            .setRequired(true)
            .addChoices(
              { name: 'Anti-Invite (Blocca inviti Discord)', value: 'anti_invite' },
              { name: 'Anti-Link (Blocca link esterni)', value: 'anti_link' },
              { name: 'Anti-Spam (Blocca messaggi a raffica)', value: 'anti_spam' },
              { name: 'Anti-Caps (Blocca testo in maiuscolo)', value: 'anti_caps' },
              { name: 'Anti-Stickers (Blocca sticker fuori dai canali autorizzati)', value: 'anti_stickers' }
            )
        )
        .addBooleanOption(opt =>
          opt
            .setName('stato')
            .setDescription('Attiva o disattiva il modulo')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({
        content: '❌ Non hai il permesso di gestire il server (`Manage Server`).',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const config = DatabaseHelper.getAutomodConfig(interaction.guild.id);

    // 1. Status Subcommand
    if (subcommand === 'status') {
      const ytList = (config.youtube_whitelist_channels || []).map(id => `<#${id}>`).join(', ') || '*Nessun canale (disattivata)*';
      const stickerList = (config.stickers_whitelist_channels || []).map(id => `<#${id}>`).join(', ') || '*Nessun canale (disattivata)*';
      const badWordsCount = (config.bad_words || []).length;

      const embed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_COLOR || '#6366f1')
        .setTitle('🛡️ Stato AutoMod & Whitelist • Sentry')
        .setDescription('Configurazione corrente del sistema di moderazione automatica per questo server.')
        .addFields(
          { name: '🔗 Anti-Invite', value: config.anti_invite ? '🟢 `Attivo`' : '🔴 `Disattivo`', inline: true },
          { name: '🌐 Anti-Link', value: config.anti_link ? '🟢 `Attivo`' : '🔴 `Disattivo`', inline: true },
          { name: '⚡ Anti-Spam', value: config.anti_spam ? '🟢 `Attivo`' : '🔴 `Disattivo`', inline: true },
          { name: '🔠 Anti-Caps', value: config.anti_caps ? '🟢 `Attivo`' : '🔴 `Disattivo`', inline: true },
          { name: '🏷️ Anti-Stickers', value: config.anti_stickers ? '🟢 `Attivo`' : '🔴 `Disattivo`', inline: true },
          { name: '🚫 Parole Vietate', value: `\`${badWordsCount}\` parole registrate`, inline: true },
          { name: '📺 Canali Whitelist YouTube', value: ytList, inline: false },
          { name: '🎨 Canali Whitelist Sticker', value: stickerList, inline: false }
        )
        .setFooter({ text: `${interaction.guild.name} • Sentry Protection`, iconURL: interaction.guild.iconURL() })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // 2. YouTube Whitelist Subcommand
    if (subcommand === 'youtube_whitelist') {
      const action = interaction.options.getString('azione');
      const targetChannel = interaction.options.getChannel('canale');
      let ytChannels = [...(config.youtube_whitelist_channels || [])];

      if (action === 'ADD') {
        if (!ytChannels.includes(targetChannel.id)) {
          ytChannels.push(targetChannel.id);
        }
        DatabaseHelper.updateAutomodConfig(interaction.guild.id, { youtube_whitelist_channels: ytChannels });
        return interaction.reply({
          content: `✅ Canale ${targetChannel} aggiunto con successo alla **Whitelist YouTube**! I link a YouTube saranno consentiti in questo canale anche con Anti-Link attivo.`,
          ephemeral: true
        });
      } else {
        ytChannels = ytChannels.filter(id => id !== targetChannel.id);
        DatabaseHelper.updateAutomodConfig(interaction.guild.id, { youtube_whitelist_channels: ytChannels });
        return interaction.reply({
          content: `✅ Canale ${targetChannel} rimosso dalla **Whitelist YouTube**.`,
          ephemeral: true
        });
      }
    }

    // 3. Sticker Whitelist Subcommand
    if (subcommand === 'sticker_whitelist') {
      const action = interaction.options.getString('azione');
      const targetChannel = interaction.options.getChannel('canale');
      let stickerChannels = [...(config.stickers_whitelist_channels || [])];

      if (action === 'ADD') {
        if (!stickerChannels.includes(targetChannel.id)) {
          stickerChannels.push(targetChannel.id);
        }
        DatabaseHelper.updateAutomodConfig(interaction.guild.id, { stickers_whitelist_channels: stickerChannels });
        return interaction.reply({
          content: `✅ Canale ${targetChannel} aggiunto con successo alla **Whitelist Sticker**! Gli sticker saranno sempre consentiti in questo canale.`,
          ephemeral: true
        });
      } else {
        stickerChannels = stickerChannels.filter(id => id !== targetChannel.id);
        DatabaseHelper.updateAutomodConfig(interaction.guild.id, { stickers_whitelist_channels: stickerChannels });
        return interaction.reply({
          content: `✅ Canale ${targetChannel} rimosso dalla **Whitelist Sticker**.`,
          ephemeral: true
        });
      }
    }

    // 4. Toggle Subcommand
    if (subcommand === 'toggle') {
      const moduleKey = interaction.options.getString('modulo');
      const state = interaction.options.getBoolean('stato');

      const updateData = {};
      updateData[moduleKey] = state ? 1 : 0;
      DatabaseHelper.updateAutomodConfig(interaction.guild.id, updateData);

      const readableNames = {
        anti_invite: 'Anti-Invite',
        anti_link: 'Anti-Link',
        anti_spam: 'Anti-Spam',
        anti_caps: 'Anti-Caps',
        anti_stickers: 'Anti-Stickers'
      };

      return interaction.reply({
        content: `✅ Modulo **${readableNames[moduleKey] || moduleKey}** impostato a: ${state ? '🟢 `ATTIVO`' : '🔴 `DISATTIVO`'}.`,
        ephemeral: true
      });
    }
  }
};


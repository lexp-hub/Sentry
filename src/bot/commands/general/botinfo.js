import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  version as djsVersion
} from 'discord.js';
import { CONFIG } from '../../../config.js';
import os from 'os';

export default {
  data: new SlashCommandBuilder()
    .setName('botinfo')
    .setDescription('Mostra informazioni tecniche e statistiche su Sentry'),

  async execute(interaction) {
    const { client } = interaction;
    const uptime = Math.floor(process.uptime());
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const uptimeStr = `${days}g ${hours}h ${minutes}m`;

    const totalGuilds = client.guilds.cache.size;
    const totalUsers = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);

    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_COLOR)
      .setTitle('🛡️ Informazioni su Sentry')
      .setDescription(
        '**Sentry** è una sentinella multifunzione all-in-one di nuova generazione dotata di Dashboard web interattiva, intelligenza artificiale neurale Llama 70B, sistema partnership automatico, embed builder live, ticket e automod.'
      )
      .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '👑 Nome Bot', value: `\`${client.user.tag}\``, inline: true },
        { name: '🌐 Server Connessi', value: `\`${totalGuilds.toLocaleString()}\``, inline: true },
        { name: '👥 Utenti Serviti', value: `\`${totalUsers.toLocaleString()}\``, inline: true },
        { name: '⏱️ Uptime', value: `\`${uptimeStr}\``, inline: true },
        { name: '⚙️ Node.js', value: `\`${process.version}\``, inline: true },
        { name: '📚 Discord.js', value: `\`v${djsVersion}\``, inline: true },
        { name: '💻 Piattaforma', value: `\`${os.type()} ${os.arch()}\``, inline: true },
        { name: '🧠 RAM Bot', value: `\`${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB\``, inline: true },
        { name: '🔗 Dashboard', value: `[Visita la Dashboard](${CONFIG.DASHBOARD_URL || 'https://sentry.wispbyte.app'})`, inline: true }
      )
      .setFooter({ text: 'Sentry • Sicurezza & Gestione Server', iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    const baseUrl = (CONFIG.DASHBOARD_URL && !CONFIG.DASHBOARD_URL.includes('localhost') && !CONFIG.DASHBOARD_URL.includes('127.0.0.1'))
      ? CONFIG.DASHBOARD_URL
      : 'https://sentry.wispbyte.app';

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('🌐 Dashboard')
        .setStyle(ButtonStyle.Link)
        .setURL(baseUrl),
      new ButtonBuilder()
        .setLabel('🔒 Privacy Policy')
        .setStyle(ButtonStyle.Link)
        .setURL(`${baseUrl}/privacy`),
      new ButtonBuilder()
        .setLabel('📜 Termini di Servizio')
        .setStyle(ButtonStyle.Link)
        .setURL(`${baseUrl}/terms`)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  }
};

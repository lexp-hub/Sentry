import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('terms')
    .setDescription('Visualizza i Termini di Servizio (Terms of Service) ufficiali di Sentry'),

  async execute(interaction) {
    const baseUrl = (CONFIG.DASHBOARD_URL && !CONFIG.DASHBOARD_URL.includes('localhost') && !CONFIG.DASHBOARD_URL.includes('127.0.0.1'))
      ? CONFIG.DASHBOARD_URL
      : 'https://sentry.wispbyte.app';

    const termsUrl = `${baseUrl}/terms`;
    const privacyUrl = `${baseUrl}/privacy`;

    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_COLOR)
      .setTitle('📜 Termini di Servizio (Terms of Service) | Sentry')
      .setDescription(
        'L\'utilizzo di **Sentry** e della sua Dashboard Web è regolato dai Termini di Servizio ufficiali:\n\n' +
        '• **Accettazione**: Aggiungere o usare Sentry comporta la totale accettazione dei Termini e delle Discord Community Guidelines.\n' +
        '• **Condotta Vietata**: È severamente proibito tentare exploit, attacchi DDoS, spam dei comandi o utilizzo per attività illecite.\n' +
        '• **Disponibilità**: Il servizio è offerto "as is" con impegno al massimo uptime e manutenzioni periodiche per la sicurezza.\n' +
        '• **Sanzioni**: L\'accesso al bot o alla dashboard può essere revocato in caso di accertato abuso.'
      )
      .addFields(
        { name: '🌐 Termini di Servizio Completi', value: `[Consulta i ToS online](${termsUrl})`, inline: true },
        { name: '🔒 Informativa Privacy', value: `[Consulta la Privacy Policy](${privacyUrl})`, inline: true }
      )
      .setFooter({
        text: 'Sentry • Documentazione Legale Ufficiale',
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('📜 Termini di Servizio Online')
        .setStyle(ButtonStyle.Link)
        .setURL(termsUrl),
      new ButtonBuilder()
        .setLabel('🔒 Privacy Policy')
        .setStyle(ButtonStyle.Link)
        .setURL(privacyUrl)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  }
};


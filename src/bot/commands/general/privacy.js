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
    .setName('privacy')
    .setDescription('Mostra l\'Informativa sulla Privacy, i Termini di Servizio e i diritti GDPR di Sentry')
    .addStringOption(option =>
      option
        .setName('sezione')
        .setDescription('Scegli quale documento o informazione visualizzare')
        .setRequired(false)
        .addChoices(
          { name: '🔒 Informativa Privacy (GDPR)', value: 'privacy' },
          { name: '📜 Termini di Servizio (ToS)', value: 'terms' },
          { name: '🗑️ Richiesta Cancellazione Dati', value: 'deletion' }
        )
    ),

  async execute(interaction) {
    const section = interaction.options.getString('sezione') || 'privacy';
    const baseUrl = (CONFIG.DASHBOARD_URL && !CONFIG.DASHBOARD_URL.includes('localhost') && !CONFIG.DASHBOARD_URL.includes('127.0.0.1'))
      ? CONFIG.DASHBOARD_URL
      : 'https://sentry.wispbyte.app';

    const privacyUrl = `${baseUrl}/privacy`;
    const termsUrl = `${baseUrl}/terms`;

    let embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_COLOR)
      .setTimestamp()
      .setFooter({
        text: 'Sentry • Trasparenza, Sicurezza & Conformità GDPR',
        iconURL: interaction.client.user.displayAvatarURL()
      });

    if (section === 'terms') {
      embed
        .setTitle('📜 Termini di Servizio (Terms of Service) | Sentry')
        .setDescription(
          'L\'utilizzo di **Sentry** e della relativa Dashboard Web implica la piena accettazione delle seguenti condizioni:\n\n' +
          '• **Uso Responsabile**: È vietato utilizzare il bot per spam, attacchi DoS, bypass di restrizioni o violazione delle linee guida Discord.\n' +
          '• **Disponibilità del Servizio**: Sentry è fornito "as is" senza garanzie implicite, sebbene venga garantito il massimo impegno per un elevato uptime.\n' +
          '• **Autonomia di Moderazione**: Lo staff di ciascun server è responsabile delle sanzioni applicate con i comandi del bot.\n' +
          '• **Sospensione**: L\'amministratore del bot si riserva il diritto di revocare l\'accesso in caso di abuso accertato.'
        )
        .addFields(
          { name: '🌐 Documento Ufficiale Completo', value: `[Leggi i Termini di Servizio completi](${termsUrl})`, inline: false }
        );
    } else if (section === 'deletion') {
      embed
        .setTitle('🗑️ Cancellazione dei Dati & Diritti GDPR')
        .setDescription(
          'In conformità con gli articoli 15-22 del Regolamento UE 2016/679 (**GDPR**), hai il pieno diritto di richiedere la visione o la cancellazione definitiva di tutti i dati memorizzati da Sentry:\n\n' +
          '• **Quali dati puoi cancellare**: Statistiche account, saldi dell\'economia virtuale, registri AFK e configurazioni del tuo server.\n' +
          '• **Nessun archivio chat**: Ricorda che Sentry **non** memorizza il testo dei tuoi messaggi privati o dei canali in alcun database.\n' +
          '• **Tempistiche di evasione**: Le richieste vengono processate entro un massimo di 48 ore lavorative.'
        )
        .addFields(
          {
            name: '📬 Come inviare la richiesta',
            value: `Puoi richiedere la rimozione contattando direttamente lo sviluppatore o aprendo una richiesta sul server di supporto o consultando la [Privacy Policy](${privacyUrl}).`,
            inline: false
          }
        );
    } else {
      // Default: privacy
      embed
        .setTitle('🔒 Informativa sulla Privacy (Privacy Policy) | Sentry')
        .setDescription(
          '**Sentry** adotta una politica rigorosa di **minimizzazione dei dati** per tutelare al 100% la riservatezza delle community e degli utenti Discord:\n\n' +
          '• **🆔 Dati Memorizzati**: Solo ID tecnici Discord (User ID, Server ID, Channel ID) necessari per le configurazioni del server e per i minigiochi/livelli.\n' +
          '• **💬 Contenuto dei Messaggi**: I messaggi di testo **NON** vengono mai archiviati su database; vengono elaborati in tempo reale (per AFK, AI o controlli) e immediatamente eliminati dalla RAM.\n' +
          '• **🛡️ Sicurezza**: Database protetti da credenziali ad alta entropia e connessioni crittografate HTTPS/WSS.\n' +
          '• **🚫 Nessuna Cessione**: I tuoi dati non sono mai ceduti o venduti a terzi per scopi pubblicitari o commerciali.'
        )
        .addFields(
          { name: '📜 Termini di Servizio', value: `[Visualizza i ToS](${termsUrl})`, inline: true },
          { name: '🔒 Privacy Policy Online', value: `[Consulta il testo integrale](${privacyUrl})`, inline: true }
        );
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('🔒 Privacy Policy')
        .setStyle(ButtonStyle.Link)
        .setURL(privacyUrl),
      new ButtonBuilder()
        .setLabel('📜 Termini di Servizio')
        .setStyle(ButtonStyle.Link)
        .setURL(termsUrl)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  }
};


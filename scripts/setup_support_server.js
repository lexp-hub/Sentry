import {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { CONFIG } from '../src/config.js';
import { DatabaseHelper } from '../src/database/db.js';

const GUILD_ID = '1545956485501165588';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    console.log(`🏰 Connected to target guild: ${guild.name} (${guild.id})`);

    // 1. Create Roles
    console.log('📦 Creating roles...');
    const roles = await guild.roles.fetch();

    let founderRole = roles.find(r => r.name.includes('Founder') || r.name.includes('Lead Dev'));
    if (!founderRole) {
      founderRole = await guild.roles.create({
        name: '👑 Founder',
        color: '#F59E0B',
        hoist: true,
        permissions: [PermissionsBitField.Flags.Administrator],
        reason: 'Sentry Support Server Setup'
      });
      console.log('✅ Created role: 👑 Founder');
    }

    let staffRole = roles.find(r => r.name.includes('Support Staff'));
    if (!staffRole) {
      staffRole = await guild.roles.create({
        name: '🛡️ Support Staff',
        color: '#3B82F6',
        hoist: true,
        permissions: [
          PermissionsBitField.Flags.ManageMessages,
          PermissionsBitField.Flags.KickMembers,
          PermissionsBitField.Flags.ModerateMembers,
          PermissionsBitField.Flags.ViewAuditLog
        ],
        reason: 'Sentry Support Server Setup'
      });
      console.log('✅ Created role: 🛡️ Support Staff');
    }

    let communityRole = roles.find(r => r.name.includes('Community') || r.name.includes('Membro'));
    if (!communityRole) {
      communityRole = await guild.roles.create({
        name: '⭐ Community',
        color: '#10B981',
        hoist: true,
        reason: 'Sentry Support Server Setup'
      });
      console.log('✅ Created role: ⭐ Community');
    }

    // Clean up default channels if they are empty
    const existingChannels = await guild.channels.fetch();
    for (const [id, ch] of existingChannels) {
      if ((ch.name === 'general' || ch.name === 'General') && ch.type !== ChannelType.GuildCategory) {
        try {
          await ch.delete('Cleaning default channel for fresh setup');
          console.log(`🗑️ Deleted default channel: ${ch.name}`);
        } catch (e) {}
      }
      if ((ch.name === 'Text Channels' || ch.name === 'Voice Channels') && ch.type === ChannelType.GuildCategory) {
        try {
          await ch.delete('Cleaning default category');
          console.log(`🗑️ Deleted default category: ${ch.name}`);
        } catch (e) {}
      }
    }

    // 2. Create Categories & Channels
    console.log('📁 Setting up Categories & Channels...');

    // Category 1: INFORMAZIONI
    const catInfo = await guild.channels.create({
      name: '📢 INFORMAZIONI',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.id, // @everyone
          deny: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AddReactions],
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory]
        },
        {
          id: staffRole.id,
          allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AddReactions]
        }
      ]
    });

    const chRules = await guild.channels.create({
      name: '📜・regolamento',
      type: ChannelType.GuildText,
      parent: catInfo.id,
      topic: 'Regolamento e linee guida del server di supporto ufficiale di Sentry'
    });

    const chAnnouncements = await guild.channels.create({
      name: '📢・annunci',
      type: ChannelType.GuildText,
      parent: catInfo.id,
      topic: 'Notifiche di rilascio, novità e aggiornamenti di Sentry'
    });

    const chStatus = await guild.channels.create({
      name: '🟢・stato-bot',
      type: ChannelType.GuildText,
      parent: catInfo.id,
      topic: 'Stato dei servizi di Sentry, manutenzioni e comunicazioni API'
    });

    // Category 2: ASSISTENZA & TICKET
    const catSupport = await guild.channels.create({
      name: '🛡️ ASSISTENZA & TICKET',
      type: ChannelType.GuildCategory
    });

    const chTicket = await guild.channels.create({
      name: '🎫・apri-ticket',
      type: ChannelType.GuildText,
      parent: catSupport.id,
      topic: 'Apri un ticket privato con il team di supporto di Sentry',
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionsBitField.Flags.SendMessages],
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory]
        }
      ]
    });

    const chFaq = await guild.channels.create({
      name: '❓・faq-guide',
      type: ChannelType.GuildText,
      parent: catSupport.id,
      topic: 'Domande frequenti, documentazione e istruzioni di configurazione',
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionsBitField.Flags.SendMessages],
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory]
        }
      ]
    });

    const chBugReport = await guild.channels.create({
      name: '🐛・bug-report',
      type: ChannelType.GuildText,
      parent: catSupport.id,
      topic: 'Segnala bug o comportamenti anomali del bot o della Dashboard'
    });

    const chSuggestions = await guild.channels.create({
      name: '💡・suggerimenti',
      type: ChannelType.GuildText,
      parent: catSupport.id,
      topic: 'Condividi le tue idee e proposte per le future versioni di Sentry'
    });

    // Category 3: TICKET APERTI (Private Category for open tickets)
    const catTicketsOpen = await guild.channels.create({
      name: '🎫 TICKET ATTIVI',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: staffRole.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageChannels
          ]
        },
        {
          id: client.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.ManageMessages
          ]
        }
      ]
    });

    // Category 4: COMMUNITY
    const catCommunity = await guild.channels.create({
      name: '💬 COMMUNITY & TEST',
      type: ChannelType.GuildCategory
    });

    const chGeneral = await guild.channels.create({
      name: '💬・chat-generale',
      type: ChannelType.GuildText,
      parent: catCommunity.id,
      topic: 'Chiacchiere generali sulla community e su Sentry'
    });

    const chCommands = await guild.channels.create({
      name: '🤖・comandi-bot',
      type: ChannelType.GuildText,
      parent: catCommunity.id,
      topic: 'Canale autorizzato per testare i comandi di Sentry (/help, /afk, minigiochi)'
    });

    // Category 5: VOCALI
    const catVoice = await guild.channels.create({
      name: '🔊 VOCALI',
      type: ChannelType.GuildCategory
    });

    await guild.channels.create({
      name: '🔊・Salotto',
      type: ChannelType.GuildVoice,
      parent: catVoice.id
    });

    await guild.channels.create({
      name: '🎧・Supporto Vocale',
      type: ChannelType.GuildVoice,
      parent: catVoice.id
    });

    console.log('✅ All channels and categories created successfully!');

    // 3. Post Content & Embeds

    // Embed Regolamento
    const rulesEmbed = new EmbedBuilder()
      .setColor('#DC2626')
      .setTitle('📜 Regolamento Ufficiale | Sentry Support Server')
      .setDescription(
        'Benvenuto nel server di supporto ufficiale di **Sentry**! Per garantire un ambiente costruttivo e piacevole per tutti, ti invitiamo a rispettare queste poche e semplici regole:\n\n' +
        '**1. Rispetto Reciproco & Buona Educazione**\n' +
        'Tratta tutti i membri e lo staff con rispetto. Non sono tollerati insulti, discorsi d\'odio, discriminazioni o provocazioni.\n\n' +
        '**2. Nessun Contenuto Illecito o NSFW**\n' +
        'È rigorosamente vietato condividere materiale pornografico, illegale o contrario ai [Termini di Servizio di Discord](https://discord.com/terms).\n\n' +
        '**3. No Spam & Autopromozione Non Autorizzata**\n' +
        'Non spammare nei canali di testo o vocali. L\'invio di inviti Discord non autorizzati in DM o nei canali pubblici comporta il ban immediato.\n\n' +
        '**4. Canali Dedicati**\n' +
        'Utilizza ciascun canale per lo scopo preposto. Per i test usa <#' + chCommands.id + '>, per l\'assistenza tecnica apri un ticket in <#' + chTicket.id + '>.\n\n' +
        '**5. Rispetto dello Staff**\n' +
        'Le decisioni dei moderatori e degli amministratori sono finali. Se hai bisogno di chiarimenti, apri un ticket privato.'
      )
      .setFooter({ text: 'Sentry • Sicurezza e Trasparenza', iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    await chRules.send({ embeds: [rulesEmbed] });
    console.log('✅ Posted rules embed');

    // Embed Stato Bot
    const statusEmbed = new EmbedBuilder()
      .setColor('#10B981')
      .setTitle('🟢 Stato del Sistema | Sentry v2.0')
      .setDescription(
        'In questo canale vengono comunicate in tempo reale le informazioni sullo stato dell\'infrastruttura di Sentry, manutenzioni programmate ed eventuali anomalie dei servizi Discord.\n\n' +
        '• **Stato Bot**: `OPERATIVO` ✅\n' +
        '• **Dashboard Web**: `ATTIVA` (https://sentry.wispbyte.app)\n' +
        '• **Database Sync**: `SQLite WAL + MySQL Multi-Guild` ⚡\n' +
        '• **Intelligenza Artificiale**: `Cloudflare Llama 70B Fast` 🧠'
      )
      .addFields(
        { name: '🌐 Dashboard Ufficiale', value: '[Accedi alla Dashboard](https://sentry.wispbyte.app)', inline: true },
        { name: '🔒 Privacy Policy', value: '[Consulta Privacy](https://sentry.wispbyte.app/privacy)', inline: true },
        { name: '📜 Termini di Servizio', value: '[Consulta ToS](https://sentry.wispbyte.app/terms)', inline: true }
      )
      .setFooter({ text: 'Sentry • Monitoraggio Continuo', iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    await chStatus.send({ embeds: [statusEmbed] });
    console.log('✅ Posted status embed');

    // Embed FAQ
    const faqEmbed = new EmbedBuilder()
      .setColor('#3B82F6')
      .setTitle('❓ Domande Frequenti & Guide (FAQ)')
      .setDescription(
        'Tutto quello che c\'è da sapere per iniziare a usare **Sentry** al massimo delle sue potenzialità:\n\n' +
        '**1. Come invito Sentry nel mio server?**\n' +
        'Puoi utilizzare il link di invito ufficiale con permessi consigliati:\n' +
        '[👉 Clicca qui per invitare Sentry](https://discord.com/oauth2/authorize?client_id=1529616837946642546&permissions=8&scope=bot%20applications.commands)\n\n' +
        '**2. Come accedo alla Dashboard Web?**\n' +
        'Visita [sentry.wispbyte.app](https://sentry.wispbyte.app) ed effettua l\'accesso con il tuo account Discord. Visualizzerai tutti i server in cui possiedi i permessi di moderatore/amministratore.\n\n' +
        '**3. Quali permessi servono al bot?**\n' +
        'Per funzionare correttamente (creare canali temporanei, inviare embed, moderare e assegnare ruoli), Sentry richiede il ruolo posizionato **più in alto** rispetto ai ruoli che deve assegnare.\n\n' +
        '**4. Come funziona il sistema AFK?**\n' +
        'Basta digitare `/afk [motivo]`. Chiunque ti menzioni o risponda a un tuo messaggio riceverà un avviso. Al tuo primo messaggio in chat, Sentry ti darà il bentornato e disattiverà l\'AFK automaticamente!\n\n' +
        '**5. Come richiedo assistenza per un problema?**\n' +
        'Recati nel canale <#' + chTicket.id + '> e premi il pulsante **"📩 Apri Ticket"**.'
      )
      .setFooter({ text: 'Sentry • FAQ & Documentazione', iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    await chFaq.send({ embeds: [faqEmbed] });
    console.log('✅ Posted FAQ embed');

    // 4. Ticket Panel
    const panelId = `panel_${Date.now()}`;
    const openButton = new ButtonBuilder()
      .setCustomId(`ticket_open_${panelId}`)
      .setLabel('Richiedi Assistenza')
      .setEmoji('📩')
      .setStyle(ButtonStyle.Primary);

    const ticketRow = new ActionRowBuilder().addComponents(openButton);

    const ticketEmbed = new EmbedBuilder()
      .setColor('#DC2626')
      .setTitle('🛡️ Sentry | Centro Assistenza & Supporto Ufficiale')
      .setDescription(
        'Hai bisogno di aiuto con la configurazione di Sentry, hai riscontrato un problema nella Dashboard Web o desideri assistenza dedicata per la tua community?\n\n' +
        'Premi il pulsante **"📩 Richiedi Assistenza"** qui sotto per creare una stanza privata visibile solo a te e allo staff di supporto!'
      )
      .addFields(
        { name: '⏰ Tempi di Risposta', value: 'Solitamente entro poche ore lavorative.', inline: true },
        { name: '🔒 Riservatezza', value: 'I ticket sono completamente privati e cifrati.', inline: true }
      )
      .setFooter({ text: 'Sentry • Support Ticket System', iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    const sentTicketMsg = await chTicket.send({ embeds: [ticketEmbed], components: [ticketRow] });

    // Save ticket panel to database
    DatabaseHelper.saveTicketPanel({
      id: panelId,
      guild_id: guild.id,
      channel_id: chTicket.id,
      message_id: sentTicketMsg.id,
      title: '🛡️ Sentry | Centro Assistenza & Supporto Ufficiale',
      description: 'Hai bisogno di aiuto con la configurazione di Sentry?',
      category_id: catTicketsOpen.id,
      button_label: 'Richiedi Assistenza',
      button_emoji: '📩',
      support_role_id: staffRole.id
    });
    console.log('✅ Saved ticket panel configuration in database!');

    // Post welcoming message in chat-generale
    const welcomeEmbed = new EmbedBuilder()
      .setColor('#DC2626')
      .setTitle('👋 Benvenuti nella Community Ufficiale di Sentry!')
      .setDescription(
        'Questo è il server ufficiale per la community, il supporto e gli aggiornamenti di **Sentry**.\n\n' +
        '• Per consultare i comandi usa il comando `/help` in <#' + chCommands.id + '>.\n' +
        '• Se hai bisogno di aiuto, apri un ticket in <#' + chTicket.id + '>.\n' +
        '• Buona permanenza!'
      )
      .setFooter({ text: 'Sentry Bot v2.0', iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    await chGeneral.send({ embeds: [welcomeEmbed] });

    // Create a permanent invite link
    const invite = await chGeneral.createInvite({
      maxAge: 0, // Never expires
      maxUses: 0, // Unlimited uses
      reason: 'Official Sentry Support Permanent Invite'
    });

    console.log(`\n🎉 SETUP COMPLETATO CON SUCCESSO!`);
    console.log(`🔗 Link di Invito Permanente Generato: ${invite.url}`);

  } catch (err) {
    console.error('❌ Errore durante il setup:', err);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(CONFIG.BOT_TOKEN).catch(console.error);

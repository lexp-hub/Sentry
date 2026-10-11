import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';
import { AIManager } from '../../modules/aiManager.js';
import { DatabaseHelper } from '../../../database/db.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Interagisci con l\'Intelligenza Artificiale Sentry AI')
    .addSubcommand(sub =>
      sub
        .setName('ask')
        .setDescription('Poni una domanda diretta a Sentry')
        .addStringOption(opt =>
          opt
            .setName('domanda')
            .setDescription('Cosa vuoi chiedere a Sentry?')
            .setRequired(true)
        )
        .addBooleanOption(opt =>
          opt
            .setName('approfondisci')
            .setDescription('Richiedi una risposta estesa e dettagliata anziché sintetica')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('search')
        .setDescription('Esegue una ricerca web in tempo reale e analizza i risultati')
        .addStringOption(opt =>
          opt
            .setName('ricerca')
            .setDescription('Termine o notizia da cercare sul web')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('reset')
        .setDescription('Azzera la memoria della conversazione in questo canale')
    )
    .addSubcommand(sub =>
      sub
        .setName('prompt')
        .setDescription('Visualizza o reimposta l\'identità e lo stile di Sentry')
        .addStringOption(opt =>
          opt
            .setName('preset')
            .setDescription('Scegli uno stile preimpostato')
            .addChoices(
              { name: '⚔️ Cinico & Spietato (Default)', value: 'cynical' },
              { name: '🛡️ Nobile Sentinella & Guardiano', value: 'noble' },
              { name: '🤖 Assistente Tecnico Preciso', value: 'technical' }
            )
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('quota')
        .setDescription('Visualizza le statistiche e il consumo della quota giornaliera AI')
    )
    .addSubcommand(sub =>
      sub
        .setName('config-quota')
        .setDescription('Imposta il limite giornaliero e la soglia di avviso AI (Admin)')
        .addIntegerOption(opt =>
          opt
            .setName('limite')
            .setDescription('Limite massimo di richieste al giorno (0 per illimitato)')
            .setMinValue(0)
            .setMaxValue(10000)
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt
            .setName('soglia')
            .setDescription('Percentuale di avviso (es. 80 per avvisare all\'80% di utilizzo)')
            .setMinValue(10)
            .setMaxValue(99)
            .setRequired(false)
        )
        .addChannelOption(opt =>
          opt
            .setName('canale_avviso')
            .setDescription('Canale dove inviare l\'allerta staff quando la quota sta per esaurirsi')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'ask') {
      const question = interaction.options.getString('domanda');
      const detail = interaction.options.getBoolean('approfondisci') || false;

      if (interaction.guild) {
        const quota = DatabaseHelper.getAIQuotaStatus(interaction.guild.id);
        if (quota.is_blocked) {
          return interaction.reply({
            content: `⏳ **Quota AI Esaurita**: Il server ha utilizzato tutte le **${quota.daily_limit}** richieste giornaliere disponibili. Il contatore si resetterà a mezzanotte!`,
            ephemeral: true
          });
        }
      }

      await interaction.deferReply();

      const guildAI = interaction.guild ? DatabaseHelper.getAIConfig(interaction.guild.id) : { enabled: true };
      const systemPrompt = guildAI.system_prompt || AIManager.loadPrompt();

      const userDisplayName = interaction.member?.displayName || interaction.user.username;
      const userPrompt = detail
        ? `[Utente: ${userDisplayName} | Richiesta dettagliata]: ${question} (spiega in dettaglio)`
        : `[Utente: ${userDisplayName}]: ${question}`;

      const messages = [{ role: 'user', content: userPrompt }];
      let reply = await AIManager.getAIResponse(messages, systemPrompt, guildAI.model);

      const searchMatch = reply.match(/\[CERCA:\s*(.*?)\]/i);
      if (searchMatch) {
        const query = searchMatch[1].trim();
        const searchResults = await AIManager.performWebSearch(query);
        const finalPrompt = `${systemPrompt}\n\nRisultati web trovati per "${query}":\n${searchResults}\n\nRispondi all'utente in modo sintetico e pungente basandoti sui dati.`;
        reply = await AIManager.getAIResponse(messages, finalPrompt, guildAI.model);
        reply = reply.replace(/\[CERCA:\s*.*?\]/gi, '').trim();
      }

      let quotaNotice = "";
      if (interaction.guild) {
        const updatedQuota = DatabaseHelper.incrementAIUsage(interaction.guild.id);
        if (updatedQuota.is_warning) {
          quotaNotice = `\n\n> ⚠️ *Nota Quota AI: rimangono **${updatedQuota.remaining}** richieste disponibili per oggi (usate ${updatedQuota.used}/${updatedQuota.daily_limit}).*`;
        }
      }

      await interaction.editReply({ content: reply + quotaNotice });
    } else if (subcommand === 'search') {
      const query = interaction.options.getString('ricerca');

      if (interaction.guild) {
        const quota = DatabaseHelper.getAIQuotaStatus(interaction.guild.id);
        if (quota.is_blocked) {
          return interaction.reply({
            content: `⏳ **Quota AI Esaurita**: Il server ha utilizzato tutte le **${quota.daily_limit}** richieste giornaliere disponibili. Il contatore si resetterà a mezzanotte!`,
            ephemeral: true
          });
        }
      }

      await interaction.deferReply();

      const searchResults = await AIManager.performWebSearch(query);
      const guildAI = interaction.guild ? DatabaseHelper.getAIConfig(interaction.guild.id) : { enabled: true };
      const systemPrompt = guildAI.system_prompt || AIManager.loadPrompt();

      const searchMessages = [
        {
          role: 'user',
          content: `Ho cercato "${query}". Ecco i risultati dal web:\n\n${searchResults}\n\nFornisci la tua sintesi cinica e lucida su questi fatti in italiano.`
        }
      ];

      const reply = await AIManager.getAIResponse(searchMessages, systemPrompt, guildAI.model);

      let quotaNotice = "";
      if (interaction.guild) {
        const updatedQuota = DatabaseHelper.incrementAIUsage(interaction.guild.id);
        if (updatedQuota.is_warning) {
          quotaNotice = `\n\n> ⚠️ *Nota Quota AI: rimangono **${updatedQuota.remaining}** richieste disponibili per oggi.*`;
        }
      }

      const embed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_COLOR)
        .setTitle(`🔍 Ricerca Web: ${query}`)
        .setDescription(reply + quotaNotice)
        .setFooter({ text: 'Sentry AI • Web Intelligence' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === 'quota') {
      if (!interaction.guild) {
        return interaction.reply({ content: 'Questo comando può essere eseguito solo all\'interno di un server.', ephemeral: true });
      }

      const quota = DatabaseHelper.getAIQuotaStatus(interaction.guild.id);
      const pct = quota.is_unlimited ? 0 : Math.min(100, Math.round((quota.used / quota.daily_limit) * 100));

      const now = new Date();
      const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const resetEpoch = Math.floor(nextMidnight.getTime() / 1000);

      const statusEmoji = quota.is_blocked ? '🔴' : quota.is_warning ? '⚠️' : '🟢';
      const statusText = quota.is_blocked ? 'Quota Giornaliera Esaurita' : quota.is_warning ? 'In Esaurimento (Pre-Avviso Attivo)' : 'Disponibile';

      const embed = new EmbedBuilder()
        .setColor(quota.is_blocked ? '#ef4444' : quota.is_warning ? '#f59e0b' : '#10b981')
        .setTitle('📊 Stato Quota & Utilizzo Sentry AI')
        .setDescription(`Monitoraggio delle richieste AI effettuate dal server oggi.`)
        .addFields(
          { name: '📈 Richieste Utilizzate', value: `\`${quota.used}\` / \`${quota.is_unlimited ? 'Illimitate' : quota.daily_limit}\` (${pct}%)`, inline: true },
          { name: '✨ Richieste Rimanenti', value: `\`${quota.is_unlimited ? 'Illimitate' : quota.remaining}\``, inline: true },
          { name: '🚦 Stato Attuale', value: `${statusEmoji} **${statusText}**`, inline: true },
          { name: '🔔 Soglia Pre-Avviso', value: `\`${quota.threshold_pct}%\` (avviso quando mancano ≤ ${quota.is_unlimited ? 0 : Math.max(1, quota.daily_limit - Math.floor(quota.daily_limit * (quota.threshold_pct / 100)))} richieste)`, inline: true },
          { name: '🔄 Reset Quota', value: `<t:${resetEpoch}:R> (<t:${resetEpoch}:t> UTC)`, inline: true },
          { name: '📢 Canale Notifiche Staff', value: quota.warning_channel_id ? `<#${quota.warning_channel_id}>` : '`Non impostato`', inline: true }
        )
        .setFooter({ text: `${interaction.guild.name} • Sentry AI Monitor`, iconURL: interaction.guild.iconURL() })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === 'config-quota') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '❌ Solo gli amministratori possono configurare la quota AI.', ephemeral: true });
      }

      const newLimit = interaction.options.getInteger('limite');
      const newThreshold = interaction.options.getInteger('soglia');
      const newChannel = interaction.options.getChannel('canale_avviso');

      const updates = {};
      if (newLimit !== null) updates.daily_limit = newLimit;
      if (newThreshold !== null) updates.warning_threshold = newThreshold;
      if (newChannel) updates.warning_channel_id = newChannel.id;

      if (Object.keys(updates).length === 0) {
        return interaction.reply({ content: '⚠️ Specifica almeno un parametro da aggiornare (`limite`, `soglia` o `canale_avviso`).', ephemeral: true });
      }

      DatabaseHelper.updateAIConfig(interaction.guild.id, updates);
      const quota = DatabaseHelper.getAIQuotaStatus(interaction.guild.id);

      const embed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle('⚙️ Configurazione Quota AI Aggiornata')
        .setDescription('I nuovi parametri di monitoraggio per l\'intelligenza artificiale sono stati applicati con successo!')
        .addFields(
          { name: 'Limite Giornaliero', value: quota.daily_limit > 0 ? `\`${quota.daily_limit} richieste/giorno\`` : '`Illimitato`', inline: true },
          { name: 'Soglia di Pre-Avviso', value: `\`${quota.threshold_pct}%\``, inline: true },
          { name: 'Canale Allerte Staff', value: quota.warning_channel_id ? `<#${quota.warning_channel_id}>` : '`Disattivato`', inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (subcommand === 'reset') {
      DatabaseHelper.resetChannelMemory(interaction.channel.id);
      await interaction.reply({
        content: '🧹 Memoria della conversazione azzerata per questo canale. Sentry ha dimenticato i messaggi precedenti.'
      });
    } else if (subcommand === 'prompt') {
      const preset = interaction.options.getString('preset');

      if (!preset) {
        const guildAI = interaction.guild ? DatabaseHelper.getAIConfig(interaction.guild.id) : {};
        const currentPrompt = guildAI.system_prompt || AIManager.loadPrompt();

        const embed = new EmbedBuilder()
          .setColor(CONFIG.EMBED_COLOR)
          .setTitle('🎭 Identità Attuale di Sentry')
          .setDescription(`\`\`\`${currentPrompt.slice(0, 1500)}\`\`\``)
          .setFooter({ text: 'Puoi personalizzare il prompt anche dalla Dashboard Web!' })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '❌ Solo gli amministratori possono modificare il preset dell\'IA.', ephemeral: true });
      }

      let newPrompt = "";
      if (preset === 'noble') {
        newPrompt = "Sei 'Sentry', una nobile sentinella di sicurezza e guardiano dei server Discord. Rispondi con tono fiero, leale ed epico, dispensando consigli saggi ed elevati per il bene del server. Massimo 300 caratteri.";
      } else if (preset === 'technical') {
        newPrompt = "Sei 'Sentry', un'intelligenza artificiale focalizzata su precisione logica, programmazione, sicurezza e analisi tecnica oggettiva. Rispondi in modo pulito, asciutto ed impeccabile.";
      } else {
        newPrompt = AIManager.loadPrompt();
      }

      DatabaseHelper.updateAIConfig(interaction.guild.id, { system_prompt: newPrompt });
      await interaction.reply({ content: `✅ Stile di Sentry aggiornato al preset: **${preset}**!` });
    }
  }
};

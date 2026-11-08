import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { CONFIG } from '../../../config.js';
import { DatabaseHelper } from '../../../database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('Invia un annuncio/aggiornamento a tutti i server che hanno attivato la ricezione')
    .addStringOption(option =>
      option.setName('titolo')
        .setDescription('Titolo dell\'annuncio o correzione')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('messaggio')
        .setDescription('Descrizione dettagliata delle novità, correzioni o aggiornamenti')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('versione')
        .setDescription('Versione di rilascio (es. 2.4.0)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('colore')
        .setDescription('Colore HEX dell\'embed (es. #10B981)')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('notifica_here')
        .setDescription('Invia con menzione @here nel canale (default: false)')
        .setRequired(false)
    ),

  async execute(interaction) {
    // Restrizione rigorosa: solo il creatore del bot può eseguire il broadcast
    if (interaction.user.id !== CONFIG.CREATOR_ID) {
      return interaction.reply({
        content: '⛔ Accesso negato: Solo il creatore del bot può inviare annunci broadcast.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const title = interaction.options.getString('titolo');
    const message = interaction.options.getString('messaggio');
    const version = interaction.options.getString('versione');
    const color = interaction.options.getString('colore') || CONFIG.EMBED_SUCCESS_COLOR || '#10B981';
    const pingHere = interaction.options.getBoolean('notifica_here') || false;

    const optedInRows = DatabaseHelper.getBroadcastEnabledGuilds();
    if (optedInRows.length === 0) {
      return interaction.editReply({
        content: 'ℹ️ Nessun server ha attualmente attivato la ricezione degli annunci/correzioni dal creatore.'
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`📢 ${title}`)
      .setDescription(message)
      .setColor(color)
      .setTimestamp()
      .setFooter({
        text: `Sentry Updates • ${version ? `v${version}` : 'Changelog'} • Inviato dal Creatore`,
        iconURL: interaction.client.user?.displayAvatarURL() || undefined
      });

    let sentCount = 0;
    const errors = [];

    for (const item of optedInRows) {
      try {
        const guild = interaction.client.guilds.cache.get(item.guild_id);
        if (!guild) continue;

        let channel = guild.channels.cache.get(item.updates_channel_id);
        if (!channel) {
          channel = await guild.channels.fetch(item.updates_channel_id).catch(() => null);
        }

        if (channel && channel.isTextBased()) {
          const payload = { embeds: [embed] };
          if (pingHere) {
            payload.content = '@here';
          }
          await channel.send(payload);
          sentCount++;
        }
      } catch (err) {
        errors.push({ guildId: item.guild_id, error: err.message });
      }
    }

    const replyMsg = `✅ **Broadcast completato con successo!**\n` +
      `• Server destinatari raggiunti: **${sentCount}** su **${optedInRows.length}** server abilitati.\n` +
      `• Server totali del bot: **${interaction.client.guilds.cache.size}**\n` +
      (errors.length > 0 ? `⚠️ Si sono verificati errori su ${errors.length} server.` : '');

    await interaction.editReply({ content: replyMsg });
  }
};

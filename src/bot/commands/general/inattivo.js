import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';
import { AFKManager } from '../../modules/afkManager.js';

export default {
  data: new SlashCommandBuilder()
    .setName('inattivo')
    .setDescription('Imposta il tuo stato su AFK / Inattivo (assente) con un motivo facoltativo')
    .addStringOption(option =>
      option
        .setName('motivo')
        .setDescription('Motivo della tua assenza (es. Studio, Pausa pranzo, Torno tra poco...)')
        .setRequired(false)
        .setMaxLength(250)
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: '❌ Questo comando può essere utilizzato solo all\'interno di un server.',
        ephemeral: true
      });
    }

    const reason = interaction.options.getString('motivo')?.trim() || 'Nessun motivo specificato';
    const now = Date.now();

    // Salva nel database
    DatabaseHelper.setAfk(interaction.guild.id, interaction.user.id, reason, now);

    // Attiva il grace period anti-cancellazione involontaria
    AFKManager.markRecentlySet(interaction.guild.id, interaction.user.id);

    const embed = new EmbedBuilder()
      .setColor('#6366f1')
      .setAuthor({
        name: `${interaction.user.displayName || interaction.user.username} è ora Inattivo (AFK)`,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true })
      })
      .setDescription(
        `💤 **Stato AFK / Inattivo Attivato**\n\n` +
        `📝 **Motivo:** ${reason}\n` +
        `⏰ **Ora di inizio:** <t:${Math.floor(now / 1000)}:t>\n\n` +
        `> 💡 *Avviserò chiunque ti menzioni o risponda a un tuo messaggio. Per rimuovere l'AFK, ti basterà scrivere un messaggio qualsiasi in una chat del server!*`
      )
      .setFooter({ text: 'Sentry AFK System' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};


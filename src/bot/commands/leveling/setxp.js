import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setxp')
    .setDescription('Imposta manualmente i punti XP di un utente')
    .addUserOption(opt => opt.setName('utente').setDescription('L\'utente a cui impostare l\'XP').setRequired(true))
    .addIntegerOption(opt => opt.setName('ammontare').setDescription('I punti XP da impostare').setMinValue(0).setRequired(true)),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ Solo gli amministratori possono modificare i punti XP.', ephemeral: true });
    }

    const target = interaction.options.getUser('utente');
    const amount = interaction.options.getInteger('ammontare');

    const calculatedLevel = Math.floor(0.1 * Math.sqrt(amount));

    DatabaseHelper.db.prepare(`
      INSERT INTO levels (guild_id, user_id, xp, level, total_messages, last_message_time)
      VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET
        xp = ?,
        level = ?
    `).run(
      interaction.guild.id,
      target.id,
      amount,
      calculatedLevel,
      Math.floor(Date.now() / 1000),
      amount,
      calculatedLevel
    );

    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_SUCCESS_COLOR)
      .setTitle('⭐ Punti XP Modificati')
      .setDescription(`I punti XP di ${target} sono stati impostati a **${amount.toLocaleString()} XP** (Livello calcolato: **${calculatedLevel}**).`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

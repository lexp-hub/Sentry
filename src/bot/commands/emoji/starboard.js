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
    .setName('starboard')
    .setDescription('Configura la bacheca messaggi preferiti (Starboard ⭐)')
    .addSubcommand(sub =>
      sub
        .setName('config')
        .setDescription('Imposta il canale e il numero minimo di stelle')
        .addChannelOption(opt =>
          opt
            .setName('canale')
            .setDescription('Canale dove pubblicare i messaggi stellati')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName('min_stelle')
            .setDescription('Numero minimo di ⭐ per finire in bacheca (default: 3)')
            .setMinValue(1)
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt
            .setName('attivo')
            .setDescription('Abilita o disabilita la starboard')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild) &&
        !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: '❌ Non hai i permessi per configurare la Starboard (`Gestisci Server`).',
        ephemeral: true
      });
    }

    const channel = interaction.options.getChannel('canale');
    const minStars = interaction.options.getInteger('min_stelle') || 3;
    const active = interaction.options.getBoolean('attivo') !== null ? interaction.options.getBoolean('attivo') : true;

    DatabaseHelper.db.prepare(`
      INSERT OR REPLACE INTO starboards (guild_id, channel_id, emoji, min_stars, enabled)
      VALUES (?, ?, '⭐', ?, ?)
    `).run(interaction.guild.id, channel.id, minStars, active ? 1 : 0);

    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_SUCCESS_COLOR)
      .setTitle('⭐ Starboard Configurato')
      .addFields(
        { name: 'Stato', value: active ? '🟢 `Attivo`' : '🔴 `Disattivato`', inline: true },
        { name: 'Canale Bacheca', value: `${channel}`, inline: true },
        { name: 'Soglia Minima', value: `\`${minStars}\` ⭐`, inline: true }
      )
      .setFooter({ text: 'I messaggi che raggiungono la soglia verranno evidenziati nel canale scelto!' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

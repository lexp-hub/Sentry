import {
  SlashCommandBuilder,
  PermissionsBitField,
  ChannelType
} from 'discord.js';
import { GiveawayManager } from '../../modules/giveawayManager.js';

export default {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Gestione dei Giveaway sul server')
    .addSubcommand(sub =>
      sub
        .setName('start')
        .setDescription('Avvia un nuovo giveaway a tempo')
        .addChannelOption(opt =>
          opt
            .setName('canale')
            .setDescription('Canale dove pubblicare il giveaway')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('durata')
            .setDescription('Durata del giveaway (es: 30s, 10m, 2h, 1d, 3d)')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName('vincitori')
            .setDescription('Numero di vincitori da estrarre')
            .setMinValue(1)
            .setMaxValue(20)
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('premio')
            .setDescription('Il premio in palio (es: Discord Nitro, Ruolo VIP)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('end')
        .setDescription('Termina immediatamente un giveaway')
        .addStringOption(opt => opt.setName('id_messaggio').setDescription('ID del messaggio del giveaway').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('reroll')
        .setDescription('Estrae un nuovo vincitore casuale per un giveaway terminato')
        .addStringOption(opt => opt.setName('id_messaggio').setDescription('ID del messaggio del giveaway').setRequired(true))
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild) &&
        !interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return interaction.reply({
        content: '❌ Non hai i permessi per gestire i giveaway (`Gestisci Server`).',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'start') {
      const channel = interaction.options.getChannel('canale');
      const durationInput = interaction.options.getString('durata');
      const winners = interaction.options.getInteger('vincitori');
      const prize = interaction.options.getString('premio');

      const match = durationInput.match(/^(\d+)(s|m|h|d)$/i);
      if (!match) {
        return interaction.reply({
          content: '❌ Formato durata non valido. Usa ad esempio: `30s`, `15m`, `2h`, `1d`.',
          ephemeral: true
        });
      }

      const num = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      let durationSec = 0;
      if (unit === 's') durationSec = num;
      else if (unit === 'm') durationSec = num * 60;
      else if (unit === 'h') durationSec = num * 3600;
      else if (unit === 'd') durationSec = num * 86400;

      await GiveawayManager.startGiveaway(channel, prize, winners, durationSec, interaction.user);
      await interaction.reply({ content: `🎉 Giveaway per **${prize}** avviato con successo in ${channel}!`, ephemeral: true });
    } else if (subcommand === 'end') {
      const msgId = interaction.options.getString('id_messaggio');
      await GiveawayManager.endGiveaway(interaction.client, msgId);
      await interaction.reply({ content: `✅ Giveaway con ID \`${msgId}\` terminato.`, ephemeral: true });
    } else if (subcommand === 'reroll') {
      const msgId = interaction.options.getString('id_messaggio');
      const res = await GiveawayManager.rerollGiveaway(interaction.client, msgId);
      if (res.success) {
        await interaction.reply({ content: `🎉 Reroll completato! Nuovo vincitore: ${res.winner}`, ephemeral: true });
      } else {
        await interaction.reply({ content: `❌ Impossibile effettuare il reroll: ${res.error}`, ephemeral: true });
      }
    }
  }
};

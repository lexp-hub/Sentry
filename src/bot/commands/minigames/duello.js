import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('duello')
    .setDescription('Sfida un altro membro del server a un onorevole duello medievale!')
    .addUserOption(opt =>
      opt
        .setName('avversario')
        .setDescription('Il guerriero da sfidare a duello')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt
        .setName('scommessa')
        .setDescription('Monete d\'oro in palio per il vincitore (opzionale)')
        .setMinValue(0)
        .setRequired(false)
    ),

  async execute(interaction) {
    const challenger = interaction.user;
    const opponent = interaction.options.getUser('avversario');
    const bet = interaction.options.getInteger('scommessa') || 0;

    if (opponent.id === challenger.id) {
      return interaction.reply({ content: '❌ Non puoi sfidare te stesso a duello!', ephemeral: true });
    }

    if (opponent.bot) {
      return interaction.reply({ content: '❌ I bot servono il reame, non partecipano ai tornei!', ephemeral: true });
    }

    const challengerProfile = DatabaseHelper.getFishingProfile(interaction.guild.id, challenger.id);
    const opponentProfile = DatabaseHelper.getFishingProfile(interaction.guild.id, opponent.id);

    if (bet > 0) {
      if (challengerProfile.coins < bet) {
        return interaction.reply({ content: `❌ Non possiedi abbastanza monete per la scommessa (Ne hai 🪙 ${challengerProfile.coins}).`, ephemeral: true });
      }
      if (opponentProfile.coins < bet) {
        return interaction.reply({ content: `❌ ${opponent} non possiede abbastanza monete per accettare questa scommessa (Ne ha 🪙 ${opponentProfile.coins}).`, ephemeral: true });
      }
    }

    // Invitation Buttons
    const duelId = `duel_${Date.now()}`;
    const acceptBtn = new ButtonBuilder()
      .setCustomId(`${duelId}_accept`)
      .setLabel('Accetta la Sfida')
      .setEmoji('⚔️')
      .setStyle(ButtonStyle.Success);

    const declineBtn = new ButtonBuilder()
      .setCustomId(`${duelId}_decline`)
      .setLabel('Rifiuta con Disonore')
      .setEmoji('🏳️')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(acceptBtn, declineBtn);

    const inviteEmbed = new EmbedBuilder()
      .setColor('#ea580c')
      .setTitle('⚔️ Sfida a Singolar Tenzone!')
      .setDescription(`Il nobile cavaliere **${challenger}** ha lanciato il proprio guanto di sfida contro **${opponent}**!\n\n` +
        (bet > 0 ? `💰 **Posta in Gioco:** 🪙 **${bet} Monete d'Oro**\n` : '') +
        `*${opponent}, hai 60 secondi per accettare il duello nell'arena.*`)
      .setThumbnail('https://cdn-icons-png.flaticon.com/512/1065/1065492.png')
      .setFooter({ text: 'Che vinca il migliore!', iconURL: interaction.guild.iconURL() })
      .setTimestamp();

    const response = await interaction.reply({ content: `${opponent}`, embeds: [inviteEmbed], components: [row] });

    // Collector for acceptance
    const filter = i => i.user.id === opponent.id && (i.customId === `${duelId}_accept` || i.customId === `${duelId}_decline`);
    const collector = response.createMessageComponentCollector({ filter, time: 60000, max: 1 });

    collector.on('collect', async i => {
      if (i.customId.endsWith('_decline')) {
        return i.update({
          content: `🏳️ **${opponent.username}** ha rifiutato la sfida di duello.`,
          embeds: [],
          components: []
        });
      }

      // Duel Battle Simulation
      let challengerHp = 100;
      let opponentHp = 100;
      let combatLog = [];

      let rounds = 0;
      while (challengerHp > 0 && opponentHp > 0 && rounds < 6) {
        rounds++;
        // Challenger attacks Opponent
        const challengerDmg = Math.floor(18 + Math.random() * 22);
        const isCrit1 = Math.random() < 0.25;
        const finalDmg1 = isCrit1 ? Math.floor(challengerDmg * 1.5) : challengerDmg;
        opponentHp = Math.max(0, opponentHp - finalDmg1);
        combatLog.push(`⚔️ **${challenger.username}** sferra un colpo ${isCrit1 ? '🔥 **CRITICO**' : ''} infliggendo **${finalDmg1}** danni! *(HP ${opponent.username}: ${opponentHp}/100)*`);

        if (opponentHp <= 0) break;

        // Opponent attacks Challenger
        const opponentDmg = Math.floor(18 + Math.random() * 22);
        const isCrit2 = Math.random() < 0.25;
        const finalDmg2 = isCrit2 ? Math.floor(opponentDmg * 1.5) : opponentDmg;
        challengerHp = Math.max(0, challengerHp - finalDmg2);
        combatLog.push(`🛡️ **${opponent.username}** contrattacca ${isCrit2 ? '🔥 **CRITICO**' : ''} infliggendo **${finalDmg2}** danni! *(HP ${challenger.username}: ${challengerHp}/100)*`);
      }

      const winner = challengerHp > opponentHp ? challenger : opponent;
      const loser = challengerHp > opponentHp ? opponent : challenger;

      // Handle bet payout
      if (bet > 0) {
        if (winner.id === challenger.id) {
          challengerProfile.coins += bet;
          opponentProfile.coins -= bet;
        } else {
          opponentProfile.coins += bet;
          challengerProfile.coins -= bet;
        }
        DatabaseHelper.saveFishingProfile(interaction.guild.id, challenger.id, challengerProfile);
        DatabaseHelper.saveFishingProfile(interaction.guild.id, opponent.id, opponentProfile);
      }

      const duelEmbed = new EmbedBuilder()
        .setColor(winner.id === challenger.id ? '#10b981' : '#dc2626')
        .setTitle(`🏆 Vittoria per ${winner.username}!`)
        .setDescription(
          `### Svolgimento del Duello nell'Arena:\n${combatLog.join('\n\n')}\n\n` +
          `👑 **Vincitore:** ${winner} con **${Math.max(challengerHp, opponentHp)} HP** rimasti!\n` +
          (bet > 0 ? `💰 **Bottino:** ${winner} intasca 🪙 **${bet * 2} Monete d'Oro**!\n` : '') +
          `*Onore a entrambi i cavalieri per la gloriosa battaglia.*`
        )
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/3063/3063822.png')
        .setFooter({ text: 'Torneo dei Cavalieri', iconURL: interaction.guild.iconURL() })
        .setTimestamp();

      await i.update({ content: null, embeds: [duelEmbed], components: [] });
      setTimeout(() => { interaction.deleteReply().catch(() => {}); }, 15000);
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        await interaction.editReply({
          content: `⏰ ${opponent} non ha risposto in tempo. La sfida di duello è scaduta.`,
          embeds: [],
          components: []
        }).catch(() => {});
        setTimeout(() => { interaction.deleteReply().catch(() => {}); }, 15000);
      }
    });
  }
};


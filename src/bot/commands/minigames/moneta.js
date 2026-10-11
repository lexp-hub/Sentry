import {
  SlashCommandBuilder,
  EmbedBuilder
} from 'discord.js';
import { DatabaseHelper } from '../../../database/db.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('moneta')
    .setDescription('Lancia una moneta reale con possibilità di scommessa')
    .addStringOption(opt =>
      opt
        .setName('scelta')
        .setDescription('Scegli Testa o Croce')
        .addChoices(
          { name: 'Testa 🪙', value: 'testa' },
          { name: 'Croce ⚔️', value: 'croce' }
        )
        .setRequired(false)
    )
    .addIntegerOption(opt =>
      opt
        .setName('puntata')
        .setDescription('Monete d\'oro da scommettere')
        .setMinValue(1)
        .setRequired(false)
    ),

  async execute(interaction) {
    const choice = interaction.options.getString('scelta');
    const bet = interaction.options.getInteger('puntata') || 0;
    const profile = DatabaseHelper.getFishingProfile(interaction.guild.id, interaction.user.id);

    if (bet > 0) {
      if (!choice) {
        return interaction.reply({ content: '❌ Se imposti una puntata, devi anche scegliere **Testa** o **Croce**!', ephemeral: true });
      }
      if (profile.coins < bet) {
        return interaction.reply({ content: `❌ Non possiedi abbastanza monete (Ne hai 🪙 ${profile.coins}).`, ephemeral: true });
      }
    }

    const outcome = Math.random() < 0.5 ? 'testa' : 'croce';
    const outcomeText = outcome === 'testa' ? '🪙 TESTA' : '⚔️ CROCE';

    let resultDesc = `La moneta d'oro è atterrata su: **${outcomeText}**!\n`;

    if (bet > 0 && choice) {
      if (choice === outcome) {
        profile.coins += bet;
        resultDesc += `\n🎉 **Hai Vinto!** Hai indovinato la faccia della moneta e incassi **🪙 +${bet} Monete**!\nNuovo Saldo: 🪙 **${profile.coins} Monete**.`;
      } else {
        profile.coins -= bet;
        resultDesc += `\n💀 **Hai Perso!** La sorte ti è stata avversa e perdi **🪙 -${bet} Monete**.\nNuovo Saldo: 🪙 **${profile.coins} Monete**.`;
      }
      DatabaseHelper.saveFishingProfile(interaction.guild.id, interaction.user.id, profile);
    }

    const embed = new EmbedBuilder()
      .setColor(bet > 0 && choice === outcome ? '#10b981' : '#ea580c')
      .setTitle('🪙 Lancio della Moneta')
      .setDescription(resultDesc)
      .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};


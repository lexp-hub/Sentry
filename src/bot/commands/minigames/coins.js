import saldoCommand from './saldo.js';
import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('coins')
    .setDescription('Mostra il tuo saldo monete d\'oro e tesoro')
    .addUserOption(opt =>
      opt
        .setName('utente')
        .setDescription('Utente di cui visualizzare il saldo (opzionale)')
        .setRequired(false)
    ),

  async execute(interaction) {
    return saldoCommand.execute(interaction);
  }
};


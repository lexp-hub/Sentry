import {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  PermissionFlagsBits
} from 'discord.js';
import { WebhookReplacerManager } from '../../modules/webhookReplacerManager.js';

export default {
  data: new ContextMenuCommandBuilder()
    .setName('Sostituisci con Sentry')
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const targetMsg = interaction.targetMessage;
    await interaction.deferReply({ ephemeral: true });

    if (!targetMsg) {
      return interaction.followUp({
        content: '❌ Impossibile trovare il messaggio selezionato.',
        ephemeral: true
      });
    }

    if (targetMsg.author.id === interaction.client.user.id) {
      return interaction.followUp({
        content: '⚠️ Questo messaggio è già stato inviato da Sentry!',
        ephemeral: true
      });
    }

    const res = await WebhookReplacerManager.replaceMessage(targetMsg);
    if (res.success) {
      return interaction.followUp({
        content: `✅ **Messaggio sostituito con successo!** Le immagini dell'embed sono state riassegnate permanentemente a Sentry.\nNuovo messaggio: https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${res.newMessage.id}`,
        ephemeral: true
      });
    } else {
      return interaction.followUp({
        content: `❌ Impossibile sostituire il messaggio: \`${res.error || 'Errore sconosciuto'}\``,
        ephemeral: true
      });
    }
  }
};

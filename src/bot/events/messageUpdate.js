import { DatabaseHelper } from '../../database/db.js';
import { EmbedBuilder } from 'discord.js';
import { CONFIG } from '../../config.js';

export default {
  name: 'messageUpdate',
  async execute(oldMessage, newMessage) {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const settings = DatabaseHelper.getGuildSettings(newMessage.guild.id);
    if (!settings.log_channel_id) return;

    const logChan = newMessage.guild.channels.cache.get(settings.log_channel_id);
    if (!logChan || logChan.id === newMessage.channel.id) return;

    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_WARN_COLOR)
      .setTitle('✏️ Messaggio Modificato')
      .addFields(
        { name: 'Autore', value: `${newMessage.author.tag} (${newMessage.author.id})`, inline: true },
        { name: 'Canale', value: `${newMessage.channel}`, inline: true },
        { name: 'Messaggio Originale', value: oldMessage.content ? `\`\`\`${oldMessage.content.slice(0, 500)}\`\`\`` : '`[Non memorizzato]`', inline: false },
        { name: 'Nuovo Messaggio', value: newMessage.content ? `\`\`\`${newMessage.content.slice(0, 500)}\`\`\`` : '`[Vuoto]`', inline: false },
        { name: 'Link', value: `[Vai al Messaggio](${newMessage.url})`, inline: true }
      )
      .setFooter({ text: `ID Messaggio: ${newMessage.id}` })
      .setTimestamp();

    await logChan.send({ embeds: [embed] }).catch(() => {});
  }
};

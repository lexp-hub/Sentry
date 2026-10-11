import { WelcomerManager } from '../modules/welcomerManager.js';
import { DatabaseHelper } from '../../database/db.js';
import { EmbedBuilder } from 'discord.js';
import { CONFIG } from '../../config.js';

export default {
  name: 'guildMemberAdd',
  async execute(member) {
    
    await WelcomerManager.handleMemberJoin(member);

    const settings = DatabaseHelper.getGuildSettings(member.guild.id);
    if (settings.log_channel_id) {
      const logChan = member.guild.channels.cache.get(settings.log_channel_id);
      if (logChan) {
        const embed = new EmbedBuilder()
          .setColor(CONFIG.EMBED_SUCCESS_COLOR)
          .setTitle('📥 Nuovo Membro Entrato')
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: 'Utente', value: `${member.user.tag} (${member.id})`, inline: true },
            { name: 'Tipo', value: member.user.bot ? '`Bot`' : '`Umano`', inline: true },
            { name: 'Membri Attuali', value: `\`${member.guild.memberCount}\``, inline: true },
            { name: 'Creazione Account', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: false }
          )
          .setTimestamp();
        await logChan.send({ embeds: [embed] }).catch(() => {});
      }
    }
  }
};

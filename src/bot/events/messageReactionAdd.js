import { DatabaseHelper } from '../../database/db.js';
import { EmbedBuilder } from 'discord.js';
import { CONFIG } from '../../config.js';

export default {
  name: 'messageReactionAdd',
  async execute(reaction, user) {
    if (user.bot) return;

    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        return;
      }
    }

    const { message } = reaction;
    if (!message.guild) return;

    const emojiIdentifier = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
    const rRoles = DatabaseHelper.getReactionRolesForMessage(message.id);
    const matched = rRoles.find(r => r.type === 'REACTION' && (r.emoji === emojiIdentifier || r.emoji === reaction.emoji.name));

    if (matched) {
      const member = await message.guild.members.fetch(user.id).catch(() => null);
      if (member) {
        const role = message.guild.roles.cache.get(matched.role_id);
        if (role) {
          await member.roles.add(role).catch(() => {});
        }
      }
    }

    if (reaction.emoji.name === '⭐') {
      const starConfig = DatabaseHelper.db.prepare('SELECT * FROM starboards WHERE guild_id = ? AND enabled = 1').get(message.guild.id);
      if (starConfig && starConfig.channel_id && message.channel.id !== starConfig.channel_id) {
        const count = reaction.count;
        if (count >= starConfig.min_stars) {
          const starChannel = message.guild.channels.cache.get(starConfig.channel_id);
          if (starChannel) {
            const existing = DatabaseHelper.db.prepare('SELECT * FROM starboard_messages WHERE guild_id = ? AND original_message_id = ?').get(message.guild.id, message.id);

            const starEmbed = new EmbedBuilder()
              .setColor('#EAB308') 
              .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
              .setDescription(message.content || '[Allegato / Embed]')
              .addFields(
                { name: 'Fonte', value: `[Salta al Messaggio](${message.url})`, inline: true }
              )
              .setFooter({ text: `ID Messaggio: ${message.id}` })
              .setTimestamp(message.createdAt);

            if (message.attachments.size > 0) {
              const firstAtt = message.attachments.first();
              if (firstAtt.contentType?.startsWith('image/')) {
                starEmbed.setImage(firstAtt.url);
              }
            }

            const starContent = `⭐ **${count}** | ${message.channel}`;

            if (existing) {
              const starMsg = await starChannel.messages.fetch(existing.starboard_message_id).catch(() => null);
              if (starMsg) {
                await starMsg.edit({ content: starContent, embeds: [starEmbed] });
                DatabaseHelper.db.prepare('UPDATE starboard_messages SET star_count = ? WHERE original_message_id = ?').run(count, message.id);
              }
            } else {
              const sentStar = await starChannel.send({ content: starContent, embeds: [starEmbed] });
              DatabaseHelper.db.prepare('INSERT INTO starboard_messages (guild_id, original_message_id, starboard_message_id, star_count) VALUES (?, ?, ?, ?)').run(
                message.guild.id,
                message.id,
                sentStar.id,
                count
              );
            }
          }
        }
      }
    }
  }
};

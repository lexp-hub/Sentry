import { DatabaseHelper } from '../../database/db.js';

export default {
  name: 'messageReactionRemove',
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
          await member.roles.remove(role).catch(() => {});
        }
      }
    }
  }
};

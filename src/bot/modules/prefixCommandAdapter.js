/**
 * Sentry Prefix Command Adapter
 * Permette l'esecuzione dei 69 comandi slash anche tramite prefisso testuale (es. !help, !ping, !autorole)
 * senza duplicare la logica dei comandi.
 */

export function createPrefixInteraction(message, args, command) {
  let repliedMessage = null;
  let isDeferred = false;
  let isReplied = false;

  return {
    isChatInputCommand: () => true,
    isContextMenuCommand: () => false,
    isButton: () => false,
    isSelectMenu: () => false,
    isModalSubmit: () => false,
    commandName: command.data.name,
    client: message.client,
    guild: message.guild,
    guildId: message.guild.id,
    channel: message.channel,
    channelId: message.channel.id,
    user: message.author,
    member: message.member,
    createdTimestamp: message.createdTimestamp,
    get deferred() { return isDeferred; },
    get replied() { return isReplied; },

    async deferReply(opts = {}) {
      isDeferred = true;
      try {
        await message.channel.sendTyping();
      } catch (e) {}
      return { createdTimestamp: Date.now() };
    },

    async reply(options) {
      isReplied = true;
      isDeferred = false;
      const payload = typeof options === 'string' ? { content: options } : { ...options };
      delete payload.ephemeral;
      repliedMessage = await message.reply(payload);
      return repliedMessage;
    },

    async editReply(options) {
      const payload = typeof options === 'string' ? { content: options } : { ...options };
      delete payload.ephemeral;
      if (repliedMessage) {
        return await repliedMessage.edit(payload);
      } else {
        repliedMessage = await message.reply(payload);
        isReplied = true;
        return repliedMessage;
      }
    },

    async followUp(options) {
      const payload = typeof options === 'string' ? { content: options } : { ...options };
      delete payload.ephemeral;
      return await message.channel.send(payload);
    },

    showModal() {
      return message.reply(`ℹ️ Questo comando utilizza un modulo popup interattivo. Usa lo slash command: \`/${command.data.name}\``);
    },

    options: {
      getSubcommand(required = false) {
        return args[0] ? args[0].toLowerCase() : null;
      },
      getString(name) {
        if (args.length === 0) return null;
        // Se c'è un sottocomando come primo arg, restituisce i successivi
        if (args.length > 1 && ['status', 'set', 'remove', 'test', 'crea', 'elimina', 'add', 'list'].includes(args[0].toLowerCase())) {
          return args.slice(1).join(' ');
        }
        return args.join(' ');
      },
      getInteger(name) {
        const num = parseInt(args.find(a => !isNaN(a) && !/^\d{17,20}$/.test(a)), 10);
        return isNaN(num) ? null : num;
      },
      getNumber(name) {
        const num = parseFloat(args.find(a => !isNaN(a) && !/^\d{17,20}$/.test(a)));
        return isNaN(num) ? null : num;
      },
      getBoolean(name) {
        const val = args.find(a => ['true', 'false', 'attivo', 'si', 'no', 'on', 'off', 'abilita', 'disabilita'].includes(a.toLowerCase()));
        if (!val) return null;
        return ['true', 'attivo', 'si', 'on', 'abilita'].includes(val.toLowerCase());
      },
      getUser(name) {
        const mention = message.mentions.users.first();
        if (mention) return mention;
        const idArg = args.find(a => /^\d{17,20}$/.test(a));
        if (idArg) return message.client.users.cache.get(idArg) || null;
        return null;
      },
      getMember(name) {
        const mention = message.mentions.members.first();
        if (mention) return mention;
        const idArg = args.find(a => /^\d{17,20}$/.test(a));
        if (idArg) return message.guild.members.cache.get(idArg) || null;
        return null;
      },
      getRole(name) {
        const mention = message.mentions.roles.first();
        if (mention) return mention;
        const idArg = args.find(a => /^\d{17,20}$/.test(a));
        if (idArg) return message.guild.roles.cache.get(idArg) || null;
        return null;
      },
      getChannel(name) {
        const mention = message.mentions.channels.first();
        if (mention) return mention;
        const idArg = args.find(a => /^\d{17,20}$/.test(a));
        if (idArg) return message.guild.channels.cache.get(idArg) || null;
        return null;
      }
    }
  };
}

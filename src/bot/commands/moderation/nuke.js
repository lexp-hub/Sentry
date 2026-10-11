import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType
} from 'discord.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('nuke')
    .setDescription('Ricrea completamente il canale cancellandone tutti i messaggi')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
    .addChannelOption(opt =>
      opt
        .setName('canale')
        .setDescription('Canale da ricreare (default: canale corrente)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName('motivo')
        .setDescription('Motivo della pulizia totale')
        .setRequired(false)
    ),

  async execute(interaction) {
    const hasPerm = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
                    interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                    interaction.guild.ownerId === interaction.user.id;

    if (!hasPerm) {
      return interaction.reply({
        content: '❌ Devi avere il permesso di **Gestire i Canali** (`Manage Channels`) o essere Amministratore per eseguire il comando nuke.',
        ephemeral: true
      });
    }

    if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return interaction.reply({
        content: '❌ Il bot non possiede il permesso di **Gestire i Canali** (`Manage Channels`) per clonare ed eliminare il canale.',
        ephemeral: true
      });
    }

    const targetChannel = interaction.options.getChannel('canale') || interaction.channel;
    const reason = interaction.options.getString('motivo') || 'Nuked by moderator';

    if (!targetChannel.isTextBased() || targetChannel.isThread() || targetChannel.isVoiceBased()) {
      return interaction.reply({
        content: '❌ Puoi eseguire il comando `/nuke` solo sui canali di testo standard.',
        ephemeral: true
      });
    }

    const origPosition = targetChannel.position;
    const origParent = targetChannel.parent;
    const origTopic = targetChannel.topic;
    const origName = targetChannel.name;
    const origNsfw = targetChannel.nsfw;
    const origSlowmode = targetChannel.rateLimitPerUser;

    await interaction.reply({ content: `💣 Ricreazione del canale <#${targetChannel.id}> in corso...`, ephemeral: true });

    try {
      const clonedChannel = await targetChannel.clone({
        name: origName,
        parent: origParent,
        topic: origTopic,
        position: origPosition,
        nsfw: origNsfw,
        rateLimitPerUser: origSlowmode,
        reason: `Nuked by ${interaction.user.tag}: ${reason}`
      });

      // Maintain exact hierarchy position
      await clonedChannel.setPosition(origPosition).catch(() => {});

      // Delete old channel
      await targetChannel.delete(`Nuked by ${interaction.user.tag}: ${reason}`);

      const embed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_COLOR || '#dc2626')
        .setAuthor({
          name: `Moderazione • ${interaction.user.tag}`,
          iconURL: interaction.user.displayAvatarURL({ dynamic: true })
        })
        .setTitle('💥 Canale Ricreato (Nuked)')
        .setDescription(`Questo canale è stato ripulito e ricreato con successo da ${interaction.user}!\n\n> 📋 **Motivo:** ${reason}`)
        .setImage('https://media.giphy.com/media/HhTXt43pk1I1W/giphy.gif')
        .setFooter({ text: `${interaction.guild.name} • Sentry Moderation`, iconURL: interaction.guild.iconURL() })
        .setTimestamp();

      await clonedChannel.send({ embeds: [embed] });
    } catch (e) {
      console.error('[Nuke Command] Error:', e);
      try {
        await interaction.followUp({
          content: `❌ Errore durante l'operazione di nuke: ${e.message}`,
          ephemeral: true
        });
      } catch (ignored) {}
    }
  }
};

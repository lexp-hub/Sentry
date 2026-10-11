import { SlashCommandBuilder, EmbedBuilder, ChannelType } from 'discord.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Mostra informazioni dettagliate sul server corrente'),

  async execute(interaction) {
    const { guild } = interaction;
    await guild.members.fetch();

    const owner = await guild.fetchOwner();
    const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
    const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
    const rolesCount = guild.roles.cache.size;
    const emojisCount = guild.emojis.cache.size;
    const stickersCount = guild.stickers.cache.size;

    const humans = guild.members.cache.filter(m => !m.user.bot).size;
    const bots = guild.members.cache.filter(m => m.user.bot).size;

    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_COLOR)
      .setTitle(`🏰 Informazioni su ${guild.name}`)
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '👑 Proprietario', value: `${owner} (\`${owner.user.tag}\`)`, inline: true },
        { name: '🆔 ID Server', value: `\`${guild.id}\``, inline: true },
        { name: '📅 Creato il', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D> (<t:${Math.floor(guild.createdTimestamp / 1000)}:R>)`, inline: false },
        { name: '👥 Membri Totali', value: `\`${guild.memberCount}\` (👤 ${humans} umani | 🤖 ${bots} bot)`, inline: true },
        { name: '🚀 Boost Livello', value: `Livello ${guild.premiumTier} (\`${guild.premiumSubscriptionCount || 0}\` boost)`, inline: true },
        { name: '💬 Canali', value: `📝 ${textChannels} Testuali | 🔊 ${voiceChannels} Vocali`, inline: true },
        { name: '🎭 Ruoli & Emoji', value: `📜 ${rolesCount} Ruoli | 😀 ${emojisCount} Emoji | 🖼️ ${stickersCount} Sticker`, inline: false }
      )
      .setFooter({ text: `Richiesto da ${interaction.user.tag}` })
      .setTimestamp();

    if (guild.bannerURL()) {
      embed.setImage(guild.bannerURL({ size: 1024 }));
    }

    await interaction.reply({ embeds: [embed] });
  }
};

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Mostra informazioni sul tuo profilo o su un altro utente')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('L\'utente di cui visualizzare le informazioni')
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('target') || interaction.user;
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    const embed = new EmbedBuilder()
      .setColor(member?.displayHexColor && member.displayHexColor !== '#000000' ? member.displayHexColor : CONFIG.EMBED_COLOR)
      .setTitle(`👤 Profilo Utente | ${targetUser.tag}`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '🆔 ID Utente', value: `\`${targetUser.id}\``, inline: true },
        { name: '🤖 Tipo Account', value: targetUser.bot ? '`Bot`' : '`Umano`', inline: true },
        { name: '📅 Registrazione Account', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:D> (<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>)`, inline: false }
      );

    if (member) {
      const roles = member.roles.cache
        .filter(r => r.id !== interaction.guild.id)
        .sort((a, b) => b.position - a.position)
        .map(r => `${r}`)
        .slice(0, 15);

      embed.addFields(
        { name: '📥 Entrato nel Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:D> (<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)`, inline: false },
        { name: `🎭 Ruoli [${member.roles.cache.size - 1}]`, value: roles.length > 0 ? roles.join(', ') : 'Nessun ruolo speciale' }
      );
    }

    embed.setFooter({ text: `Richiesto da ${interaction.user.tag}` }).setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

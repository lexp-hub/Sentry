import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  parseEmoji
} from 'discord.js';
import { CONFIG } from '../../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('steal')
    .setDescription('Ruba e aggiunge emoji o sticker al tuo server')
    .addSubcommand(sub =>
      sub
        .setName('emoji')
        .setDescription('Aggiunge un\'emoji personalizzata al server da un\'emoji o URL')
        .addStringOption(opt =>
          opt
            .setName('emoji_o_link')
            .setDescription('L\'emoji da rubare (anche di un altro server) o un link immagine PNG/GIF')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('nome')
            .setDescription('Nome da dare alla nuova emoji')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuildExpressions) &&
        !interaction.member.permissions.has(PermissionsBitField.Flags.ManageEmojisAndStickers) &&
        !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: '❌ Non hai i permessi per aggiungere emoji (`Gestisci Espressioni Server`).',
        ephemeral: true
      });
    }

    await interaction.deferReply();

    const input = interaction.options.getString('emoji_o_link');
    let customName = interaction.options.getString('nome');

    let url = '';
    let name = customName || 'stolen_emoji';

    const parsed = parseEmoji(input);
    if (parsed && parsed.id) {
      const ext = parsed.animated ? 'gif' : 'png';
      url = `https://cdn.discordapp.com/emojis/${parsed.id}.${ext}`;
      if (!customName) name = parsed.name;
    } else if (input.startsWith('http://') || input.startsWith('https://')) {
      url = input;
    } else {
      return interaction.editReply({
        content: '❌ Input non valido. Inserisci un\'emoji personalizzata di Discord o un URL diretto ad un\'immagine/GIF.'
      });
    }

    try {
      const createdEmoji = await interaction.guild.emojis.create({
        attachment: url,
        name: name.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32)
      });

      const embed = new EmbedBuilder()
        .setColor(CONFIG.EMBED_SUCCESS_COLOR)
        .setTitle('✨ Emoji Rubata con Successo!')
        .setDescription(`L'emoji ${createdEmoji} (\`:${createdEmoji.name}:\`) è stata aggiunta al server!`)
        .setThumbnail(createdEmoji.url)
        .setFooter({ text: `Aggiunta da ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply({
        content: `❌ Impossibile aggiungere l'emoji: ${error.message} (Verifica che il server non abbia raggiunto il limite massimo di emoji o che l'immagine sia inferiore a 256KB).`
      });
    }
  }
};

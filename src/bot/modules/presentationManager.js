import { DatabaseHelper } from '../../database/db.js';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { CONFIG } from '../../config.js';
import { XPManager } from './xpManager.js';

export const PresentationManager = {
  /**
   * Generates the native Discord Modal form for user presentation
   */
  createPresentationModal() {
    const modal = new ModalBuilder()
      .setCustomId('modal_presentation_submit')
      .setTitle('📜 Presentati al Server');

    const nameInput = new TextInputBuilder()
      .setCustomId('pres_name')
      .setLabel('Come ti chiami? (Nome o Nickname)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('es. Alessandro / Alex')
      .setRequired(true)
      .setMaxLength(50);

    const ageInput = new TextInputBuilder()
      .setCustomId('pres_age')
      .setLabel('Età e/o Pronomi (Opzionale)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('es. 20 anni, he/him / she/her')
      .setRequired(false)
      .setMaxLength(50);

    const hobbiesInput = new TextInputBuilder()
      .setCustomId('pres_hobbies')
      .setLabel('I tuoi Hobby, Passioni o Giochi')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('es. Gaming (Minecraft, LoL, Elden Ring), Musica, Cinema, Coding...')
      .setRequired(true)
      .setMaxLength(1500);

    const bioInput = new TextInputBuilder()
      .setCustomId('pres_bio')
      .setLabel('Parlaci di te / Perché sei qui?')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('es. Sono qui per fare nuove amicizie, divertirmi e chiacchierare!')
      .setRequired(true)
      .setMaxLength(2000);

    const socialInput = new TextInputBuilder()
      .setCustomId('pres_social')
      .setLabel('Social, Link o Foto/Banner URL (Opzionale)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('es. Instagram: @tuonome / Spotify / Link immagine...')
      .setRequired(false)
      .setMaxLength(255);

    const row1 = new ActionRowBuilder().addComponents(nameInput);
    const row2 = new ActionRowBuilder().addComponents(ageInput);
    const row3 = new ActionRowBuilder().addComponents(hobbiesInput);
    const row4 = new ActionRowBuilder().addComponents(bioInput);
    const row5 = new ActionRowBuilder().addComponents(socialInput);

    modal.addComponents(row1, row2, row3, row4, row5);
    return modal;
  },

  /**
   * Sends an interactive Presentation Panel in Discord with a button to open the form
   */
  async sendPresentationPanel(guild, channelId, title = '📜 Benvenuto nella Sala delle Presentazioni', description = null, color = '#6366f1', image = null) {
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) throw new Error('Canale presentazioni non trovato o non valido.');

    const config = DatabaseHelper.getPresentationConfig(guild.id);

    const desc = description ||
      `Benvenuto nella sala delle presentazioni di **${guild.name}**!\n\n` +
      `Vogliamo conoscerti meglio! Clicca sul pulsante qui sotto per compilare il tuo **modulo di presentazione** personalizzato.\n\n` +
      `🎁 **Cosa ottieni presentandoti:**\n` +
      `• Il ruolo esclusivo della community ${config.reward_role_id ? `<@&${config.reward_role_id}>` : ''}\n` +
      `• **+${config.xp_reward || 100} XP** per scalare la classifica del server!\n\n` +
      `👇 Clicca sul pulsante verde **Presentati al Server** per aprire il modulo!`;

    const embed = new EmbedBuilder()
      .setColor(color || '#6366f1')
      .setTitle(title)
      .setDescription(desc)
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .setFooter({ text: `${guild.name} • Presentazioni Ufficiali`, iconURL: guild.iconURL() })
      .setTimestamp();

    if (image && image.startsWith('http')) {
      embed.setImage(image);
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('presentation_open_form')
        .setLabel('📜 Presentati al Server (Form)')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('presentation_view_rules')
        .setLabel('ℹ️ Regolamento')
        .setStyle(ButtonStyle.Secondary)
    );

    return channel.send({ embeds: [embed], components: [row] });
  },

  /**
   * Handles the presentation modal submit event
   */
  async handlePresentationModalSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const member = interaction.member;
    const user = interaction.user;

    const config = DatabaseHelper.getPresentationConfig(guild.id);
    if (!config.enabled) {
      return interaction.editReply({ content: '❌ Il modulo presentazioni è attualmente disattivato su questo server.' });
    }

    const name = interaction.fields.getTextInputValue('pres_name')?.trim();
    const agePronouns = interaction.fields.getTextInputValue('pres_age')?.trim() || 'Non specificato';
    const hobbies = interaction.fields.getTextInputValue('pres_hobbies')?.trim();
    const bio = interaction.fields.getTextInputValue('pres_bio')?.trim();
    const social = interaction.fields.getTextInputValue('pres_social')?.trim() || null;

    // Build the introduction embed
    const presEmbed = new EmbedBuilder()
      .setColor(config.color || '#6366f1')
      .setAuthor({
        name: `Presentazione di ${name}`,
        iconURL: user.displayAvatarURL({ dynamic: true })
      })
      .setTitle(`📜 Nuova Presentazione: ${name}!`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 512 }))
      .addFields(
        { name: '👤 Nome / Nickname', value: `**${name}** (<@${user.id}>)`, inline: true },
        { name: '🎂 Età / Pronomi', value: `\`${agePronouns}\``, inline: true },
        { name: '📅 Entrato nel Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
        { name: '🎮 Hobby & Passioni', value: hobbies, inline: false },
        { name: '✨ Qualcosa su di me', value: bio, inline: false }
      )
      .setFooter({ text: `${guild.name} • Presentazioni`, iconURL: guild.iconURL() })
      .setTimestamp();

    if (social) {
      if (social.startsWith('http://') || social.startsWith('https://')) {
        // If image link, display as banner
        if (/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(social)) {
          presEmbed.setImage(social);
        } else {
          presEmbed.addFields({ name: '🌐 Social & Link', value: `[Clicca qui per il profilo](${social})`, inline: false });
        }
      } else {
        presEmbed.addFields({ name: '🌐 Social & Contatti', value: `\`${social}\``, inline: false });
      }
    }

    const targetChannelId = config.channel_id;
    const targetChannel = targetChannelId 
      ? (guild.channels.cache.get(targetChannelId) || await guild.channels.fetch(targetChannelId).catch(() => null))
      : interaction.channel;

    if (!targetChannel) {
      return interaction.editReply({ content: '❌ Canale presentazioni non trovato o non configurato.' });
    }

    // Send the presentation embed
    const sentMsg = await targetChannel.send({
      content: `🎉 Diamo un caloroso benvenuto a <@${user.id}>!`,
      embeds: [presEmbed]
    });

    // Add reactions
    try {
      await sentMsg.react('👋');
      await sentMsg.react('❤️');
      await sentMsg.react('⚔️');
    } catch (e) {}

    // Reward role assignment
    let roleAssignedText = '';
    if (config.reward_role_id) {
      try {
        const rewardRole = guild.roles.cache.get(config.reward_role_id) || await guild.roles.fetch(config.reward_role_id).catch(() => null);
        if (rewardRole) {
          await member.roles.add(rewardRole);
          roleAssignedText = `\n🎖️ Ti è stato assegnato il ruolo ${rewardRole}!`;
        }
      } catch (err) {
        console.error('[Presentazioni] Errore assegnazione ruolo:', err.message);
      }
    }

    // XP Bonus reward
    if (config.xp_reward > 0) {
      try {
        await XPManager.addXP(guild.id, user.id, config.xp_reward);
      } catch (e) {}
    }

    // Save presentation in database
    DatabaseHelper.addPresentation(guild.id, {
      user_id: user.id,
      name,
      age_pronouns: agePronouns,
      hobbies,
      bio,
      social_media: social,
      message_id: sentMsg.id,
      timestamp: Math.floor(Date.now() / 1000)
    });

    const successEmbed = new EmbedBuilder()
      .setColor('#10b981')
      .setTitle('🎉 Presentazione Inviata con Successo!')
      .setDescription(
        `Grazie per esserti presentato alla community di **${guild.name}**!\n\n` +
        `La tua presentazione è ora visibile in ${targetChannel}.\n` +
        `🎁 **Ricompensa Ricevuta:** \`+${config.xp_reward || 100} XP\`${roleAssignedText}\n\n` +
        `🔗 **[Visualizza il tuo Messaggio](${sentMsg.url})**`
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });
  }
};

export default PresentationManager;


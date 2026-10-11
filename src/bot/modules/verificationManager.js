import {
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { createCanvas } from '@napi-rs/canvas';
import { DatabaseHelper } from '../../database/db.js';

// Map of active captcha sessions: `${guildId}_${userId}` -> session data
const activeSessions = new Map();

const CHARACTERS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateCaptchaText(length = 6) {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CHARACTERS.charAt(Math.floor(Math.random() * CHARACTERS.length));
  }
  return result;
}

function generateCaptchaImage(text) {
  const width = 280;
  const height = 100;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Dark slate background
  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, width, height);

  // Background subtle noise grid
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 20) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Wavy distortion lines
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b'][i % 4];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.random() * 20, Math.random() * height);
    ctx.bezierCurveTo(
      width * 0.33, Math.random() * height,
      width * 0.66, Math.random() * height,
      width - Math.random() * 20, Math.random() * height
    );
    ctx.stroke();
  }

  // Draw distorted characters
  ctx.font = 'bold 44px sans-serif';
  const startX = 25;
  const charSpacing = (width - 50) / text.length;

  for (let i = 0; i < text.length; i++) {
    ctx.save();
    const char = text[i];
    const x = startX + i * charSpacing + (Math.random() * 4 - 2);
    const y = 68 + (Math.random() * 10 - 5);
    const angle = (Math.random() * 32 - 16) * Math.PI / 180;

    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = ['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1'][Math.floor(Math.random() * 4)];
    ctx.fillText(char, 0, 0);
    ctx.restore();
  }

  // Random noise speckles
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.arc(Math.random() * width, Math.random() * height, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas.toBuffer('image/png');
}

export const VerificationManager = {
  buildPanelPayload(config) {
    const embed = new EmbedBuilder()
      .setColor('#dc2626')
      .setTitle(config.panel_title || '🛡️ Portale di Verifica • Sentry')
      .setDescription(
        (config.panel_description || 'Benvenuto nel server! Clicca sul pulsante sottostante per avviare la verifica con Captcha visivo e sbloccare tutti i canali.') +
        '\n\n> 🔒 **Sicurezza Anti-Bot:** Completa il Captcha per ricevere il ruolo di accesso e sbloccare la community.'
      )
      .setFooter({ text: 'Sentry Sentinel Security • Protezione Anti-Raid' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_verify_start')
        .setEmoji('🔐')
        .setLabel('Verifica con Captcha')
        .setStyle(ButtonStyle.Success)
    );

    return { embeds: [embed], components: [row] };
  },

  async startVerification(interaction) {
    const { guild, member } = interaction;
    const config = DatabaseHelper.getVerificationConfig(guild.id);

    if (!config.enabled) {
      return interaction.reply({
        content: '⚠️ Il sistema di verifica è attualmente disattivato su questo server.',
        ephemeral: true
      });
    }

    if (!config.verified_role_id) {
      return interaction.reply({
        content: '⚠️ Nessun ruolo verificato configurato! Chiedi a un amministratore di impostare il ruolo tramite `/verifica setup`.',
        ephemeral: true
      });
    }

    // Check if member already has the verified role
    if (member.roles.cache.has(config.verified_role_id)) {
      return interaction.reply({
        content: '✅ Sei già verificato in questo server!',
        ephemeral: true
      });
    }

    // Generate new captcha
    const sessionKey = `${guild.id}_${member.id}`;
    const code = generateCaptchaText(6);
    const imgBuffer = generateCaptchaImage(code);
    const attachment = new AttachmentBuilder(imgBuffer, { name: 'captcha.png' });

    activeSessions.set(sessionKey, {
      code,
      attempts: 3,
      expiresAt: Date.now() + 180000 // 3 minutes
    });

    const embed = new EmbedBuilder()
      .setColor('#3b82f6')
      .setTitle('🔐 Verifica di Sicurezza • Captcha')
      .setDescription(
        '### Inserisci i caratteri visualizzati nell\'immagine sottostante\n\n' +
        '1. Guarda l\'immagine generata qui sotto.\n' +
        '2. Clicca sul pulsante **✏️ Inserisci Codice** e digita i 6 caratteri.\n' +
        '3. Se l\'immagine è difficile da leggere, clicca su **🔄 Nuova Immagine**.\n\n' +
        '> ⏱️ **Tempo a disposizione:** 3 minuti\n' +
        '> 🛡️ **Tentativi disponibili:** 3'
      )
      .setImage('attachment://captcha.png')
      .setFooter({ text: 'Sentry Captcha Shield • Lettere maiuscole e numeri' });

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_verify_enter_code')
        .setEmoji('✏️')
        .setLabel('Inserisci Codice')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('btn_verify_refresh')
        .setEmoji('🔄')
        .setLabel('Nuova Immagine')
        .setStyle(ButtonStyle.Secondary)
    );

    if (interaction.replied || interaction.deferred) {
      return interaction.editReply({
        embeds: [embed],
        files: [attachment],
        components: [buttons]
      });
    } else {
      return interaction.reply({
        embeds: [embed],
        files: [attachment],
        components: [buttons],
        ephemeral: true
      });
    }
  },

  async showCodeModal(interaction) {
    const sessionKey = `${interaction.guildId}_${interaction.user.id}`;
    const session = activeSessions.get(sessionKey);

    if (!session || Date.now() > session.expiresAt) {
      return interaction.reply({
        content: '⏱️ La sessione di verifica è scaduta. Clicca nuovamente su "Verifica con Captcha" per iniziare.',
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('modal_verify_submit')
      .setTitle('Verifica di Sicurezza Captcha');

    const input = new TextInputBuilder()
      .setCustomId('captcha_code_input')
      .setLabel('Digita il codice mostrato nell\'immagine')
      .setPlaceholder('Es. 7X9KR2 (non fa distinzione maiuscole/minuscole)')
      .setStyle(TextInputStyle.Short)
      .setMinLength(4)
      .setMaxLength(8)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    return interaction.showModal(modal);
  },

  async handleModalSubmit(interaction) {
    try {
      const sessionKey = `${interaction.guildId}_${interaction.user.id}`;
      const session = activeSessions.get(sessionKey);

      if (!session || Date.now() > session.expiresAt) {
        return await interaction.reply({
          content: '⏱️ La sessione di verifica è scaduta. Clicca su "Nuova Immagine" per rigenerare il Captcha.',
          ephemeral: true
        }).catch(() => {});
      }

      const userInput = interaction.fields.getTextInputValue('captcha_code_input').trim().toUpperCase();
      const config = DatabaseHelper.getVerificationConfig(interaction.guildId);

      // 1. Success match!
      if (userInput === session.code) {
        activeSessions.delete(sessionKey);

        try {
          if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
          }
        } catch (deferErr) {
          if (deferErr.code === 10062 || deferErr.code === 40060) {
            console.warn(`[Verification] Interazione modal scaduta o già gestita (${deferErr.code}):`, deferErr.message);
            return;
          }
          throw deferErr;
        }

        try {
          const member = interaction.member;

          // Assign verified role
          if (config.verified_role_id) {
            await member.roles.add(config.verified_role_id);
          }

          // Remove unverified role if present
          if (config.unverified_role_id && member.roles.cache.has(config.unverified_role_id)) {
            await member.roles.remove(config.unverified_role_id).catch(() => {});
          }

          // Send log to log channel
          if (config.log_channel_id) {
            const logChan = interaction.guild.channels.cache.get(config.log_channel_id);
            if (logChan && logChan.isTextBased()) {
              logChan.send({
                embeds: [
                  new EmbedBuilder()
                    .setColor('#10b981')
                    .setAuthor({ name: `${member.user.tag} Verificato`, iconURL: member.user.displayAvatarURL() })
                    .setDescription(`✅ L'utente <@${member.id}> ha completato con successo la verifica Captcha!`)
                    .setTimestamp()
                ]
              }).catch(() => {});
            }
          }

          const successEmbed = new EmbedBuilder()
            .setColor('#10b981')
            .setTitle('🎉 Verifica Completata con Successo!')
            .setDescription(
              `Congratulazioni <@${member.id}>! Il tuo codice Captcha è corretto.\n\n` +
              (config.verified_role_id ? `> 🏷️ Ti è stato assegnato il ruolo <@&${config.verified_role_id}>.\n` : '') +
              '> 🚀 Ora puoi visualizzare e chattare in tutti i canali del server!'
            )
            .setFooter({ text: 'Sentry Sentinel Shield' });

          return await interaction.editReply({ embeds: [successEmbed], components: [] }).catch(() => {});
        } catch (err) {
          console.error('[Verification] Errore assegnazione ruolo:', err);
          return await interaction.editReply({
            content: `⚠️ Codice corretto, ma si è verificato un errore nell'assegnazione del ruolo: \`${err.message}\`. Verifica che il ruolo del bot sia posizionato più in alto nella gerarchia ruoli di Discord!`
          }).catch(() => {});
        }
      }

      // 2. Incorrect code
      session.attempts--;
      if (session.attempts <= 0) {
        activeSessions.delete(sessionKey);
        return await interaction.reply({
          content: '❌ **Hai esaurito i 3 tentativi disponibili.** Clicca sul pulsante "Nuova Immagine" per riprovare con un nuovo codice.',
          ephemeral: true
        }).catch(() => {});
      }

      return await interaction.reply({
        content: `❌ **Codice errato!** Ti rimangono **${session.attempts}** tentativi. Riguarda con attenzione l'immagine e clicca su "Inserisci Codice".`,
        ephemeral: true
      }).catch(() => {});
    } catch (err) {
      if (err.code === 10062 || err.code === 40060) {
        console.warn(`[Verification] Interazione modal scaduta o non valida (${err.code}):`, err.message);
        return;
      }
      console.error('[Verification] Errore imprevisto nel modal di verifica:', err);
    }
  }
};

export default VerificationManager;

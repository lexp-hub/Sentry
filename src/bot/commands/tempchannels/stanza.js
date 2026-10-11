import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
  PermissionsBitField
} from 'discord.js';
import { TempChannelManager } from '../../modules/tempChannelManager.js';
import { DatabaseHelper } from '../../../database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('stanza')
    .setDescription('Gestisci e crea i tuoi canali privati temporanei (vocali e testuali)')
    .addSubcommand(sub =>
      sub
        .setName('crea')
        .setDescription('Crea all\'istante una nuova stanza vocale privata')
        .addStringOption(opt =>
          opt
            .setName('nome')
            .setDescription('Nome personalizzato per la stanza vocale')
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt
            .setName('limite')
            .setDescription('Limite massimo di partecipanti per la vocale (0 = illimitato)')
            .setMinValue(0)
            .setMaxValue(99)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('hub')
        .setDescription('Invia o rimanda l\'Hub di Controllo Rapido nella chat della stanza vocale')
    )
    .addSubcommand(sub =>
      sub
        .setName('invita')
        .setDescription('Concedi l\'accesso alla tua stanza privata a un amico')
        .addUserOption(opt =>
          opt
            .setName('utente')
            .setDescription('Utente da invitare nella stanza')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('espelli')
        .setDescription('Revoca l\'accesso ed espelli un utente dalla stanza privata')
        .addUserOption(opt =>
          opt
            .setName('utente')
            .setDescription('Utente da espellere o rimuovere')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('blocca')
        .setDescription('Blocca l\'accesso alla stanza a tutti gli altri membri')
    )
    .addSubcommand(sub =>
      sub
        .setName('sblocca')
        .setDescription('Riapri l\'accesso alla stanza a tutti i membri')
    )
    .addSubcommand(sub =>
      sub
        .setName('nascondi')
        .setDescription('Rendi la stanza invisibile nell\'elenco dei canali')
    )
    .addSubcommand(sub =>
      sub
        .setName('mostra')
        .setDescription('Rendi la stanza di nuovo visibile nell\'elenco dei canali')
    )
    .addSubcommand(sub =>
      sub
        .setName('limite')
        .setDescription('Imposta il limite massimo di utenti per la stanza vocale')
        .addIntegerOption(opt =>
          opt
            .setName('numero')
            .setDescription('Numero partecipanti (0 = illimitato)')
            .setMinValue(0)
            .setMaxValue(99)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('rinomina')
        .setDescription('Rinomina la tua stanza privata')
        .addStringOption(opt =>
          opt
            .setName('nome')
            .setDescription('Nuovo nome del canale')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('elimina')
        .setDescription('Chiudi ed elimina definitivamente la tua stanza')
    )
    .addSubcommand(sub =>
      sub
        .setName('panel')
        .setDescription('Invia l\'Hub interattivo per la creazione rapida delle stanze (Admin)')
        .addChannelOption(opt =>
          opt
            .setName('canale')
            .setDescription('Canale in cui inviare il pannello')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('titolo')
            .setDescription('Titolo personalizzato dell\'embed')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('descrizione')
            .setDescription('Descrizione personalizzata')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('config')
        .setDescription('Configura il generatore vocale e la categoria delle stanze (Admin)')
        .addChannelOption(opt =>
          opt
            .setName('generatore')
            .setDescription('Canale vocale "Join to Create" (clicca per creare stanza)')
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(false)
        )
        .addChannelOption(opt =>
          opt
            .setName('categoria')
            .setDescription('Categoria sotto cui creare le stanze temporanee')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt
            .setName('attivo')
            .setDescription('Attiva o disattiva il modulo')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const member = interaction.member;
    const user = interaction.user;

    // === 1. PANEL (Admin) ===
    if (subcommand === 'panel') {
      if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return interaction.reply({ content: '❌ Solo gli amministratori possono inviare l\'Hub stanze.', ephemeral: true });
      }

      const targetChannel = interaction.options.getChannel('canale') || interaction.channel;
      const title = interaction.options.getString('titolo');
      const description = interaction.options.getString('descrizione');

      try {
        await TempChannelManager.sendHubPanel(guild, targetChannel.id, { title, description });
        return interaction.reply({
          content: `✅ Hub Creazione Stanze inviato con successo in <#${targetChannel.id}>!`,
          ephemeral: true
        });
      } catch (err) {
        return interaction.reply({ content: `❌ Errore durante l'invio: ${err.message}`, ephemeral: true });
      }
    }

    // === 2. CONFIG (Admin) ===
    if (subcommand === 'config') {
      if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return interaction.reply({ content: '❌ Solo gli amministratori possono configurare il modulo.', ephemeral: true });
      }

      const generator = interaction.options.getChannel('generatore');
      const category = interaction.options.getChannel('categoria');
      const enabled = interaction.options.getBoolean('attivo');

      const updates = {};
      if (generator) updates.voice_generator_id = generator.id;
      if (category) updates.category_id = category.id;
      if (enabled !== null) updates.enabled = enabled ? 1 : 0;

      const newConfig = DatabaseHelper.updateTempChannelConfig(guild.id, updates);

      return interaction.reply({
        content: `✅ **Configurazione Canali Privati Salvata:**\n` +
                 `• 🔌 **Stato Modulo:** ${newConfig.enabled ? '🟢 Attivo' : '🔴 Disattivato'}\n` +
                 `• 🔊 **Generatore "Join to Create":** ${newConfig.voice_generator_id ? `<#${newConfig.voice_generator_id}>` : '*Nessuno configurato*'}\n` +
                 `• 📁 **Categoria Stanze:** ${newConfig.category_id ? `<#${newConfig.category_id}>` : '*Nessuna (Default del server)*'}`,
        ephemeral: true
      });
    }

    // === 3. CREA ===
    if (subcommand === 'crea') {
      const customName = interaction.options.getString('nome');
      const userLimit = interaction.options.getInteger('limite') || 0;

      const result = await TempChannelManager.createVoiceRoom(guild, member, { name: customName, userLimit });
      if (!result.success) return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
      return interaction.reply({
        content: `✅ Stanza vocale privata creata: <#${result.voiceChannel.id}>!\n💡 *Apri la chat della vocale per trovare l'**Hub di Controllo Rapido** con tutti i pulsanti di gestione.*`,
        ephemeral: true
      });
    }

    // === 3b. HUB ===
    if (subcommand === 'hub') {
      const activeVoiceId = member.voice?.channelId;
      let targetChannel = null;
      let tempRecord = null;

      if (activeVoiceId) {
        tempRecord = DatabaseHelper.getTempChannelByVoiceId(activeVoiceId);
        if (tempRecord) targetChannel = guild.channels.cache.get(tempRecord.voice_channel_id);
      }
      if (!targetChannel) {
        tempRecord = DatabaseHelper.getTempChannelByChannelId(interaction.channelId);
        if (tempRecord) targetChannel = guild.channels.cache.get(tempRecord.voice_channel_id || tempRecord.text_channel_id);
      }

      if (!targetChannel || !tempRecord) {
        return interaction.reply({
          content: '❌ Devi essere collegato alla tua stanza vocale temporanea (o nella sua chat) per richiederne l\'Hub.',
          ephemeral: true
        });
      }

      if (tempRecord.owner_id !== interaction.user.id &&
          !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({
          content: '❌ Solo il proprietario della stanza o un amministratore possono richiamare l\'Hub di Controllo.',
          ephemeral: true
        });
      }

      await TempChannelManager.sendControlPanel(targetChannel, member, targetChannel.id, null);
      return interaction.reply({
        content: `✅ **Hub di Controllo Rapido inviato nella chat della vocale:** <#${targetChannel.id}>!\n💡 Clicca sull'icona del fumetto della chat per gestirla.`,
        ephemeral: true
      });
    }

    // === Commands that require being in/controlling a temp channel ===
    // Find active channel by current interaction channel or voice channel
    const currentChannelId = interaction.channelId;
    const voiceChannelId = member.voice?.channelId;

    let tempRecord = DatabaseHelper.getTempChannelByChannelId(currentChannelId);
    if (!tempRecord && voiceChannelId) {
      tempRecord = DatabaseHelper.getTempChannelByVoiceId(voiceChannelId);
    }

    if (!tempRecord) {
      return interaction.reply({
        content: '❌ Devi trovarti all\'interno della tua stanza privata o eseguire il comando nella sua chat per gestirla.',
        ephemeral: true
      });
    }

    const isOwner = tempRecord.owner_id === user.id;
    const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                    member.permissions.has(PermissionsBitField.Flags.ManageChannels);

    if (!isOwner && !isAdmin) {
      return interaction.reply({
        content: `❌ Solo il proprietario della stanza (<@${tempRecord.owner_id}>) può eseguire questo comando.`,
        ephemeral: true
      });
    }

    const voiceChan = tempRecord.voice_channel_id ? guild.channels.cache.get(tempRecord.voice_channel_id) : null;
    const textChan = tempRecord.text_channel_id ? guild.channels.cache.get(tempRecord.text_channel_id) : null;

    // === 4. INVITA ===
    if (subcommand === 'invita') {
      const targetUser = interaction.options.getUser('utente');
      if (voiceChan) {
        await voiceChan.permissionOverwrites.edit(targetUser.id, {
          ViewChannel: true,
          Connect: true,
          Speak: true
        }).catch(() => {});
      }
      if (textChan) {
        await textChan.permissionOverwrites.edit(targetUser.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        }).catch(() => {});
      }
      return interaction.reply({
        content: `✅ Accesso concesso a ${targetUser} per questa stanza!`,
        ephemeral: true
      });
    }

    // === 5. ESPELLI ===
    if (subcommand === 'espelli') {
      const targetUser = interaction.options.getUser('utente');
      if (voiceChan) {
        await voiceChan.permissionOverwrites.delete(targetUser.id).catch(() => {});
        const targetMember = guild.members.cache.get(targetUser.id);
        if (targetMember && targetMember.voice?.channelId === voiceChan.id) {
          await targetMember.voice.disconnect('Espulso dalla stanza privata').catch(() => {});
        }
      }
      if (textChan) {
        await textChan.permissionOverwrites.delete(targetUser.id).catch(() => {});
      }
      return interaction.reply({
        content: `🚫 Accesso revocato per ${targetUser}.`,
        ephemeral: true
      });
    }

    // === 6. BLOCCA ===
    if (subcommand === 'blocca') {
      if (voiceChan) {
        await voiceChan.permissionOverwrites.edit(guild.id, { Connect: false, SendMessages: false }).catch(() => {});
      }
      if (textChan) {
        await textChan.permissionOverwrites.edit(guild.id, { ViewChannel: false, SendMessages: false }).catch(() => {});
      }
      DatabaseHelper.updateTempChannelState(tempRecord.id, { is_locked: 1 });
      return interaction.reply({ content: '🔒 Stanza bloccata a tutti i nuovi membri!', ephemeral: true });
    }

    // === 7. SBLOCCA ===
    if (subcommand === 'sblocca') {
      if (voiceChan) {
        await voiceChan.permissionOverwrites.edit(guild.id, { Connect: true, SendMessages: true }).catch(() => {});
      }
      if (textChan) {
        await textChan.permissionOverwrites.edit(guild.id, { ViewChannel: false, SendMessages: false }).catch(() => {});
      }
      DatabaseHelper.updateTempChannelState(tempRecord.id, { is_locked: 0 });
      return interaction.reply({ content: '🔓 Stanza sbloccata!', ephemeral: true });
    }

    // === 8. NASCONDI ===
    if (subcommand === 'nascondi') {
      if (voiceChan) {
        await voiceChan.permissionOverwrites.edit(guild.id, { ViewChannel: false }).catch(() => {});
      }
      if (textChan) {
        await textChan.permissionOverwrites.edit(guild.id, { ViewChannel: false, SendMessages: false }).catch(() => {});
      }
      DatabaseHelper.updateTempChannelState(tempRecord.id, { is_hidden: 1 });
      return interaction.reply({ content: '👁️ Stanza resa invisibile agli altri membri!', ephemeral: true });
    }

    // === 9. MOSTRA ===
    if (subcommand === 'mostra') {
      if (voiceChan) {
        await voiceChan.permissionOverwrites.edit(guild.id, { ViewChannel: true }).catch(() => {});
      }
      if (textChan) {
        await textChan.permissionOverwrites.edit(guild.id, { ViewChannel: false, SendMessages: false }).catch(() => {});
      }
      DatabaseHelper.updateTempChannelState(tempRecord.id, { is_hidden: 0 });
      return interaction.reply({ content: '👁️ Stanza di nuovo visibile nell\'elenco canali!', ephemeral: true });
    }

    // === 10. LIMITE ===
    if (subcommand === 'limite') {
      if (!voiceChan) {
        return interaction.reply({ content: '❌ Il limite è applicabile solo ai canali vocali.', ephemeral: true });
      }
      const num = interaction.options.getInteger('numero');
      await voiceChan.setUserLimit(num).catch(() => {});
      DatabaseHelper.updateTempChannelState(tempRecord.id, { user_limit: num });
      return interaction.reply({
        content: num === 0 ? '👥 Limite partecipanti rimosso (illimitato).' : `👥 Limite partecipanti impostato a **${num} utenti**.`,
        ephemeral: true
      });
    }

    // === 11. RINOMINA ===
    if (subcommand === 'rinomina') {
      const newName = interaction.options.getString('nome');
      if (voiceChan) await voiceChan.setName(newName).catch(() => {});
      if (textChan && !voiceChan) await textChan.setName(newName).catch(() => {});
      return interaction.reply({ content: `✏️ Stanza rinominata in **${newName}**!`, ephemeral: true });
    }

    // === 12. ELIMINA ===
    if (subcommand === 'elimina') {
      await interaction.reply({ content: '🗑️ Chiusura ed eliminazione della stanza in corso...', ephemeral: true });
      if (voiceChan) await voiceChan.delete('Eliminata dal proprietario').catch(() => {});
      if (textChan) await textChan.delete('Eliminata dal proprietario').catch(() => {});
      DatabaseHelper.deleteTempChannelRecord(tempRecord.id);
    }
  }
};


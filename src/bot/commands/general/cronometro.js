import {
  SlashCommandBuilder,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder
} from "discord.js";
import { StopwatchManager } from "../../modules/stopwatchManager.js";
import { DatabaseHelper } from "../../../database/db.js";

export default {
  data: new SlashCommandBuilder()
    .setName("cronometro")
    .setDescription("Gestisce cronometri digitali live progressivi (HH:MM:SS) nella descrizione")
    .addSubcommand(sub =>
      sub
        .setName("avvia")
        .setDescription("Avvia un nuovo cronometro digitale che conta in avanti dall orario impostato")
        .addIntegerOption(opt =>
          opt
            .setName("ore")
            .setDescription("Ore di partenza (es. 2 per partire da 02:00:00, oppure 0)")
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(999)
        )
        .addIntegerOption(opt =>
          opt
            .setName("minuti")
            .setDescription("Minuti di partenza aggiuntivi (es. 30 per 02:30:00)")
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(59)
        )
        .addStringOption(opt =>
          opt
            .setName("titolo")
            .setDescription("Titolo dell embed del cronometro")
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName("descrizione")
            .setDescription("Descrizione o nota aggiuntiva nell embed")
            .setRequired(false)
        )
        .addChannelOption(opt =>
          opt
            .setName("canale")
            .setDescription("Canale in cui inviare il cronometro (default: questo canale)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("ferma")
        .setDescription("Ferma un cronometro attivo nel server")
        .addIntegerOption(opt =>
          opt
            .setName("id")
            .setDescription("ID del cronometro da fermare (vedi /cronometro lista)")
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("pausa")
        .setDescription("Mette in pausa o riprende un cronometro attivo")
        .addIntegerOption(opt =>
          opt
            .setName("id")
            .setDescription("ID del cronometro")
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("lista")
        .setDescription("Mostra la lista dei cronometri attualmente attivi nel server")
    ),

  async execute(interaction) {
    const { guild, channel, user, member, options } = interaction;
    const subcommand = options.getSubcommand();

    const isMod = member.permissions?.has(PermissionsBitField.Flags.ManageMessages) ||
                  member.permissions?.has(PermissionsBitField.Flags.Administrator);

    if (subcommand === "avvia") {
      const hours = options.getInteger("ore") || 0;
      const minutes = options.getInteger("minuti") || 0;
      const title = options.getString("titolo");
      const customText = options.getString("descrizione");
      const targetChannel = options.getChannel("canale") || channel;

      await interaction.deferReply({ ephemeral: true });

      try {
        const sw = await StopwatchManager.start(guild, targetChannel, user, {
          hours,
          minutes,
          title,
          customText
        });

        const offsetFormatted = StopwatchManager.formatTime(sw.start_offset_seconds);
        return interaction.editReply({
          content: "✅ **Cronometro avviato con successo!**\n" +
            "> 📍 **Canale:** <#" + targetChannel.id + ">\n" +
            "> ⏱️ **Orario di partenza impostato:** \`" + offsetFormatted + "\`\n" +
            "> 🆔 **ID Cronometro:** \`#" + sw.id + "\`\n\n" +
            "Il messaggio si aggiornerà automaticamente con il display digitale progressivo!"
        });
      } catch (err) {
        console.error("[Cronometro Error]:", err);
        return interaction.editReply({
          content: "❌ Errore durante l avvio del cronometro: \`" + err.message + "\`"
        });
      }
    }

    if (subcommand === "lista") {
      const activeList = DatabaseHelper.getActiveStopwatches(guild.id);
      if (activeList.length === 0) {
        return interaction.reply({
          content: "ℹ️ Nessun cronometro attivo in questo server al momento. Usa \`/cronometro avvia\` per crearne uno!",
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setColor("#ef4444")
        .setTitle("⏱️ Cronometri Attivi • " + guild.name)
        .setDescription(
          activeList.map(sw => {
            const statusEmoji = sw.status === "paused" ? "⏸️" : "▶️";
            return "**ID #" + sw.id + "** • " + statusEmoji + " **[" + (sw.title || "Cronometro") + "](https://discord.com/channels/" + guild.id + "/" + sw.channel_id + "/" + sw.message_id + ")**\n" +
              "> Canale: <#" + sw.channel_id + "> • Avviato da: <@" + sw.created_by + ">\n" +
              "> Offset iniziale: \`" + StopwatchManager.formatTime(sw.start_offset_seconds) + "\`";
          }).join("\n\n")
        )
        .setFooter({ text: "Usa /cronometro ferma <id> per terminare un cronometro." });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === "ferma") {
      const id = options.getInteger("id");
      const activeList = DatabaseHelper.getActiveStopwatches(guild.id);

      let targetSw = null;
      if (id) {
        targetSw = activeList.find(s => s.id === id);
      } else {
        targetSw = activeList.find(s => s.channel_id === channel.id) || activeList[0];
      }

      if (!targetSw) {
        return interaction.reply({
          content: "❌ Nessun cronometro trovato da fermare.",
          ephemeral: true
        });
      }

      if (targetSw.created_by !== user.id && !isMod) {
        return interaction.reply({
          content: "⚠️ Non hai i permessi per fermare questo cronometro.",
          ephemeral: true
        });
      }

      const res = await StopwatchManager.stop(targetSw.id, interaction.client);
      return interaction.reply({
        content: "⏹️ **Cronometro #" + targetSw.id + " fermato con successo!** Tempo finale: \`" + StopwatchManager.formatTime(res.finalElapsed) + "\`"
      });
    }

    if (subcommand === "pausa") {
      const id = options.getInteger("id");
      const activeList = DatabaseHelper.getActiveStopwatches(guild.id);

      let targetSw = null;
      if (id) {
        targetSw = activeList.find(s => s.id === id);
      } else {
        targetSw = activeList.find(s => s.channel_id === channel.id) || activeList[0];
      }

      if (!targetSw) {
        return interaction.reply({
          content: "❌ Nessun cronometro attivo trovato.",
          ephemeral: true
        });
      }

      if (targetSw.created_by !== user.id && !isMod) {
        return interaction.reply({
          content: "⚠️ Non hai i permessi per controllare questo cronometro.",
          ephemeral: true
        });
      }

      if (targetSw.status === "running") {
        await StopwatchManager.pause(targetSw.id, interaction.client);
        return interaction.reply({ content: "⏸️ **Cronometro #" + targetSw.id + " messo in pausa!**" });
      } else {
        await StopwatchManager.resume(targetSw.id, interaction.client);
        return interaction.reply({ content: "▶️ **Cronometro #" + targetSw.id + " ripreso con successo!**" });
      }
    }
  }
};

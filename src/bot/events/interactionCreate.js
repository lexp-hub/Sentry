import { TicketManager } from '../modules/ticketManager.js';
import { PartnershipManager } from '../modules/partnershipManager.js';
import { PresentationManager } from '../modules/presentationManager.js';
import { FishingManager } from '../modules/fishingManager.js';
import { BlackjackManager } from '../modules/blackjackManager.js';
import { TempChannelManager } from '../modules/tempChannelManager.js';
import { MusicManager } from '../modules/musicManager.js';
import { StopwatchManager } from '../modules/stopwatchManager.js';
import { VerificationManager } from '../modules/verificationManager.js';
import { DatabaseHelper } from '../../database/db.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } from 'discord.js';
import { CONFIG } from '../../config.js';

export default {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      // 1. Slash Commands & Context Menu Commands
      if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) {
        console.error(`[Commands] Nessun comando trovato per ${interaction.commandName}`);
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`[Commands] Errore nell'esecuzione di ${interaction.commandName}:`, error);
        const replyPayload = {
          content: `❌ Si è verificato un errore durante l'esecuzione del comando: \`${error.message}\``,
          ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(replyPayload).catch(() => {});
        } else {
          await interaction.reply(replyPayload).catch(() => {});
        }
      }
      return;
    }

    // 2. Buttons
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // Partnership Form Modal Button
      if (customId === 'partnership_open_form') {
        const config = DatabaseHelper.getPartnershipConfig(interaction.guild.id);
        const member = interaction.member;
        const isOwnerOrAdmin = interaction.guild.ownerId === interaction.user.id ||
          member.permissions.has(PermissionsBitField.Flags.Administrator) ||
          member.permissions.has(PermissionsBitField.Flags.ManageGuild);

        if (config.manager_role_id && !isOwnerOrAdmin) {
          const hasManagerRole = member.roles.cache.has(config.manager_role_id);
          if (!hasManagerRole) {
            return interaction.reply({
              content: `❌ Non possiedi il ruolo autorizzato (<@&${config.manager_role_id}>) per inviare partnership su questo server.`,
              ephemeral: true
            });
          }
        }

        const modal = PartnershipManager.createPartnershipModal();
        return interaction.showModal(modal);
      }

      // Partnership Quick Stats Button
      if (customId === 'partnership_view_stats') {
        const stats = DatabaseHelper.getPartnershipStats(interaction.guild.id);
        const embed = new EmbedBuilder()
          .setColor(CONFIG.EMBED_COLOR || '#ea580c')
          .setTitle(`📊 Statistiche Partnership | ${interaction.guild.name}`)
          .addFields(
            { name: '🤝 Totale Partnership', value: `\`${stats.total}\``, inline: true },
            { name: '🏆 Top Partner Manager', value: stats.leaderboard[0] ? `<@${stats.leaderboard[0].rep_user_id}> (\`${stats.leaderboard[0].count}\` completate)` : '`Nessuno`', inline: true }
          )
          .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Reaction Roles Button
      if (customId.startsWith('rr_btn_')) {
        const roleId = customId.replace('rr_btn_', '');
        const role = interaction.guild.roles.cache.get(roleId);

        if (!role) {
          return interaction.reply({ content: '❌ Questo ruolo non esiste più sul server.', ephemeral: true });
        }

        const member = interaction.member;
        const hasRole = member.roles.cache.has(role.id);

        try {
          if (hasRole) {
            await member.roles.remove(role);
            return interaction.reply({ content: `➖ Ruolo ${role} **rimosso** con successo.`, ephemeral: true });
          } else {
            await member.roles.add(role);
            return interaction.reply({ content: `➕ Ruolo ${role} **assegnato** con successo!`, ephemeral: true });
          }
        } catch (err) {
          return interaction.reply({
            content: `❌ Impossibile modificare il ruolo: ${err.message} (Verifica che il ruolo del bot sia posizionato più in alto).`,
            ephemeral: true
          });
        }
      }

      // Presentation Form Modal Button
      if (customId === 'presentation_open_form') {
        const modal = PresentationManager.createPresentationModal();
        return interaction.showModal(modal);
      }

      // Presentation Rules Info Button
      if (customId === 'presentation_view_rules') {
        const embed = new EmbedBuilder()
          .setColor('#6366f1')
          .setTitle('📜 Linee Guida per le Presentazioni')
          .setDescription(
            `• Rispetta gli altri membri e il regolamento generale.\n` +
            `• Non inserire dati sensibili personali (indirizzi, numeri di telefono).\n` +
            `• Sii gentile, autentico e divertiti nella community!\n\n` +
            `👉 Clicca su **Presentati al Server** per compilare il tuo form!`
          )
          .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Ticket Buttons
      if (customId.startsWith('ticket_open_')) {
        const panelId = customId.replace('ticket_open_', '');
        return TicketManager.handleTicketCreate(interaction, panelId);
      }

      if (customId.startsWith('ticket_close_')) {
        return TicketManager.handleTicketClose(interaction, 'Chiusura richiesta tramite pulsante');
      }

      if (customId.startsWith('ticket_claim_')) {
        return TicketManager.handleTicketClaim(interaction);
      }

      // Fishing Module Buttons
      if (customId.startsWith('btn_fish_')) {
        return FishingManager.handleButtonInteraction(interaction);
      }

      // Blackjack Module Buttons
      if (customId.startsWith('btn_bj_')) {
        return BlackjackManager.handleButtonInteraction(interaction);
      }

      // Slots Replay Button
      if (customId.startsWith('btn_slot_again_')) {
        const bet = parseInt(customId.replace('btn_slot_again_', ''), 10) || 50;
        const profile = DatabaseHelper.getFishingProfile(interaction.guild.id, interaction.user.id);
        const config = DatabaseHelper.getMinigamesConfig(interaction.guild.id);

        if ((profile.coins || 0) < bet) {
          return interaction.reply({
            content: `❌ Non hai abbastanza monete! Il tuo saldo è di **${(profile.coins || 0).toLocaleString()} 🪙** monete.`,
            ephemeral: true
          });
        }

        profile.coins -= bet;
        DatabaseHelper.saveFishingProfile(interaction.guild.id, interaction.user.id, profile);

        const SYMBOLS = [
          { emoji: '👑', name: 'Corona Reale', weight: 4, mult3: 10, mult2: 2 },
          { emoji: '💎', name: 'Diamante Sacro', weight: 6, mult3: 7, mult2: 1.5 },
          { emoji: '⚔️', name: 'Spade Crociate', weight: 10, mult3: 5, mult2: 1.2 },
          { emoji: '🔔', name: 'Campana d\'Oro', weight: 14, mult3: 3.5, mult2: 1 },
          { emoji: '🍇', name: 'Uva del Banchetto', weight: 20, mult3: 2.5, mult2: 0.8 },
          { emoji: '🍒', name: 'Ciliegia', weight: 26, mult3: 2, mult2: 0.5 }
        ];

        const getRandomSymbol = () => {
          const total = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
          let rand = Math.random() * total;
          for (const s of SYMBOLS) {
            if (rand < s.weight) return s;
            rand -= s.weight;
          }
          return SYMBOLS[SYMBOLS.length - 1];
        };

        const reel1 = getRandomSymbol();
        const reel2 = getRandomSymbol();
        const reel3 = getRandomSymbol();

        let multiplier = 0;
        let winType = 'loss';

        if (reel1.emoji === reel2.emoji && reel2.emoji === reel3.emoji) {
          multiplier = reel1.mult3;
          winType = 'jackpot';
        } else if (reel1.emoji === reel2.emoji || reel2.emoji === reel3.emoji || reel1.emoji === reel3.emoji) {
          const matchSymbol = (reel1.emoji === reel2.emoji) ? reel1 : ((reel2.emoji === reel3.emoji) ? reel2 : reel1);
          multiplier = matchSymbol.mult2;
          winType = 'match2';
        }

        const wonCoins = Math.floor(bet * multiplier);
        const netCoins = wonCoins - bet;

        if (wonCoins > 0) {
          profile.coins += wonCoins;
          DatabaseHelper.saveFishingProfile(interaction.guild.id, interaction.user.id, profile);
        }

        DatabaseHelper.recordMinigameResult(interaction.guild.id, interaction.user.id, 'slots', wonCoins > bet, netCoins);

        const isWin = wonCoins > bet;
        const isPush = wonCoins === bet;
        const resultColor = winType === 'jackpot' ? '#eab308' : (isWin ? '#10b981' : (isPush ? '#38bdf8' : '#ef4444'));
        const resultTitle = winType === 'jackpot' ? '🎰 JACKPOT REALE! TRIS PERFETTO! 👑' : (isWin ? '🎉 VITTORIA ALLA SLOT!' : (isPush ? '🤝 PAREGGIO!' : '💀 NESSUNA COMBINAZIONE!'));

        const embed = new EmbedBuilder()
          .setColor(resultColor)
          .setAuthor({
            name: `🎰 Slot Machine Medievale • ${interaction.user.displayName || interaction.user.username}`,
            iconURL: interaction.user.displayAvatarURL({ dynamic: true })
          })
          .setTitle(resultTitle)
          .setDescription(
            `╭───────────────────╮\n` +
            `│   ${reel1.emoji}   ┆   ${reel2.emoji}   ┆   ${reel3.emoji}   │\n` +
            `╰───────────────────╯\n\n` +
            (winType === 'jackpot' ? `🌟 **TRIS DI ${reel1.name.toUpperCase()}! Moltiplicatore: \`x${multiplier}\`!**\n\n` : (winType === 'match2' ? `✨ **COPPIA DI ${reel1.emoji}! Moltiplicatore: \`x${multiplier}\`**\n\n` : '')) +
            `> 💸 **Puntata:** \`${bet.toLocaleString()}\` 🪙\n` +
            `> 💰 **Incasso:** \`${wonCoins.toLocaleString()}\` 🪙\n` +
            `> 🪙 **Nuovo Saldo:** \`${profile.coins.toLocaleString()}\` 🪙 monete`
          )
          .setFooter({ text: `${interaction.guild.name} • Sentry Casino`, iconURL: interaction.guild.iconURL() })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Minigames Hub Buttons
      if (customId === 'btn_hub_fishing') {
        const result = await FishingManager.castRod(interaction.guild, interaction.user, interaction.channelId);
        if (!result.success) {
          return interaction.reply({ content: result.message, ephemeral: true });
        }
        return interaction.reply({ embeds: [result.embed], ephemeral: true });
      }

      if (customId === 'btn_hub_blackjack') {
        const result = await BlackjackManager.startGame(interaction.guild, interaction.user, interaction.channelId, 50);
        if (!result.success) {
          return interaction.reply({ content: result.message, ephemeral: true });
        }
        const comp = result.row ? [result.row] : [];
        return interaction.reply({ embeds: [result.embed], components: comp, ephemeral: true });
      }

      if (customId === 'btn_hub_slots') {
        const profile = DatabaseHelper.getFishingProfile(interaction.guild.id, interaction.user.id);
        const bet = 50;

        if ((profile.coins || 0) < bet) {
          return interaction.reply({
            content: `❌ Non hai abbastanza monete! Il tuo saldo è di **${(profile.coins || 0).toLocaleString()} 🪙** monete.`,
            ephemeral: true
          });
        }

        profile.coins -= bet;
        DatabaseHelper.saveFishingProfile(interaction.guild.id, interaction.user.id, profile);

        const SYMBOLS = [
          { emoji: '👑', name: 'Corona Reale', weight: 4, mult3: 10, mult2: 2 },
          { emoji: '💎', name: 'Diamante Sacro', weight: 6, mult3: 7, mult2: 1.5 },
          { emoji: '⚔️', name: 'Spade Crociate', weight: 10, mult3: 5, mult2: 1.2 },
          { emoji: '🔔', name: 'Campana d\'Oro', weight: 14, mult3: 3.5, mult2: 1 },
          { emoji: '🍇', name: 'Uva del Banchetto', weight: 20, mult3: 2.5, mult2: 0.8 },
          { emoji: '🍒', name: 'Ciliegia', weight: 26, mult3: 2, mult2: 0.5 }
        ];

        const getRandomSymbol = () => {
          const total = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
          let rand = Math.random() * total;
          for (const s of SYMBOLS) {
            if (rand < s.weight) return s;
            rand -= s.weight;
          }
          return SYMBOLS[SYMBOLS.length - 1];
        };

        const reel1 = getRandomSymbol();
        const reel2 = getRandomSymbol();
        const reel3 = getRandomSymbol();

        let multiplier = 0;
        let winType = 'loss';

        if (reel1.emoji === reel2.emoji && reel2.emoji === reel3.emoji) {
          multiplier = reel1.mult3;
          winType = 'jackpot';
        } else if (reel1.emoji === reel2.emoji || reel2.emoji === reel3.emoji || reel1.emoji === reel3.emoji) {
          const matchSymbol = (reel1.emoji === reel2.emoji) ? reel1 : ((reel2.emoji === reel3.emoji) ? reel2 : reel1);
          multiplier = matchSymbol.mult2;
          winType = 'match2';
        }

        const wonCoins = Math.floor(bet * multiplier);
        const netCoins = wonCoins - bet;

        if (wonCoins > 0) {
          profile.coins += wonCoins;
          DatabaseHelper.saveFishingProfile(interaction.guild.id, interaction.user.id, profile);
        }

        DatabaseHelper.recordMinigameResult(interaction.guild.id, interaction.user.id, 'slots', wonCoins > bet, netCoins);

        const isWin = wonCoins > bet;
        const isPush = wonCoins === bet;
        const resultColor = winType === 'jackpot' ? '#eab308' : (isWin ? '#10b981' : (isPush ? '#38bdf8' : '#ef4444'));
        const resultTitle = winType === 'jackpot' ? '🎰 JACKPOT REALE! TRIS PERFETTO! 👑' : (isWin ? '🎉 VITTORIA ALLA SLOT!' : (isPush ? '🤝 PAREGGIO!' : '💀 NESSUNA COMBINAZIONE!'));

        const embed = new EmbedBuilder()
          .setColor(resultColor)
          .setAuthor({
            name: `🎰 Slot Machine Medievale • ${interaction.user.displayName || interaction.user.username}`,
            iconURL: interaction.user.displayAvatarURL({ dynamic: true })
          })
          .setTitle(resultTitle)
          .setDescription(
            `╭───────────────────╮\n` +
            `│   ${reel1.emoji}   ┆   ${reel2.emoji}   ┆   ${reel3.emoji}   │\n` +
            `╰───────────────────╯\n\n` +
            (winType === 'jackpot' ? `🌟 **TRIS DI ${reel1.name.toUpperCase()}! Moltiplicatore: \`x${multiplier}\`!**\n\n` : (winType === 'match2' ? `✨ **COPPIA DI ${reel1.emoji}! Moltiplicatore: \`x${multiplier}\`**\n\n` : '')) +
            `> 💸 **Puntata:** \`${bet.toLocaleString()}\` 🪙\n` +
            `> 💰 **Incasso:** \`${wonCoins.toLocaleString()}\` 🪙\n` +
            `> 🪙 **Nuovo Saldo:** \`${profile.coins.toLocaleString()}\` 🪙 monete`
          )
          .setFooter({ text: `${interaction.guild.name} • Sentry Casino`, iconURL: interaction.guild.iconURL() })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (customId === 'btn_hub_daily') {
        const profile = DatabaseHelper.getFishingProfile(interaction.guild.id, interaction.user.id);
        const config = DatabaseHelper.getMinigamesConfig(interaction.guild.id);
        const now = Math.floor(Date.now() / 1000);
        const cooldown = 86400; // 24 hours

        if (now - (profile.last_daily || 0) < cooldown) {
          const hoursLeft = Math.ceil((cooldown - (now - profile.last_daily)) / 3600);
          return interaction.reply({
            content: `⏳ Hai già riscosso la tua ricompensa giornaliera! Torna tra **${hoursLeft} ore**.`,
            ephemeral: true
          });
        }

        const reward = config.daily_reward || 150;
        profile.coins = (profile.coins || 0) + reward;
        profile.last_daily = now;
        DatabaseHelper.saveFishingProfile(interaction.guild.id, interaction.user.id, profile);

        const embed = new EmbedBuilder()
          .setColor('#10b981')
          .setTitle('🎁 Ricompensa Giornaliera Riscossa!')
          .setDescription(`Hai ricevuto **+${reward.toLocaleString()} 🪙** monete!\n💰 **Nuovo Saldo:** \`${profile.coins.toLocaleString()}\` 🪙`)
          .setFooter({ text: `${interaction.guild.name} • Sentry Daily Reward`, iconURL: interaction.guild.iconURL() })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (customId === 'btn_hub_profile' || customId === 'btn_hub_saldo' || customId === 'btn_balance_refresh') {
        const guild = interaction.guild;
        const user = interaction.user;
        const profile = DatabaseHelper.getFishingProfile(guild.id, user.id);
        const userLevel = DatabaseHelper.getUserLevel(guild.id, user.id);
        const bjStats = DatabaseHelper.getMinigameStats(guild.id, user.id, 'blackjack');
        const slotStats = DatabaseHelper.getMinigameStats(guild.id, user.id, 'slots');
        const allProfiles = DatabaseHelper.getFishingLeaderboard(guild.id, 1000);
        const rankPos = allProfiles.findIndex(p => p.user_id === user.id) + 1 || allProfiles.length + 1;

        const inventory = profile.inventory || [];
        const inventoryValue = inventory.reduce((sum, item) => sum + (Number(item.value) || 0), 0);

        const ROD_TIERS = [
          { level: 1, name: 'Canna di Legno Grezza' },
          { level: 2, name: 'Canna di Quercia Rinforzata' },
          { level: 3, name: 'Canna d\'Argento Lucido' },
          { level: 4, name: 'Canna d\'Oro Regale' },
          { level: 5, name: 'Canna Mitica del Leviatano' }
        ];
        const rodInfo = ROD_TIERS.find(r => r.level === (profile.rod_level || 1)) || ROD_TIERS[0];

        const embed = new EmbedBuilder()
          .setColor('#eab308')
          .setAuthor({
            name: `Forziere Reale • ${user.displayName || user.username}`,
            iconURL: user.displayAvatarURL({ dynamic: true })
          })
          .setTitle('🪙 Patrimonio & Saldo Sincronizzato')
          .setDescription(
            `### 💰 Saldo Attuale: **\`${(profile.coins || 0).toLocaleString()}\` Monete d'Oro 🪙**\n` +
            `> 🏆 **Posizione nel Reame:** \`#${rankPos}\` su ${allProfiles.length} cavalieri\n` +
            `> ⭐ **Livello Attuale:** \`Livello ${userLevel.level}\` (${userLevel.xp.toLocaleString()} XP)\n` +
            `> 🎣 **Canna da Pesca:** \`${rodInfo.name}\` (Liv. ${profile.rod_level || 1})\n` +
            `> 🎒 **Pescato nel Cestino:** \`${inventory.length} prede\` (Valore stimato: **${inventoryValue.toLocaleString()} 🪙**)`
          )
          .addFields(
            {
              name: '🃏 Casinò & Blackjack',
              value: `Partite: **${bjStats.games_played}** (Vinte: **${bjStats.games_won}**)\nVincite: **+${bjStats.total_won_coins.toLocaleString()} 🪙**`,
              inline: true
            },
            {
              name: '🎰 Slot Machine',
              value: `Giri: **${slotStats.games_played}** (Vinti: **${slotStats.games_won}**)\nRecord: **${slotStats.highest_win.toLocaleString()} 🪙**`,
              inline: true
            },
            {
              name: '🎣 Lago di Pesca',
              value: `Prede Catturate: **${profile.total_fish_caught || 0}**\nCanna: **Livello ${profile.rod_level || 1}/5**`,
              inline: true
            }
          )
          .setFooter({ text: `${guild.name} • Sentry Economia Sincronizzata • Ultimo Aggiornamento`, iconURL: guild.iconURL() })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('btn_balance_refresh')
            .setLabel('Aggiorna Saldo')
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('btn_hub_fishing')
            .setLabel('Pesca')
            .setEmoji('🎣')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('btn_hub_blackjack')
            .setLabel('Blackjack')
            .setEmoji('🃏')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('btn_hub_slots')
            .setLabel('Slot')
            .setEmoji('🎰')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('btn_hub_daily')
            .setLabel('Daily')
            .setEmoji('🎁')
            .setStyle(ButtonStyle.Secondary)
        );

        if (customId === 'btn_balance_refresh') {
          return interaction.update({ embeds: [embed], components: [row] });
        }

        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }

      if (customId === 'btn_hub_top') {
        const leaderboard = DatabaseHelper.getFishingLeaderboard(interaction.guild.id, 10);
        let desc = 'Ecco i cavalieri e pescatori più facoltosi del Reame:\n\n';

        if (leaderboard.length === 0) {
          desc += '*Nessun cavaliere ha ancora accumulato monete nel forziere.*';
        } else {
          leaderboard.forEach((item, idx) => {
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `**#${idx + 1}**`;
            desc += `${medal} <@${item.user_id}> — **${(item.coins || 0).toLocaleString()} 🪙** *(🎣 ${item.total_fish_caught || 0} prede)*\n`;
          });
        }

        const topEmbed = new EmbedBuilder()
          .setColor('#eab308')
          .setTitle(`🏆 Classifica Ricchezza & Pescatori • ${interaction.guild.name}`)
          .setDescription(desc)
          .setFooter({ text: `${interaction.guild.name} • Sentry Leaderboard`, iconURL: interaction.guild.iconURL() })
          .setTimestamp();

        return interaction.reply({ embeds: [topEmbed], ephemeral: true });
      }

      if (customId.startsWith('btn_tc_')) {
        return TempChannelManager.handleButtonInteraction(interaction);
      }

      if (customId.startsWith('btn_music_')) {
        return MusicManager.handleMusicButton(interaction);
      }

      if (customId.startsWith('btn_sw_')) {
        return StopwatchManager.handleButton(interaction);
      }

      // Captcha Verification Buttons
      if (customId === 'btn_verify_start' || customId === 'btn_verify_refresh') {
        return VerificationManager.startVerification(interaction);
      }

      if (customId === 'btn_verify_enter_code') {
        return await VerificationManager.showCodeModal(interaction);
      }
    }

    // 3. Modal Submissions
    if (interaction.isModalSubmit()) {
      const customId = interaction.customId;

      if (customId === 'modal_verify_submit') {
        return await VerificationManager.handleModalSubmit(interaction);
      }

      if (customId.startsWith('modal_tc_')) {
        return await TempChannelManager.handleModalSubmit(interaction);
      }

      if (customId.startsWith('modal_partnership_submit')) {
        return await PartnershipManager.handlePartnershipModalSubmit(interaction);
      }

      if (customId.startsWith('modal_presentation_submit')) {
        return await PresentationManager.handlePresentationModalSubmit(interaction);
      }
    }

    // 4. Select Menus (String & User Selects)
    if (interaction.isAnySelectMenu && interaction.isAnySelectMenu() || interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) {
      const customId = interaction.customId;

      if (customId.startsWith('select_tc_')) {
        return await TempChannelManager.handleSelectMenu(interaction);
      }

      if (customId.startsWith('rr_select_')) {
        const selectedRoleId = interaction.values[0];
        const role = interaction.guild.roles.cache.get(selectedRoleId);

        if (!role) {
          return await interaction.reply({ content: '❌ Ruolo selezionato non valido.', ephemeral: true }).catch(() => {});
        }

        const member = interaction.member;
        const hasRole = member.roles.cache.has(role.id);

        try {
          if (hasRole) {
            await member.roles.remove(role);
            return await interaction.reply({ content: `➖ Ruolo ${role} rimosso.`, ephemeral: true }).catch(() => {});
          } else {
            await member.roles.add(role);
            return await interaction.reply({ content: `➕ Ruolo ${role} assegnato!`, ephemeral: true }).catch(() => {});
          }
        } catch (err) {
          return await interaction.reply({ content: `❌ Errore assegnazione ruolo: ${err.message}`, ephemeral: true }).catch(() => {});
        }
      }
    }
    } catch (err) {
      if (err.code === 10062 || err.code === 40060) {
        console.warn(`[Interaction] Interazione scaduta o già gestita (${err.code} - ${err.message}) per ${interaction.customId || interaction.commandName}`);
        return;
      }
      console.error('[Interaction Error]', err);
    }
  }
};

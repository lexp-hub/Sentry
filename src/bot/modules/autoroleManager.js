import { DatabaseHelper } from '../../database/db.js';
import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { CONFIG } from '../../config.js';

export const AutoroleManager = {
  /**
   * Valida se un ruolo può essere assegnato dal bot (esistenza, permessi, gerarchia)
   */
  async validateRole(guild, roleId) {
    if (!guild || !roleId) {
      return { valid: false, error: 'ID ruolo non specificato.' };
    }

    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (!botMember) {
      return { valid: false, error: 'Impossibile determinare i permessi del bot nel server.' };
    }

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return {
        valid: false,
        error: 'Il bot non possiede il permesso "Gestisci Ruoli" (Manage Roles) nel server.'
      };
    }

    let role = guild.roles.cache.get(roleId);
    if (!role) {
      role = await guild.roles.fetch(roleId).catch(() => null);
    }

    if (!role) {
      return { valid: false, error: `Il ruolo configurato (ID: ${roleId}) non esiste più nel server.` };
    }

    if (role.id === guild.id) {
      return { valid: false, error: 'Non è possibile assegnare il ruolo predefinito @everyone.' };
    }

    if (role.managed) {
      return { valid: false, error: `Il ruolo "${role.name}" è gestito da un'integrazione o bot esterno e non può essere assegnato manualmente.` };
    }

    if (botMember.roles.highest.position <= role.position) {
      return {
        valid: false,
        error: `Gerarchia insufficiente: il ruolo del bot ("${botMember.roles.highest.name}", pos. ${botMember.roles.highest.position}) si trova al di sotto o allo stesso livello di "${role.name}" (pos. ${role.position}). Nelle Impostazioni del Server di Discord -> Ruoli, sposta il ruolo del bot sopra "${role.name}".`
      };
    }

    return { valid: true, role };
  },

  /**
   * Invia un alert al canale log del server se l'assegnazione fallisce per motivi critici
   */
  async notifyLogChannel(guild, message, isError = true) {
    try {
      const settings = DatabaseHelper.getGuildSettings(guild.id);
      if (!settings?.log_channel_id) return;
      const logChan = guild.channels.cache.get(settings.log_channel_id) || await guild.channels.fetch(settings.log_channel_id).catch(() => null);
      if (!logChan || !logChan.isTextBased()) return;

      const embed = new EmbedBuilder()
        .setColor(isError ? '#ef4444' : CONFIG.EMBED_SUCCESS_COLOR || '#22c55e')
        .setTitle(isError ? '⚠️ Autorole - Errore Assegnazione' : '🎭 Autorole - Notifica')
        .setDescription(message)
        .setTimestamp();

      await logChan.send({ embeds: [embed] }).catch(() => {});
    } catch (e) {}
  },

  /**
   * Assegna in modo sicuro un ruolo a un membro
   */
  async assignRole(member, roleId, context = 'Utente') {
    if (!member || !member.guild || !roleId) return { success: false, error: 'Parametri non validi.' };

    const validation = await this.validateRole(member.guild, roleId);
    if (!validation.valid) {
      console.warn(`[Autorole Warning] Fallita assegnazione a ${member.user?.tag || member.id}: ${validation.error}`);
      await this.notifyLogChannel(
        member.guild,
        `Impossibile assegnare l'autorole a **${member.user?.tag || member.id}**:\n${validation.error}`,
        true
      );
      return { success: false, error: validation.error };
    }

    const role = validation.role;

    // Se l'utente ha già il ruolo, evita chiamate API inutili
    if (member.roles.cache.has(role.id)) {
      return { success: true, alreadyHas: true, role };
    }

    try {
      await member.roles.add(role, `Sentry Autorole Modulo (${context})`);
      console.log(`[Autorole] Ruolo "${role.name}" assegnato con successo a ${member.user?.tag || member.id} (${context}).`);
      return { success: true, role };
    } catch (err) {
      console.error(`[Autorole Error] Errore nell'aggiunta del ruolo "${role.name}" a ${member.user?.tag || member.id}:`, err.message);
      await this.notifyLogChannel(
        member.guild,
        `Errore Discord nell'assegnare il ruolo **${role.name}** a **${member.user?.tag || member.id}**: \`${err.message}\``,
        true
      );
      return { success: false, error: err.message };
    }
  },

  /**
   * Gestione ingresso nuovo membro (guildMemberAdd)
   */
  async handleMemberJoin(member) {
    if (!member || !member.guild) return;

    // Verifica modulo attivo a livello globale della guild
    const settings = DatabaseHelper.getGuildSettings(member.guild.id);
    if (settings.modules_enabled && settings.modules_enabled.autorole === false) {
      return;
    }

    const config = DatabaseHelper.getAutoroleConfig(member.guild.id);
    if (!config.enabled) return;

    const isBot = Boolean(member.user?.bot);

    if (isBot) {
      if (config.bot_role_id) {
        await this.assignRole(member, config.bot_role_id, 'Bot');
      }
      return;
    }

    // Per utenti umani
    if (!config.user_role_id) return;

    // Se il server ha la membership screening (regole) abilitata e l'utente è ancora "pending"
    if (member.pending && config.wait_for_screening) {
      console.log(`[Autorole] Membro ${member.user?.tag || member.id} in attesa di accettazione delle regole/screening del server.`);
      return;
    }

    if (config.delay_seconds > 0) {
      const delayMs = Math.min(Math.max(config.delay_seconds, 1), 300) * 1000;
      setTimeout(async () => {
        try {
          const freshMember = await member.guild.members.fetch(member.id).catch(() => null);
          if (freshMember) {
            await this.assignRole(freshMember, config.user_role_id, 'Utente (Ritardato)');
          }
        } catch (e) {
          console.error('[Autorole Delayed Error]:', e.message);
        }
      }, delayMs);
    } else {
      await this.assignRole(member, config.user_role_id, 'Utente');
    }
  },

  /**
   * Gestione completamento membership screening (guildMemberUpdate)
   */
  async handleMemberScreeningComplete(member) {
    if (!member || !member.guild) return;

    const settings = DatabaseHelper.getGuildSettings(member.guild.id);
    if (settings.modules_enabled && settings.modules_enabled.autorole === false) {
      return;
    }

    const config = DatabaseHelper.getAutoroleConfig(member.guild.id);
    if (!config.enabled || !config.user_role_id) return;

    console.log(`[Autorole] ${member.user?.tag || member.id} ha accettato le regole del server: assegnazione ruolo in corso.`);

    if (config.delay_seconds > 0) {
      const delayMs = Math.min(Math.max(config.delay_seconds, 1), 300) * 1000;
      setTimeout(async () => {
        try {
          const freshMember = await member.guild.members.fetch(member.id).catch(() => null);
          if (freshMember) {
            await this.assignRole(freshMember, config.user_role_id, 'Utente (Post-Screening)');
          }
        } catch (e) {
          console.error('[Autorole Screening Delayed Error]:', e.message);
        }
      }, delayMs);
    } else {
      await this.assignRole(member, config.user_role_id, 'Utente (Post-Screening)');
    }
  },

  /**
   * Diagnostica completa dello stato di Autorole per un dato server
   */
  async diagnose(guild) {
    if (!guild) return null;

    const config = DatabaseHelper.getAutoroleConfig(guild.id);
    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);

    const botHasManageRoles = botMember ? botMember.permissions.has(PermissionFlagsBits.ManageRoles) : false;
    const botHighestRole = botMember?.roles?.highest || null;

    let userRoleCheck = null;
    if (config.user_role_id) {
      userRoleCheck = await this.validateRole(guild, config.user_role_id);
    }

    let botRoleCheck = null;
    if (config.bot_role_id) {
      botRoleCheck = await this.validateRole(guild, config.bot_role_id);
    }

    return {
      config,
      botHasManageRoles,
      botHighestRole: botHighestRole ? { id: botHighestRole.id, name: botHighestRole.name, position: botHighestRole.position } : null,
      userRoleCheck,
      botRoleCheck
    };
  }
};


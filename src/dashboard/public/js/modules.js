
(function () {
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.loadModuleData = async function (guildId) {
    if (!guildId) return;

    await Promise.allSettled([
      loadMasterModules(guildId),
      loadPartnershipData(guildId),
      loadReactionRoles(guildId),
      window.loadWelcomerData ? window.loadWelcomerData(guildId) : Promise.resolve(),
      loadBoostData(guildId),
      loadAutoresponders(guildId),
      loadAutomodData(guildId),
      loadTicketsData(guildId),
      loadGiveawaysAndLeveling(guildId),
      loadPresentationsData(guildId),
      loadSetupShowcaseData(guildId),
      loadMinigamesData(guildId),
      loadEmojiStats(guildId),
      loadMusicData(guildId)
    ]);
  };

  async function loadMasterModules(guildId) {
    try {
      const res = await fetch(`/api/guilds/${guildId}/settings`);
      if (!res.ok) return;
      const settings = await res.json();

      const grid = document.getElementById('modules-toggle-grid');
      if (!grid) return;

      const moduleLabels = {
        partnerships: { name: 'Partnership System', desc: 'Form modale e statistiche manager', icon: 'handshake', color: 'text-red-600' },
        setups: { name: 'Showcase Setup', desc: 'Foto, specifiche ed embed automatici', icon: 'monitor', color: 'text-red-600' },
        embeds: { name: 'Live Embeds', desc: 'Anteprima live e riquadri', icon: 'scroll', color: 'text-red-600' },
        reaction_roles: { name: 'Reaction Roles', desc: 'Pulsanti e ruoli automatici', icon: 'layers', color: 'text-red-600' },
        welcomer: { name: 'Welcomer & DM', desc: 'Benvenuto, DM e auto-role', icon: 'user-plus', color: 'text-red-600' },
        autoresponder: { name: 'Auto-Responder', desc: 'Trigger e auto-reaction', icon: 'zap', color: 'text-red-600' },
        moderation: { name: 'AutoMod & Sanzioni', desc: 'Protezione anti-spam e log', icon: 'shield-alert', color: 'text-rose-600' },
        tickets: { name: 'Ticket Support', desc: 'Canali privati di assistenza', icon: 'ticket', color: 'text-red-600' },
        giveaways: { name: 'Giveaways & XP', desc: 'Concorsi e timer automatici', icon: 'trophy', color: 'text-amber-600' },
        leveling: { name: 'XP & Leveling', desc: 'Classifiche e ruoli livello', icon: 'star', color: 'text-amber-500' },
        starboard: { name: 'Starboard', desc: 'Bacheca messaggi stellati', icon: 'sparkle', color: 'text-amber-500' }
      };

      grid.innerHTML = '';
      const enabledMap = settings.modules_enabled || {};

      Object.keys(moduleLabels).forEach(key => {
        const info = moduleLabels[key];
        const isEnabled = enabledMap[key] !== false;

        const card = document.createElement('div');
        card.className = 'p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm flex items-center justify-between gap-3';
        card.innerHTML = `
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-center ${info.color} shrink-0">
              <i data-lucide="${info.icon}" class="w-4 h-4"></i>
            </div>
            <div>
              <p class="font-bold text-xs text-slate-900">${info.name}</p>
              <p class="text-[11px] text-slate-500">${info.desc}</p>
            </div>
          </div>
          <label class="switch shrink-0">
            <input type="checkbox" class="master-module-toggle" data-module="${key}" ${isEnabled ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        `;
        grid.appendChild(card);
      });

      if (window.lucide) lucide.createIcons();

      document.querySelectorAll('.master-module-toggle').forEach(toggle => {
        toggle.addEventListener('change', async (e) => {
          const modKey = e.target.getAttribute('data-module');
          enabledMap[modKey] = e.target.checked;

          await fetch(`/api/guilds/${guildId}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modules_enabled: enabledMap })
          });
        });
      });

      const prefixEl = document.getElementById('gen-prefix');
      const logEl = document.getElementById('gen-log-channel');
      if (settings) {
        window.AppState.settings = settings;
      }
      if (prefixEl && settings.prefix) prefixEl.value = settings.prefix;
      if (logEl && settings.log_channel_id) {
        logEl.dataset.savedValue = settings.log_channel_id;
        logEl.value = settings.log_channel_id;
      }

      if (prefixEl && !prefixEl.hasAttribute('data-bound')) {
        prefixEl.setAttribute('data-bound', 'true');
        prefixEl.addEventListener('change', async () => {
          await fetch(`/api/guilds/${guildId}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-client-id': window.AppState?.clientId },
            body: JSON.stringify({ prefix: prefixEl.value })
          });
          window.showToast('Prefisso comandi salvato!');
        });
      }

      if (logEl && !logEl.hasAttribute('data-bound')) {
        logEl.setAttribute('data-bound', 'true');
        logEl.addEventListener('change', async () => {
          logEl.dataset.savedValue = logEl.value;
          if (window.AppState?.settings) window.AppState.settings.log_channel_id = logEl.value;
          await fetch(`/api/guilds/${guildId}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-client-id': window.AppState?.clientId },
            body: JSON.stringify({ log_channel_id: logEl.value || null })
          });
          window.showToast('Canale Audit Log salvato nel database!');
        });
      }
    } catch (e) {
      console.error('Error loading master modules:', e);
    }
  }

  async function loadPartnershipData(guildId) {
    try {
      const res = await fetch(`/api/guilds/${guildId}/partnerships`);
      if (!res.ok) return;
      const data = await res.json();

      const config = data.config || {};
      const chEl = document.getElementById('part-channel');
      const pingEl = document.getElementById('part-ping-role');
      const mgrEl = document.getElementById('part-manager-role');
      const minEl = document.getElementById('part-min-members');
      const cdEl = document.getElementById('part-cooldown');
      const enEl = document.getElementById('part-enabled');

      if (chEl && config.channel_id) chEl.value = config.channel_id;
      if (pingEl && config.ping_role_id) pingEl.value = config.ping_role_id;
      if (mgrEl && config.manager_role_id) mgrEl.value = config.manager_role_id;
      if (minEl) minEl.value = config.min_members ?? 50;
      if (cdEl) cdEl.value = config.cooldown_minutes ?? 60;
      if (enEl) enEl.checked = Boolean(config.enabled);

      const tbody = document.getElementById('part-recent-table');
      if (tbody) {
        tbody.innerHTML = '';
        const list = data.partnerships || [];
        if (list.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-slate-500">Nessuna partnership registrata finora.</td></tr>';
        } else {
          list.forEach(p => {
            const tr = document.createElement('tr');
            const dateStr = new Date(p.timestamp * 1000).toLocaleDateString('it-IT');
            tr.innerHTML = `
              <td class="py-2.5 font-medium text-white">${p.partner_name || 'Server Partner'}</td>
              <td class="py-2.5 text-purple-400">&lt;@${p.rep_user_id || 'Staff'}&gt;</td>
              <td class="py-2.5"><span class="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono">${p.partner_count || 0}</span></td>
              <td class="py-2.5 text-slate-400">${dateStr}</td>
            `;
            tbody.appendChild(tr);
          });
        }
      }

      const lbDiv = document.getElementById('part-leaderboard-list');
      if (lbDiv) {
        lbDiv.innerHTML = '';
        const lb = data.stats?.leaderboard || [];
        if (lb.length === 0) {
          lbDiv.innerHTML = '<p class="text-slate-500 text-center py-2">Nessun partner manager attivo.</p>';
        } else {
          lb.forEach((entry, idx) => {
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
            const item = document.createElement('div');
            item.className = 'p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 shadow-sm flex items-center justify-between';
            item.innerHTML = `
              <div class="flex items-center gap-2">
                <span class="font-bold text-sm">${medal}</span>
                <span class="font-mono text-xs text-slate-300">&lt;@${entry.rep_user_id}&gt;</span>
              </div>
              <span class="font-bold text-xs text-purple-400">${entry.count} fatte</span>
            `;
            lbDiv.appendChild(item);
          });
        }
      }

      const ovPart = document.getElementById('ov-partnerships');
      if (ovPart) ovPart.textContent = data.stats?.total || '0';
    } catch (e) {
      console.error('Error loading partnerships:', e);
    }
  }

  const btnSavePart = document.getElementById('btn-save-partner-config');
  if (btnSavePart) {
    btnSavePart.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      if (!guildId) return;

      const payload = {
        channel_id: document.getElementById('part-channel')?.value || null,
        ping_role_id: document.getElementById('part-ping-role')?.value || null,
        manager_role_id: document.getElementById('part-manager-role')?.value || null,
        min_members: parseInt(document.getElementById('part-min-members')?.value || '0', 10),
        cooldown_minutes: parseInt(document.getElementById('part-cooldown')?.value || '60', 10),
        enabled: document.getElementById('part-enabled')?.checked
      };

      const res = await fetch(`/api/guilds/${guildId}/partnerships/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        window.showToast('Configurazione Partnership salvata!');
      } else {
        window.showToast('Errore durante il salvataggio.', 'error');
      }
    });
  }

  const btnSendPartnerPanel = document.getElementById('btn-send-partner-panel');
  if (btnSendPartnerPanel) {
    btnSendPartnerPanel.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      const channelId = document.getElementById('part-channel')?.value;
      const title = document.getElementById('part-panel-title')?.value || '🤝 Sistema Partnership & Alleanze';
      const description = document.getElementById('part-panel-desc')?.value?.trim() || null;
      const image = document.getElementById('part-panel-image')?.value?.trim() || null;

      if (!channelId) return window.showToast('Seleziona un canale per inviare il pannello partnership.', 'error');

      try {
        btnSendPartnerPanel.disabled = true;
        btnSendPartnerPanel.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Invio in corso...';
        if (window.lucide) lucide.createIcons();

        const res = await fetch(`/api/guilds/${guildId}/partnerships/panel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, title, description, image, color: '#ea580c' })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          window.showToast('Pannello Partnership con pulsante Form inviato su Discord con successo!');
        } else {
          window.showToast(`Errore invio pannello: ${data.error || 'Fallito'}`, 'error');
        }
      } catch (err) {
        window.showToast(`Errore: ${err.message}`, 'error');
      } finally {
        btnSendPartnerPanel.disabled = false;
        btnSendPartnerPanel.innerHTML = '<i data-lucide="send" class="w-3.5 h-3.5 text-red-600"></i> Invia Pannello nel Canale';
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  const btnQuickPart = document.getElementById('btn-quick-partner');
  if (btnQuickPart) {
    btnQuickPart.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      const invite = document.getElementById('part-quick-invite')?.value?.trim();
      const banner = document.getElementById('part-quick-banner')?.value?.trim() || null;
      const notes = document.getElementById('part-quick-notes')?.value?.trim();

      if (!invite) return window.showToast('Inserisci un link o codice di invito valido.', 'error');

      try {
        btnQuickPart.disabled = true;
        btnQuickPart.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Pubblicazione in corso...';
        if (window.lucide) lucide.createIcons();

        const res = await fetch(`/api/guilds/${guildId}/partnerships/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invite, notes, banner })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          window.showToast('Partnership pubblicata con successo sul canale Discord!');
          document.getElementById('part-quick-invite').value = '';
          if (document.getElementById('part-quick-banner')) document.getElementById('part-quick-banner').value = '';
          document.getElementById('part-quick-notes').value = '';
          await loadPartnershipData(guildId);
        } else {
          window.showToast(data.error || 'Errore nella pubblicazione.', 'error');
        }
      } catch (err) {
        window.showToast(`Errore: ${err.message}`, 'error');
      } finally {
        btnQuickPart.disabled = false;
        btnQuickPart.innerHTML = '<i data-lucide="send" class="w-3.5 h-3.5"></i> Pubblica Partnership';
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  async function loadReactionRoles(guildId) {
    try {
      const res = await fetch(`/api/guilds/${guildId}/reaction-roles`);
      if (!res.ok) return;
      const list = await res.json();

      const container = document.getElementById('rr-list-container');
      if (!container) return;

      container.innerHTML = '';
      if (list.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-xs text-center py-4">Nessun reaction role attivo.</p>';
      } else {
        list.forEach(item => {
          const card = document.createElement('div');
          card.className = 'p-3 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm flex items-center justify-between';
          card.innerHTML = `
            <div class="flex items-center gap-3">
              <span class="text-base">${item.emoji || '🔘'}</span>
              <div>
                <p class="font-bold text-xs text-white">${item.label || 'Ruolo'}</p>
                <p class="text-[11px] text-slate-400">Ruolo: &lt;@&amp;${item.role_id}&gt; • Canale: &lt;#${item.channel_id}&gt;</p>
              </div>
            </div>
            <button class="btn-danger text-xs py-1 px-2.5" onclick="deleteReactionRole(${item.id})">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          `;
          container.appendChild(card);
        });
        lucide.createIcons();
      }

      const ovRR = document.getElementById('ov-rr');
      if (ovRR) ovRR.textContent = list.length;
    } catch (e) {
      console.error('Error loading reaction roles:', e);
    }
  }

  window.deleteReactionRole = async function(id) {
    const guildId = window.AppState.currentGuildId;
    await fetch(`/api/guilds/${guildId}/reaction-roles/${id}`, { method: 'DELETE' });
    window.showToast('Reaction role eliminato.');
    await loadReactionRoles(guildId);
  };

  const btnCreateRR = document.getElementById('btn-create-rr');
  if (btnCreateRR) {
    btnCreateRR.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      const channelId = document.getElementById('rr-channel')?.value;
      const roleId = document.getElementById('rr-role')?.value;
      const style = document.getElementById('rr-style')?.value || 'Primary';
      const label = document.getElementById('rr-label')?.value || 'Ruolo';
      const emoji = document.getElementById('rr-emoji')?.value || '🔘';
      const title = document.getElementById('rr-title')?.value || '🎭 Selezione Ruolo';

      if (!channelId || !roleId) return window.showToast('Seleziona canale e ruolo.', 'error');

      const res = await fetch(`/api/guilds/${guildId}/reaction-roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, roleId, style, label, emoji, title })
      });

      if (res.ok) {
        window.showToast('Pannello Reaction Role creato!');
        await loadReactionRoles(guildId);
      } else {
        window.showToast('Errore creazione reaction role.', 'error');
      }
    });
  }



  async function loadAutoresponders(guildId) {
    try {
      const res = await fetch(`/api/guilds/${guildId}/autoresponders`);
      if (!res.ok) return;
      const data = await res.json();

      const container = document.getElementById('ar-list-container');
      if (!container) return;

      container.innerHTML = '';
      const list = data.autoresponders || [];

      if (list.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-xs text-center py-4">Nessun autoresponder configurato.</p>';
      } else {
        list.forEach(ar => {
          const card = document.createElement('div');
          card.className = 'p-3 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm flex items-center justify-between';
          card.innerHTML = `
            <div>
              <p class="font-bold text-xs text-white">Trigger: <code class="text-purple-300 font-mono">${ar.trigger}</code> <span class="text-[10px] text-slate-400 font-normal">(${ar.match_type})</span></p>
              <p class="text-[11px] text-slate-300 mt-0.5">Risposta: ${ar.response_text || 'Reazione Emoji'}</p>
            </div>
            <button class="btn-danger text-xs py-1 px-2.5" onclick="deleteAutoresponder(${ar.id})">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          `;
          container.appendChild(card);
        });
        lucide.createIcons();
      }
    } catch (e) {
      console.error('Error loading autoresponders:', e);
    }
  }

  window.deleteAutoresponder = async function(id) {
    const guildId = window.AppState.currentGuildId;
    await fetch(`/api/guilds/${guildId}/autoresponders/${id}`, { method: 'DELETE' });
    window.showToast('Risposta automatica eliminata.');
    await loadAutoresponders(guildId);
  };

  const btnAddAR = document.getElementById('btn-add-autoresponder');
  if (btnAddAR) {
    btnAddAR.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      const trigger = document.getElementById('ar-trigger')?.value?.trim();
      const matchType = document.getElementById('ar-match')?.value || 'CONTAINS';
      const response = document.getElementById('ar-response')?.value?.trim();
      const reactionsRaw = document.getElementById('ar-reactions')?.value?.trim();

      if (!trigger) return window.showToast('Inserisci una parola chiave.', 'error');
      const reactions = reactionsRaw ? reactionsRaw.split(/[, ]+/).filter(Boolean) : [];

      const res = await fetch(`/api/guilds/${guildId}/autoresponders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger, match_type: matchType, response_text: response, auto_reactions: reactions, enabled: true })
      });

      if (res.ok) {
        window.showToast('Risposta automatica aggiunta!');
        document.getElementById('ar-trigger').value = '';
        document.getElementById('ar-response').value = '';
        document.getElementById('ar-reactions').value = '';
        await loadAutoresponders(guildId);
      } else {
        window.showToast('Errore creazione.', 'error');
      }
    });
  }

  async function loadAutomodData(guildId) {
    try {
      const res = await fetch(`/api/guilds/${guildId}/automod`);
      if (!res.ok) return;
      const data = await res.json();

      const config = data.config || {};
      const invEl = document.getElementById('am-invite');
      const lnkEl = document.getElementById('am-link');
      const spmEl = document.getElementById('am-spam');
      const cpsEl = document.getElementById('am-caps');
      const bwEl = document.getElementById('am-badwords');

      if (invEl) invEl.checked = Boolean(config.anti_invite);
      if (lnkEl) lnkEl.checked = Boolean(config.anti_link);
      if (spmEl) spmEl.checked = Boolean(config.anti_spam);
      if (cpsEl) cpsEl.checked = Boolean(config.anti_caps);
      if (bwEl && Array.isArray(config.bad_words)) bwEl.value = config.bad_words.join(', ');

      const tbody = document.getElementById('am-cases-table');
      if (tbody) {
        tbody.innerHTML = '';
        const cases = data.recentCases || [];
        if (cases.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" class="py-4 text-center text-slate-500">Nessuna sanzione registrata.</td></tr>';
        } else {
          cases.forEach(c => {
            const tr = document.createElement('tr');
            const dateStr = new Date(c.timestamp * 1000).toLocaleString('it-IT');
            tr.innerHTML = `
              <td class="py-2 font-mono text-purple-400">#${c.id}</td>
              <td class="py-2"><span class="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold">${c.action_type}</span></td>
              <td class="py-2">&lt;@${c.user_id}&gt;</td>
              <td class="py-2 text-slate-400">&lt;@${c.moderator_id}&gt;</td>
              <td class="py-2 text-slate-300">${c.reason || '-'}</td>
              <td class="py-2 text-slate-500">${dateStr}</td>
            `;
            tbody.appendChild(tr);
          });
        }
      }
    } catch (e) {
      console.error('Error loading automod:', e);
    }
  }

  const btnSaveAutomod = document.getElementById('btn-save-automod');
  if (btnSaveAutomod) {
    btnSaveAutomod.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      const badWordsRaw = document.getElementById('am-badwords')?.value || '';
      const badWords = badWordsRaw.split(/[, ]+/).map(w => w.trim()).filter(Boolean);

      const payload = {
        anti_invite: document.getElementById('am-invite')?.checked,
        anti_link: document.getElementById('am-link')?.checked,
        anti_spam: document.getElementById('am-spam')?.checked,
        anti_caps: document.getElementById('am-caps')?.checked,
        bad_words: badWords
      };

      const res = await fetch(`/api/guilds/${guildId}/automod`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) window.showToast('Regole AutoMod salvate!');
      else window.showToast('Errore salvataggio AutoMod.', 'error');
    });
  }

  function updateTicketPreview() {
    const title = document.getElementById('tk-title')?.value || '🎫 Centro Supporto & Assistenza';
    const desc = document.getElementById('tk-description')?.value || 'Clicca sul pulsante sottostante per aprire un ticket.';
    const color = document.getElementById('tk-color')?.value || '#dc2626';
    const image = document.getElementById('tk-image')?.value?.trim();
    const footer = document.getElementById('tk-footer')?.value || 'Sentry • Sistema Ticket';
    const btnLabel = document.getElementById('tk-btn-label')?.value || 'Apri Ticket';
    const btnEmoji = document.getElementById('tk-btn-emoji')?.value || '📩';
    const btnStyle = document.getElementById('tk-btn-style')?.value || 'Primary';

    const prevBox = document.getElementById('prev-tk-embed-box');
    const prevTitle = document.getElementById('prev-tk-title');
    const prevDesc = document.getElementById('prev-tk-desc');
    const prevImage = document.getElementById('prev-tk-image');
    const prevFooter = document.getElementById('prev-tk-footer-text');
    const prevBtn = document.getElementById('prev-tk-btn');
    const prevBtnLabel = document.getElementById('prev-tk-btn-label');
    const prevBtnEmoji = document.getElementById('prev-tk-btn-emoji');

    if (prevBox) prevBox.style.borderLeftColor = color;
    if (prevTitle) prevTitle.textContent = title;
    if (prevDesc) {
      prevDesc.innerHTML = window.parseDiscordMarkdown ? window.parseDiscordMarkdown(desc) : desc;
    }

    if (prevImage) {
      if (image) {
        prevImage.src = image;
        prevImage.classList.remove('hidden');
      } else {
        prevImage.src = '';
        prevImage.classList.add('hidden');
      }
    }

    if (prevFooter) prevFooter.textContent = footer;
    if (prevBtnLabel) prevBtnLabel.textContent = btnLabel;
    if (prevBtnEmoji) prevBtnEmoji.textContent = btnEmoji;

    if (prevBtn) {
      // Clear style classes
      prevBtn.className = 'px-3.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 shadow transition-all';
      if (btnStyle === 'Primary') {
        prevBtn.classList.add('bg-[#5865F2]', 'text-white');
      } else if (btnStyle === 'Secondary') {
        prevBtn.classList.add('bg-slate-700', 'text-white');
      } else if (btnStyle === 'Success') {
        prevBtn.classList.add('bg-emerald-600', 'text-white');
      } else if (btnStyle === 'Danger') {
        prevBtn.classList.add('bg-rose-600', 'text-white');
      }
    }
  }

  ['tk-title', 'tk-description', 'tk-color', 'tk-color-hex', 'tk-image', 'tk-footer', 'tk-btn-label', 'tk-btn-emoji', 'tk-btn-style'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', (e) => {
        if (id === 'tk-color') {
          const hexEl = document.getElementById('tk-color-hex');
          if (hexEl) hexEl.value = e.target.value;
        } else if (id === 'tk-color-hex') {
          const colEl = document.getElementById('tk-color');
          if (colEl && /^#[0-9A-Fa-f]{6}$/.test(e.target.value)) colEl.value = e.target.value;
        }
        updateTicketPreview();
      });
      if (el.tagName === 'SELECT') {
        el.addEventListener('change', updateTicketPreview);
      }
    }
  });

  async function loadTicketsData(guildId) {
    try {
      const res = await fetch(`/api/guilds/${guildId}/tickets`);
      if (!res.ok) return;
      const data = await res.json();

      const container = document.getElementById('tk-list-container');
      if (container) {
        container.innerHTML = '';
        const tickets = data.tickets || [];

        if (tickets.length === 0) {
          container.innerHTML = '<p class="text-slate-500 text-xs text-center py-4">Nessun ticket recente.</p>';
        } else {
          tickets.forEach(tk => {
            const card = document.createElement('div');
            const dateStr = new Date(tk.created_at * 1000).toLocaleString('it-IT');
            const badgeClass = tk.status === 'OPEN' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-300';
            card.className = 'p-3 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm flex items-center justify-between';
            card.innerHTML = `
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-bold text-xs text-white">Ticket #${tk.id}</span>
                  <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeClass}">${tk.status}</span>
                </div>
                <p class="text-[11px] text-slate-400 mt-0.5">Creato da &lt;@${tk.user_id}&gt; • ${dateStr}</p>
              </div>
            `;
            container.appendChild(card);
          });
        }
      }

      // If existing panel found, optionally preload
      const panel = data.panels?.[0];
      if (panel) {
        if (panel.title) document.getElementById('tk-title').value = panel.title;
        if (panel.description) document.getElementById('tk-description').value = panel.description;
        if (panel.color) {
          document.getElementById('tk-color').value = panel.color;
          document.getElementById('tk-color-hex').value = panel.color;
        }
        if (panel.image) document.getElementById('tk-image').value = panel.image;
        if (panel.footer) document.getElementById('tk-footer').value = panel.footer;
        if (panel.button_label) document.getElementById('tk-btn-label').value = panel.button_label;
        if (panel.button_emoji) document.getElementById('tk-btn-emoji').value = panel.button_emoji;
        if (panel.button_style) document.getElementById('tk-btn-style').value = panel.button_style;
        if (panel.naming_scheme) document.getElementById('tk-naming').value = panel.naming_scheme;
        if (panel.welcome_message) document.getElementById('tk-welcome-msg').value = panel.welcome_message;
        if (panel.channel_id) document.getElementById('tk-channel').value = panel.channel_id;
        if (panel.category_id) document.getElementById('tk-category').value = panel.category_id;
        if (panel.support_role_id) document.getElementById('tk-support-role').value = panel.support_role_id;
        if (panel.log_channel_id) document.getElementById('tk-log-channel').value = panel.log_channel_id;

        const panelIdInput = document.getElementById('tk-active-panel-id');
        const messageIdInput = document.getElementById('tk-active-message-id');
        const btnUpdate = document.getElementById('btn-update-ticket-panel');

        if (panelIdInput) panelIdInput.value = panel.id;
        if (messageIdInput) messageIdInput.value = panel.message_id || '';
        if (btnUpdate) {
          if (panel.message_id) {
            btnUpdate.classList.remove('hidden');
          } else {
            btnUpdate.classList.add('hidden');
          }
        }
      }

      updateTicketPreview();
    } catch (e) {
      console.error('Error loading tickets:', e);
    }
  }

  function getTicketPanelPayload() {
    return {
      channelId: document.getElementById('tk-channel')?.value,
      categoryId: document.getElementById('tk-category')?.value || null,
      supportRoleId: document.getElementById('tk-support-role')?.value || null,
      logChannelId: document.getElementById('tk-log-channel')?.value || null,
      title: document.getElementById('tk-title')?.value,
      description: document.getElementById('tk-description')?.value,
      color: document.getElementById('tk-color')?.value || '#dc2626',
      image: document.getElementById('tk-image')?.value?.trim() || null,
      footer: document.getElementById('tk-footer')?.value,
      buttonLabel: document.getElementById('tk-btn-label')?.value,
      buttonEmoji: document.getElementById('tk-btn-emoji')?.value,
      buttonStyle: document.getElementById('tk-btn-style')?.value || 'Primary',
      namingScheme: document.getElementById('tk-naming')?.value || 'ticket-{user}',
      welcomeMessage: document.getElementById('tk-welcome-msg')?.value
    };
  }

  const btnCreateTicketPanel = document.getElementById('btn-create-ticket-panel');
  if (btnCreateTicketPanel) {
    btnCreateTicketPanel.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      const payload = getTicketPanelPayload();

      if (!payload.channelId) return window.showToast('Seleziona un canale per inviare il pannello.', 'error');

      const res = await fetch(`/api/guilds/${guildId}/tickets/panel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        window.showToast('Nuovo Pannello Ticket inviato con successo nel canale!');
        await loadTicketsData(guildId);
      } else {
        window.showToast('Errore durante l\'invio del pannello.', 'error');
      }
    });
  }

  const btnUpdateTicketPanel = document.getElementById('btn-update-ticket-panel');
  if (btnUpdateTicketPanel) {
    btnUpdateTicketPanel.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      const panelId = document.getElementById('tk-active-panel-id')?.value;
      const messageId = document.getElementById('tk-active-message-id')?.value;
      const payload = getTicketPanelPayload();

      if (!payload.channelId) return window.showToast('Seleziona un canale.', 'error');

      try {
        btnUpdateTicketPanel.disabled = true;
        btnUpdateTicketPanel.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Modifica in corso...';
        if (window.lucide) lucide.createIcons();

        const res = await fetch(`/api/guilds/${guildId}/tickets/panel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, panelId, messageId })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          window.showToast('Pannello Ticket su Discord aggiornato con successo in tempo reale senza cancellarlo!');
          await loadTicketsData(guildId);
        } else {
          window.showToast(`Errore modifica: ${data.error || 'Fallita'}`, 'error');
        }
      } catch (err) {
        window.showToast(`Errore: ${err.message}`, 'error');
      } finally {
        btnUpdateTicketPanel.disabled = false;
        btnUpdateTicketPanel.innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4 text-amber-600"></i> Modifica Pannello Esistente';
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  async function loadGiveawaysAndLeveling(guildId) {
    try {
      const res = await fetch(`/api/guilds/${guildId}/leveling`);
      if (!res.ok) return;
      const data = await res.json();

      const config = data.config || {};
      const enLvl = document.getElementById('lvl-enabled');
      const rateLvl = document.getElementById('lvl-rate');
      const chLvl = document.getElementById('lvl-channel');
      const coinsLvl = document.getElementById('lvl-coins');

      if (enLvl) enLvl.checked = Boolean(config.enabled);
      if (rateLvl) rateLvl.value = config.xp_rate || 1.0;
      if (chLvl && config.channel_id) chLvl.value = config.channel_id;
      if (coinsLvl) coinsLvl.value = config.coins_per_level !== undefined ? config.coins_per_level : 100;
    } catch (e) {
      console.error('Error loading giveaways and leveling:', e);
    }
  }

  // Save Leveling Config
  const btnSaveLeveling = document.getElementById('btn-save-leveling');
  if (btnSaveLeveling) {
    btnSaveLeveling.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      const enabled = document.getElementById('lvl-enabled')?.checked;
      const xp_rate = parseFloat(document.getElementById('lvl-rate')?.value || '1.0');
      const channel_id = document.getElementById('lvl-channel')?.value || null;
      const coins_per_level = parseInt(document.getElementById('lvl-coins')?.value || '100', 10);

      btnSaveLeveling.disabled = true;
      try {
        const res = await fetch(`/api/guilds/${guildId}/leveling`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled, xp_rate, channel_id, coins_per_level })
        });

        if (res.ok) {
          window.showToast('Configurazione Leveling & Ricompense Monete salvata con successo!');
        } else {
          window.showToast('Errore durante il salvataggio.', 'error');
        }
      } catch (e) {
        window.showToast(e.message, 'error');
      } finally {
        btnSaveLeveling.disabled = false;
      }
    });
  }

  const btnStartGiveaway = document.getElementById('btn-start-giveaway');
  if (btnStartGiveaway) {
    btnStartGiveaway.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      const channelId = document.getElementById('ga-channel')?.value;
      const prize = document.getElementById('ga-prize')?.value?.trim();
      const durationStr = document.getElementById('ga-duration')?.value?.trim();
      const winners = parseInt(document.getElementById('ga-winners')?.value || '1', 10);

      if (!channelId || !prize) return window.showToast('Compila tutti i campi.', 'error');

      const match = durationStr.match(/^(\d+)(s|m|h|d)$/i);
      let durationSec = 3600;
      if (match) {
        const num = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();
        if (unit === 's') durationSec = num;
        else if (unit === 'm') durationSec = num * 60;
        else if (unit === 'h') durationSec = num * 3600;
        else if (unit === 'd') durationSec = num * 86400;
      }

      const res = await fetch(`/api/guilds/${guildId}/giveaways/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, prize, durationSeconds: durationSec, winnerCount: winners })
      });

      if (res.ok) window.showToast(`Giveaway per ${prize} avviato!`);
      else window.showToast('Errore avvio giveaway.', 'error');
    });
  }

  // === Community Presentations (Presentazioni) Handler ===
  async function loadPresentationsData(guildId) {
    try {
      const res = await fetch(`/api/guilds/${guildId}/presentations`);
      if (!res.ok) return;
      const data = await res.json();

      const config = data.config || {};
      const enabledEl = document.getElementById('pres-enabled');
      const channelEl = document.getElementById('pres-channel');
      const roleEl = document.getElementById('pres-role');
      const xpEl = document.getElementById('pres-xp');

      if (enabledEl) enabledEl.checked = Boolean(config.enabled);
      if (channelEl && config.channel_id) channelEl.value = config.channel_id;
      if (roleEl && config.reward_role_id) roleEl.value = config.reward_role_id;
      if (xpEl) xpEl.value = config.xp_reward !== undefined ? config.xp_reward : 100;

      const tbody = document.getElementById('pres-recent-table');
      if (tbody) {
        tbody.innerHTML = '';
        const list = data.presentations || [];
        if (list.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-slate-400 italic">Nessuna presentazione ricevuta finora.</td></tr>';
        } else {
          list.forEach(p => {
            const tr = document.createElement('tr');
            const dateStr = new Date(p.timestamp * 1000).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            tr.innerHTML = `
              <td class="py-2.5 font-mono text-slate-900 font-bold">&lt;@${p.user_id}&gt;</td>
              <td class="py-2.5 font-semibold text-indigo-700">${escapeHtml(p.name)}</td>
              <td class="py-2.5 text-slate-600">${escapeHtml(p.age_pronouns || 'N/A')}</td>
              <td class="py-2.5 text-slate-600 max-w-xs truncate" title="${escapeHtml(p.hobbies)}">${escapeHtml(p.hobbies)}</td>
              <td class="py-2.5 text-slate-400 text-[11px]">${dateStr}</td>
            `;
            tbody.appendChild(tr);
          });
        }
      }
    } catch (e) {
      console.error('Error loading presentations:', e);
    }
  }

  const btnSavePresConfig = document.getElementById('btn-save-pres-config');
  if (btnSavePresConfig) {
    btnSavePresConfig.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      const channel_id = document.getElementById('pres-channel')?.value || null;
      const reward_role_id = document.getElementById('pres-role')?.value || null;
      const xp_reward = parseInt(document.getElementById('pres-xp')?.value || '100', 10);
      const enabled = document.getElementById('pres-enabled')?.checked;

      const res = await fetch(`/api/guilds/${guildId}/presentations/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id, reward_role_id, xp_reward, enabled })
      });

      if (res.ok) {
        window.showToast('Configurazione Modulo Presentazioni salvata con successo!');
        await loadPresentationsData(guildId);
      } else {
        window.showToast('Errore durante il salvataggio.', 'error');
      }
    });
  }

  const btnSendPresPanel = document.getElementById('btn-send-pres-panel');
  if (btnSendPresPanel) {
    btnSendPresPanel.addEventListener('click', async () => {
      const guildId = window.AppState?.currentGuildId;
      if (!guildId) return window.showToast('Nessun server selezionato. Seleziona prima un server dal menu in alto.', 'error');

      const channelId = document.getElementById('pres-channel')?.value;
      if (!channelId) return window.showToast('Seleziona un canale per inviare il pannello presentazioni.', 'error');

      const title = document.getElementById('pres-panel-title')?.value || '📜 Benvenuto nella Sala delle Presentazioni';
      const description = document.getElementById('pres-panel-desc')?.value?.trim() || null;
      const image = document.getElementById('pres-panel-image')?.value?.trim() || null;

      try {
        btnSendPresPanel.disabled = true;
        btnSendPresPanel.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Invio in corso...';
        if (window.lucide) lucide.createIcons();

        const res = await fetch(`/api/guilds/${guildId}/presentations/panel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, title, description, image, color: '#6366f1' })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          window.showToast('Pannello Presentazioni inviato su Discord con successo!');
        } else {
          window.showToast(`Errore invio: ${data.error || 'Fallito'}`, 'error');
        }
      } catch (err) {
        window.showToast(`Errore: ${err.message}`, 'error');
      } finally {
        btnSendPresPanel.disabled = false;
        btnSendPresPanel.innerHTML = '<i data-lucide="send" class="w-3.5 h-3.5 text-indigo-600"></i> Invia Pannello nel Canale';
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  // === Community Setup Showcase (Postazioni) Handler ===
  async function loadSetupShowcaseData(guildId) {
    try {
      const res = await fetch(`/api/guilds/${guildId}/setup-showcase`);
      if (!res.ok) return;
      const data = await res.json();

      const config = data.config || {};
      const enabledEl = document.getElementById('setup-enabled');
      const channelEl = document.getElementById('setup-channel');
      const roleEl = document.getElementById('setup-role');
      const xpEl = document.getElementById('setup-xp');
      const titleEl = document.getElementById('setup-title');
      const colorEl = document.getElementById('setup-color');
      const pickerEl = document.getElementById('setup-color-picker');
      const reactionsEl = document.getElementById('setup-reactions');
      const autoThreadEl = document.getElementById('setup-auto-thread');
      const deleteInvalidEl = document.getElementById('setup-delete-invalid');

      if (enabledEl) enabledEl.checked = Boolean(config.enabled);
      if (channelEl && config.channel_id) channelEl.value = config.channel_id;
      if (roleEl && config.reward_role_id) roleEl.value = config.reward_role_id;
      if (xpEl) xpEl.value = config.xp_reward !== undefined ? config.xp_reward : 50;
      if (titleEl) titleEl.value = config.title || '🖥️ Setup & Postazione';
      if (colorEl) colorEl.value = config.color || '#dc2626';
      if (pickerEl) pickerEl.value = config.color || '#dc2626';
      if (reactionsEl) {
        reactionsEl.value = Array.isArray(config.auto_reactions) ? config.auto_reactions.join(', ') : '🔥, ⭐, ❤️';
      }
      if (autoThreadEl) autoThreadEl.checked = config.auto_thread !== false;
      if (deleteInvalidEl) deleteInvalidEl.checked = Boolean(config.delete_invalid);

      const tbody = document.getElementById('setup-recent-table');
      if (tbody) {
        tbody.innerHTML = '';
        const list = data.submissions || [];
        if (list.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-slate-400 italic">Nessun setup condiviso finora. Configura il canale e invita la community a postare!</td></tr>';
        } else {
          list.forEach(s => {
            const tr = document.createElement('tr');
            const dateStr = new Date(s.timestamp * 1000).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            const desc = s.description ? escapeHtml(s.description) : '<span class="italic text-slate-400">Nessuna descrizione</span>';
            tr.innerHTML = `
              <td class="py-2.5 font-mono text-slate-900 font-bold">&lt;@${s.user_id}&gt;</td>
              <td class="py-2.5 text-slate-700 max-w-xs truncate" title="${escapeHtml(s.description || '')}">${desc}</td>
              <td class="py-2.5">
                <a href="${escapeHtml(s.image_url)}" target="_blank" class="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-800 hover:underline">
                  <i data-lucide="external-link" class="w-3 h-3"></i> Vedi Foto
                </a>
              </td>
              <td class="py-2.5 text-slate-400 text-[11px]">${dateStr}</td>
            `;
            tbody.appendChild(tr);
          });
          if (window.lucide) lucide.createIcons();
        }
      }
    } catch (e) {
      console.error('Error loading setup showcase:', e);
    }
  }

  // Color picker synchronization for Setup Showcase
  const setupColorPicker = document.getElementById('setup-color-picker');
  const setupColorInput = document.getElementById('setup-color');
  if (setupColorPicker && setupColorInput) {
    setupColorPicker.addEventListener('input', () => {
      setupColorInput.value = setupColorPicker.value;
    });
    setupColorInput.addEventListener('input', () => {
      if (/^#[0-9A-F]{6}$/i.test(setupColorInput.value)) {
        setupColorPicker.value = setupColorInput.value;
      }
    });
  }

  const btnSaveSetupConfig = document.getElementById('btn-save-setup-config');
  if (btnSaveSetupConfig) {
    btnSaveSetupConfig.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      if (!guildId) return window.showToast('Nessun server selezionato.', 'error');

      const channel_id = document.getElementById('setup-channel')?.value || null;
      const reward_role_id = document.getElementById('setup-role')?.value || null;
      const xp_reward = parseInt(document.getElementById('setup-xp')?.value || '50', 10);
      const title = document.getElementById('setup-title')?.value || '🖥️ Setup & Postazione';
      const color = document.getElementById('setup-color')?.value || '#dc2626';
      const rawReactions = document.getElementById('setup-reactions')?.value || '🔥, ⭐, ❤️';
      const auto_reactions = rawReactions.split(',').map(r => r.trim()).filter(Boolean);
      const auto_thread = document.getElementById('setup-auto-thread')?.checked;
      const delete_invalid = document.getElementById('setup-delete-invalid')?.checked;
      const enabled = document.getElementById('setup-enabled')?.checked;

      const res = await fetch(`/api/guilds/${guildId}/setup-showcase/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_id,
          reward_role_id,
          xp_reward,
          title,
          color,
          auto_reactions,
          auto_thread,
          delete_invalid,
          enabled
        })
      });

      if (res.ok) {
        window.showToast('Configurazione Showcase Postazioni salvata con successo!');
        await loadSetupShowcaseData(guildId);
      } else {
        window.showToast('Errore durante il salvataggio.', 'error');
      }
    });
  }

  const btnSendSetupPanel = document.getElementById('btn-send-setup-panel');
  if (btnSendSetupPanel) {
    btnSendSetupPanel.addEventListener('click', async () => {
      const guildId = window.AppState?.currentGuildId;
      if (!guildId) return window.showToast('Nessun server selezionato. Seleziona prima un server dal menu in alto.', 'error');

      const channelId = document.getElementById('setup-channel')?.value;
      if (!channelId) return window.showToast('Seleziona un canale per inviare il pannello regole setup.', 'error');

      const title = document.getElementById('setup-panel-title')?.value || '🖥️ Condividi la Tua Postazione da Battaglia';
      const description = document.getElementById('setup-panel-desc')?.value?.trim() || null;
      const image = document.getElementById('setup-panel-image')?.value?.trim() || null;
      const color = document.getElementById('setup-color')?.value || '#dc2626';

      try {
        btnSendSetupPanel.disabled = true;
        btnSendSetupPanel.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Invio in corso...';
        if (window.lucide) lucide.createIcons();

        const res = await fetch(`/api/guilds/${guildId}/setup-showcase/panel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, title, description, image, color })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          window.showToast('Pannello Regole Setup inviato su Discord con successo!');
        } else {
          window.showToast(`Errore invio: ${data.error || 'Fallito'}`, 'error');
        }
      } catch (err) {
        window.showToast(`Errore: ${err.message}`, 'error');
      } finally {
        btnSendSetupPanel.disabled = false;
        btnSendSetupPanel.innerHTML = '<i data-lucide="send" class="w-3.5 h-3.5 text-red-600"></i> Invia Pannello nel Canale';
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  const btnConvertSetupMsgs = document.getElementById('btn-convert-setup-msgs');
  if (btnConvertSetupMsgs) {
    btnConvertSetupMsgs.addEventListener('click', async () => {
      const guildId = window.AppState?.currentGuildId;
      if (!guildId) return window.showToast('Nessun server selezionato.', 'error');

      const channelId = document.getElementById('setup-channel')?.value;
      if (!channelId) return window.showToast('Seleziona prima il canale in cui scansionare i setup.', 'error');

      try {
        btnConvertSetupMsgs.disabled = true;
        btnConvertSetupMsgs.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Scansione in corso...';
        if (window.lucide) lucide.createIcons();

        const res = await fetch(`/api/guilds/${guildId}/setup-showcase/convert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, limit: 100 })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          window.showToast(`✨ Conversione completata! ${data.convertedCount} setup convertiti in Embed.`);
          await loadSetupShowcaseData(guildId);
        } else {
          window.showToast(`Errore: ${data.error || 'Scansione fallita'}`, 'error');
        }
      } catch (err) {
        window.showToast(`Errore: ${err.message}`, 'error');
      } finally {
        btnConvertSetupMsgs.disabled = false;
        btnConvertSetupMsgs.innerHTML = '<i data-lucide="refresh-cw" class="w-3.5 h-3.5 text-red-600"></i> Scansiona e Converti Messaggi del Canale';
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  // === Minigames & Medieval Community Handler ===
  async function loadMinigamesData(guildId) {
    try {
      const [cntRes, fishRes, mgRes] = await Promise.allSettled([
        fetch(`/api/guilds/${guildId}/counting`),
        fetch(`/api/guilds/${guildId}/fishing`),
        fetch(`/api/guilds/${guildId}/minigames`)
      ]);

      // 1. Counting
      if (cntRes.status === 'fulfilled' && cntRes.value.ok) {
        const data = await cntRes.value.json();
        const cfg = data.config || {};
        const enabledEl = document.getElementById('cnt-enabled');
        const channelEl = document.getElementById('cnt-channel');
        const curEl = document.getElementById('cnt-current-val');
        const highEl = document.getElementById('cnt-highest-val');

        if (enabledEl) enabledEl.checked = Boolean(cfg.enabled);
        if (channelEl && cfg.channel_id) channelEl.value = cfg.channel_id;
        if (curEl) curEl.textContent = cfg.current_number || 0;
        if (highEl) highEl.textContent = cfg.highest_streak || 0;
        const zenEl = document.getElementById('cnt-zen-mode');
        if (zenEl) zenEl.checked = cfg.zen_mode !== undefined ? Boolean(cfg.zen_mode) : true;
        const consEl = document.getElementById('cnt-consecutive');
        if (consEl) consEl.checked = cfg.allow_consecutive !== undefined ? Boolean(cfg.allow_consecutive) : true;

        const lbList = document.getElementById('cnt-leaderboard-list');
        if (lbList) {
          lbList.innerHTML = '';
          const lb = data.leaderboard || [];
          if (lb.length === 0) {
            lbList.innerHTML = '<p class="text-slate-400 italic">Nessun punteggio conteggio registrato finora.</p>';
          } else {
            lb.forEach((item, idx) => {
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
              const div = document.createElement('div');
              div.className = 'flex items-center justify-between p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs';
              div.innerHTML = `
                <div class="flex items-center gap-2">
                  <span class="font-bold text-slate-300">${medal}</span>
                  <span class="font-mono text-white">&lt;@${item.user_id}&gt;</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="font-bold text-emerald-400">${item.correct_counts} corretti</span>
                  <span class="text-slate-400 text-[10px]">(${item.ruined_counts} errori)</span>
                </div>
              `;
              lbList.appendChild(div);
            });
          }
        }
      }

      // 2. Fishing
      if (fishRes.status === 'fulfilled' && fishRes.value.ok) {
        const data = await fishRes.value.json();
        const cfg = data.config || {};
        const fishEnabled = document.getElementById('fish-enabled');
        const fishChannel = document.getElementById('fish-channel');
        const fishCooldown = document.getElementById('fish-cooldown');

        if (fishEnabled) fishEnabled.checked = Boolean(cfg.enabled);
        if (fishChannel && cfg.channel_id) fishChannel.value = cfg.channel_id;
        if (fishCooldown) fishCooldown.value = cfg.cooldown_seconds || 15;

        const lbList = document.getElementById('fish-leaderboard-list');
        if (lbList) {
          lbList.innerHTML = '';
          const lb = data.leaderboard || [];
          if (lb.length === 0) {
            lbList.innerHTML = '<p class="text-slate-400 italic">Nessun pescatore registrato finora.</p>';
          } else {
            lb.forEach((item, idx) => {
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
              const div = document.createElement('div');
              div.className = 'flex items-center justify-between p-2.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-xs cursor-pointer transition-colors';
              div.title = 'Clicca per selezionare questo utente nella gestione tesoreria';
              div.innerHTML = `
                <div class="flex items-center gap-2">
                  <span class="font-bold text-slate-300">${medal}</span>
                  <span class="font-mono text-white">&lt;@${item.user_id}&gt;</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="font-bold text-amber-400">🪙 ${(item.coins || 0).toLocaleString()} Monete</span>
                  <span class="text-slate-400 text-[10px]">🎣 ${item.total_fish_caught || 0} prede</span>
                </div>
              `;
              div.addEventListener('click', () => {
                const targetInput = document.getElementById('coin-target-user');
                if (targetInput) {
                  targetInput.value = item.user_id;
                  targetInput.focus();
                  window.showToast(`Utente <@${item.user_id}> selezionato per la modifica monete!`);
                }
              });
              lbList.appendChild(div);
            });
          }
        }
      }

      // 3. Minigames & Casino
      if (mgRes.status === 'fulfilled' && mgRes.value.ok) {
        const data = await mgRes.value.json();
        const cfg = data.config || {};
        const mgEnabled = document.getElementById('mg-enabled');
        const mgGeneralChannel = document.getElementById('mg-general-channel');
        const mgBjChannel = document.getElementById('mg-bj-channel');
        const mgSlotChannel = document.getElementById('mg-slot-channel');
        const mgMinBet = document.getElementById('mg-min-bet');
        const mgMaxBet = document.getElementById('mg-max-bet');
        const mgDailyReward = document.getElementById('mg-daily-reward');

        if (mgEnabled) mgEnabled.checked = Boolean(cfg.enabled);
        if (mgGeneralChannel && cfg.general_channel_id) mgGeneralChannel.value = cfg.general_channel_id;
        if (mgBjChannel && cfg.blackjack_channel_id) mgBjChannel.value = cfg.blackjack_channel_id;
        if (mgSlotChannel && cfg.slots_channel_id) mgSlotChannel.value = cfg.slots_channel_id;
        if (mgMinBet) mgMinBet.value = cfg.min_bet || 10;
        if (mgMaxBet) mgMaxBet.value = cfg.max_bet || 5000;
        if (mgDailyReward) mgDailyReward.value = cfg.daily_reward || 150;
      }
    } catch (e) {
      console.error('Error loading minigames:', e);
    }
  }

  // Save Fishing Config
  const btnSaveFishing = document.getElementById('btn-save-fishing');
  if (btnSaveFishing) {
    btnSaveFishing.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      const channelId = document.getElementById('fish-channel')?.value;
      const enabled = document.getElementById('fish-enabled')?.checked;
      const cooldown = parseInt(document.getElementById('fish-cooldown')?.value, 10) || 15;

      const res = await fetch(`/api/guilds/${guildId}/fishing/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId, enabled, cooldown_seconds: cooldown })
      });

      if (res.ok) {
        window.showToast('Configurazione Pesca Medievale salvata con successo!');
        await loadMinigamesData(guildId);
      } else {
        window.showToast('Errore durante il salvataggio.', 'error');
      }
    });
  }

  // Send Fishing Panel
  const btnSendFishingPanel = document.getElementById('btn-send-fishing-panel');
  if (btnSendFishingPanel) {
    btnSendFishingPanel.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      const channelId = document.getElementById('fish-channel')?.value;

      if (!channelId) {
        return window.showToast('Seleziona e salva prima il canale dedicato alla pesca!', 'error');
      }

      btnSendFishingPanel.disabled = true;
      try {
        const res = await fetch(`/api/guilds/${guildId}/fishing/panel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId })
        });

        if (res.ok) {
          window.showToast('Pannello di pesca interattivo inviato nel canale!');
        } else {
          const err = await res.json();
          window.showToast(err.error || 'Errore durante l\'invio.', 'error');
        }
      } catch (e) {
        window.showToast(e.message, 'error');
      } finally {
        btnSendFishingPanel.disabled = false;
      }
    });
  }

  // Save Casino & Minigames Config
  const btnSaveMinigames = document.getElementById('btn-save-minigames');
  if (btnSaveMinigames) {
    btnSaveMinigames.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      const enabled = document.getElementById('mg-enabled')?.checked;
      const generalChannelId = document.getElementById('mg-general-channel')?.value;
      const bjChannelId = document.getElementById('mg-bj-channel')?.value;
      const slotChannelId = document.getElementById('mg-slot-channel')?.value;
      const minBet = parseInt(document.getElementById('mg-min-bet')?.value, 10) || 10;
      const maxBet = parseInt(document.getElementById('mg-max-bet')?.value, 10) || 5000;
      const dailyReward = parseInt(document.getElementById('mg-daily-reward')?.value, 10) || 150;

      const res = await fetch(`/api/guilds/${guildId}/minigames/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          general_channel_id: generalChannelId,
          blackjack_channel_id: bjChannelId,
          slots_channel_id: slotChannelId,
          min_bet: minBet,
          max_bet: maxBet,
          daily_reward: dailyReward
        })
      });

      if (res.ok) {
        window.showToast('Configurazione Casinò e Minigiochi salvata con successo!');
        await loadMinigamesData(guildId);
      } else {
        window.showToast('Errore durante il salvataggio.', 'error');
      }
    });
  }

  // Send Blackjack Panel
  const btnSendBjPanel = document.getElementById('btn-send-bj-panel');
  if (btnSendBjPanel) {
    btnSendBjPanel.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      const channelId = document.getElementById('mg-bj-channel')?.value || document.getElementById('mg-general-channel')?.value;

      if (!channelId) {
        return window.showToast('Seleziona prima il canale per il Blackjack o il canale generale!', 'error');
      }

      btnSendBjPanel.disabled = true;
      try {
        const res = await fetch(`/api/guilds/${guildId}/minigames/panel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, gameType: 'blackjack' })
        });

        if (res.ok) {
          window.showToast('Tavolo interattivo di Blackjack inviato con successo!');
        } else {
          const err = await res.json();
          window.showToast(err.error || 'Errore durante l\'invio.', 'error');
        }
      } catch (e) {
        window.showToast(e.message, 'error');
      } finally {
        btnSendBjPanel.disabled = false;
      }
    });
  }

  // Send Minigames Hub
  const btnSendMinigamesHub = document.getElementById('btn-send-minigames-hub');
  if (btnSendMinigamesHub) {
    btnSendMinigamesHub.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      const channelId = document.getElementById('mg-general-channel')?.value;

      if (!channelId) {
        return window.showToast('Seleziona prima il canale generale dei minigiochi!', 'error');
      }

      btnSendMinigamesHub.disabled = true;
      try {
        const res = await fetch(`/api/guilds/${guildId}/minigames/panel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, gameType: 'hub' })
        });

        if (res.ok) {
          window.showToast('Hub dei Minigiochi inviato nel canale!');
        } else {
          const err = await res.json();
          window.showToast(err.error || 'Errore durante l\'invio.', 'error');
        }
      } catch (e) {
        window.showToast(e.message, 'error');
      } finally {
        btnSendMinigamesHub.disabled = false;
      }
    });
  }

  // Member search in Treasury
  const coinMemberSearch = document.getElementById('coin-member-search');
  if (coinMemberSearch) {
    coinMemberSearch.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      const select = document.getElementById('coin-target-user');
      if (!select) return;

      Array.from(select.options).forEach((opt, idx) => {
        if (idx === 0) return; // Keep placeholder
        const text = opt.textContent.toLowerCase();
        const val = opt.value.toLowerCase();
        const match = !term || text.includes(term) || val.includes(term);
        opt.style.display = match ? '' : 'none';
      });
    });
  }

  // Toggle manual user ID entry
  const btnToggleManualUser = document.getElementById('btn-toggle-manual-user');
  if (btnToggleManualUser) {
    btnToggleManualUser.addEventListener('click', () => {
      const dropdownCont = document.getElementById('coin-member-dropdown-container');
      const manualCont = document.getElementById('coin-manual-user-container');
      if (!dropdownCont || !manualCont) return;

      const isManual = !manualCont.classList.contains('hidden');
      if (isManual) {
        manualCont.classList.add('hidden');
        dropdownCont.classList.remove('hidden');
        btnToggleManualUser.textContent = 'Inserisci ID manuale';
      } else {
        dropdownCont.classList.add('hidden');
        manualCont.classList.remove('hidden');
        btnToggleManualUser.textContent = 'Seleziona dalla lista';
      }
    });
  }

  // Update Player Coins (Treasury Management)
  const btnUpdatePlayerCoins = document.getElementById('btn-update-player-coins');
  if (btnUpdatePlayerCoins) {
    btnUpdatePlayerCoins.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      const manualCont = document.getElementById('coin-manual-user-container');
      const isManual = manualCont && !manualCont.classList.contains('hidden');
      
      let targetUser = '';
      if (isManual) {
        targetUser = document.getElementById('coin-target-user-manual')?.value?.trim();
      } else {
        targetUser = document.getElementById('coin-target-user')?.value?.trim();
      }

      const operation = document.getElementById('coin-operation')?.value || 'add';
      const amount = parseInt(document.getElementById('coin-amount')?.value, 10);

      if (!targetUser) {
        return window.showToast('Seleziona un membro o inserisci un ID valido!', 'error');
      }

      if (isNaN(amount) || amount < 0) {
        return window.showToast('Inserisci un importo valido di monete!', 'error');
      }

      btnUpdatePlayerCoins.disabled = true;
      try {
        const res = await fetch(`/api/guilds/${guildId}/economy/coins`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: targetUser, operation, amount })
        });

        if (res.ok) {
          const data = await res.json();
          window.showToast(`Saldo monete aggiornato con successo! Nuovo saldo: ${data.profile.coins.toLocaleString()} 🪙`);
          if (isManual) {
            document.getElementById('coin-target-user-manual').value = '';
          }
          await loadMinigamesData(guildId);
          if (window.switchGuild && guildId) {
            await window.switchGuild(guildId);
          } else if (window.updateUserCoinsDisplay) {
            await window.updateUserCoinsDisplay(guildId);
          }
        } else {
          const err = await res.json();
          window.showToast(err.error || 'Errore durante l\'aggiornamento saldo.', 'error');
        }
      } catch (e) {
        window.showToast(e.message, 'error');
      } finally {
        btnUpdatePlayerCoins.disabled = false;
      }
    });
  }

  // Reset Server Economy Handler
  const btnResetServerEconomy = document.getElementById('btn-reset-server-economy');
  if (btnResetServerEconomy) {
    btnResetServerEconomy.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      if (!confirm('⚠️ ATTENZIONE: Sei sicuro di voler azzerare completamente la ricchezza, le monete e le statistiche dei minigiochi di TUTTI i membri del server? L\'operazione non è reversibile.')) {
        return;
      }

      btnResetServerEconomy.disabled = true;
      try {
        const res = await fetch(`/api/guilds/${guildId}/economy/reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
          window.showToast('Economia e forzieri del server azzerati con successo!');
          await loadMinigamesData(guildId);
          if (window.switchGuild && guildId) {
            await window.switchGuild(guildId);
          }
        } else {
          const err = await res.json();
          window.showToast(err.error || 'Errore durante il reset.', 'error');
        }
      } catch (e) {
        window.showToast(e.message, 'error');
      } finally {
        btnResetServerEconomy.disabled = false;
      }
    });
  }

  // Counting Handlers
  const btnSaveCounting = document.getElementById('btn-save-counting');
  if (btnSaveCounting) {
    btnSaveCounting.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      const channelId = document.getElementById('cnt-channel')?.value;
      const enabled = document.getElementById('cnt-enabled')?.checked;
      const zen_mode = document.getElementById('cnt-zen-mode')?.checked;
      const allow_consecutive = document.getElementById('cnt-consecutive')?.checked;

      const res = await fetch(`/api/guilds/${guildId}/counting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId, enabled, zen_mode, allow_consecutive })
      });

      if (res.ok) {
        window.showToast('Configurazione Minigioco Counting salvata!');
        await loadMinigamesData(guildId);
      } else {
        window.showToast('Errore durante il salvataggio.', 'error');
      }
    });
  }

  const btnResetCounting = document.getElementById('btn-reset-counting');
  if (btnResetCounting) {
    btnResetCounting.addEventListener('click', async () => {
      if (!confirm('Sei sicuro di voler azzerare il conteggio attuale a 0?')) return;
      const guildId = window.AppState.currentGuildId;
      const channelId = document.getElementById('cnt-channel')?.value;
      const enabled = document.getElementById('cnt-enabled')?.checked;

      const res = await fetch(`/api/guilds/${guildId}/counting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId, enabled, current_number: 0, last_user_id: null })
      });

      if (res.ok) {
        window.showToast('Conteggio azzerato a 0!');
        await loadMinigamesData(guildId);
      }
    });
  }

  async function loadEmojiStats(guildId) {
    try {
      const res = await fetch(`/api/guilds/${guildId}/emoji-stats`);
      if (!res.ok) return;
      const stats = await res.json();

      const tbody = document.getElementById('emoji-stats-table');
      if (!tbody) return;

      tbody.innerHTML = '';
      if (stats.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-slate-500">Nessun dato registrato.</td></tr>';
      } else {
        stats.forEach((s, idx) => {
          const tr = document.createElement('tr');
          const dateStr = new Date(s.last_used * 1000).toLocaleString('it-IT');
          tr.innerHTML = `
            <td class="py-2.5 font-bold font-mono text-purple-400">#${idx + 1}</td>
            <td class="py-2.5 font-medium text-white">:${s.emoji_name}:</td>
            <td class="py-2.5"><span class="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[10px] font-bold">${s.is_animated ? 'GIF' : 'PNG'}</span></td>
            <td class="py-2.5 font-mono text-cyan-400 font-bold">${s.use_count}</td>
            <td class="py-2.5 text-slate-400">${dateStr}</td>
          `;
          tbody.appendChild(tr);
        });
      }
    } catch (e) {
      console.error('Error loading emoji stats:', e);
    }
  }

  async function saveAllServerSettings(guildId) {
    if (!guildId) return;

    const btn = document.getElementById('btn-save-all');
    const btnMob = document.getElementById('btn-save-all-mobile');

    try {
      if (btn) btn.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Salvataggio...';
      if (btnMob) btnMob.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Salvataggio...';
      if (window.lucide) lucide.createIcons();

      const clientId = window.AppState?.clientId;
      const headers = {
        'Content-Type': 'application/json',
        ...(clientId ? { 'x-client-id': clientId } : {})
      };

      // 1. Master Modules & General Settings (Log Channel, Prefix)
      const logChannelVal = document.getElementById('gen-log-channel')?.value;
      const prefixVal = document.getElementById('gen-prefix')?.value || '!';
      const enabledMap = {};
      document.querySelectorAll('.master-module-toggle').forEach(t => {
        const mod = t.getAttribute('data-module');
        if (mod) enabledMap[mod] = t.checked;
      });

      const p1 = fetch(`/api/guilds/${guildId}/settings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prefix: prefixVal,
          log_channel_id: logChannelVal || null,
          modules_enabled: Object.keys(enabledMap).length > 0 ? enabledMap : undefined
        })
      });

      // 2. Welcomer Config
      const welPayload = window.getWelcomerPayload ? window.getWelcomerPayload() : null;
      const p3 = welPayload ? fetch(`/api/guilds/${guildId}/welcomer`, {
        method: 'POST',
        headers,
        body: JSON.stringify(welPayload)
      }) : Promise.resolve({ ok: true });

      // 4. Partnership Config
      const p4 = fetch(`/api/guilds/${guildId}/partnerships/config`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          enabled: document.getElementById('part-enabled')?.checked,
          channel_id: document.getElementById('part-channel')?.value || null,
          ping_role_id: document.getElementById('part-ping-role')?.value || null,
          min_members: parseInt(document.getElementById('part-min-members')?.value || '50', 10),
          cooldown_minutes: parseInt(document.getElementById('part-cooldown')?.value || '60', 10)
        })
      });

      // 5. AutoMod Config
      const badWordsRaw = document.getElementById('am-badwords')?.value || '';
      const badWords = badWordsRaw.split(/[, ]+/).map(w => w.trim()).filter(Boolean);
      const p5 = fetch(`/api/guilds/${guildId}/automod`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          anti_invite: document.getElementById('am-invite')?.checked,
          anti_link: document.getElementById('am-link')?.checked,
          anti_spam: document.getElementById('am-spam')?.checked,
          anti_caps: document.getElementById('am-caps')?.checked,
          bad_words: badWords
        })
      });

      // 6. Leveling Config
      const p6 = fetch(`/api/guilds/${guildId}/leveling`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          enabled: document.getElementById('lvl-enabled')?.checked,
          channel_id: document.getElementById('lvl-channel')?.value || null,
          xp_rate: parseFloat(document.getElementById('lvl-rate')?.value || '1.0'),
          coins_per_level: parseInt(document.getElementById('lvl-coins')?.value || '100', 10)
        })
      });

      // 7. Counting Minigame Config
      const p7 = fetch(`/api/guilds/${guildId}/counting`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          enabled: document.getElementById('cnt-enabled')?.checked,
          channel_id: document.getElementById('cnt-channel')?.value || null,
          zen_mode: document.getElementById('cnt-zen-mode')?.checked,
          allow_consecutive: document.getElementById('cnt-consecutive')?.checked
        })
      });

      // 8. Presentations Module Config
      const p8 = fetch(`/api/guilds/${guildId}/presentations/config`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          enabled: document.getElementById('pres-enabled')?.checked,
          channel_id: document.getElementById('pres-channel')?.value || null,
          reward_role_id: document.getElementById('pres-role')?.value || null,
          xp_reward: parseInt(document.getElementById('pres-xp')?.value || '100', 10)
        })
      });

      // 9. Setup Showcase Module Config
      const rawReactions = document.getElementById('setup-reactions')?.value || '🔥, ⭐, ❤️';
      const auto_reactions = rawReactions.split(',').map(r => r.trim()).filter(Boolean);
      const p9 = fetch(`/api/guilds/${guildId}/setup-showcase/config`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          enabled: document.getElementById('setup-enabled')?.checked,
          channel_id: document.getElementById('setup-channel')?.value || null,
          reward_role_id: document.getElementById('setup-role')?.value || null,
          xp_reward: parseInt(document.getElementById('setup-xp')?.value || '50', 10),
          title: document.getElementById('setup-title')?.value || '🖥️ Setup & Postazione',
          color: document.getElementById('setup-color')?.value || '#dc2626',
          auto_reactions,
          auto_thread: document.getElementById('setup-auto-thread')?.checked,
          delete_invalid: document.getElementById('setup-delete-invalid')?.checked
        })
      });

      // 10. Temp Channels Config
      const p10 = fetch(`/api/guilds/${guildId}/temp-channels/config`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          enabled: document.getElementById('tc-enabled')?.checked,
          voice_generator_id: document.getElementById('tc-gen-voice-channel')?.value || null,
          category_id: document.getElementById('tc-category')?.value || null,
          panel_channel_id: document.getElementById('tc-panel-channel')?.value || null,
          default_user_limit: parseInt(document.getElementById('tc-user-limit')?.value || '0', 10),
          default_bitrate: parseInt(document.getElementById('tc-bitrate')?.value || '64000', 10)
        })
      });

      const results = await Promise.allSettled([p1, p3, p4, p5, p6, p7, p8, p9, p10]);
      const failures = results.filter(r => r.status === 'rejected' || (r.value && !r.value.ok));

      // Update in-memory state
      if (window.AppState?.settings) {
        window.AppState.settings.prefix = prefixVal;
        window.AppState.settings.log_channel_id = logChannelVal || null;
      }

      if (failures.length === 0) {
        window.showToast('🛡️ Tutte le impostazioni del server sono state salvate permanentemente nel database!');
      } else {
        console.warn('[SaveAll] Alcune sezioni hanno riscontrato errori:', failures);
        window.showToast(`Salvataggio completato con ${failures.length} avvisi.`, 'warning');
      }
    } catch (err) {
      console.error('[SaveAll Error]:', err);
      window.showToast('Errore imprevisto durante il salvataggio.', 'error');
    } finally {
      if (btn) btn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5"></i> Salva Modifiche';
      if (btnMob) btnMob.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5"></i> Salva';
      if (window.lucide) lucide.createIcons();
    }
  }

  // Initialize Markdown Toolbars & Searchable Selects for ALL Modules across the entire Dashboard
  function initModuleToolbars() {
    if (window.setupMarkdownToolbar) {
      
      // Partnerships Module
      window.setupMarkdownToolbar('part-notes-toolbar-container', 'part-quick-notes');

      // Welcomer Module
      window.setupMarkdownToolbar('wel-toolbar-container', 'wel-message');
      window.setupMarkdownToolbar('wel-dm-toolbar-container', 'wel-dm-message');
      window.setupMarkdownToolbar('wel-leave-toolbar-container', 'wel-leave-message');

      // Reaction Roles Module
      window.setupMarkdownToolbar('rr-title-toolbar-container', 'rr-title');

      // Auto-Responder Module
      window.setupMarkdownToolbar('ar-response-toolbar-container', 'ar-response');

      // Ticket System Module
      window.setupMarkdownToolbar('tk-desc-toolbar-container', 'tk-description');
      window.setupMarkdownToolbar('tk-welcome-toolbar-container', 'tk-welcome-msg');

      // Giveaways & Leveling Module
      window.setupMarkdownToolbar('ga-prize-toolbar-container', 'ga-prize');
      window.setupMarkdownToolbar('lvl-msg-toolbar-container', 'lvl-message');
    }

    if (window.setupSearchableSelect) {
      // Welcomer Channels
      window.setupSearchableSelect('wel-channel-search', 'wel-channel', 'text');
      window.setupSearchableSelect('wel-leave-channel-search', 'wel-leave-channel', 'text');

      // Ticket System Channels, Categories & Roles
      window.setupSearchableSelect('tk-channel-search', 'tk-channel', 'text');
      window.setupSearchableSelect('tk-category-search', 'tk-category', 'category');
      window.setupSearchableSelect('tk-support-role-search', 'tk-support-role', 'role');
      window.setupSearchableSelect('tk-log-channel-search', 'tk-log-channel', 'text');

      // Partnerships Channels & Roles
      window.setupSearchableSelect('part-channel-search', 'part-channel', 'text');
      window.setupSearchableSelect('part-ping-role-search', 'part-ping-role', 'role');
      window.setupSearchableSelect('part-manager-role-search', 'part-manager-role', 'role');

      // Community Presentations Channels & Roles
      window.setupSearchableSelect('pres-channel-search', 'pres-channel', 'text');
      window.setupSearchableSelect('pres-role-search', 'pres-role', 'role');

      // Community Setup Showcase Channels & Roles
      window.setupSearchableSelect('setup-channel-search', 'setup-channel', 'text');
      window.setupSearchableSelect('setup-role-search', 'setup-role', 'role');

      // Reaction Roles Channels & Roles
      window.setupSearchableSelect('rr-channel-search', 'rr-channel', 'text');
      window.setupSearchableSelect('rr-role-search', 'rr-role', 'role');

      // Auto-Responder Channel
      window.setupSearchableSelect('ar-chan-search', 'ar-chan-select', 'text');

      // Giveaways & Leveling Channels
      window.setupSearchableSelect('ga-channel-search', 'ga-channel', 'text');
      window.setupSearchableSelect('lvl-channel-search', 'lvl-channel', 'text');

      // Minigames & Counting Channel
      window.setupSearchableSelect('cnt-channel-search', 'cnt-channel', 'text');
      window.setupSearchableSelect('fish-channel-search', 'fish-channel', 'text');
      window.setupSearchableSelect('mg-general-channel-search', 'mg-general-channel', 'text');
      window.setupSearchableSelect('mg-bj-channel-search', 'mg-bj-channel', 'text');
      window.setupSearchableSelect('mg-slot-channel-search', 'mg-slot-channel', 'text');

      // Temporary & Private Channels
      window.setupSearchableSelect('tc-gen-voice-search', 'tc-gen-voice-channel', 'voice');
      window.setupSearchableSelect('tc-category-search', 'tc-category', 'category');
      window.setupSearchableSelect('tc-panel-channel-search', 'tc-panel-channel', 'text');
    }
  }

  // Temporary & Private Channels Data Loader
  async function loadTempChannelsData(guildId) {
    if (!guildId) return;
    try {
      const res = await fetch(`/api/guilds/${guildId}/tempchannels`);
      if (!res.ok) return;

      const { config, activeRooms } = await res.json();

      const enabledEl = document.getElementById('tc-enabled');
      const voiceGenEl = document.getElementById('tc-gen-voice-channel');
      const catEl = document.getElementById('tc-category');
      const panelEl = document.getElementById('tc-panel-channel');
      const nameVoiceEl = document.getElementById('tc-name-voice');
      const nameTextEl = document.getElementById('tc-name-text');
      const limitEl = document.getElementById('tc-default-limit');
      const bitrateEl = document.getElementById('tc-bitrate');

      if (enabledEl) enabledEl.checked = Boolean(config.enabled);
      if (voiceGenEl && config.voice_generator_id) voiceGenEl.value = config.voice_generator_id;
      if (catEl && config.category_id) catEl.value = config.category_id;
      if (panelEl && config.panel_channel_id) panelEl.value = config.panel_channel_id;
      if (nameVoiceEl) nameVoiceEl.value = config.naming_scheme_voice || '🔊 Stanza di {user}';
      if (nameTextEl) nameTextEl.value = config.naming_scheme_text || '💬 chat-{user}';
      if (limitEl) limitEl.value = config.default_user_limit || 0;
      if (bitrateEl) bitrateEl.value = config.default_bitrate || 64000;

      // Render Active Rooms List
      const roomsContainer = document.getElementById('tc-active-rooms-list');
      if (roomsContainer) {
        if (!activeRooms || activeRooms.length === 0) {
          roomsContainer.innerHTML = '<p class="text-slate-400 italic text-center py-4">Nessuna stanza temporanea attiva al momento.</p>';
        } else {
          roomsContainer.innerHTML = activeRooms.map(r => {
            const isLocked = r.is_locked ? '🔒 Bloccata' : '🔓 Aperta';
            const isHidden = r.is_hidden ? '👁️ Nascosta' : '👁️ Visibile';
            return `
              <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-slate-900 font-mono">Stanza #${r.id}</span>
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">Owner: ${r.owner_id}</span>
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold ${r.is_locked ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}">${isLocked}</span>
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">${isHidden}</span>
                  </div>
                  <p class="text-[11px] text-slate-500 mt-1">
                    ${r.voice_channel_id ? `🔊 Vocale: <code>${r.voice_channel_id}</code>` : ''} 
                    ${r.text_channel_id ? `💬 Testo: <code>${r.text_channel_id}</code>` : ''}
                  </p>
                </div>
                <button type="button" class="btn-delete-temp-room p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200" data-room-id="${r.id}" title="Elimina forzatamente">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              </div>
            `;
          }).join('');

          document.querySelectorAll('.btn-delete-temp-room').forEach(btn => {
            btn.addEventListener('click', async (e) => {
              const roomId = e.currentTarget.getAttribute('data-room-id');
              if (!confirm(`Sei sicuro di voler eliminare forzatamente la stanza #${roomId}?`)) return;
              try {
                const delRes = await fetch(`/api/guilds/${guildId}/tempchannels/${roomId}`, { method: 'DELETE' });
                if (delRes.ok) {
                  window.showToast('Stanza eliminata con successo!');
                  await loadTempChannelsData(guildId);
                } else {
                  const err = await delRes.json();
                  window.showToast(err.error || 'Errore eliminazione.', 'error');
                }
              } catch (err) {
                window.showToast(err.message, 'error');
              }
            });
          });

          if (window.lucide) lucide.createIcons();
        }
      }
    } catch (e) {
      console.error('Error loading temp channels data:', e);
    }
  }

  window.loadTempChannelsData = loadTempChannelsData;

  // Temp Channels Event Listeners
  const btnSaveTempChannels = document.getElementById('btn-save-tempchannels');
  if (btnSaveTempChannels) {
    btnSaveTempChannels.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      if (!guildId) return;

      const payload = {
        enabled: document.getElementById('tc-enabled')?.checked,
        voice_generator_id: document.getElementById('tc-gen-voice-channel')?.value || null,
        category_id: document.getElementById('tc-category')?.value || null,
        panel_channel_id: document.getElementById('tc-panel-channel')?.value || null,
        naming_scheme_voice: document.getElementById('tc-name-voice')?.value?.trim() || '🔊 Stanza di {user}',
        naming_scheme_text: document.getElementById('tc-name-text')?.value?.trim() || '💬 chat-{user}',
        default_user_limit: parseInt(document.getElementById('tc-default-limit')?.value, 10) || 0,
        default_bitrate: parseInt(document.getElementById('tc-bitrate')?.value, 10) || 64000
      };

      btnSaveTempChannels.disabled = true;
      try {
        const res = await fetch(`/api/guilds/${guildId}/tempchannels/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          window.showToast('Configurazione Canali Privati salvata con successo!');
        } else {
          const err = await res.json();
          window.showToast(err.error || 'Errore durante il salvataggio.', 'error');
        }
      } catch (err) {
        window.showToast(err.message, 'error');
      } finally {
        btnSaveTempChannels.disabled = false;
      }
    });
  }

  const btnSendTempChannelsPanel = document.getElementById('btn-send-tempchannels-panel');
  if (btnSendTempChannelsPanel) {
    btnSendTempChannelsPanel.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      if (!guildId) return;

      const channelId = document.getElementById('tc-panel-channel')?.value;
      if (!channelId) {
        return window.showToast('Seleziona prima il canale per inviare il pannello!', 'error');
      }

      btnSendTempChannelsPanel.disabled = true;
      try {
        const res = await fetch(`/api/guilds/${guildId}/tempchannels/panel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId })
        });

        if (res.ok) {
          window.showToast('Hub Creazione Canali Privati inviato nel canale!');
        } else {
          const err = await res.json();
          window.showToast(err.error || 'Errore durante l\'invio del pannello.', 'error');
        }
      } catch (err) {
        window.showToast(err.message, 'error');
      } finally {
        btnSendTempChannelsPanel.disabled = false;
      }
    });
  }

  const btnRefreshTempChannels = document.getElementById('btn-refresh-tempchannels');
  if (btnRefreshTempChannels) {
    btnRefreshTempChannels.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      if (guildId) await loadTempChannelsData(guildId);
    });
  }

  // === SENTRY MUSIC (Music Player & Voice Controller Frontend) ===
  let currentMusicState = {
    active: false,
    isPlaying: false,
    isPaused: false,
    volume: 100,
    loopMode: 'off'
  };

  async function loadMusicData(guildId) {
    if (!guildId) return;

    // 1. Populate Voice Channel Selector
    const voiceSelect = document.getElementById('music-target-voice');
    if (voiceSelect && window.AppState.channels) {
      const currentVal = voiceSelect.value;
      voiceSelect.innerHTML = '<option value="">-- Seleziona Canale Vocale --</option>';

      // Type 'voice' from backend, or Discord ChannelType 2/13
      const voiceChannels = window.AppState.channels.filter(c => c.type === 'voice' || c.type === 2 || c.rawType === 2 || c.rawType === 13 || c.isVoice);
      voiceChannels.forEach(ch => {
        const opt = document.createElement('option');
        opt.value = ch.id;
        opt.textContent = `🔊 ${ch.name}`;
        if (ch.id === currentVal) opt.selected = true;
        voiceSelect.appendChild(opt);
      });
    }

    // 2. Fetch Music Status
    try {
      const res = await fetch(`/api/guilds/${guildId}/music/status`);
      if (!res.ok) return;
      const data = await res.json();
      currentMusicState = data;

      const badge = document.getElementById('music-connection-badge');
      const statusPill = document.getElementById('music-status-pill');
      const thumbImg = document.getElementById('music-now-thumb');
      const thumbPlaceholder = document.getElementById('music-thumb-placeholder');
      const titleEl = document.getElementById('music-now-title');
      const authorEl = document.getElementById('music-now-author');
      const durationEl = document.getElementById('music-meta-duration');
      const requesterEl = document.getElementById('music-meta-requester');
      const channelEl = document.getElementById('music-meta-channel');
      const playPauseBtn = document.getElementById('btn-web-music-playpause');
      const loopBtn = document.getElementById('btn-web-music-loop');
      const volSlider = document.getElementById('music-vol-slider');
      const volLabel = document.getElementById('music-vol-label');
      const queueCount = document.getElementById('music-queue-count');
      const queueContainer = document.getElementById('music-queue-container');

      if (badge) {
        if (data.voiceChannel) {
          badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Connesso a: <strong>${escapeHtml(data.voiceChannel.name)}</strong>`;
          badge.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-xs text-emerald-300';
        } else {
          badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-500"></span> Non connesso a canali vocali';
          badge.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-slate-300';
        }
      }

      if (statusPill) {
        if (data.isPlaying) {
          statusPill.textContent = '▶️ In Riproduzione';
          statusPill.className = 'text-xs px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 font-bold';
        } else if (data.isPaused) {
          statusPill.textContent = '⏸️ In Pausa';
          statusPill.className = 'text-xs px-2.5 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/80 font-bold';
        } else {
          statusPill.textContent = 'Inattivo';
          statusPill.className = 'text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-bold';
        }
      }

      if (data.currentTrack) {
        if (thumbImg && thumbPlaceholder) {
          if (data.currentTrack.thumbnail) {
            thumbImg.src = data.currentTrack.thumbnail;
            thumbImg.classList.remove('hidden');
            thumbPlaceholder.classList.add('hidden');
          } else {
            thumbImg.classList.add('hidden');
            thumbPlaceholder.classList.remove('hidden');
          }
        }

        if (titleEl) titleEl.innerHTML = `<a href="${escapeHtml(data.currentTrack.url)}" target="_blank" class="hover:text-pink-400 transition-colors">${escapeHtml(data.currentTrack.title)}</a>`;
        if (authorEl) authorEl.textContent = `Canale: ${data.currentTrack.author || 'YouTube'}`;
        if (durationEl) durationEl.textContent = `⏱️ ${data.currentTrack.duration || 'Live'}`;
        if (requesterEl) requesterEl.textContent = `👤 ${data.currentTrack.requestedBy || 'Dashboard'}`;
        if (channelEl) channelEl.textContent = `🔊 Canale: ${data.voiceChannel?.name || 'Vocale'}`;
      } else {
        if (thumbImg && thumbPlaceholder) {
          thumbImg.classList.add('hidden');
          thumbPlaceholder.classList.remove('hidden');
        }
        if (titleEl) titleEl.textContent = 'Nessun brano in riproduzione';
        if (authorEl) authorEl.innerHTML = 'Usa la barra di ricerca sottostante o il comando <code class="text-pink-400 bg-slate-900 px-1 py-0.5 rounded">/play</code>';
        if (durationEl) durationEl.textContent = '⏱️ --:--';
        if (requesterEl) requesterEl.textContent = '👤 --';
        if (channelEl) channelEl.textContent = '🔊 Canale: --';
      }

      if (playPauseBtn) {
        if (data.isPaused) {
          playPauseBtn.innerHTML = '<i data-lucide="play" class="w-3.5 h-3.5"></i> <span>Riprendi</span>';
        } else {
          playPauseBtn.innerHTML = '<i data-lucide="pause" class="w-3.5 h-3.5"></i> <span>Pausa</span>';
        }
      }

      if (loopBtn) {
        if (data.loopMode === 'track') {
          loopBtn.className = 'btn-cyber text-xs py-2 px-2.5 font-bold text-emerald-300';
          loopBtn.title = 'Loop Singolo Brano Attivo';
        } else if (data.loopMode === 'queue') {
          loopBtn.className = 'btn-cyber text-xs py-2 px-2.5 font-bold text-amber-300';
          loopBtn.title = 'Loop Intera Coda Attivo';
        } else {
          loopBtn.className = 'btn-secondary text-xs py-2 px-2.5 font-bold text-slate-400';
          loopBtn.title = 'Loop Disattivato';
        }
      }

      if (volSlider && volLabel) {
        volSlider.value = data.volume || 100;
        volLabel.textContent = `${data.volume || 100}%`;
      }

      // 3. Render Queue List
      if (queueCount) {
        queueCount.textContent = `${data.queue?.length || 0} brani in attesa`;
      }

      if (queueContainer) {
        if (data.queue && data.queue.length > 0) {
          queueContainer.innerHTML = '';
          data.queue.forEach((track, idx) => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between p-2.5 rounded-lg bg-[#0e1624] border border-slate-800/80 hover:border-pink-500/40 transition-all gap-3 text-xs';
            row.innerHTML = `
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="text-slate-500 font-mono font-bold w-5 shrink-0 text-center">${idx + 1}</span>
                <div class="min-w-0">
                  <p class="font-bold text-white truncate max-w-md">${escapeHtml(track.title)}</p>
                  <p class="text-[11px] text-slate-500 truncate">${escapeHtml(track.author || 'YouTube')} • Richiesto da ${escapeHtml(track.requestedBy || 'Utente')}</p>
                </div>
              </div>
              <span class="text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 shrink-0 font-mono">${track.duration || 'Live'}</span>
            `;
            queueContainer.appendChild(row);
          });
        } else {
          queueContainer.innerHTML = '<p class="text-xs text-slate-500 italic py-3 text-center">Nessun brano in coda al momento.</p>';
        }
      }

      if (window.lucide) lucide.createIcons();
    } catch (e) {
      console.error('[Music] Errore caricamento stato:', e);
    }
  }

  // Dashboard Music Controls Event Listeners
  const btnMusicPlayPause = document.getElementById('btn-web-music-playpause');
  if (btnMusicPlayPause) {
    btnMusicPlayPause.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      if (!guildId) return;
      const action = currentMusicState.isPaused ? 'resume' : 'pause';
      await fetch(`/api/guilds/${guildId}/music/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      await loadMusicData(guildId);
    });
  }

  const btnMusicSkip = document.getElementById('btn-web-music-skip');
  if (btnMusicSkip) {
    btnMusicSkip.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      if (!guildId) return;
      await fetch(`/api/guilds/${guildId}/music/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'skip' })
      });
      window.showToast('⏭️ Brano saltato!');
      await loadMusicData(guildId);
    });
  }

  const btnMusicStop = document.getElementById('btn-web-music-stop');
  if (btnMusicStop) {
    btnMusicStop.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      if (!guildId) return;
      await fetch(`/api/guilds/${guildId}/music/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
      });
      window.showToast('⏹️ Riproduzione fermata e disconnessione.');
      await loadMusicData(guildId);
    });
  }

  const btnMusicLoop = document.getElementById('btn-web-music-loop');
  if (btnMusicLoop) {
    btnMusicLoop.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      if (!guildId) return;
      const res = await fetch(`/api/guilds/${guildId}/music/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'loop' })
      });
      const data = await res.json();
      if (data.success) {
        const msg = data.loopMode === 'track' ? 'Loop singolo brano' : (data.loopMode === 'queue' ? 'Loop intera coda' : 'Loop disattivato');
        window.showToast(`🔁 ${msg}`);
      }
      await loadMusicData(guildId);
    });
  }

  const btnMusicShuffle = document.getElementById('btn-web-music-shuffle');
  if (btnMusicShuffle) {
    btnMusicShuffle.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      if (!guildId) return;
      await fetch(`/api/guilds/${guildId}/music/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'shuffle' })
      });
      window.showToast('🔀 Coda mescolata!');
      await loadMusicData(guildId);
    });
  }

  const musicVolSlider = document.getElementById('music-vol-slider');
  if (musicVolSlider) {
    musicVolSlider.addEventListener('input', (e) => {
      const valLabel = document.getElementById('music-vol-label');
      if (valLabel) valLabel.textContent = `${e.target.value}%`;
    });

    musicVolSlider.addEventListener('change', async (e) => {
      const guildId = window.AppState.currentGuildId;
      if (!guildId) return;
      await fetch(`/api/guilds/${guildId}/music/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'volume', value: e.target.value })
      });
    });
  }

  const btnWebMusicSearchPlay = document.getElementById('btn-web-music-search-play');
  if (btnWebMusicSearchPlay) {
    btnWebMusicSearchPlay.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      if (!guildId) return window.showToast('Seleziona prima un server Discord.', 'error');

      const voiceSelect = document.getElementById('music-target-voice');
      const voiceChannelId = voiceSelect ? voiceSelect.value : '';

      const queryInput = document.getElementById('music-search-query');
      const query = queryInput ? queryInput.value.trim() : '';

      if (!query) {
        return window.showToast('Inserisci un titolo o link da riprodurre.', 'error');
      }

      const origHtml = btnWebMusicSearchPlay.innerHTML;
      btnWebMusicSearchPlay.disabled = true;
      btnWebMusicSearchPlay.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Ricerca & Connessione...';
      if (window.lucide) lucide.createIcons();

      try {
        const res = await fetch(`/api/guilds/${guildId}/music/play`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, voiceChannelId })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          if (data.isPlaylist) {
            window.showToast(`📑 Playlist "${data.title}" aggiunta (${data.count} brani)!`);
          } else {
            window.showToast(`▶️ In riproduzione: "${data.track?.title}"!`);
          }
          if (queryInput) queryInput.value = '';
          await loadMusicData(guildId);
        } else {
          window.showToast(data.error || 'Impossibile riprodurre il brano.', 'error');
        }
      } catch (err) {
        window.showToast(err.message, 'error');
      } finally {
        btnWebMusicSearchPlay.disabled = false;
        btnWebMusicSearchPlay.innerHTML = origHtml;
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  window.initModuleToolbars = initModuleToolbars;

  // Run on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModuleToolbars);
  } else {
    initModuleToolbars();
  }

  const btnSaveAll = document.getElementById('btn-save-all');
  if (btnSaveAll) {
    btnSaveAll.addEventListener('click', () => {
      const guildId = window.AppState.currentGuildId;
      if (guildId) saveAllServerSettings(guildId);
    });
  }

  const btnSaveAllMobile = document.getElementById('btn-save-all-mobile');
  if (btnSaveAllMobile) {
    btnSaveAllMobile.addEventListener('click', () => {
      const guildId = window.AppState.currentGuildId;
      if (guildId) saveAllServerSettings(guildId);
    });
  }

  // Wispbyte Persistence & Backup Cloud Listeners
  const btnCloudSync = document.getElementById('btn-cloud-sync');
  if (btnCloudSync) {
    btnCloudSync.addEventListener('click', async () => {
      const origHtml = btnCloudSync.innerHTML;
      btnCloudSync.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Caricamento in Cloud...';
      if (window.lucide) lucide.createIcons();

      try {
        const res = await fetch('/api/system/cloud-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-client-id': window.AppState?.clientId }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          window.showToast('☁️ Database caricato e protetto sul Cloud MySQL di Wispbyte!');
        } else {
          window.showToast(data.error || 'Errore sincronizzazione Cloud MySQL.', 'error');
        }
      } catch (err) {
        window.showToast(err.message, 'error');
      } finally {
        btnCloudSync.innerHTML = origHtml;
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  const btnBackupFlush = document.getElementById('btn-backup-flush');
  if (btnBackupFlush) {
    btnBackupFlush.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      if (!guildId) return window.showToast('Seleziona prima un server.', 'error');
      const origHtml = btnBackupFlush.innerHTML;
      btnBackupFlush.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Salvataggio...';
      if (window.lucide) lucide.createIcons();

      try {
        const res = await fetch(`/api/guilds/${guildId}/backup/flush`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-client-id': window.AppState?.clientId }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          window.showToast(`💾 Database sincronizzato e salvato su disco Wispbyte!`);
        } else {
          window.showToast('Errore durante il salvataggio su disco.', 'error');
        }
      } catch (err) {
        window.showToast(err.message, 'error');
      } finally {
        btnBackupFlush.innerHTML = origHtml;
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  const btnBackupExport = document.getElementById('btn-backup-export');
  if (btnBackupExport) {
    btnBackupExport.addEventListener('click', () => {
      const guildId = window.AppState.currentGuildId;
      if (!guildId) return window.showToast('Seleziona prima un server.', 'error');
      window.open(`/api/guilds/${guildId}/backup/export`, '_blank');
      window.showToast('📥 Download del backup di configurazione avviato!');
    });
  }

  const btnExportChannelsCsv = document.getElementById('btn-export-channels-csv');
  if (btnExportChannelsCsv) {
    btnExportChannelsCsv.addEventListener('click', () => {
      const guildId = window.AppState.currentGuildId;
      if (!guildId) return window.showToast('Seleziona prima un server.', 'error');
      window.open(`/api/guilds/${guildId}/export/channels.csv`, '_blank');
      window.showToast('📥 Download del file CSV canali e categorie avviato!');
    });
  }

  const btnBackupImportTrigger = document.getElementById('btn-backup-import-trigger');
  const inputBackupImportFile = document.getElementById('input-backup-import-file');
  if (btnBackupImportTrigger && inputBackupImportFile) {
    btnBackupImportTrigger.addEventListener('click', () => inputBackupImportFile.click());
    inputBackupImportFile.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const guildId = window.AppState.currentGuildId;
      if (!guildId) return window.showToast('Seleziona prima un server.', 'error');

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const parsed = JSON.parse(evt.target.result);
          if (!confirm('Sei sicuro di voler ripristinare questa configurazione? I moduli del server verranno aggiornati con i dati del file.')) {
            inputBackupImportFile.value = '';
            return;
          }

          const res = await fetch(`/api/guilds/${guildId}/backup/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-client-id': window.AppState?.clientId },
            body: JSON.stringify(parsed)
          });
          const data = await res.json();
          if (res.ok && data.success) {
            window.showToast('✅ Configurazione ripristinata e salvata su disco con successo!');
            if (window.reloadCurrentGuildData) {
              await window.reloadCurrentGuildData(false);
            }
          } else {
            window.showToast(data.error || 'Errore durante il ripristino del backup.', 'error');
          }
        } catch (err) {
          window.showToast('Il file selezionato non è un JSON di backup valido.', 'error');
        } finally {
          inputBackupImportFile.value = '';
        }
      };
      reader.readAsText(file);
    });
  }

  // ==========================================
  // NITRO BOOST MODULE DATA & HANDLERS
  // ==========================================
  async function loadBoostData(guildId) {
    try {
      const res = await fetch(`/api/guilds/${guildId}/boost`);
      if (!res.ok) return;
      const data = await res.json();
      const config = data.config || {};
      const embed = config.embed || {};

      const enabledEl = document.getElementById('boost-enabled');
      const chanEl = document.getElementById('boost-channel');
      const msgEl = document.getElementById('boost-message');
      const titleEl = document.getElementById('boost-embed-title');
      const colorEl = document.getElementById('boost-embed-color');
      const pickerEl = document.getElementById('boost-color-picker');
      const descEl = document.getElementById('boost-embed-desc');
      const imageEl = document.getElementById('boost-embed-image');
      const thumbEl = document.getElementById('boost-embed-thumb');
      const badgeEl = document.getElementById('boost-status-badge');

      if (enabledEl) enabledEl.checked = Boolean(config.enabled !== false && config.enabled !== 0);
      if (chanEl) {
        chanEl.value = config.channel_id || '';
        chanEl.dataset.savedValue = config.channel_id || '';
      }
      if (msgEl) msgEl.value = config.message || 'Grazie per il boost {user.mention}! 🚀';
      if (titleEl) titleEl.value = embed.title || '🚀 {server.name} è stato Potenziato!';
      const color = embed.color || '#f47fff';
      if (colorEl) colorEl.value = color;
      if (pickerEl) pickerEl.value = (color.startsWith('#') && color.length === 7) ? color : '#f47fff';
      if (descEl) descEl.value = embed.description || 'Un immenso ringraziamento a {user.mention} per aver potenziato il server!\n\nGrazie al tuo supporto, **{server.name}** ha raggiunto **{server.boost_count}** boost (Livello {server.boost_tier})! ✨💖';
      if (imageEl) imageEl.value = embed.image || '';
      if (thumbEl) thumbEl.value = embed.thumbnail || '';

      if (badgeEl) {
        const count = data.boostCount || 0;
        const tier = data.boostTier || 0;
        badgeEl.textContent = `🚀 ${count} Boost (Livello ${tier})`;
      }
    } catch (e) {
      console.error('Error loading Boost data:', e);
    }
  }
  window.loadBoostData = loadBoostData;

  // Boost color picker sync
  const boostColorPicker = document.getElementById('boost-color-picker');
  const boostEmbedColor = document.getElementById('boost-embed-color');
  if (boostColorPicker && boostEmbedColor) {
    boostColorPicker.addEventListener('input', () => {
      boostEmbedColor.value = boostColorPicker.value;
    });
    boostEmbedColor.addEventListener('input', () => {
      if (boostEmbedColor.value.startsWith('#') && boostEmbedColor.value.length === 7) {
        boostColorPicker.value = boostEmbedColor.value;
      }
    });
  }

  // Save Boost Config
  const btnSaveBoost = document.getElementById('btn-save-boost');
  if (btnSaveBoost) {
    btnSaveBoost.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      if (!guildId) return;

      const payload = {
        enabled: document.getElementById('boost-enabled')?.checked,
        channel_id: document.getElementById('boost-channel')?.value || null,
        message: document.getElementById('boost-message')?.value || '',
        embed: {
          title: document.getElementById('boost-embed-title')?.value || null,
          color: document.getElementById('boost-embed-color')?.value || '#f47fff',
          description: document.getElementById('boost-embed-desc')?.value || null,
          image: document.getElementById('boost-embed-image')?.value || null,
          thumbnail: document.getElementById('boost-embed-thumb')?.value || null
        }
      };

      try {
        btnSaveBoost.disabled = true;
        const res = await fetch(`/api/guilds/${guildId}/boost`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          window.showToast('Impostazioni Boost Nitro salvate con successo!');
          await loadBoostData(guildId);
        } else {
          window.showToast('Errore nel salvataggio del modulo Boost.', 'error');
        }
      } catch (err) {
        window.showToast('Errore di connessione durante il salvataggio.', 'error');
      } finally {
        btnSaveBoost.disabled = false;
      }
    });
  }

  // Test Boost Message
  const btnTestBoost = document.getElementById('btn-test-boost');
  if (btnTestBoost) {
    btnTestBoost.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      if (!guildId) return;

      const targetChannel = document.getElementById('boost-channel')?.value || null;

      try {
        btnTestBoost.disabled = true;
        const res = await fetch(`/api/guilds/${guildId}/boost/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel_id: targetChannel })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          window.showToast('Embed di prova Boost inviato con successo nel canale!');
        } else {
          window.showToast(data.error || 'Impossibile inviare il messaggio di prova.', 'error');
        }
      } catch (err) {
        window.showToast('Errore durante l\'invio del test.', 'error');
      } finally {
        btnTestBoost.disabled = false;
      }
    });
  }
})();

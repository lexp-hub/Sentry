// Global Fetch Interceptor for Anti-Adblock & Brave-Shields localStorage authentication
const originalFetch = window.fetch;
window.fetch = async function(url, options = {}) {
  options = options || {};
  options.headers = options.headers || {};
  options.credentials = options.credentials || 'include';
  
  const token = localStorage.getItem('cavaliere_auth_token');
  if (token) {
    if (options.headers instanceof Headers) {
      if (!options.headers.has('Authorization')) {
        options.headers.set('Authorization', `Bearer ${token}`);
      }
    } else if (typeof options.headers === 'object') {
      if (!options.headers['Authorization'] && !options.headers['authorization']) {
        options.headers['Authorization'] = `Bearer ${token}`;
      }
    }
  }

  return originalFetch.call(this, url, options);
};

window.AppState = {
  currentGuildId: null,
  currentGuildData: null,
  user: null,
  guilds: [],
  channels: [],
  roles: []
};

window.showToast = function(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icon = type === 'success' ? 'check-circle' : 'alert-circle';
  toast.innerHTML = `<i data-lucide="${icon}" class="w-5 h-5 ${type === 'success' ? 'text-emerald-400' : 'text-rose-400'}"></i><span>${message}</span>`;
  
  container.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
};

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const incomingAuthToken = urlParams.get('auth_token');

  if (incomingAuthToken) {
    localStorage.setItem('cavaliere_auth_token', incomingAuthToken);
    const cleanUrl = window.location.pathname + (urlParams.get('guild') ? `?guild=${urlParams.get('guild')}` : '');
    window.history.replaceState({}, document.title, cleanUrl);
  }

  window.AppState.clientId = window.AppState.clientId || 'client_' + Math.random().toString(36).substring(2, 11);

  initTabNavigation();
  initMobileDrawer();
  initWebSocket();
  await loadUserData();
  await loadGuilds();

  const btnSyncLive = document.getElementById('btn-sync-live');
  if (btnSyncLive) {
    btnSyncLive.addEventListener('click', () => {
      window.reloadCurrentGuildData(false);
    });
  }

  const btnReloadModules = document.getElementById('btn-reload-modules');
  if (btnReloadModules) {
    btnReloadModules.addEventListener('click', () => {
      window.forceReloadModulesAndCache(false);
    });
  }

  const btnReloadModulesMobile = document.getElementById('btn-reload-modules-mobile');
  if (btnReloadModulesMobile) {
    btnReloadModulesMobile.addEventListener('click', () => {
      window.forceReloadModulesAndCache(false);
    });
  }
});

function initMobileDrawer() {
  const btnToggle = document.getElementById('btn-toggle-drawer');
  const drawer = document.getElementById('sidebar-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  const btnCloseDrawer = document.getElementById('btn-close-drawer');
  const btnSaveMobile = document.getElementById('btn-save-all-mobile');
  const btnSaveDesktop = document.getElementById('btn-save-all');

  function toggleDrawer(open) {
    if (!drawer || !backdrop) return;
    if (open) {
      drawer.classList.remove('-translate-x-full');
      backdrop.classList.remove('hidden');
    } else {
      drawer.classList.add('-translate-x-full');
      backdrop.classList.add('hidden');
    }
  }

  if (btnToggle) btnToggle.addEventListener('click', () => toggleDrawer(true));
  if (btnCloseDrawer) btnCloseDrawer.addEventListener('click', () => toggleDrawer(false));
  if (backdrop) backdrop.addEventListener('click', () => toggleDrawer(false));

  if (btnSaveMobile && btnSaveDesktop) {
    btnSaveMobile.addEventListener('click', () => btnSaveDesktop.click());
  }

  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (window.innerWidth < 768) {
        toggleDrawer(false);
      }
    });
  });
}

function initTabNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active', 'bg-white/10', 'text-white'));
      tab.classList.add('active', 'bg-white/10', 'text-white');

      const targetId = tab.getAttribute('data-tab');
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
        content.classList.remove('block');
      });

      const targetContent = document.getElementById(targetId);
      if (targetContent) {
        targetContent.classList.remove('hidden');
        targetContent.classList.add('block');
      }

      if (targetId === 'tab-welcomer' && window.updateWelcomerPreview) {
        window.updateWelcomerPreview();
      }
      if (targetId === 'tab-embeds' && window.updateEmbedPreview) {
        window.updateEmbedPreview();
      }

      if (window.populateDropdowns) {
        window.populateDropdowns();
      }

      if (window.lucide) lucide.createIcons();
    });
  });
}

let activeWs = null;
let wsReconnectTimer = null;
let wsPingInterval = null;

function initWebSocket() {
  if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
  if (wsPingInterval) clearInterval(wsPingInterval);

  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    activeWs = ws;

    ws.onopen = () => {
      console.log('[WebSocket] Connesso al server di sincronizzazione Sentry.');
      const statusEl = document.getElementById('bot-ws-status');
      if (statusEl && !statusEl.textContent.includes('Modalità Demo')) {
        statusEl.textContent = 'Bot Online • Live Sync Attivo';
      }
      if (window.AppState.currentGuildId) {
        ws.send(JSON.stringify({ type: 'SUBSCRIBE_GUILD', guildId: window.AppState.currentGuildId }));
      }
      wsPingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'PING' }));
        }
      }, 20000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'INIT') {
          const statusEl = document.getElementById('bot-ws-status');
          if (statusEl) {
            statusEl.textContent = data.botOnline ? 'Bot Online • Live Sync Attivo' : 'Modalità Demo Attiva';
          }
        } else if (data.type === 'GUILD_UPDATED') {
          if (data.senderClientId && data.senderClientId === window.AppState.clientId) {
            // Ignora l'evento di sync generato da noi stessi per evitare il reset degli input
            return;
          }
          if (data.guildId === window.AppState.currentGuildId) {
            console.log(`[WebSocket] Ricevuto aggiornamento in tempo reale per modulo "${data.module}" da ${data.updatedBy}`);
            window.reloadCurrentGuildData(true);
            window.showToast(`⚡ Sincronizzazione Live: modulo "${data.module}" aggiornato da ${data.updatedBy}`);
          }
        }
      } catch (e) {}
    };

    ws.onclose = () => {
      clearInterval(wsPingInterval);
      wsReconnectTimer = setTimeout(() => {
        console.log('[WebSocket] Tentativo di riconnessione automatica...');
        initWebSocket();
      }, 3000);
    };

    ws.onerror = () => {
      try { ws.close(); } catch (e) {}
    };
  } catch (e) {
    wsReconnectTimer = setTimeout(initWebSocket, 5000);
  }
}

async function loadUserData() {
  try {
    const res = await fetch('/auth/me');
    if (res.ok) {
      const user = await res.json();
      window.AppState.user = user;

      const avatarEl = document.getElementById('user-avatar');
      const nameEl = document.getElementById('user-name');
      if (avatarEl && user.avatar) avatarEl.src = user.avatar;
      if (nameEl && user.username) nameEl.textContent = user.username;
    } else if (res.status === 401) {
      localStorage.removeItem('cavaliere_auth_token');
      window.location.href = '/auth/login';
    }
  } catch (e) {
    console.error('Error fetching user info:', e);
  }
}

async function loadGuilds() {
  try {
    const res = await fetch('/api/guilds');
    if (res.status === 401) {
      localStorage.removeItem('cavaliere_auth_token');
      window.location.href = '/auth/login';
      return;
    }
    if (!res.ok) return;

    const guilds = await res.json();
    window.AppState.guilds = guilds;

    const selector = document.getElementById('server-selector');
    if (!selector) return;

    selector.innerHTML = '';
    if (guilds.length === 0) {
      selector.innerHTML = '<option value="">Nessun Server Trovato</option>';
      window.showToast('Nessun server trovato in cui possiedi i permessi di Moderatore/Amministratore.', 'error');
      return;
    }

    guilds.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = `${g.name} (${g.memberCount} membri)`;
      selector.appendChild(opt);
    });

    selector.addEventListener('change', (e) => switchGuild(e.target.value));

    const savedGuild = localStorage.getItem('cavaliere_last_guild');
    const defaultGuild = (savedGuild && guilds.some(g => g.id === savedGuild)) ? savedGuild : guilds[0].id;
    selector.value = defaultGuild;
    await switchGuild(defaultGuild);
  } catch (e) {
    console.error('Error loading guilds:', e);
  }
}

window.reloadCurrentGuildData = async function(silent = false) {
  const guildId = window.AppState.currentGuildId;
  if (!guildId) return;

  const syncIcon = document.getElementById('icon-sync-live');
  if (syncIcon) syncIcon.classList.add('animate-spin');

  try {
    const res = await fetch(`/api/guilds/${guildId}`);
    if (!res.ok) return;

    const guildData = await res.json();
    window.AppState.currentGuildData = guildData;
    window.AppState.channels = guildData.channels || [];
    window.AppState.roles = guildData.roles || [];
    window.AppState.members = guildData.members || [];
    window.AppState.settings = guildData.settings || {};

    const logEl = document.getElementById('gen-log-channel');
    if (logEl && guildData.settings?.log_channel_id) {
      logEl.dataset.savedValue = guildData.settings.log_channel_id;
      logEl.value = guildData.settings.log_channel_id;
    }
    const prefixEl = document.getElementById('gen-prefix');
    if (prefixEl && guildData.settings?.prefix) {
      prefixEl.value = guildData.settings.prefix;
    }

    const membersEl = document.getElementById('ov-members');
    if (membersEl) membersEl.textContent = (guildData.memberCount || 0).toLocaleString();

    populateDropdowns(guildData.channels, guildData.roles, guildData.members);

    if (window.loadModuleData) {
      await window.loadModuleData(guildId);
    }
    if (window.loadEmbedBuilderData) {
      await window.loadEmbedBuilderData(guildId);
    }
    if (window.loadWelcomerData) {
      await window.loadWelcomerData(guildId);
    }
    if (window.loadBoostData) {
      await window.loadBoostData(guildId);
    }

    if (!silent) {
      window.showToast('✅ Dati sincronizzati con successo dal database!');
    }
  } catch (err) {
    console.error('[Sync] Errore durante la sincronizzazione:', err);
    if (!silent) window.showToast('Errore durante la sincronizzazione.', 'error');
  } finally {
    if (syncIcon) syncIcon.classList.remove('animate-spin');
  }
};

window.forceReloadModulesAndCache = async function(hardReload = false) {
  const iconDesktop = document.getElementById('icon-reload-modules');
  const iconMobile = document.querySelector('#btn-reload-modules-mobile i');
  if (iconDesktop) iconDesktop.classList.add('animate-spin');
  if (iconMobile) iconMobile.classList.add('animate-spin');

  try {
    // 1. Clear caches API if supported by browser
    if ('caches' in window) {
      try {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map(key => caches.delete(key)));
      } catch (e) {}
    }

    // 2. Clear transient session storage (preserve auth token and selected guild)
    try {
      const savedAuth = localStorage.getItem('cavaliere_auth_token');
      const savedGuild = localStorage.getItem('cavaliere_last_guild');
      sessionStorage.clear();
      if (savedAuth) localStorage.setItem('cavaliere_auth_token', savedAuth);
      if (savedGuild) localStorage.setItem('cavaliere_last_guild', savedGuild);
    } catch (e) {}

    const guildId = window.AppState.currentGuildId;
    if (!guildId) {
      await loadGuilds();
      window.showToast('🔄 Lista server e cache ricaricate!');
      return;
    }

    // 3. Force re-fetch guild with cache-busting query parameter and no-cache header
    const cacheBuster = `_t=${Date.now()}&_rnd=${Math.random().toString(36).substring(7)}`;
    const res = await fetch(`/api/guilds/${guildId}?${cacheBuster}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });

    if (res.ok) {
      const guildData = await res.json();
      window.AppState.currentGuildData = guildData;
      window.AppState.channels = guildData.channels || [];
      window.AppState.roles = guildData.roles || [];
      window.AppState.members = guildData.members || [];
      window.AppState.settings = guildData.settings || {};

      const logEl = document.getElementById('gen-log-channel');
      if (logEl && guildData.settings?.log_channel_id) {
        logEl.dataset.savedValue = guildData.settings.log_channel_id;
        logEl.value = guildData.settings.log_channel_id;
      }
      const prefixEl = document.getElementById('gen-prefix');
      if (prefixEl && guildData.settings?.prefix) {
        prefixEl.value = guildData.settings.prefix;
      }

      const membersEl = document.getElementById('ov-members');
      if (membersEl) membersEl.textContent = (guildData.memberCount || 0).toLocaleString();

      populateDropdowns(guildData.channels, guildData.roles, guildData.members);

      // Force reload all sub-module data with cache-busting
      if (window.loadModuleData) {
        await window.loadModuleData(guildId, true);
      }
      if (window.loadEmbedBuilderData) {
        await window.loadEmbedBuilderData(guildId);
      }
      if (window.loadWelcomerData) {
        await window.loadWelcomerData(guildId);
      }
      if (window.loadBoostData) {
        await window.loadBoostData(guildId);
      }
      if (window.loadCloudStatus) {
        await window.loadCloudStatus();
      }

      window.showToast('🔄 Moduli e cache ricaricati con successo!');
    } else {
      window.showToast('Errore durante la risposta dal server.', 'error');
    }
  } catch (err) {
    console.error('[ReloadModules] Errore:', err);
    window.showToast('Errore durante la ricarica dei moduli: ' + err.message, 'error');
  } finally {
    if (iconDesktop) iconDesktop.classList.remove('animate-spin');
    if (iconMobile) iconMobile.classList.remove('animate-spin');
    if (window.lucide) lucide.createIcons();
  }
};

window.switchGuild = async function(guildId) {
  if (!guildId) return;
  window.AppState.currentGuildId = guildId;
  localStorage.setItem('cavaliere_last_guild', guildId);

  if (activeWs && activeWs.readyState === WebSocket.OPEN) {
    activeWs.send(JSON.stringify({ type: 'SUBSCRIBE_GUILD', guildId }));
  }

  try {
    const res = await fetch(`/api/guilds/${guildId}`);
    if (!res.ok) return;

    const guildData = await res.json();
    window.AppState.currentGuildData = guildData;
    window.AppState.channels = guildData.channels || [];
    window.AppState.roles = guildData.roles || [];
    window.AppState.members = guildData.members || [];
    window.AppState.settings = guildData.settings || {};

    const logEl = document.getElementById('gen-log-channel');
    if (logEl && guildData.settings?.log_channel_id) {
      logEl.dataset.savedValue = guildData.settings.log_channel_id;
      logEl.value = guildData.settings.log_channel_id;
    }
    const prefixEl = document.getElementById('gen-prefix');
    if (prefixEl && guildData.settings?.prefix) {
      prefixEl.value = guildData.settings.prefix;
    }

    const nameEl = document.getElementById('current-guild-name');
    if (nameEl) {
      nameEl.innerHTML = `<i data-lucide="shield" class="w-6 h-6 text-red-600 inline-block mr-2 align-middle"></i><span>${guildData.name}</span>`;
      if (window.lucide) lucide.createIcons();
    }

    const membersEl = document.getElementById('ov-members');
    if (membersEl) membersEl.textContent = (guildData.memberCount || 0).toLocaleString();

    populateDropdowns(guildData.channels, guildData.roles, guildData.members);

    if (window.loadEmbedBuilderData) {
      window.loadEmbedBuilderData(guildId);
    } else if (window.updateEmbedPreview) {
      window.updateEmbedPreview();
    }

    if (window.loadWelcomerData) {
      window.loadWelcomerData(guildId);
    } else if (window.updateWelcomerPreview) {
      window.updateWelcomerPreview();
    }

    if (window.loadModuleData) {
      window.loadModuleData(guildId);
    }

    if (window.loadTempChannelsData) {
      window.loadTempChannelsData(guildId);
    }

    if (window.initModuleToolbars) {
      window.initModuleToolbars();
    }

    if (window.updateUserCoinsDisplay) {
      await window.updateUserCoinsDisplay(guildId);
    }

    lucide.createIcons();
  } catch (e) {
    console.error('Error switching guild:', e);
  }
};

window.updateUserCoinsDisplay = async function(guildId) {
  if (!guildId) return;
  try {
    const res = await fetch(`/api/guilds/${guildId}/my-profile`);
    if (res.ok) {
      const data = await res.json();
      const coins = (data.profile?.coins !== undefined ? data.profile.coins : 100).toLocaleString();
      const sidebarCoinsEl = document.getElementById('user-sidebar-coins');
      const headerCoinsEl = document.getElementById('user-header-coins');
      if (sidebarCoinsEl) sidebarCoinsEl.textContent = coins;
      if (headerCoinsEl) headerCoinsEl.textContent = `${coins} 🪙`;
    }
  } catch (e) {
    console.error('Error updating user coins display:', e);
  }
};

window.populateDropdowns = function populateDropdowns(channels, roles, members) {
  const allChannels = (channels && channels.length) ? channels : (window.AppState?.channels || []);
  const allRoles = (roles && roles.length) ? roles : (window.AppState?.roles || []);
  const allMembers = (members && members.length) ? members : (window.AppState?.members || []);

  const textChannels = allChannels.filter(c => (c.type === 'text' || c.type === 0 || c.type === 5) && c.type !== 'voice' && c.rawType !== 2 && c.rawType !== 13);
  const voiceChannels = allChannels.filter(c => c.type === 'voice' || c.rawType === 2 || c.rawType === 13 || c.isVoice);
  const categories = allChannels.filter(c => c.type === 'category' || c.type === 4);

  // 1. Text Channels Selectors
  const channelSelectIds = [
    'gen-log-channel', 'part-channel', 'embed-channel', 'rr-channel',
    'wel-channel', 'wel-leave-channel', 'ar-chan-select', 'tk-channel', 'tk-log-channel',
    'ga-channel', 'lvl-channel', 'cnt-channel', 'pres-channel', 'setup-channel',
    'fish-channel', 'mg-general-channel', 'mg-bj-channel', 'mg-slot-channel',
    'tc-panel-channel', 'boost-channel'
  ];

  channelSelectIds.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;

    const currentVal = select.value || select.dataset.savedValue || (id === 'gen-log-channel' ? window.AppState?.settings?.log_channel_id : null);
    select.innerHTML = '<option value="">-- Seleziona un Canale --</option>';

    textChannels.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `# ${c.name}`;
      select.appendChild(opt);
    });

    if (currentVal && textChannels.some(c => c.id === currentVal)) {
      select.value = currentVal;
      select.dataset.savedValue = currentVal;
    }

    if (!select.dataset.changeBound) {
      select.dataset.changeBound = 'true';
      select.addEventListener('change', () => {
        select.dataset.savedValue = select.value;
        if (id === 'gen-log-channel' && window.AppState?.settings) {
          window.AppState.settings.log_channel_id = select.value;
        }
      });
    }
  });

  // 2. Voice Channels Selectors
  ['tc-gen-voice-channel', 'music-target-voice'].forEach(id => {
    const vSelect = document.getElementById(id);
    if (!vSelect) return;

    const currentVal = vSelect.value || vSelect.dataset.savedValue;
    vSelect.innerHTML = '<option value="">-- Seleziona un Canale Vocale --</option>';

    voiceChannels.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `🔊 ${c.name}`;
      vSelect.appendChild(opt);
    });

    if (currentVal && voiceChannels.some(c => c.id === currentVal)) {
      vSelect.value = currentVal;
      vSelect.dataset.savedValue = currentVal;
    }

    if (!vSelect.dataset.changeBound) {
      vSelect.dataset.changeBound = 'true';
      vSelect.addEventListener('change', () => {
        vSelect.dataset.savedValue = vSelect.value;
      });
    }
  });

  // 3. Category Selectors
  const categorySelectIds = ['tk-category', 'tc-category'];
  categorySelectIds.forEach(id => {
    const catSelect = document.getElementById(id);
    if (!catSelect) return;

    const currentCat = catSelect.value || catSelect.dataset.savedValue;
    catSelect.innerHTML = '<option value="">-- Seleziona Categoria --</option>';

    categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `📁 ${c.name}`;
      catSelect.appendChild(opt);
    });

    if (currentCat && categories.some(c => c.id === currentCat)) {
      catSelect.value = currentCat;
      catSelect.dataset.savedValue = currentCat;
    }

    if (!catSelect.dataset.changeBound) {
      catSelect.dataset.changeBound = 'true';
      catSelect.addEventListener('change', () => {
        catSelect.dataset.savedValue = catSelect.value;
      });
    }
  });

  // 4. Role Selectors
  const roleSelectIds = [
    'part-ping-role', 'part-manager-role', 'rr-role',
    'wel-autorole-user', 'wel-autorole-bot', 'tk-support-role',
    'pres-role', 'setup-role'
  ];
  roleSelectIds.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;

    const currentVal = select.value || select.dataset.savedValue;
    select.innerHTML = '<option value="">-- Nessun Ruolo --</option>';

    allRoles.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `@ ${r.name}`;
      select.appendChild(opt);
    });

    if (currentVal && allRoles.some(r => r.id === currentVal)) {
      select.value = currentVal;
      select.dataset.savedValue = currentVal;
    }

    if (!select.dataset.changeBound) {
      select.dataset.changeBound = 'true';
      select.addEventListener('change', () => {
        select.dataset.savedValue = select.value;
      });
    }
  });

  // 5. Member Dropdowns (Treasury, etc.)
  const memberSelectIds = ['coin-target-user'];
  memberSelectIds.forEach(id => {
    const memberSelect = document.getElementById(id);
    if (!memberSelect) return;

    const currentMember = memberSelect.value || memberSelect.dataset.savedValue;
    memberSelect.innerHTML = '<option value="">-- Seleziona un Membro --</option>';
    allMembers.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      const coinText = m.coins !== undefined ? ` — ${Number(m.coins).toLocaleString()} 🪙` : '';
      opt.textContent = `${m.displayName || m.name} (@${m.name})${coinText}`;
      memberSelect.appendChild(opt);
    });

    if (currentMember && allMembers.some(m => m.id === currentMember)) {
      memberSelect.value = currentMember;
      memberSelect.dataset.savedValue = currentMember;
    }

    if (!memberSelect.dataset.changeBound) {
      memberSelect.dataset.changeBound = 'true';
      memberSelect.addEventListener('change', () => {
        memberSelect.dataset.savedValue = memberSelect.value;
      });
    }
  });
};

function populateDropdowns(channels, roles, members) {
  return window.populateDropdowns(channels, roles, members);
}

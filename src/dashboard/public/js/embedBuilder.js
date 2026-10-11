
(function () {
  let fields = [];

  const colorInput = document.getElementById('embed-color');
  const colorHexInput = document.getElementById('embed-color-hex');
  const authorNameInput = document.getElementById('embed-author-name');
  const authorIconInput = document.getElementById('embed-author-icon');
  const titleInput = document.getElementById('embed-title');
  const titleUrlInput = document.getElementById('embed-title-url');
  const descInput = document.getElementById('embed-description');
  const imageInput = document.getElementById('embed-image-url');
  const thumbInput = document.getElementById('embed-thumb-url');
  const footerTextInput = document.getElementById('embed-footer-text');
  const footerIconInput = document.getElementById('embed-footer-icon');

  const prevEmbedBox = document.getElementById('preview-embed-box');
  const prevAuthor = document.getElementById('prev-author');
  const prevAuthorName = document.getElementById('prev-author-name');
  const prevAuthorIcon = document.getElementById('prev-author-icon');
  const prevTitle = document.getElementById('prev-title');
  const prevDesc = document.getElementById('prev-desc');
  const prevFields = document.getElementById('prev-fields');
  const prevImage = document.getElementById('prev-image');
  const prevThumb = document.getElementById('prev-thumb');
  const prevFooter = document.getElementById('prev-footer');
  const prevFooterText = document.getElementById('prev-footer-text');
  const prevFooterIcon = document.getElementById('prev-footer-icon');

  const channelSearchInput = document.getElementById('embed-channel-search');
  const channelSelect = document.getElementById('embed-channel');

  const savedTemplatesContainer = document.getElementById('saved-templates-container');
  const btnSaveAsTemplate = document.getElementById('btn-save-as-template');
  const btnSaveTemplateTop = document.getElementById('btn-save-template');
  const btnResetEmbed = document.getElementById('btn-reset-embed');

  /**
   * Comprehensive Discord Markdown Parser
   */
  function parseDiscordMarkdown(rawText) {
    if (!rawText) return '';

    const channels = window.AppState?.channels || [];
    const roles = window.AppState?.roles || [];

    const channelMap = new Map();
    channels.forEach(c => channelMap.set(String(c.id), c.name));

    const roleMap = new Map();
    roles.forEach(r => roleMap.set(String(r.id), r.name));

    // 1. Temporarily protect code blocks
    const codeBlocks = [];
    let text = rawText.replace(/```(?:([a-z0-9_+-]+)\n)?([\s\S]*?)```/gi, (match, lang, code) => {
      const id = `___CODEBLOCK_${codeBlocks.length}___`;
      const escapedCode = (code || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      codeBlocks.push(`<pre class="bg-black/60 p-2.5 rounded-lg text-xs font-mono text-emerald-300 my-1.5 overflow-x-auto border border-white/10"><code>${escapedCode}</code></pre>`);
      return id;
    });

    // 2. Protect inline code
    const inlineCodes = [];
    text = text.replace(/`([^`\n]+)`/g, (match, code) => {
      const id = `___INLINECODE_${inlineCodes.length}___`;
      const escaped = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      inlineCodes.push(`<code class="bg-black/40 px-1.5 py-0.5 rounded text-amber-300 font-mono text-xs border border-white/10">${escaped}</code>`);
      return id;
    });

    // 3. Escape HTML
    text = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const guildName = window.AppState?.currentGuildData?.name || 'Sentry Realm';

    // 3.1 Resolve Welcomer & Dynamic Placeholders
    text = text
      .replace(/{user\.mention}/g, '<span class="discord-mention-pill user">@NuovoMembro</span>')
      .replace(/{user}/g, 'NuovoMembro')
      .replace(/{user\.name}/g, 'NuovoMembro')
      .replace(/{user\.tag}/g, 'NuovoMembro#0000')
      .replace(/{user\.id}/g, '123456789012345678')
      .replace(/{server\.name}/g, guildName)
      .replace(/{server\.memberCount}/g, '128')
      .replace(/{memberCount}/g, '128')
      .replace(/{count}/g, '128');

    // 4. Resolve Discord Channel Mentions: &lt;#ID&gt;
    text = text.replace(/&lt;#([0-9]{15,22})&gt;/g, (match, id) => {
      const name = channelMap.get(id) || 'canale';
      return `<span class="discord-mention-pill channel" title="ID: ${id}"><svg class="w-3 h-3 inline mr-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line></svg>${name}</span>`;
    });

    // 5. Resolve Discord Role Mentions: &lt;@&amp;ID&gt;
    text = text.replace(/&lt;@&amp;([0-9]{15,22})&gt;/g, (match, id) => {
      const name = roleMap.get(id) || 'ruolo';
      return `<span class="discord-mention-pill role" title="ID: ${id}">@${name}</span>`;
    });

    // 6. Resolve Discord User Mentions: &lt;@!?ID&gt;
    text = text.replace(/&lt;@!?([0-9]{15,22})&gt;/g, () => {
      return `<span class="discord-mention-pill user">@NuovoCavaliere</span>`;
    });

    // 7. Bold Italic (***text***)
    text = text.replace(/\*\*\*([\s\S]*?)\*\*\*/g, '<strong class="font-bold text-white"><em class="italic">$1</em></strong>');

    // 8. Bold (**text**) - High contrast white and heavy weight
    text = text.replace(/\*\*([\s\S]*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>');

    // 9. Underline (__text__)
    text = text.replace(/__([\s\S]*?)__/g, '<u class="underline decoration-slate-300">$1</u>');

    // 10. Italic (*text* or _text_)
    text = text.replace(/\*([^\*\n]+)\*/g, '<em class="italic">$1</em>');
    text = text.replace(/_([^_\n]+)_/g, '<em class="italic">$1</em>');

    // 11. Strikethrough (~~text~~)
    text = text.replace(/~~([\s\S]*?)~~/g, '<del class="line-through text-slate-400 opacity-75">$1</del>');

    // 12. Blockquotes (>>> for multi-line or > for single-line)
    text = text.replace(/^&gt;&gt;&gt;\s*([\s\S]*)/gm, '<blockquote class="border-l-4 border-slate-500 pl-2.5 my-1 text-slate-300 italic">$1</blockquote>');
    text = text.replace(/^&gt;\s*(.*)/gm, '<blockquote class="border-l-4 border-slate-500 pl-2.5 my-0.5 text-slate-300 italic">$1</blockquote>');

    // 13. Subtext (-# text)
    text = text.replace(/^-#\s*(.*)/gm, '<small class="text-[11px] text-slate-400 block">$1</small>');

    // 14. Headers (# H1, ## H2, ### H3)
    text = text.replace(/^### (.*)/gm, '<h3 class="text-sm font-bold text-white mt-1 mb-0.5 font-montserrat">$1</h3>');
    text = text.replace(/^## (.*)/gm, '<h2 class="text-base font-bold text-white mt-1.5 mb-0.5 font-montserrat">$1</h2>');
    text = text.replace(/^# (.*)/gm, '<h1 class="text-lg font-bold text-white mt-2 mb-1 font-montserrat">$1</h1>');

    // 15. Bullet lists (- item or * item)
    text = text.replace(/^[*-] (.*)/gm, '<div class="flex items-start gap-2 ml-2"><span class="text-slate-400">•</span><span>$1</span></div>');

    // 16. Masked Links [text](url)
    text = text.replace(/\[(.*?)\]\((https?:\/\/[^\s\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-sky-400 hover:underline cursor-pointer">$1</a>');

    // 17. Restore Codeblocks & Inline Code
    inlineCodes.forEach((html, i) => {
      text = text.replace(`___INLINECODE_${i}___`, html);
    });
    codeBlocks.forEach((html, i) => {
      text = text.replace(`___CODEBLOCK_${i}___`, html);
    });

    // 18. Line Breaks
    text = text.replace(/\n/g, '<br>');

    return text;
  }

  window.parseDiscordMarkdown = parseDiscordMarkdown;

  /**
   * Helper: Insert text into active textarea at cursor
   */
  function insertTextAtCursor(textarea, beforeText, afterText = '') {
    if (!textarea) return;
    textarea.focus();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    const replacement = beforeText + selected + afterText;

    textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
    textarea.selectionStart = start + beforeText.length;
    textarea.selectionEnd = start + beforeText.length + selected.length;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  window.insertTextAtCursor = insertTextAtCursor;

  /**
   * Global Universal Markdown Toolbar Generator
   */
  window.setupMarkdownToolbar = function (containerId, textareaId) {
    const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    const textarea = typeof textareaId === 'string' ? document.getElementById(textareaId) : textareaId;
    if (!container || !textarea) return;

    container.innerHTML = `
      <div class="flex flex-wrap items-center gap-1">
        <button type="button" class="btn-fmt-b px-2 py-0.5 text-[11px] font-bold rounded bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm transition-colors" title="Grassetto: **testo**">
          <b>B</b>
        </button>
        <button type="button" class="btn-fmt-i px-2 py-0.5 text-[11px] italic rounded bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm transition-colors" title="Corsivo: *testo*">
          <i>I</i>
        </button>
        <button type="button" class="btn-fmt-s px-2 py-0.5 text-[11px] line-through rounded bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm transition-colors" title="Barrato: ~~testo~~">
          S
        </button>
        <button type="button" class="btn-fmt-c px-2 py-0.5 text-[11px] font-mono rounded bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm transition-colors" title="Codice Inline: \`codice\`">
          &lt;/&gt;
        </button>
        <button type="button" class="btn-fmt-cb px-2 py-0.5 text-[11px] font-mono rounded bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm transition-colors" title="Blocco Codice: \`\`\`...\`\`\`">
          { }
        </button>
        <button type="button" class="btn-fmt-q px-2 py-0.5 text-[11px] rounded bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm transition-colors" title="Citazione: > testo">
          &gt; Quote
        </button>
        <button type="button" class="btn-fmt-l px-2 py-0.5 text-[11px] rounded bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm transition-colors" title="Link Mascherato: [titolo](url)">
          🔗 Link
        </button>

        <!-- Searchable Channel Inserter -->
        <div class="relative inline-block text-left">
          <button type="button" class="btn-open-ch-pick px-2.5 py-0.5 text-[11px] font-bold rounded bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/60 shadow-sm flex items-center gap-1 transition-colors" title="Cerca e inserisci un canale">
            <span class="text-red-400 font-extrabold text-xs">#</span> Inserisci Canale
          </button>
          <div class="ch-pick-dropdown hidden absolute right-0 mt-1 w-64 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl z-50 p-2 space-y-2">
            <input type="text" class="ch-pick-search form-input text-xs py-1 px-2" placeholder="🔍 Cerca canale...">
            <div class="ch-pick-list max-h-48 overflow-y-auto space-y-0.5 text-xs"></div>
          </div>
        </div>

        <!-- Searchable Role Inserter -->
        <div class="relative inline-block text-left">
          <button type="button" class="btn-open-role-pick px-2.5 py-0.5 text-[11px] font-bold rounded bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm flex items-center gap-1 transition-colors" title="Cerca e inserisci un ruolo">
            <span class="text-slate-400 font-extrabold text-xs">@</span> Ruolo
          </button>
          <div class="role-pick-dropdown hidden absolute right-0 mt-1 w-64 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl z-50 p-2 space-y-2">
            <input type="text" class="role-pick-search form-input text-xs py-1 px-2" placeholder="🔍 Cerca ruolo...">
            <div class="role-pick-list max-h-48 overflow-y-auto space-y-0.5 text-xs"></div>
          </div>
        </div>
      </div>
    `;

    const triggerUpdate = () => {
      if (window.updateWelcomerPreview) window.updateWelcomerPreview();
      if (window.updateEmbedPreview) window.updateEmbedPreview();
    };

    container.querySelector('.btn-fmt-b')?.addEventListener('click', () => { insertTextAtCursor(textarea, '**', '**'); triggerUpdate(); });
    container.querySelector('.btn-fmt-i')?.addEventListener('click', () => { insertTextAtCursor(textarea, '*', '*'); triggerUpdate(); });
    container.querySelector('.btn-fmt-s')?.addEventListener('click', () => { insertTextAtCursor(textarea, '~~', '~~'); triggerUpdate(); });
    container.querySelector('.btn-fmt-c')?.addEventListener('click', () => { insertTextAtCursor(textarea, '`', '`'); triggerUpdate(); });
    container.querySelector('.btn-fmt-cb')?.addEventListener('click', () => { insertTextAtCursor(textarea, '```\n', '\n```'); triggerUpdate(); });
    container.querySelector('.btn-fmt-q')?.addEventListener('click', () => { insertTextAtCursor(textarea, '> '); triggerUpdate(); });
    container.querySelector('.btn-fmt-l')?.addEventListener('click', () => { insertTextAtCursor(textarea, '[Titolo Link](', 'https://...)'); triggerUpdate(); });

    const btnCh = container.querySelector('.btn-open-ch-pick');
    const ddCh = container.querySelector('.ch-pick-dropdown');
    const searchCh = container.querySelector('.ch-pick-search');
    const listCh = container.querySelector('.ch-pick-list');

    const btnRole = container.querySelector('.btn-open-role-pick');
    const ddRole = container.querySelector('.role-pick-dropdown');
    const searchRole = container.querySelector('.role-pick-search');
    const listRole = container.querySelector('.role-pick-list');

    function renderChannels(query = '') {
      const channels = (window.AppState?.channels || []).filter(c => (c.type === 'text' || c.type === 0 || c.type === 5) && c.type !== 'voice' && c.rawType !== 2 && c.rawType !== 13);
      const q = query.toLowerCase().trim().replace(/^#/, '');
      listCh.innerHTML = '';
      const filtered = channels.filter(c => !q || c.name.toLowerCase().includes(q) || String(c.id).includes(q));
      if (filtered.length === 0) {
        listCh.innerHTML = '<div class="p-2 text-slate-400 text-[11px] text-center">Nessun canale trovato</div>';
        return;
      }
      filtered.forEach(c => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-red-50 hover:text-red-700 text-slate-700 flex items-center justify-between transition-colors';
        item.innerHTML = `<span class="font-medium truncate"># ${c.name}</span><span class="text-[10px] text-slate-400 font-mono">${c.id.slice(-4)}</span>`;
        item.addEventListener('click', () => {
          insertTextAtCursor(textarea, `<#${c.id}>`);
          ddCh.classList.add('hidden');
          triggerUpdate();
          window.showToast(`Inserito canale #${c.name}`);
        });
        listCh.appendChild(item);
      });
    }

    function renderRoles(query = '') {
      const roles = window.AppState?.roles || [];
      const q = query.toLowerCase().trim().replace(/^@/, '');
      listRole.innerHTML = '';
      const filtered = roles.filter(r => !q || r.name.toLowerCase().includes(q) || String(r.id).includes(q));
      if (filtered.length === 0) {
        listRole.innerHTML = '<div class="p-2 text-slate-400 text-[11px] text-center">Nessun ruolo trovato</div>';
        return;
      }
      filtered.forEach(r => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-900 text-slate-700 flex items-center justify-between transition-colors';
        item.innerHTML = `<span class="font-medium truncate">@ ${r.name}</span><span class="text-[10px] text-slate-400 font-mono">${r.id.slice(-4)}</span>`;
        item.addEventListener('click', () => {
          insertTextAtCursor(textarea, `<@&${r.id}>`);
          ddRole.classList.add('hidden');
          triggerUpdate();
          window.showToast(`Inserito ruolo @${r.name}`);
        });
        listRole.appendChild(item);
      });
    }

    btnCh?.addEventListener('click', (e) => {
      e.stopPropagation();
      ddCh?.classList.toggle('hidden');
      ddRole?.classList.add('hidden');
      if (!ddCh?.classList.contains('hidden')) {
        renderChannels(searchCh?.value || '');
        searchCh?.focus();
      }
    });

    searchCh?.addEventListener('input', (e) => renderChannels(e.target.value));
    ddCh?.addEventListener('click', (e) => e.stopPropagation());

    btnRole?.addEventListener('click', (e) => {
      e.stopPropagation();
      ddRole?.classList.toggle('hidden');
      ddCh?.classList.add('hidden');
      if (!ddRole?.classList.contains('hidden')) {
        renderRoles(searchRole?.value || '');
        searchRole?.focus();
      }
    });

    searchRole?.addEventListener('input', (e) => renderRoles(e.target.value));
    ddRole?.addEventListener('click', (e) => e.stopPropagation());

    document.addEventListener('click', () => {
      ddCh?.classList.add('hidden');
      ddRole?.classList.add('hidden');
    });

    if (window.lucide) lucide.createIcons();
  };

  /**
   * Global Universal Searchable Select Filter
   */
  window.setupSearchableSelect = function (searchInputId, selectId, filterType = 'text') {
    const input = typeof searchInputId === 'string' ? document.getElementById(searchInputId) : searchInputId;
    const select = typeof selectId === 'string' ? document.getElementById(selectId) : selectId;
    if (!input || !select) return;
    if (input.dataset.searchBound === select.id) return;
    input.dataset.searchBound = select.id;

    input.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim().replace(/^[#@🔊📁👤]/, '');
      let items = [];
      let prefix = '# ';

      if (filterType === 'role') {
        items = window.AppState?.roles || [];
        prefix = '@ ';
      } else if (filterType === 'category') {
        items = (window.AppState?.channels || []).filter(c => c.type === 'category' || c.type === 4);
        prefix = '📁 ';
      } else if (filterType === 'voice') {
        items = (window.AppState?.channels || []).filter(c => c.type === 'voice' || c.rawType === 2 || c.rawType === 13 || c.isVoice);
        prefix = '🔊 ';
      } else if (filterType === 'member' || filterType === 'user') {
        items = window.AppState?.members || [];
        prefix = '👤 ';
      } else {
        items = (window.AppState?.channels || []).filter(c => (c.type === 'text' || c.type === 0 || c.type === 5) && c.type !== 'voice' && c.rawType !== 2 && c.rawType !== 13);
        prefix = '# ';
      }

      const currentVal = select.value;
      select.innerHTML = `<option value="">-- Seleziona --</option>`;

      let matched = 0;
      items.forEach(item => {
        const name = item.displayName || item.name || '';
        const id = String(item.id || '');
        if (!query || name.toLowerCase().includes(query) || id.includes(query) || (item.name && item.name.toLowerCase().includes(query))) {
          const opt = document.createElement('option');
          opt.value = item.id;
          opt.textContent = `${prefix}${item.displayName ? `${item.displayName} (@${item.name})` : item.name}`;
          select.appendChild(opt);
          matched++;
        }
      });

      if (matched === 1) {
        select.selectedIndex = 1;
      } else if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
        select.value = currentVal;
      }
    });
  };

  // Setup variable tag insertion handler globally
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-var-tag');
    if (!btn) return;
    const targetId = btn.getAttribute('data-target');
    const varText = btn.getAttribute('data-var');
    const targetEl = document.getElementById(targetId);
    if (targetEl && varText) {
      insertTextAtCursor(targetEl, varText);
      if (window.updateWelcomerPreview) window.updateWelcomerPreview();
      if (window.updateEmbedPreview) window.updateEmbedPreview();
      window.showToast(`Inserito ${varText}`);
    }
  });

  /**
   * Setup Quick Formatting Toolbar on Embed Description
   */
  function setupEmbedFormattingToolbar() {
    const btnBold = document.getElementById('btn-fmt-bold');
    const btnItalic = document.getElementById('btn-fmt-italic');
    const btnStrike = document.getElementById('btn-fmt-strike');
    const btnCode = document.getElementById('btn-fmt-code');
    const btnQuote = document.getElementById('btn-fmt-quote');
    const btnLink = document.getElementById('btn-fmt-link');

    if (btnBold) btnBold.addEventListener('click', () => insertTextAtCursor(descInput, '**', '**'));
    if (btnItalic) btnItalic.addEventListener('click', () => insertTextAtCursor(descInput, '*', '*'));
    if (btnStrike) btnStrike.addEventListener('click', () => insertTextAtCursor(descInput, '~~', '~~'));
    if (btnCode) btnCode.addEventListener('click', () => insertTextAtCursor(descInput, '`', '`'));
    if (btnQuote) btnQuote.addEventListener('click', () => insertTextAtCursor(descInput, '> '));
    if (btnLink) btnLink.addEventListener('click', () => insertTextAtCursor(descInput, '[Titolo Link](', 'https://...)'));

    // Embed specific mention pickers
    const btnOpenChannelPicker = document.getElementById('btn-open-channel-picker');
    const channelPickerDropdown = document.getElementById('channel-picker-dropdown');
    const pickerChannelSearch = document.getElementById('picker-channel-search');
    const pickerChannelsList = document.getElementById('picker-channels-list');

    const btnOpenRolePicker = document.getElementById('btn-open-role-picker');
    const rolePickerDropdown = document.getElementById('role-picker-dropdown');
    const pickerRoleSearch = document.getElementById('picker-role-search');
    const pickerRolesList = document.getElementById('picker-roles-list');

    if (btnOpenChannelPicker && channelPickerDropdown && pickerChannelSearch && pickerChannelsList) {
      function renderPickerChannels(filter = '') {
        const channels = (window.AppState?.channels || []).filter(c => (c.type === 'text' || c.type === 0 || c.type === 5) && c.type !== 'voice' && c.rawType !== 2 && c.rawType !== 13);
        const query = filter.toLowerCase().trim().replace(/^#/, '');
        pickerChannelsList.innerHTML = '';

        const filtered = channels.filter(c => !query || c.name.toLowerCase().includes(query));
        if (filtered.length === 0) {
          pickerChannelsList.innerHTML = '<div class="p-2 text-slate-400 text-[11px] text-center">Nessun canale trovato</div>';
          return;
        }

        filtered.forEach(c => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-red-50 hover:text-red-700 text-slate-700 flex items-center justify-between transition-colors';
          item.innerHTML = `<span class="font-medium truncate"># ${c.name}</span><span class="text-[10px] text-slate-400 font-mono">${c.id.slice(-4)}</span>`;
          item.addEventListener('click', () => {
            insertTextAtCursor(descInput, `<#${c.id}>`);
            channelPickerDropdown.classList.add('hidden');
            window.showToast(`Inserito canale #${c.name}`);
          });
          pickerChannelsList.appendChild(item);
        });
      }

      btnOpenChannelPicker.addEventListener('click', (e) => {
        e.stopPropagation();
        channelPickerDropdown.classList.toggle('hidden');
        if (rolePickerDropdown) rolePickerDropdown.classList.add('hidden');
        if (!channelPickerDropdown.classList.contains('hidden')) {
          renderPickerChannels(pickerChannelSearch.value);
          pickerChannelSearch.focus();
        }
      });

      pickerChannelSearch.addEventListener('input', (e) => renderPickerChannels(e.target.value));
      channelPickerDropdown.addEventListener('click', (e) => e.stopPropagation());
    }

    if (btnOpenRolePicker && rolePickerDropdown && pickerRoleSearch && pickerRolesList) {
      function renderPickerRoles(filter = '') {
        const roles = window.AppState?.roles || [];
        const query = filter.toLowerCase().trim().replace(/^@/, '');
        pickerRolesList.innerHTML = '';

        const filtered = roles.filter(r => !query || r.name.toLowerCase().includes(query));
        if (filtered.length === 0) {
          pickerRolesList.innerHTML = '<div class="p-2 text-slate-400 text-[11px] text-center">Nessun ruolo trovato</div>';
          return;
        }

        filtered.forEach(r => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-900 text-slate-700 flex items-center justify-between transition-colors';
          item.innerHTML = `<span class="font-medium truncate">@ ${r.name}</span><span class="text-[10px] text-slate-400 font-mono">${r.id.slice(-4)}</span>`;
          item.addEventListener('click', () => {
            insertTextAtCursor(descInput, `<@&${r.id}>`);
            rolePickerDropdown.classList.add('hidden');
            window.showToast(`Inserito ruolo @${r.name}`);
          });
          pickerRolesList.appendChild(item);
        });
      }

      btnOpenRolePicker.addEventListener('click', (e) => {
        e.stopPropagation();
        rolePickerDropdown.classList.toggle('hidden');
        if (channelPickerDropdown) channelPickerDropdown.classList.add('hidden');
        if (!rolePickerDropdown.classList.contains('hidden')) {
          renderPickerRoles(pickerRoleSearch.value);
          pickerRoleSearch.focus();
        }
      });

      pickerRoleSearch.addEventListener('input', (e) => renderPickerRoles(e.target.value));
      rolePickerDropdown.addEventListener('click', (e) => e.stopPropagation());
    }
  }

  /**
   * Update Live Discord Embed Preview
   */
  function updatePreview() {
    const color = colorHexInput?.value || colorInput?.value || '#DC2626';
    if (prevEmbedBox) prevEmbedBox.style.borderLeftColor = color;

    const authorName = authorNameInput?.value?.trim();
    const authorIcon = authorIconInput?.value?.trim();
    if (prevAuthor) {
      if (authorName) {
        prevAuthor.classList.remove('hidden');
        if (prevAuthorName) prevAuthorName.textContent = authorName;
        if (prevAuthorIcon) {
          if (authorIcon) {
            prevAuthorIcon.src = authorIcon;
            prevAuthorIcon.classList.remove('hidden');
          } else {
            prevAuthorIcon.classList.add('hidden');
          }
        }
      } else {
        prevAuthor.classList.add('hidden');
      }
    }

    const title = titleInput?.value?.trim() || '';
    if (prevTitle) {
      prevTitle.textContent = title;
      prevTitle.style.display = title ? 'block' : 'none';
    }

    const desc = descInput?.value || '';
    if (prevDesc) {
      prevDesc.innerHTML = parseDiscordMarkdown(desc);
      prevDesc.style.display = desc ? 'block' : 'none';
    }

    if (prevFields) {
      prevFields.innerHTML = '';
      fields.forEach(f => {
        const fieldEl = document.createElement('div');
        fieldEl.className = `discord-field ${f.inline ? 'inline' : ''}`;
        fieldEl.innerHTML = `
          <div class="discord-field-name">${f.name || 'Campo'}</div>
          <div class="discord-field-value">${parseDiscordMarkdown(f.value || 'Valore')}</div>
        `;
        prevFields.appendChild(fieldEl);
      });
      prevFields.style.display = fields.length > 0 ? 'grid' : 'none';
    }

    const imgUrl = imageInput?.value?.trim();
    if (prevImage) {
      if (imgUrl) {
        prevImage.src = imgUrl;
        prevImage.classList.remove('hidden');
      } else {
        prevImage.classList.add('hidden');
      }
    }

    const thumbUrl = thumbInput?.value?.trim();
    if (prevThumb) {
      if (thumbUrl) {
        prevThumb.src = thumbUrl;
        prevThumb.classList.remove('hidden');
      } else {
        prevThumb.classList.add('hidden');
      }
    }

    const footerText = footerTextInput?.value?.trim();
    const footerIcon = footerIconInput?.value?.trim();
    if (prevFooter) {
      if (footerText) {
        prevFooter.classList.remove('hidden');
        if (prevFooterText) prevFooterText.textContent = footerText;
        if (prevFooterIcon) {
          if (footerIcon) {
            prevFooterIcon.src = footerIcon;
            prevFooterIcon.classList.remove('hidden');
          } else {
            prevFooterIcon.classList.add('hidden');
          }
        }
      } else {
        prevFooter.classList.add('hidden');
      }
    }

    saveDraftToLocalStorage();
  }

  window.updateEmbedPreview = updatePreview;

  // Bind Input Event Listeners
  const allInputs = [
    colorInput, colorHexInput, authorNameInput, authorIconInput,
    titleInput, titleUrlInput, descInput, imageInput, thumbInput,
    footerTextInput, footerIconInput
  ];

  allInputs.forEach(input => {
    if (input) {
      ['input', 'change', 'keyup', 'paste'].forEach(evt => {
        input.addEventListener(evt, () => {
          if (input === colorInput && colorHexInput) colorHexInput.value = colorInput.value.toUpperCase();
          if (input === colorHexInput && colorInput && colorHexInput.value.startsWith('#')) colorInput.value = colorHexInput.value;
          updatePreview();
        });
      });
    }
  });

  // Dynamic Fields & Subgroups Management
  const btnAddField = document.getElementById('btn-add-field');
  const btnAddFieldPair = document.getElementById('btn-add-field-pair');
  const btnAddFieldTrio = document.getElementById('btn-add-field-trio');
  const fieldsContainer = document.getElementById('embed-fields-container');

  function renderFieldsList() {
    if (!fieldsContainer) return;
    fieldsContainer.innerHTML = '';

    if (fields.length === 0) {
      fieldsContainer.innerHTML = `
        <div class="p-4 rounded-xl border border-dashed border-slate-300 text-center text-slate-500 text-xs">
          Nessun riquadro/sottogruppo aggiunto. Usa i pulsanti sopra per aggiungere riquadri a 1, 2 o 3 colonne.
        </div>
      `;
      return;
    }

    fields.forEach((field, index) => {
      const row = document.createElement('div');
      row.className = 'p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-2.5 transition-all';
      row.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-slate-200">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded text-[11px] font-bold ${field.inline ? 'bg-cyan-100 text-cyan-800 border border-cyan-300' : 'bg-red-100 text-red-800 border border-red-300'} font-medieval flex items-center gap-1">
              <i data-lucide="${field.inline ? 'columns-2' : 'square'}" class="w-3 h-3"></i>
              <span>${field.inline ? 'Riquadro Affiancato' : 'Riquadro Intero'} #${index + 1}</span>
            </span>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-xs text-slate-700 flex items-center gap-1.5 cursor-pointer font-medium select-none" title="Se attivo, il riquadro si affianca agli altri (fino a 3 colonne)">
              <input type="checkbox" class="field-inline-toggle" data-index="${index}" ${field.inline ? 'checked' : ''}>
              <span>Affianca (Colonne)</span>
            </label>
            <button type="button" class="btn-field-up text-slate-400 hover:text-slate-700 p-1" data-index="${index}" title="Sposta su" ${index === 0 ? 'disabled style="opacity:0.3;"' : ''}>
              <i data-lucide="arrow-up" class="w-3.5 h-3.5"></i>
            </button>
            <button type="button" class="btn-field-down text-slate-400 hover:text-slate-700 p-1" data-index="${index}" title="Sposta giù" ${index === fields.length - 1 ? 'disabled style="opacity:0.3;"' : ''}>
              <i data-lucide="arrow-down" class="w-3.5 h-3.5"></i>
            </button>
            <button type="button" class="btn-remove-field text-rose-600 hover:text-rose-700 p-1" data-index="${index}" title="Elimina riquadro">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
        <div class="space-y-2">
          <div>
            <label class="text-[11px] font-semibold text-slate-600 block mb-1">Titolo del Riquadro / Sottogruppo</label>
            <input type="text" class="form-input text-xs field-name-input bg-white" data-index="${index}" placeholder="es. Regole, Staff, Informazioni..." value="${field.name || ''}">
          </div>
          <div>
            <div class="flex flex-wrap items-center justify-between gap-1 mb-1">
              <label class="text-[11px] font-semibold text-slate-600 block">Contenuto del Riquadro (Markdown, elenchi, menzioni)</label>
              <div id="field-toolbar-${index}"></div>
            </div>
            <textarea class="form-textarea h-20 text-xs field-val-input bg-white" id="field-val-${index}" data-index="${index}" placeholder="Scrivi il testo del riquadro...">${field.value || ''}</textarea>
          </div>
        </div>
      `;
      fieldsContainer.appendChild(row);

      if (window.setupMarkdownToolbar) {
        window.setupMarkdownToolbar(`field-toolbar-${index}`, `field-val-${index}`);
      }
    });

    if (window.lucide) lucide.createIcons();

    document.querySelectorAll('.field-name-input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        if (fields[idx]) {
          fields[idx].name = e.target.value;
          updatePreview();
        }
      });
    });

    document.querySelectorAll('.field-val-input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        if (fields[idx]) {
          fields[idx].value = e.target.value;
          updatePreview();
        }
      });
    });

    document.querySelectorAll('.field-inline-toggle').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        if (fields[idx]) {
          fields[idx].inline = e.target.checked;
          renderFieldsList();
          updatePreview();
        }
      });
    });

    document.querySelectorAll('.btn-field-up').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        if (idx > 0) {
          const temp = fields[idx];
          fields[idx] = fields[idx - 1];
          fields[idx - 1] = temp;
          renderFieldsList();
          updatePreview();
        }
      });
    });

    document.querySelectorAll('.btn-field-down').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        if (idx < fields.length - 1) {
          const temp = fields[idx];
          fields[idx] = fields[idx + 1];
          fields[idx + 1] = temp;
          renderFieldsList();
          updatePreview();
        }
      });
    });

    document.querySelectorAll('.btn-remove-field').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        fields.splice(idx, 1);
        renderFieldsList();
        updatePreview();
      });
    });
  }

  if (btnAddField) {
    btnAddField.addEventListener('click', () => {
      if (fields.length >= 25) {
        return window.showToast('Limite massimo di 25 campi raggiunto.', 'error');
      }
      fields.push({ name: `Riquadro #${fields.length + 1}`, value: 'Testo del riquadro...', inline: false });
      renderFieldsList();
      updatePreview();
    });
  }

  if (btnAddFieldPair) {
    btnAddFieldPair.addEventListener('click', () => {
      if (fields.length >= 24) {
        return window.showToast('Limite massimo di 25 campi raggiunto.', 'error');
      }
      fields.push(
        { name: `Colonna 1`, value: 'Informazioni...', inline: true },
        { name: `Colonna 2`, value: 'Dettagli...', inline: true }
      );
      renderFieldsList();
      updatePreview();
    });
  }

  if (btnAddFieldTrio) {
    btnAddFieldTrio.addEventListener('click', () => {
      if (fields.length >= 23) {
        return window.showToast('Limite massimo di 25 campi raggiunto.', 'error');
      }
      fields.push(
        { name: `Colonna 1`, value: 'Info...', inline: true },
        { name: `Colonna 2`, value: 'Info...', inline: true },
        { name: `Colonna 3`, value: 'Info...', inline: true }
      );
      renderFieldsList();
      updatePreview();
    });
  }

  function getEmbedPayload() {
    const payload = {};
    const color = colorHexInput?.value || '#DC2626';
    payload.color = parseInt(color.replace('#', ''), 16);

    const title = titleInput?.value?.trim();
    if (title) payload.title = title;

    const url = titleUrlInput?.value?.trim();
    if (url) payload.url = url;

    const desc = descInput?.value?.trim();
    if (desc) payload.description = desc;

    const authorName = authorNameInput?.value?.trim();
    if (authorName) {
      payload.author = { name: authorName };
      const icon = authorIconInput?.value?.trim();
      if (icon) payload.author.icon_url = icon;
    }

    const image = imageInput?.value?.trim();
    if (image) payload.image = { url: image };

    const thumb = thumbInput?.value?.trim();
    if (thumb) payload.thumbnail = { url: thumb };

    const footerText = footerTextInput?.value?.trim();
    if (footerText) {
      payload.footer = { text: footerText };
      const fIcon = footerIconInput?.value?.trim();
      if (fIcon) payload.footer.icon_url = fIcon;
    }

    if (fields.length > 0) {
      payload.fields = fields.map(f => ({
        name: f.name || 'Campo',
        value: f.value || 'Valore',
        inline: Boolean(f.inline)
      }));
    }

    payload.timestamp = new Date().toISOString();
    return payload;
  }

  function loadEmbedDataIntoForm(embedData) {
    if (!embedData) return;

    if (embedData.color !== undefined) {
      const hex = '#' + Number(embedData.color).toString(16).padStart(6, '0').toUpperCase();
      if (colorInput) colorInput.value = hex;
      if (colorHexInput) colorHexInput.value = hex;
    }

    if (titleInput) titleInput.value = embedData.title || '';
    if (titleUrlInput) titleUrlInput.value = embedData.url || '';
    if (descInput) descInput.value = embedData.description || '';

    if (authorNameInput) authorNameInput.value = embedData.author?.name || '';
    if (authorIconInput) authorIconInput.value = embedData.author?.icon_url || '';

    if (imageInput) imageInput.value = embedData.image?.url || '';
    if (thumbInput) thumbInput.value = embedData.thumbnail?.url || '';

    if (footerTextInput) footerTextInput.value = embedData.footer?.text || '';
    if (footerIconInput) footerIconInput.value = embedData.footer?.icon_url || '';

    fields = (embedData.fields || []).map(f => ({
      name: f.name || '',
      value: f.value || '',
      inline: Boolean(f.inline)
    }));

    renderFieldsList();
    updatePreview();
  }

  function saveDraftToLocalStorage() {
    const guildId = window.AppState?.currentGuildId;
    if (!guildId) return;

    const draft = {
      channelId: channelSelect?.value || '',
      colorHex: colorHexInput?.value || '#DC2626',
      authorName: authorNameInput?.value || '',
      authorIcon: authorIconInput?.value || '',
      title: titleInput?.value || '',
      titleUrl: titleUrlInput?.value || '',
      description: descInput?.value || '',
      imageUrl: imageInput?.value || '',
      thumbUrl: thumbInput?.value || '',
      footerText: footerTextInput?.value || '',
      footerIcon: footerIconInput?.value || '',
      fields: fields
    };

    try {
      localStorage.setItem(`cavaliere_draft_embed_${guildId}`, JSON.stringify(draft));
    } catch (e) {}
  }

  function loadDraftFromLocalStorage(guildId) {
    if (!guildId) return false;
    try {
      const raw = localStorage.getItem(`cavaliere_draft_embed_${guildId}`);
      if (!raw) return false;
      const draft = JSON.parse(raw);

      if (draft.colorHex) {
        if (colorInput) colorInput.value = draft.colorHex;
        if (colorHexInput) colorHexInput.value = draft.colorHex;
      }
      if (titleInput && draft.title !== undefined) titleInput.value = draft.title;
      if (titleUrlInput && draft.titleUrl !== undefined) titleUrlInput.value = draft.titleUrl;
      if (descInput && draft.description !== undefined) descInput.value = draft.description;
      if (authorNameInput && draft.authorName !== undefined) authorNameInput.value = draft.authorName;
      if (authorIconInput && draft.authorIcon !== undefined) authorIconInput.value = draft.authorIcon;
      if (imageInput && draft.imageUrl !== undefined) imageInput.value = draft.imageUrl;
      if (thumbInput && draft.thumbUrl !== undefined) thumbInput.value = draft.thumbUrl;
      if (footerTextInput && draft.footerText !== undefined) footerTextInput.value = draft.footerText;
      if (footerIconInput && draft.footerIcon !== undefined) footerIconInput.value = draft.footerIcon;
      if (channelSelect && draft.channelId) channelSelect.value = draft.channelId;

      fields = draft.fields || [];
      renderFieldsList();
      updatePreview();
      return true;
    } catch (e) {
      return false;
    }
  }

  if (btnResetEmbed) {
    btnResetEmbed.addEventListener('click', () => {
      if (!confirm('Sei sicuro di voler resettare l\'editor dell\'embed?')) return;
      const guildId = window.AppState?.currentGuildId;
      if (guildId) localStorage.removeItem(`cavaliere_draft_embed_${guildId}`);

      if (titleInput) titleInput.value = '🛡️ Annuncio Ufficiale | Sentry';
      if (titleUrlInput) titleUrlInput.value = '';
      if (descInput) descInput.value = 'Benvenuti nel server! Questo è un messaggio generato dal **Live Embed Builder** di *Sentry*.';
      if (authorNameInput) authorNameInput.value = '';
      if (authorIconInput) authorIconInput.value = '';
      if (imageInput) imageInput.value = '';
      if (thumbInput) thumbInput.value = '';
      if (footerTextInput) footerTextInput.value = 'Sentry • Notifiche';
      if (footerIconInput) footerIconInput.value = '';
      if (colorInput) colorInput.value = '#DC2626';
      if (colorHexInput) colorHexInput.value = '#DC2626';

      fields = [];
      renderFieldsList();
      updatePreview();
      window.showToast('Editor resettato.');
    });
  }

  async function loadSavedTemplates(guildId) {
    if (!guildId || !savedTemplatesContainer) return;

    try {
      savedTemplatesContainer.innerHTML = `
        <div class="col-span-full text-center py-6 text-slate-400 text-xs">
          <i data-lucide="loader" class="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400"></i>
          Caricamento template salvati...
        </div>
      `;
      if (window.lucide) lucide.createIcons();

      const res = await fetch(`/api/guilds/${guildId}/embeds`);
      if (!res.ok) return;

      const templates = await res.json();
      savedTemplatesContainer.innerHTML = '';

      if (!templates || templates.length === 0) {
        savedTemplatesContainer.innerHTML = `
          <div class="col-span-full text-center py-8 border border-dashed border-slate-300 rounded-xl p-6 bg-slate-900/40">
            <i data-lucide="bookmark" class="w-8 h-8 text-slate-400 mx-auto mb-2"></i>
            <p class="text-sm font-bold text-slate-700 mb-1">Nessun template salvato per questo server</p>
            <p class="text-xs text-slate-500">Crea il tuo messaggio personalizzato e clicca su "Salva Embed Corrente" per ritrovarlo sempre qui.</p>
          </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
      }

      templates.forEach(tpl => {
        const emb = tpl.embed_data || {};
        const hexColor = emb.color ? '#' + Number(emb.color).toString(16).padStart(6, '0').toUpperCase() : '#DC2626';
        const dateStr = tpl.created_at ? new Date(tpl.created_at * 1000).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recente';

        const card = document.createElement('div');
        card.className = 'p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-md flex flex-col justify-between space-y-3 hover:border-red-500/50 transition-all';
        card.innerHTML = `
          <div class="space-y-1.5">
            <div class="flex items-center justify-between gap-2">
              <span class="font-bold text-sm text-slate-900 truncate" title="${tpl.name}">${tpl.name}</span>
              <span class="w-3 h-3 rounded-full shrink-0 shadow-sm" style="background-color: ${hexColor};" title="Colore: ${hexColor}"></span>
            </div>
            <div class="text-[11px] text-slate-500 flex items-center gap-2">
              <span>👤 ${tpl.created_by || 'Moderatore'}</span>
              <span>•</span>
              <span>📅 ${dateStr}</span>
            </div>
            <div class="p-2 rounded bg-slate-100/90 text-xs text-slate-700 line-clamp-2 italic border border-slate-200">
              ${emb.description ? emb.description.slice(0, 100) : (emb.title || 'Senza testo')}
            </div>
          </div>

          <div class="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
            <button type="button" class="btn-load-tpl text-xs py-1.5 px-3 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-bold border border-red-200 flex items-center gap-1 transition-colors">
              <i data-lucide="download" class="w-3.5 h-3.5"></i> Carica
            </button>
            <button type="button" class="btn-delete-tpl text-xs py-1.5 px-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 font-medium border border-rose-200 flex items-center gap-1 transition-colors" title="Elimina Template">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        `;

        card.querySelector('.btn-load-tpl').addEventListener('click', () => {
          loadEmbedDataIntoForm(emb);
          window.showToast(`Template "${tpl.name}" caricato nell'editor!`);
          window.scrollTo({ top: document.getElementById('tab-embeds')?.offsetTop || 0, behavior: 'smooth' });
        });

        card.querySelector('.btn-delete-tpl').addEventListener('click', async () => {
          if (!confirm(`Sei sicuro di voler eliminare il template "${tpl.name}"?`)) return;
          try {
            const delRes = await fetch(`/api/guilds/${guildId}/embeds/${tpl.id}`, { method: 'DELETE' });
            if (delRes.ok) {
              window.showToast(`Template "${tpl.name}" eliminato.`);
              loadSavedTemplates(guildId);
            }
          } catch (err) {
            window.showToast('Errore durante l\'eliminazione.', 'error');
          }
        });

        savedTemplatesContainer.appendChild(card);
      });

      if (window.lucide) lucide.createIcons();
    } catch (e) {
      console.error('Error loading saved templates:', e);
    }
  }

  async function handleSaveTemplate() {
    const guildId = window.AppState?.currentGuildId;
    if (!guildId) return window.showToast('Nessun server selezionato.', 'error');

    const defaultName = titleInput?.value?.trim() || `Embed ${new Date().toLocaleDateString('it-IT')}`;
    const name = prompt('Inserisci un nome per questo template embed:', defaultName);
    if (!name || !name.trim()) return;

    const payload = getEmbedPayload();

    try {
      const res = await fetch(`/api/guilds/${guildId}/embeds/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          embedData: payload,
          componentsData: []
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        window.showToast(`Template "${name.trim()}" salvato con successo nel database!`);
        loadSavedTemplates(guildId);
      } else {
        window.showToast(`Errore durante il salvataggio: ${data.error || 'Fallito'}`, 'error');
      }
    } catch (err) {
      window.showToast(`Errore di connessione: ${err.message}`, 'error');
    }
  }

  if (btnSaveAsTemplate) btnSaveAsTemplate.addEventListener('click', handleSaveTemplate);
  if (btnSaveTemplateTop) btnSaveTemplateTop.addEventListener('click', handleSaveTemplate);

  const btnCopyJson = document.getElementById('btn-copy-json');
  if (btnCopyJson) {
    btnCopyJson.addEventListener('click', () => {
      const payload = getEmbedPayload();
      navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      window.showToast('JSON dell\'embed copiato negli appunti!');
    });
  }

  const btnSendEmbed = document.getElementById('btn-send-embed');
  if (btnSendEmbed) {
    btnSendEmbed.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      const channelId = channelSelect?.value;

      if (!guildId) return window.showToast('Nessun server selezionato.', 'error');
      if (!channelId) return window.showToast('Seleziona un canale di invio dal menu a tendina o cerca il canale.', 'error');

      const payload = getEmbedPayload();

      try {
        btnSendEmbed.disabled = true;
        btnSendEmbed.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Invio in corso...';
        if (window.lucide) lucide.createIcons();

        const res = await fetch(`/api/guilds/${guildId}/embeds/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId,
            embedData: payload,
            componentsData: []
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          window.showToast('Messaggio embed inviato con successo nel canale Discord!');
        } else {
          window.showToast(`Errore: ${data.error || 'Invio fallito'}`, 'error');
        }
      } catch (err) {
        window.showToast(`Errore di connessione: ${err.message}`, 'error');
      } finally {
        btnSendEmbed.disabled = false;
        btnSendEmbed.innerHTML = '<i data-lucide="send" class="w-3.5 h-3.5"></i> Invia nel Canale Discord';
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  // Live Embed Fetch & In-Place Editor Handler
  const fetchInput = document.getElementById('embed-fetch-input');
  const btnFetchLive = document.getElementById('btn-fetch-live-embed');
  const btnEditLive = document.getElementById('btn-edit-live-embed');
  let currentEditingMessage = null;

  if (btnFetchLive && fetchInput) {
    btnFetchLive.addEventListener('click', async () => {
      const val = fetchInput.value.trim();
      if (!val) return window.showToast('Inserisci un link del messaggio Discord o il suo ID.', 'error');
      const guildId = window.AppState.currentGuildId;
      if (!guildId) return window.showToast('Seleziona prima un server.', 'error');

      const channelId = channelSelect?.value;

      try {
        btnFetchLive.disabled = true;
        btnFetchLive.innerHTML = '<i data-lucide="loader" class="w-3 h-3 animate-spin"></i>';
        if (window.lucide) lucide.createIcons();

        const res = await fetch(`/api/guilds/${guildId}/embeds/fetch-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: val, messageId: val, channelId })
        });

        const data = await res.json();
        if (res.ok && data.success && data.data) {
          const emb = data.data.embed;
          if (emb) {
            if (titleInput) titleInput.value = emb.title || '';
            if (titleUrlInput) titleUrlInput.value = emb.url || '';
            if (descInput) descInput.value = emb.description || '';
            if (colorInput) colorInput.value = emb.color || '#dc2626';
            if (colorHexInput) colorHexInput.value = emb.color || '#dc2626';
            if (imageInput) imageInput.value = emb.image || '';
            if (thumbInput) thumbInput.value = emb.thumbnail || '';
            if (footerTextInput) footerTextInput.value = emb.footer || '';
            fields = emb.fields ? [...emb.fields] : [];
            renderFieldsList();
            updatePreview();
          }

          if (data.data.channelId && channelSelect) {
            channelSelect.value = data.data.channelId;
          }

          currentEditingMessage = {
            channelId: data.data.channelId,
            messageId: data.data.messageId
          };

          if (btnEditLive) {
            btnEditLive.classList.remove('hidden');
          }

          window.showToast('Embed caricato da Discord! Ora puoi modificarlo e cliccare su "Salva Modifica Live".');
        } else {
          window.showToast(`Errore: ${data.error || 'Messaggio non trovato'}`, 'error');
        }
      } catch (err) {
        window.showToast(`Errore di connessione: ${err.message}`, 'error');
      } finally {
        btnFetchLive.disabled = false;
        btnFetchLive.innerHTML = '<i data-lucide="download" class="w-3.5 h-3.5 text-amber-700"></i> Carica';
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  if (btnEditLive) {
    btnEditLive.addEventListener('click', async () => {
      if (!currentEditingMessage) return window.showToast('Nessun messaggio live caricato.', 'error');
      const guildId = window.AppState.currentGuildId;
      const payload = getEmbedPayload();

      try {
        btnEditLive.disabled = true;
        btnEditLive.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Modifica in corso...';
        if (window.lucide) lucide.createIcons();

        const res = await fetch(`/api/guilds/${guildId}/embeds/edit-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId: currentEditingMessage.channelId,
            messageId: currentEditingMessage.messageId,
            embed: payload
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          window.showToast('Messaggio Discord aggiornato con successo in tempo reale!');
        } else {
          window.showToast(`Errore modifica: ${data.error || 'Fallita'}`, 'error');
        }
      } catch (err) {
        window.showToast(`Errore: ${err.message}`, 'error');
      } finally {
        btnEditLive.disabled = false;
        btnEditLive.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5"></i> Salva Modifica Live';
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  // =========================================================================
  // WELCOMER EMBED BUILDER (1:1 DEDICATED EMBED BUILDER INSTANCE FOR WELCOMER)
  // =========================================================================
  let welFields = [];

  const welColorInput = document.getElementById('wel-embed-color');
  const welColorHexInput = document.getElementById('wel-embed-color-hex');
  const welAuthorNameInput = document.getElementById('wel-embed-author-name');
  const welAuthorIconInput = document.getElementById('wel-embed-author-icon');
  const welTitleInput = document.getElementById('wel-embed-title');
  const welTitleUrlInput = document.getElementById('wel-embed-title-url');
  const welDescInput = document.getElementById('wel-message');
  const welImageInput = document.getElementById('wel-embed-image');
  const welThumbInput = document.getElementById('wel-embed-thumbnail');
  const welFooterTextInput = document.getElementById('wel-embed-footer');
  const welFooterIconInput = document.getElementById('wel-embed-footer-icon');
  const welChannelSelect = document.getElementById('wel-channel');
  const welEnabledToggle = document.getElementById('wel-enabled');
  const welAutoRoleUser = document.getElementById('wel-autorole-user');
  const welAutoRoleBot = document.getElementById('wel-autorole-bot');
  const welFieldsContainer = document.getElementById('wel-fields-list');
  const btnWelAddField = document.getElementById('btn-wel-add-field');
  const btnWelAddFieldPair = document.getElementById('btn-wel-add-field-pair');
  const btnWelAddFieldTrio = document.getElementById('btn-wel-add-field-trio');

  const prevWelBox = document.getElementById('prev-wel-embed-box');
  const prevWelAuthor = document.getElementById('prev-wel-author');
  const prevWelAuthorName = document.getElementById('prev-wel-author-name');
  const prevWelAuthorIcon = document.getElementById('prev-wel-author-icon');
  const prevWelTitle = document.getElementById('prev-wel-title');
  const prevWelDesc = document.getElementById('prev-wel-desc');
  const prevWelFields = document.getElementById('prev-wel-fields');
  const prevWelThumb = document.getElementById('prev-wel-thumb');
  const prevWelImage = document.getElementById('prev-wel-image');
  const prevWelFooter = document.getElementById('prev-wel-footer');
  const prevWelFooterText = document.getElementById('prev-wel-footer-text');
  const prevWelFooterIcon = document.getElementById('prev-wel-footer-icon');

  function updateWelcomerPreview() {
    const color = welColorHexInput?.value || welColorInput?.value || '#DC2626';
    if (prevWelBox) prevWelBox.style.borderLeftColor = color;

    const authorName = welAuthorNameInput?.value?.trim();
    const authorIcon = welAuthorIconInput?.value?.trim();
    if (prevWelAuthor) {
      if (authorName) {
        prevWelAuthor.classList.remove('hidden');
        if (prevWelAuthorName) prevWelAuthorName.textContent = authorName;
        if (prevWelAuthorIcon) {
          if (authorIcon) {
            prevWelAuthorIcon.src = authorIcon.replace(/{user\.avatar}/g, 'https://cdn.discordapp.com/embed/avatars/0.png');
            prevWelAuthorIcon.classList.remove('hidden');
          } else {
            prevWelAuthorIcon.classList.add('hidden');
          }
        }
      } else {
        prevWelAuthor.classList.add('hidden');
      }
    }

    const title = welTitleInput?.value?.trim() || '';
    if (prevWelTitle) {
      prevWelTitle.textContent = title;
      prevWelTitle.style.display = title ? 'block' : 'none';
    }

    const desc = welDescInput?.value || '';
    if (prevWelDesc) {
      prevWelDesc.innerHTML = parseDiscordMarkdown(desc);
      prevWelDesc.style.display = desc ? 'block' : 'none';
    }

    if (prevWelFields) {
      prevWelFields.innerHTML = '';
      welFields.forEach(f => {
        const fieldEl = document.createElement('div');
        fieldEl.className = `discord-field ${f.inline ? 'inline' : ''}`;
        fieldEl.innerHTML = `
          <div class="discord-field-name">${f.name || 'Campo'}</div>
          <div class="discord-field-value">${parseDiscordMarkdown(f.value || 'Valore')}</div>
        `;
        prevWelFields.appendChild(fieldEl);
      });
      prevWelFields.style.display = welFields.length > 0 ? 'grid' : 'none';
    }

    const imgUrl = welImageInput?.value?.trim();
    if (prevWelImage) {
      if (imgUrl) {
        prevWelImage.src = imgUrl;
        prevWelImage.classList.remove('hidden');
      } else {
        prevWelImage.classList.add('hidden');
      }
    }

    const thumbUrl = welThumbInput?.value?.trim();
    if (prevWelThumb) {
      if (thumbUrl) {
        prevWelThumb.src = thumbUrl.replace(/{user\.avatar}/g, 'https://cdn.discordapp.com/embed/avatars/0.png');
        prevWelThumb.classList.remove('hidden');
      } else {
        prevWelThumb.classList.add('hidden');
      }
    }

    const footerText = welFooterTextInput?.value?.trim();
    const footerIcon = welFooterIconInput?.value?.trim();
    if (prevWelFooter) {
      if (footerText) {
        prevWelFooter.classList.remove('hidden');
        if (prevWelFooterText) prevWelFooterText.textContent = footerText;
        if (prevWelFooterIcon) {
          if (footerIcon) {
            prevWelFooterIcon.src = footerIcon;
            prevWelFooterIcon.classList.remove('hidden');
          } else {
            prevWelFooterIcon.classList.add('hidden');
          }
        }
      } else {
        prevWelFooter.classList.add('hidden');
      }
    }
  }

  window.updateWelcomerPreview = updateWelcomerPreview;

  function renderWelFieldsList() {
    if (!welFieldsContainer) return;
    welFieldsContainer.innerHTML = '';

    if (welFields.length === 0) {
      welFieldsContainer.innerHTML = `
        <div class="p-4 rounded-xl border border-dashed border-slate-300 text-center text-slate-500 text-xs">
          Nessun riquadro/sottogruppo aggiunto. Usa i pulsanti sopra per aggiungere riquadri a 1, 2 o 3 colonne.
        </div>
      `;
      return;
    }

    welFields.forEach((field, index) => {
      const row = document.createElement('div');
      row.className = 'p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-2.5 transition-all';
      row.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-slate-200">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded text-[11px] font-bold ${field.inline ? 'bg-cyan-100 text-cyan-800 border border-cyan-300' : 'bg-red-100 text-red-800 border border-red-300'} font-medieval flex items-center gap-1">
              <i data-lucide="${field.inline ? 'columns-2' : 'square'}" class="w-3 h-3"></i>
              <span>${field.inline ? 'Riquadro Affiancato' : 'Riquadro Intero'} #${index + 1}</span>
            </span>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-xs text-slate-700 flex items-center gap-1.5 cursor-pointer font-medium select-none" title="Se attivo, il riquadro si affianca agli altri (fino a 3 colonne)">
              <input type="checkbox" class="wel-field-inline-toggle" data-index="${index}" ${field.inline ? 'checked' : ''}>
              <span>Affianca (Colonne)</span>
            </label>
            <button type="button" class="btn-wel-field-up text-slate-400 hover:text-slate-700 p-1" data-index="${index}" title="Sposta su" ${index === 0 ? 'disabled style="opacity:0.3;"' : ''}>
              <i data-lucide="arrow-up" class="w-3.5 h-3.5"></i>
            </button>
            <button type="button" class="btn-wel-field-down text-slate-400 hover:text-slate-700 p-1" data-index="${index}" title="Sposta giù" ${index === welFields.length - 1 ? 'disabled style="opacity:0.3;"' : ''}>
              <i data-lucide="arrow-down" class="w-3.5 h-3.5"></i>
            </button>
            <button type="button" class="btn-wel-remove-field text-rose-600 hover:text-rose-700 p-1" data-index="${index}" title="Elimina riquadro">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
        <div class="space-y-2">
          <div>
            <label class="text-[11px] font-semibold text-slate-600 block mb-1">Titolo del Riquadro</label>
            <input type="text" class="form-input text-xs wel-field-name-input bg-white" data-index="${index}" placeholder="es. Regole, Ruoli, Canali..." value="${field.name || ''}">
          </div>
          <div>
            <div class="flex flex-wrap items-center justify-between gap-1 mb-1">
              <label class="text-[11px] font-semibold text-slate-600 block">Contenuto del Riquadro (Markdown, tag {user}, menzioni)</label>
              <div id="wel-field-toolbar-${index}"></div>
            </div>
            <textarea class="form-textarea h-20 text-xs wel-field-val-input bg-white" id="wel-field-val-${index}" data-index="${index}" placeholder="Scrivi il testo del riquadro...">${field.value || ''}</textarea>
          </div>
        </div>
      `;
      welFieldsContainer.appendChild(row);

      if (window.setupMarkdownToolbar) {
        window.setupMarkdownToolbar(`wel-field-toolbar-${index}`, `wel-field-val-${index}`);
      }
    });

    if (window.lucide) lucide.createIcons();

    document.querySelectorAll('.wel-field-name-input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        if (welFields[idx]) {
          welFields[idx].name = e.target.value;
          updateWelcomerPreview();
        }
      });
    });

    document.querySelectorAll('.wel-field-val-input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        if (welFields[idx]) {
          welFields[idx].value = e.target.value;
          updateWelcomerPreview();
        }
      });
    });

    document.querySelectorAll('.wel-field-inline-toggle').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        if (welFields[idx]) {
          welFields[idx].inline = e.target.checked;
          renderWelFieldsList();
          updateWelcomerPreview();
        }
      });
    });

    document.querySelectorAll('.btn-wel-field-up').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        if (idx > 0) {
          const temp = welFields[idx];
          welFields[idx] = welFields[idx - 1];
          welFields[idx - 1] = temp;
          renderWelFieldsList();
          updateWelcomerPreview();
        }
      });
    });

    document.querySelectorAll('.btn-wel-field-down').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        if (idx < welFields.length - 1) {
          const temp = welFields[idx];
          welFields[idx] = welFields[idx + 1];
          welFields[idx + 1] = temp;
          renderWelFieldsList();
          updateWelcomerPreview();
        }
      });
    });

    document.querySelectorAll('.btn-wel-remove-field').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        welFields.splice(idx, 1);
        renderWelFieldsList();
        updateWelcomerPreview();
      });
    });
  }

  if (btnWelAddField) {
    btnWelAddField.addEventListener('click', () => {
      if (welFields.length >= 25) {
        return window.showToast('Limite massimo di 25 campi raggiunto.', 'error');
      }
      welFields.push({ name: `Riquadro #${welFields.length + 1}`, value: '{user.mention}', inline: false });
      renderWelFieldsList();
      updateWelcomerPreview();
    });
  }

  if (btnWelAddFieldPair) {
    btnWelAddFieldPair.addEventListener('click', () => {
      if (welFields.length >= 24) {
        return window.showToast('Limite massimo di 25 campi raggiunto.', 'error');
      }
      welFields.push(
        { name: `Regole`, value: 'Rispetta tutti i membri del server.', inline: true },
        { name: `Ruoli`, value: 'Assegnati i ruoli nel canale dedicato.', inline: true }
      );
      renderWelFieldsList();
      updateWelcomerPreview();
    });
  }

  if (btnWelAddFieldTrio) {
    btnWelAddFieldTrio.addEventListener('click', () => {
      if (welFields.length >= 23) {
        return window.showToast('Limite massimo di 25 campi raggiunto.', 'error');
      }
      welFields.push(
        { name: `Regole`, value: 'Leggi le linee guida.', inline: true },
        { name: `Canali`, value: 'Esplora le sezioni attive.', inline: true },
        { name: `Supporto`, value: 'Apri un ticket per aiuto.', inline: true }
      );
      renderWelFieldsList();
      updateWelcomerPreview();
    });
  }

  // Bind Welcomer Inputs
  const allWelInputs = [
    welColorInput, welColorHexInput, welAuthorNameInput, welAuthorIconInput,
    welTitleInput, welTitleUrlInput, welDescInput, welImageInput, welThumbInput,
    welFooterTextInput, welFooterIconInput
  ];

  allWelInputs.forEach(input => {
    if (input) {
      ['input', 'change', 'keyup', 'paste'].forEach(evt => {
        input.addEventListener(evt, () => {
          if (input === welColorInput && welColorHexInput) welColorHexInput.value = welColorInput.value.toUpperCase();
          if (input === welColorHexInput && welColorInput && welColorHexInput.value.startsWith('#')) welColorInput.value = welColorHexInput.value;
          updateWelcomerPreview();
        });
      });
    }
  });

  function getWelcomerPayload() {
    return {
      welcome_enabled: welEnabledToggle?.checked,
      welcome_channel_id: welChannelSelect?.value || null,
      auto_role_user: welAutoRoleUser?.value || null,
      auto_role_bot: welAutoRoleBot?.value || null,
      welcome_message: welDescInput?.value || '',
      welcome_embed: {
        author: {
          name: welAuthorNameInput?.value?.trim() || null,
          icon_url: welAuthorIconInput?.value?.trim() || null,
          url: welTitleUrlInput?.value?.trim() || null
        },
        title: welTitleInput?.value?.trim() || '⚔️ Benvenuto nel Reame, {user}!',
        url: welTitleUrlInput?.value?.trim() || null,
        color: welColorHexInput?.value || welColorInput?.value || '#dc2626',
        description: welDescInput?.value || '',
        thumbnail: welThumbInput?.value?.trim() || '{user.avatar}',
        image: welImageInput?.value?.trim() || null,
        fields: welFields.filter(f => f.name && f.value),
        footer: {
          text: welFooterTextInput?.value?.trim() || 'Membro #{memberCount} • {server.name}',
          icon_url: welFooterIconInput?.value?.trim() || null
        },
        timestamp: true
      },
      welcome_dm_enabled: document.getElementById('wel-dm-enabled')?.checked,
      welcome_dm_message: document.getElementById('wel-dm-message')?.value,
      leave_enabled: document.getElementById('wel-leave-enabled')?.checked,
      leave_channel_id: document.getElementById('wel-leave-channel')?.value || null,
      leave_message: document.getElementById('wel-leave-message')?.value
    };
  }
  window.getWelcomerPayload = getWelcomerPayload;

  // Load Welcomer from Database
  window.loadWelcomerData = async function (guildId) {
    if (!guildId) return;
    try {
      const res = await fetch(`/api/guilds/${guildId}/welcomer`);
      if (!res.ok) return;
      const config = await res.json();

      if (welEnabledToggle) welEnabledToggle.checked = Boolean(config.welcome_enabled);
      if (welChannelSelect) {
        welChannelSelect.dataset.savedValue = config.welcome_channel_id || '';
        if (config.welcome_channel_id) welChannelSelect.value = config.welcome_channel_id;
      }
      if (welAutoRoleUser) {
        welAutoRoleUser.dataset.savedValue = config.auto_role_user || '';
        if (config.auto_role_user) welAutoRoleUser.value = config.auto_role_user;
      }
      if (welAutoRoleBot) {
        welAutoRoleBot.dataset.savedValue = config.auto_role_bot || '';
        if (config.auto_role_bot) welAutoRoleBot.value = config.auto_role_bot;
      }

      const emb = config.welcome_embed || {};

      if (welAuthorNameInput) welAuthorNameInput.value = emb.author?.name || emb.author_name || '';
      if (welAuthorIconInput) welAuthorIconInput.value = emb.author?.icon_url || emb.author_icon || '';
      if (welTitleInput) welTitleInput.value = emb.title || '⚔️ Benvenuto nel Reame, {user}!';
      if (welTitleUrlInput) welTitleUrlInput.value = emb.url || '';
      if (welDescInput) welDescInput.value = emb.description || config.welcome_message || 'Benvenuto {user.mention} in **{server.name}**! Siamo felici di averti tra noi. Sei il membro **#{memberCount}**!';
      
      const col = emb.color || '#DC2626';
      if (welColorInput) welColorInput.value = col;
      if (welColorHexInput) welColorHexInput.value = col;

      if (welThumbInput) welThumbInput.value = emb.thumbnail?.url || emb.thumbnail || '{user.avatar}';
      if (welImageInput) welImageInput.value = emb.image?.url || emb.image || '';
      if (welFooterTextInput) welFooterTextInput.value = emb.footer?.text || emb.footer || 'Membro #{memberCount} • {server.name}';
      if (welFooterIconInput) welFooterIconInput.value = emb.footer?.icon_url || emb.footer_icon || '';

      welFields = emb.fields && Array.isArray(emb.fields) ? [...emb.fields] : [];
      renderWelFieldsList();

      const dmEn = document.getElementById('wel-dm-enabled');
      const dmMsg = document.getElementById('wel-dm-message');
      const lvEn = document.getElementById('wel-leave-enabled');
      const lvCh = document.getElementById('wel-leave-channel');
      const lvMsg = document.getElementById('wel-leave-message');

      if (dmEn) dmEn.checked = Boolean(config.welcome_dm_enabled);
      if (dmMsg && config.welcome_dm_message) dmMsg.value = config.welcome_dm_message;
      if (lvEn) lvEn.checked = Boolean(config.leave_enabled);
      if (lvCh) {
        lvCh.dataset.savedValue = config.leave_channel_id || '';
        if (config.leave_channel_id) lvCh.value = config.leave_channel_id;
      }
      if (lvMsg && config.leave_message) lvMsg.value = config.leave_message;

      updateWelcomerPreview();
    } catch (e) {
      console.error('Error loading welcomer data:', e);
    }
  };

  const btnSaveWel = document.getElementById('btn-save-welcomer');
  if (btnSaveWel) {
    btnSaveWel.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      if (!guildId) return window.showToast('Nessun server selezionato.', 'error');
      const payload = getWelcomerPayload();

      try {
        btnSaveWel.disabled = true;
        btnSaveWel.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Salvataggio...';
        if (window.lucide) lucide.createIcons();

        const res = await fetch(`/api/guilds/${guildId}/welcomer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          window.showToast('Impostazioni Welcomer Embed salvate con successo!');
        } else {
          window.showToast('Errore durante il salvataggio.', 'error');
        }
      } catch (err) {
        window.showToast(`Errore: ${err.message}`, 'error');
      } finally {
        btnSaveWel.disabled = false;
        btnSaveWel.innerHTML = '<i data-lucide="save" class="w-3.5 h-3.5"></i> Salva Impostazioni Welcomer';
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  const btnTestWel = document.getElementById('btn-test-welcomer');
  if (btnTestWel) {
    btnTestWel.addEventListener('click', async () => {
      const guildId = window.AppState.currentGuildId;
      if (!guildId) return window.showToast('Nessun server selezionato.', 'error');
      const payload = getWelcomerPayload();

      try {
        btnTestWel.disabled = true;
        btnTestWel.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Invio test...';
        if (window.lucide) lucide.createIcons();

        // 1. Save first
        await fetch(`/api/guilds/${guildId}/welcomer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        // 2. Fire test
        const res = await fetch(`/api/guilds/${guildId}/welcomer/test`, { method: 'POST' });
        const data = await res.json();
        if (res.ok && data.success) {
          window.showToast('Embed di benvenuto inviato con successo nel canale Discord!');
        } else {
          window.showToast(data.error || 'Errore invio test.', 'error');
        }
      } catch (err) {
        window.showToast(`Errore: ${err.message}`, 'error');
      } finally {
        btnTestWel.disabled = false;
        btnTestWel.innerHTML = '<i data-lucide="send" class="w-3.5 h-3.5"></i> Invia Embed di Prova nel Canale';
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  const btnResetWel = document.getElementById('btn-reset-welcomer');
  if (btnResetWel) {
    btnResetWel.addEventListener('click', () => {
      if (!confirm('Reimpostare il Welcomer con i valori predefiniti?')) return;
      if (welAuthorNameInput) welAuthorNameInput.value = '';
      if (welAuthorIconInput) welAuthorIconInput.value = '';
      if (welTitleInput) welTitleInput.value = '⚔️ Benvenuto nel Reame, {user}!';
      if (welTitleUrlInput) welTitleUrlInput.value = '';
      if (welColorInput) welColorInput.value = '#dc2626';
      if (welColorHexInput) welColorHexInput.value = '#DC2626';
      if (welDescInput) welDescInput.value = 'Benvenuto {user.mention} in **{server.name}**! Siamo felici di averti tra noi. Sei il membro **#{memberCount}**!';
      if (welImageInput) welImageInput.value = '';
      if (welThumbInput) welThumbInput.value = '{user.avatar}';
      if (welFooterTextInput) welFooterTextInput.value = 'Membro #{memberCount} • {server.name}';
      if (welFooterIconInput) welFooterIconInput.value = '';
      welFields = [];
      renderWelFieldsList();
      updateWelcomerPreview();
      window.showToast('Welcomer reimpostato.');
    });
  }

  const btnCopyWel = document.getElementById('btn-copy-wel-json');
  if (btnCopyWel) {
    btnCopyWel.addEventListener('click', () => {
      const payload = getWelcomerPayload();
      navigator.clipboard.writeText(JSON.stringify(payload.welcome_embed, null, 2))
        .then(() => window.showToast('JSON Embed copiato negli appunti!'))
        .catch(() => window.showToast('Impossibile copiare negli appunti.', 'error'));
    });
  }

  window.loadEmbedBuilderData = function (guildId) {
    loadDraftFromLocalStorage(guildId);
    loadSavedTemplates(guildId);
    updatePreview();
  };

  // Initialize embed builder specific components
  setupEmbedFormattingToolbar();
  window.setupSearchableSelect('embed-channel-search', 'embed-channel', 'text');
  updatePreview();
  updateWelcomerPreview();
})();

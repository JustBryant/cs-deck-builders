document.addEventListener('DOMContentLoaded', initializeCSBuilder);

// DOM refs
const loadingOverlay = document.getElementById('loading-overlay');
const themeToggleBtn = document.getElementById('theme-toggle');
const previewEl = document.getElementById('card-preview');
const searchBar = document.getElementById('search-bar');
const searchResults = document.getElementById('search-results');
const fCategory = document.getElementById('f-category');
const fAttribute = document.getElementById('f-attribute');
const fRace = document.getElementById('f-race');
const fCardType = document.getElementById('f-type');
const fLevel = document.getElementById('f-level');
const fScale = document.getElementById('f-scale');
const fAtk = document.getElementById('f-atk');
const fDef = document.getElementById('f-def');
const fClearBtn = document.getElementById('f-clear');
const monsterTagCheckboxes = Array.from(document.querySelectorAll('.f-monster-tag'));
const characterSelect = document.getElementById('character-select');
const charlistCurrent = document.getElementById('charlist-current');

// Deck zones
const mainDeckGrid = document.getElementById('main-deck');
const extraDeckGrid = document.getElementById('extra-deck');
const sideDeckGrid = document.getElementById('side-deck');
const mainCount = document.getElementById('main-count');
const extraCount = document.getElementById('extra-count');
const sideCount = document.getElementById('side-count');

// Export buttons
const clearDeckBtn = document.getElementById('clear-deck');
const exportYdkBtn = document.getElementById('export-ydk');
const copyYdkeBtn = document.getElementById('copy-ydke');
const importStatus = document.getElementById('import-status');

// Data stores
const idToCard = new Map();
const nameToId = new Map();
let allCards = [];
let currentResults = [];
let currentPage = 0;
const CARDS_PER_PAGE = 12;

// Lazy name resolution cache and inflight tracker
const nameCache = new Map(); // id -> name
const nameFetchInFlight = new Map(); // id -> Promise<string|null>
let pendingResultsRefresh = false;
// Config
let csConfig = { ignisMode: 'hybrid', enableEdoproDb: true, enableCardScripts: false, allowYgoCdnImages: true }; // 'hybrid' | 'ignis-only' | 'api-only'

// EDOPro database configuration
const edoproCdbUrls = [
  // Use the direct Delta CDB link you provided
  'https://github.com/ProjectIgnis/DeltaBagooska/raw/master/cards.delta.cdb',
  // Backup sources
  'https://raw.githubusercontent.com/ProjectIgnis/CardScripts/master/cards.cdb',
  'https://cdn.jsdelivr.net/gh/ProjectIgnis/CardScripts@master/cards.cdb',
  'https://raw.githubusercontent.com/ProjectIgnis/CardScripts/master/prerelease.cdb'
];
let edoproDbs = [];
let edoproDbLoaded = false;
let sqlJsModule = null;
const SQL_JS_URL = 'https://sql.js.org/dist/sql-wasm.js';
const SQL_WASM_URL = 'https://sql.js.org/dist/sql-wasm.wasm';

// Constants (match main builder)
const MONSTER_TYPES = [
  'Aqua','Beast','Beast-Warrior','Cyberse','Dinosaur','Divine-Beast','Dragon','Fairy','Fiend','Fish','Insect','Machine','Plant','Psychic','Pyro','Reptile','Rock','Sea Serpent','Spellcaster','Thunder','Warrior','Winged Beast','Wyrm','Zombie','Creator God','Illusion'
];

// Character pools
let characters = [];
let activeChar = null; // { name, pool, banned, limited, semi, specialUnlimited? }
let poolSet = null; // Set of ids allowed
let limitsMap = null; // Map id->0/1/2/3 (3 = default unlimited normal cap)
let unlimitedSpecialSet = null; // Set of ids with special unlimited (infinite copies) rules for active character
let staplesSet = null; // Set of staple ids for this character (optional)
let staplesMax = null; // Max number of staples allowed (optional)
// Optional runtime-configurable image mirror bases
let imageMirrorBases = null; // array of base URLs ending at repo root with pics/pics_small folders
let imageAliasMap = null; // optional map of id -> direct image URL
const IMG_BUST = (()=>{
  try {
    // Change per load; keep reasonably stable if user scrolls
    return String(Math.floor(Date.now()/1000));
  } catch { return '1'; }
})();

function withBust(u){
  try {
    if (!u) return u;
    const hasQ = u.includes('?');
    return u + (hasQ ? '&' : '?') + 'v=' + IMG_BUST;
  } catch { return u; }
}

async function initializeCSBuilder(){
  initTheme();
  showLoading(true, 'Loading Card Database...');
  try {
    // Load official cards
    await loadApiCards();

    // Supplemental merge (anime/manga/VG) now resilient to late loading of anime_cards.js
    let supplementalMerged = false;
    function mergeSupplementalCards(trigger='initial'){
      if (supplementalMerged) return;
      if (typeof allAnimeCardsData === 'undefined') return; // wait until available
      try {
        const animeKeys = Object.keys(allAnimeCardsData);
        console.log(`[CS] (${trigger}) Merging ${animeKeys.length} supplemental (anime/manga/VG/custom) cards from anime_cards.js`);
        
        // Helper function to normalize card names for comparison (remove variant suffixes)
        const normalizeCardName = (name) => {
          if (!name) return '';
          return name.trim().toLowerCase()
            .replace(/\s*\(anime\)\s*$/i, '')
            .replace(/\s*\(manga\)\s*$/i, '')
            .replace(/\s*\(vg\)\s*$/i, '')
            .trim();
        };
        
        // Create a map of normalized names to official cards for deduplication
        const officialCardsByName = new Map();
        allCards.forEach(card => {
          const normalizedName = normalizeCardName(card.name);
          if (normalizedName) {
            officialCardsByName.set(normalizedName, card);
          }
        });
        
        let skipped = 0, added = 0, replaced = 0;
        for (const id of animeKeys) {
          const card = allAnimeCardsData[id];
          if (!card) continue;
          
          const nmRaw = (card.name||'').trim();
          const lowerName = nmRaw.toLowerCase();
          const normalizedName = normalizeCardName(nmRaw);
          
          const isAnimeOrManga = lowerName.includes('(anime)') || lowerName.includes('(manga)');
          const isVG = lowerName.includes('(vg)') || (Array.isArray(card.misc_info) && card.misc_info.some(m=>m && m.video_game_variant));
          const isVariant = isAnimeOrManga || isVG;
          
          // Skip if this is a variant and an official card with the same normalized name exists
          if (isVariant && officialCardsByName.has(normalizedName)) {
            skipped++;
            console.log(`[CS] Skipping variant "${nmRaw}" - official version exists`);
            continue;
          }
          
          if (!idToCard.has(card.id)) {
            // Check if we're adding a variant card - if so, verify no official version exists
            if (isVariant && officialCardsByName.has(normalizedName)) {
              skipped++;
              continue;
            }
            
            allCards.push(card);
            idToCard.set(card.id, card);
            const nm = (card.name||'').trim(); 
            if (nm && !nameToId.has(nm)) nameToId.set(nm, card.id);
            added++;
          } else if (isVG) {
            const existing = idToCard.get(card.id);
            if (existing && !/(\(vg\))/i.test(existing.name||'')) {
              idToCard.set(card.id, card);
              const idx = allCards.findIndex(c => c && c.id === card.id);
              if (idx >= 0) allCards[idx] = card;
              const nm = (card.name||'').trim(); 
              if (nm && !nameToId.has(nm)) nameToId.set(nm, card.id);
              replaced++;
            }
          } else {
            skipped++;
          }
        }
        supplementalMerged = true;
        console.log(`[CS] Supplemental merge complete: added=${added}, replacedWithVG=${replaced}, skipped=${skipped}`);
        // If a character already selected, refresh search so newly merged cards appear
        if (activeChar) refreshSearchResults();
      } catch(e){ console.warn('[CS] Supplemental merge failed', e); }
    }
    // Attempt immediate merge (if file loaded before us)
    mergeSupplementalCards('initial');
    // Listen for readiness event dispatched by anime_cards.js (added in patch)
    window.addEventListener('animeCardsDataReady', () => mergeSupplementalCards('event'));
    // Fallback polling (in case event missed) for up to 3 seconds
  // Extend polling window (was 3s ~30*100ms). Increase to ~8s to accommodate slower loads.
  let pollCount = 0; const poll = () => { if (!supplementalMerged && pollCount < 80){ pollCount++; mergeSupplementalCards('poll'); if(!supplementalMerged) setTimeout(poll,100);} }; poll();
    // Removed previous hardcoded safety injection: now fully data-driven via JSON + supplemental dataset

    // Create lookup maps
    allCards.forEach(c => {
      idToCard.set(c.id, c);
      const nm = (c.name||'').trim();
      if (nm && !nameToId.has(nm)) nameToId.set(nm, c.id);
    });

    // Load character pools from local JSON with robust fallbacks for file://
    async function loadCharactersData(){
      // Try JSON first
      try {
        if (location.protocol === 'file:') {
          console.warn('[CS] Running under file://; direct fetch may be blocked by browser CORS. Will attempt anyway, then fallbacks. Consider starting a local server (e.g., python -m http.server) to avoid this.');
        }
        // Force cache bypass with timestamp
        const timestamp = Date.now();
        const res = await fetch(`cs-characters.json?v=${timestamp}`, { 
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        if (res.ok) {
          const j = await res.json();
          return j;
        }
      } catch (e) {
        // ignore; we'll fallback below
      }
      // Inline <script type="application/json" id="cs-characters-inline"> fallback (user can embed raw JSON to avoid fetch issues)
      try {
        const inline = document.getElementById('cs-characters-inline');
        if (inline && inline.textContent.trim()) {
          const parsed = JSON.parse(inline.textContent);
          console.log('[CS] Loaded characters from inline JSON script tag.');
          return parsed;
        }
      } catch (e) { console.warn('[CS] Inline JSON parse failed', e); }
      // Fallback: if a global is present (from cs-characters.js), use it
      if (window.CS_CHARACTERS && window.CS_CHARACTERS.characters) {
        console.warn('[CS] Using global CS_CHARACTERS fallback (ensure it is up to date).');
        return window.CS_CHARACTERS;
      }
      // Try to dynamically load cs-characters.js then read global
      await new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = 'cs-characters.js';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => resolve();
        document.head.appendChild(s);
      });
      if (window.CS_CHARACTERS && window.CS_CHARACTERS.characters) {
        console.warn('[CS] Loaded cs-characters.js via dynamic script fallback.');
        return window.CS_CHARACTERS;
      }
      return { characters: [] };
    }

  const charData = await loadCharactersData();
  characters = (charData.characters || []).map(resolveCharacterIds);
  console.log('[CS] Loaded characters:', characters.length);
  
  // Sort characters alphabetically by name before adding to dropdown
  const sortedCharacters = characters.slice().sort((a, b) => a.name.localeCompare(b.name));
  
  sortedCharacters.forEach(ch => {
    const opt = document.createElement('option');
    opt.value = ch.name; opt.textContent = ch.name; characterSelect.appendChild(opt);
  });

  // Wire events
    searchBar.addEventListener('input', handleSearch);
    document.getElementById('search-button').addEventListener('click', () => refreshSearchResults());
    [fCategory,fAttribute,fRace,fCardType,fLevel,fScale,fAtk,fDef].forEach(el => el && el.addEventListener('input', refreshSearchResults));
    monsterTagCheckboxes.forEach(cb => cb.addEventListener('change', () => { updateFilterEnablement(); refreshSearchResults(); }));
    if (fCategory) fCategory.addEventListener('change', () => { updateFilterEnablement(); updateCardTypeOptions(); refreshSearchResults(); });
    if (fClearBtn) fClearBtn.addEventListener('click', clearFilters);

  if (characterSelect) characterSelect.addEventListener('change', onCharacterChange);

    clearDeckBtn.addEventListener('click', clearDeck);
    exportYdkBtn.addEventListener('click', exportYdk);
    copyYdkeBtn.addEventListener('click', copyYdke);
    if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);

    // Populate attribute/type options and apply gating just like the main builder
    populateFilterOptions();
    updateCardTypeOptions();
    updateFilterEnablement();
    handleSearch({ target: searchBar });
    setupDragAndDrop();
    renderDeck();
  } catch (err) {
    console.error(err);
    showLoading(true, `Error loading database. Refresh page. (${err.message})`);
  } finally {
    showLoading(false);
  }
}

// Load official card database via YGOPRODeck API
async function loadApiCards(){
  try {
    const response = await fetch('https://db.ygoprodeck.com/api/v7/cardinfo.php?misc=yes');
    if (!response.ok) throw new Error(`Network error: ${response.status}`);
    const payload = await response.json();
    allCards = (payload.data || []).filter(c=>!isTokenOrSkill(c));
    allCards.forEach(c => {
      idToCard.set(c.id, c);
      const nm = (c.name||'').trim();
      if (nm && !nameToId.has(nm)) nameToId.set(nm, c.id);
    });
    return true;
  } catch (e) {
    console.warn('[CS] Failed to load YGOPRODeck API dataset:', e?.message || e);
    return false;
  }
}

// Theme helpers (copied)
function initTheme() {
  const saved = localStorage.getItem('genesys-theme');
  let theme = saved;
  if (!theme) {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    theme = prefersDark ? 'dark' : 'light';
  }
  applyTheme(theme);
}
function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.body.setAttribute('data-theme', t);
  if (themeToggleBtn) themeToggleBtn.textContent = t === 'dark' ? 'Light Mode' : 'Dark Mode';
}
function toggleTheme() {
  const current = document.body.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('genesys-theme', next); } catch {}
}
function showLoading(isLoading, message = 'Loading...') {
  if (isLoading) {
    loadingOverlay.querySelector('p').textContent = message;
    loadingOverlay.style.display = 'flex';
  } else {
    loadingOverlay.style.display = 'none';
  }
}

// Notification system
function showNotification(message, type = 'warning', duration = 4000) {
  // Create notification element if it doesn't exist
  let notification = document.getElementById('notification');
  if (!notification) {
    notification = document.createElement('div');
    notification.id = 'notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #fff;
      border: 2px solid #ffa500;
      border-radius: 8px;
      padding: 15px 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      max-width: 400px;
      font-size: 14px;
      font-weight: 500;
      display: none;
      transform: translateX(100%);
      transition: transform 0.3s ease-in-out;
    `;
    document.body.appendChild(notification);
  }
  
  // Set notification style based on type
  const colors = {
    warning: { border: '#ffa500', bg: '#fff8e1', text: '#e65100' },
    error: { border: '#f44336', bg: '#ffebee', text: '#c62828' },
    success: { border: '#4caf50', bg: '#e8f5e9', text: '#2e7d32' },
    info: { border: '#2196f3', bg: '#e3f2fd', text: '#1565c0' }
  };
  
  const color = colors[type] || colors.warning;
  notification.style.borderColor = color.border;
  notification.style.backgroundColor = color.bg;
  notification.style.color = color.text;
  notification.textContent = message;
  
  // Show notification
  notification.style.display = 'block';
  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
  }, 10);
  
  // Hide notification after duration
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      notification.style.display = 'none';
    }, 300);
  }, duration);
}

// Custom confirmation dialog
function showCustomConfirm(title, message, onConfirm, onCancel) {
  return new Promise((resolve) => {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 20000;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(2px);
    `;
    
    // Create dialog
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: var(--bg-primary, #ffffff);
      border: 2px solid var(--border-color, #e0e0e0);
      border-radius: 12px;
      padding: 24px;
      max-width: 400px;
      min-width: 320px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      color: var(--text-primary, #333);
      font-family: inherit;
    `;
    
    // Create content
    dialog.innerHTML = `
      <div style="margin-bottom: 16px;">
        <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: var(--text-primary, #333);">${title}</h3>
        <p style="margin: 0; font-size: 14px; line-height: 1.4; color: var(--text-secondary, #666);">${message}</p>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button id="custom-cancel" style="
          background: var(--bg-secondary, #f5f5f5);
          border: 1px solid var(--border-color, #ddd);
          border-radius: 6px;
          padding: 8px 16px;
          font-size: 14px;
          cursor: pointer;
          color: var(--text-primary, #333);
          transition: all 0.2s;
        ">Cancel</button>
        <button id="custom-confirm" style="
          background: #dc3545;
          border: 1px solid #dc3545;
          border-radius: 6px;
          padding: 8px 16px;
          font-size: 14px;
          cursor: pointer;
          color: white;
          font-weight: 500;
          transition: all 0.2s;
        ">Remove Anyway</button>
      </div>
    `;
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // Add hover effects
    const cancelBtn = dialog.querySelector('#custom-cancel');
    const confirmBtn = dialog.querySelector('#custom-confirm');
    
    cancelBtn.addEventListener('mouseenter', () => {
      cancelBtn.style.background = 'var(--bg-hover, #e9e9e9)';
    });
    cancelBtn.addEventListener('mouseleave', () => {
      cancelBtn.style.background = 'var(--bg-secondary, #f5f5f5)';
    });
    
    confirmBtn.addEventListener('mouseenter', () => {
      confirmBtn.style.background = '#c82333';
    });
    confirmBtn.addEventListener('mouseleave', () => {
      confirmBtn.style.background = '#dc3545';
    });
    
    // Handle clicks
    const cleanup = () => {
      document.body.removeChild(overlay);
    };
    
    cancelBtn.addEventListener('click', () => {
      cleanup();
      if (onCancel) onCancel();
      resolve(false);
    });
    
    confirmBtn.addEventListener('click', () => {
      cleanup();
      if (onConfirm) onConfirm();
      resolve(true);
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        if (onCancel) onCancel();
        resolve(false);
      }
    });
    
    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        cleanup();
        document.removeEventListener('keydown', handleEscape);
        if (onCancel) onCancel();
        resolve(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
  });
}

// Search
function handleSearch(e) {
  const query = (e.target?.value || '').toLowerCase().trim();
  
  let results = allCards.filter(c => matchesQueryAndFilters(c, query));
  // Sort alphabetically by name, then by id
  results = results.slice().sort((a,b)=>{
    const an = (a.name||'').trim();
    const bn = (b.name||'').trim();
    if (an && bn) return an.localeCompare(bn);
    if (an) return -1; if (bn) return 1;
    return (a.id||0) - (b.id||0);
  });

  currentResults = results;
  currentPage = 0;
  renderSearchPage();
}

function refreshSearchResults(){ handleSearch({ target: { value: searchBar.value } }); }

// Unified image loader: KingdomsImages -> character-showdown -> placeholder
function loadImagesSequentially(queue){
  let activeLoads = 0; const MAX = 8;
  function next(){
    while(activeLoads < MAX && queue.length){
      const img = queue.shift();
      if (!img) continue;
      const cardId = img.closest('.card')?.dataset.cardId;
      if (!cardId){ attachPlaceholder(img); continue; }
      activeLoads++;
      const sources = [
        `https://cdn.jsdelivr.net/gh/JustBryant/KingdomsImages@main/CS_Images/${cardId}.jpg`,
        `https://cdn.jsdelivr.net/gh/franluque2/character-showdown@main/pics/${cardId}.jpg`
      ];
      let attempt = 0;
      function trySrc(){
        if (attempt < sources.length){
          const url = sources[attempt];
          console.log(`Search image ${cardId} attempt ${attempt+1}: ${url}`);
          img.src = url;
        } else {
          console.log(`Search image ${cardId} all sources failed`);
          attachPlaceholder(img);
          done();
        }
      }
      function done(){ if(!img.__done){ img.__done=true; activeLoads--; next(); } }
      img.onload = ()=> done();
      img.onerror = ()=> { attempt++; trySrc(); };
      trySrc();
    }
  }
  next();
}

function attachPlaceholder(img){
  if (!img || img.__placeholder) return;
  img.__placeholder = true;
  const w = img.style.width || '120px';
  const h = img.style.height || '175px';
  img.style.display='none';
  const ph = document.createElement('div');
  ph.style.width = w; ph.style.height = h; ph.style.background='#666'; ph.style.borderRadius='8px';
  ph.style.display='flex'; ph.style.alignItems='center'; ph.style.justifyContent='center';
  ph.style.color='#ccc'; ph.style.fontSize='12px'; ph.textContent='No Image';
  img.parentNode && img.parentNode.appendChild(ph);
}

function renderSearchPage() {
    if (!currentResults) return;

    searchResults.innerHTML = '';
    
    const totalPages = Math.ceil(currentResults.length / CARDS_PER_PAGE);
    const start = currentPage * CARDS_PER_PAGE;
    const end = Math.min(start + CARDS_PER_PAGE, currentResults.length);
    const pageResults = currentResults.slice(start, end);

    pageResults.forEach(card => {
        const el = createCardElement(card);
        el.title = 'Click: Main | Right-Click: Extra (if Extra type) | Shift+Click: Side | Ctrl+Right-Click: Side';
        
        // Mobile-aware event handling
        if (window.innerWidth <= 768) {
            // Mobile: Use double-tap instead of single click
            let tapCount = 0;
            let tapTimer = null;
            
            el.addEventListener('touchstart', (evt) => {
                tapCount++;
                if (tapCount === 1) {
                    tapTimer = setTimeout(() => {
                        tapCount = 0; // Reset tap count after delay
                    }, 300);
                } else if (tapCount === 2) {
                    clearTimeout(tapTimer);
                    tapCount = 0;
                    evt.preventDefault();
                    
                    // Double-tap: add to appropriate deck
                    if (evt.shiftKey) addToDeck(card, 'side'); 
                    else addToDeck(card, isExtraDeckCard(card) ? 'extra' : 'main');
                }
            });
            
            // Still handle right-click/long-press for extra deck
            el.addEventListener('contextmenu', (evt) => { 
                evt.preventDefault(); 
                if (evt.ctrlKey || evt.metaKey) addToDeck(card, 'side'); 
                else addToDeck(card, 'extra'); 
            });
        } else {
            // Desktop: Use single click as before
            el.addEventListener('click', (evt) => { 
                if (evt.shiftKey) addToDeck(card, 'side'); 
                else addToDeck(card, isExtraDeckCard(card) ? 'extra' : 'main'); 
            });
            el.addEventListener('contextmenu', (evt) => { 
                evt.preventDefault(); 
                if (evt.ctrlKey || evt.metaKey) addToDeck(card, 'side'); 
                else addToDeck(card, 'extra'); 
            });
        }
        
        searchResults.appendChild(el);
    // Image now loads immediately with internal fallback logic (no queue)
    });

  // Queue based loader removed for search results (immediate load now)

    // Remove old pagination controls if they exist
    const oldPagination = document.getElementById('pagination-controls');
    if (oldPagination) {
        oldPagination.remove();
    }

    if (totalPages > 1) {
        const paginationControls = document.createElement('div');
        paginationControls.id = 'pagination-controls';
        paginationControls.style.textAlign = 'center';
        paginationControls.style.marginTop = '0.5rem';
        paginationControls.style.marginBottom = '1rem';
        paginationControls.style.padding = '10px';
        paginationControls.style.display = 'flex';
        paginationControls.style.justifyContent = 'center';
        paginationControls.style.alignItems = 'center';
        paginationControls.style.gap = '10px';

        const prevButton = document.createElement('button');
        prevButton.textContent = '◀';
        prevButton.disabled = currentPage === 0;
        prevButton.style.padding = '8px 12px';
        prevButton.style.fontSize = '14px';
        prevButton.style.minWidth = '40px';
        prevButton.addEventListener('click', () => {
            if (currentPage > 0) {
                currentPage--;
                renderSearchPage();
            }
        });

        const pageInfo = document.createElement('span');
        pageInfo.textContent = `Page ${currentPage + 1} of ${totalPages}`;
        pageInfo.style.margin = '0 1rem';
        pageInfo.style.fontSize = '14px';
        pageInfo.style.fontWeight = 'bold';

        const nextButton = document.createElement('button');
        nextButton.textContent = '▶';
        nextButton.disabled = currentPage >= totalPages - 1;
        nextButton.style.padding = '8px 12px';
        nextButton.style.fontSize = '14px';
        nextButton.style.minWidth = '40px';
        nextButton.addEventListener('click', () => {
            if (currentPage < totalPages - 1) {
                currentPage++;
                renderSearchPage();
            }
        });

        paginationControls.appendChild(prevButton);
        paginationControls.appendChild(pageInfo);
        paginationControls.appendChild(nextButton);
        searchResults.parentNode.insertBefore(paginationControls, searchResults.nextSibling);
    }
}

function createCardElement(card){
  const div = document.createElement('div');
  div.className = 'card';
  div.dataset.cardId = card.id;
  div.draggable = true;
  div.addEventListener('dragstart', (e)=> onDragStartFromSearch(e, card));
  div.addEventListener('dragend', onDragEndGlobal);
  
  // Check if mobile layout
  const isMobile = window.innerWidth <= 768;
  
  if (isMobile) {
    // Mobile layout: horizontal card with image + info
    const img = document.createElement('img');
    img.alt = card.name;
    img.loading = 'lazy';
    
    const cardInfo = document.createElement('div');
    cardInfo.className = 'card-info';
    
    const cardName = document.createElement('div');
    cardName.className = 'card-name';
    cardName.textContent = card.name;
    
    const cardType = document.createElement('div');
    cardType.className = 'card-type';
    
    // Build type line
    let typeLine = '';
    if (card.type) {
      if (card.type.includes('Monster')) {
        typeLine = `${card.race || 'Unknown'} / ${card.type}`;
        if (card.attribute) typeLine = `[${card.attribute}] ${typeLine}`;
        if (card.level !== undefined) typeLine += ` / Level ${card.level}`;
        if (card.atk !== undefined) typeLine += ` / ATK: ${card.atk}`;
        if (card.def !== undefined) typeLine += ` / DEF: ${card.def}`;
      } else {
        typeLine = card.type;
        if (card.race && card.race !== 'Normal') typeLine += ` / ${card.race}`;
      }
    }
    cardType.textContent = typeLine;
    
    cardInfo.appendChild(cardName);
    cardInfo.appendChild(cardType);
    div.appendChild(img);
    div.appendChild(cardInfo);
    
    // Start loading immediately
    loadSingleCardImage(img, card.id);
  } else {
    // Desktop layout: original image-only layout
    const img = document.createElement('img');
    img.alt = card.name;
    img.loading = 'lazy';
    img.style.width = '120px';
    img.style.height = '175px';
    img.style.objectFit = 'cover';
    
    div.appendChild(img);
    
    // Start loading immediately (independent of batch queue)
    loadSingleCardImage(img, card.id);
  }

  // Character list badge
  if (activeChar){
    const lim = limitsMap.get(card.id);
    if (lim !== undefined && lim !== 3){
      const status = lim===0?'banned':lim===1?'limited':lim===2?'semi':null;
      if (status){
        const b = document.createElement('span');
        b.className = `banlist-badge ${status}`;
        if (status === 'limited') b.textContent = '1';
        else if (status === 'semi') b.textContent = '2';
        b.title = status === 'banned' ? `Forbidden (${activeChar.name})`
          : status === 'limited' ? `Limited (${activeChar.name})`
          : `Semi-Limited (${activeChar.name})`;
        div.appendChild(b);
      }
    }
    if (unlimitedSpecialSet && unlimitedSpecialSet.has(card.id)){
      const ub = document.createElement('span');
      ub.className = 'banlist-badge unlimited-special';
      ub.textContent = '∞';
      ub.title = `Unlimited Special (${activeChar.name})`;
      div.appendChild(ub);
    }
  }

  // No visual badge for non-official cards to avoid visual noise

  div.addEventListener('mouseenter', (e)=> showPreview(null, e, card));
  div.addEventListener('mousemove', (e)=> positionPreview(e));
  div.addEventListener('mouseleave', hidePreview);
  return div;
}

// Load a single card image immediately with fallback chain.
function loadSingleCardImage(img, cardId){
  if (!img || !cardId) return;
  const sources = [
    `https://cdn.jsdelivr.net/gh/JustBryant/KingdomsImages@main/CS_Images/${cardId}.jpg`,
    `https://cdn.jsdelivr.net/gh/franluque2/character-showdown@main/pics/${cardId}.jpg`
  ];
  let attempt = 0;
  function tryNext(){
    if (attempt < sources.length){
      const url = sources[attempt];
      console.log(`Immediate image load attempt ${attempt+1}/${sources.length} for ${cardId}: ${url}`);
      img.src = url;
    } else {
      attachPlaceholder(img);
    }
  }
  img.onload = () => { /* success */ };
  img.onerror = () => { attempt++; tryNext(); };
  tryNext();
}

function matchesQueryAndFilters(card, query){
  if (isTokenOrSkill(card)) return false;
  
  // When a character is selected, restrict to their pool
  if (activeChar && poolSet && !poolSet.has(card.id)) return false;
  if (query) {
    const cname = (card.name || '').toLowerCase();
    const nameHit = cname.includes(query);
    const idHit = String(card.id || '').includes(query.replace(/[^0-9]/g,''));
    if (!nameHit && !(idHit && query.replace(/[^0-9]/g,'').length >= 3)) return false;
  }
  let selectedCategory = null;
  if (fCategory && fCategory.value !== 'all'){
    selectedCategory = fCategory.value; const cardCat = detectCardCategory(card);
    if (cardCat && cardCat.toLowerCase() !== selectedCategory.toLowerCase()) return false;
  }
  if (fAttribute && !fAttribute.disabled && fAttribute.value && fAttribute.value !== 'all'){
    if ((card.attribute||'').toLowerCase() !== fAttribute.value.toLowerCase()) return false;
  }
  if (fCardType && !fCardType.disabled && fCardType.value && fCardType.value !== 'all'){
    const cat = (selectedCategory || detectCardCategory(card)); const normalized = normalizeCardType(card, cat);
    if (!normalized) return false; if (normalized.toLowerCase() !== fCardType.value.toLowerCase()) return false;
  }
  if (fRace && !fRace.disabled && fRace.value && fRace.value !== 'all'){
    if ((card.race||'').toLowerCase() !== fRace.value.toLowerCase()) return false;
  }
  if (monsterTagCheckboxes.length && monsterTagCheckboxes.some(cb=>!cb.disabled && cb.checked)){
    const typeStr=(card.type||'').toLowerCase(); const frameStr=(card.frameType||'').toLowerCase();
    for (const cb of monsterTagCheckboxes){
      if (cb.disabled || !cb.checked) continue;
      const tag = cb.value.toLowerCase();
      if (tag === 'pendulum'){
        const hasScale = card.scale != null || card.pend_scale != null;
        const isPendulum = hasScale || typeStr.includes('pendulum') || frameStr.includes('pendulum');
        if (!isPendulum) return false;
      } else {
        if (!typeStr.includes(tag)) return false;
      }
    }
  }
  const level = card.level ?? card.linkval ?? 0;
  if (fLevel && !fLevel.disabled && fLevel.value && !compareWithOperator(level, fLevel.value)) return false;
  if (fScale && !fScale.disabled && fScale.value){
    const scale = card.scale ?? card.pend_scale ?? null; if (scale === null || scale !== parseInt(fScale.value,10)) return false;
  }
  const atk = card.atk ?? -1; const def = card.def ?? -1;
  if (fAtk && !fAtk.disabled && fAtk.value && !compareWithOperator(atk, fAtk.value)) return false;
  if (fDef && !fDef.disabled && fDef.value && !compareWithOperator(def, fDef.value)) return false;
  return true;
}

function clearFilters(){
  // Reset all filter dropdowns to default state
  if (fCategory) fCategory.value = 'all';
  [fAttribute,fRace,fCardType,fLevel,fScale,fAtk,fDef].forEach(el=>{ if (el) el.value=''; });
  if (fAttribute) fAttribute.value = 'all';
  if (fRace) fRace.value = 'all';
  if (fCardType) fCardType.value = 'all';
  
  // Reset search bar
  const searchBar = document.getElementById('search-bar');
  if (searchBar) searchBar.value = '';
  
  // Reset character dropdown
  const characterSelect = document.getElementById('character-select');
  if (characterSelect) characterSelect.value = '';
  
  // Reset all monster tag checkboxes
  document.querySelectorAll('.f-monster-tag').forEach(checkbox => {
    checkbox.checked = false;
  });
  
  updateCardTypeOptions(); updateFilterEnablement(); refreshSearchResults();
}

// No dedupe helpers required for anime/stub; official and EDOPro datasets

// Anime data supplement restored via EDOPro database loading

// --------- EDOPro CDB loader: fetch and parse cards.cdb via SQL.js, and merge cards by IDs ---------
async function loadEdoproDbs() {
  if (!csConfig.enableEdoproDb) return;
  if (!sqlJsModule) {
    try {
      // Dynamically import SQL.js
      sqlJsModule = await import(SQL_JS_URL);
    } catch (e) {
      console.error("Failed to load SQL.js module:", e);
      return;
    }
  }

  const initSqlJs = sqlJsModule.default;
  let SQL;
  try {
    SQL = await initSqlJs({ locateFile: file => SQL_WASM_URL });
  } catch (e) {
    console.error("Failed to initialize SQL.js:", e);
    return;
  }

  for (const url of edoproCdbUrls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[CS-DB] Failed to fetch ${url}: ${response.status}`);
        continue;
      }
      const arrayBuffer = await response.arrayBuffer();
      const db = new SQL.Database(new Uint8Array(arrayBuffer));
      edoproDbs.push(db);
      console.log(`[CS-DB] Loaded EDOPro database from ${url}`);
      
      // Now, extract cards and merge them
      const stmt = db.prepare("SELECT t.id, t.name, t.desc, d.atk, d.def, d.level, d.race, d.attribute, d.type FROM texts t JOIN datas d ON t.id = d.id");
      while (stmt.step()) {
        const row = stmt.getAsObject();
        const card = {
          id: row.id,
          name: row.name,
          type: row.type,
          desc: row.desc,
          atk: row.atk,
          def: row.def,
          level: row.level,
          race: row.race,
          attribute: row.attribute,
          // Mark as unofficial to distinguish from API cards if needed
          unofficial: true,
        };
        
        // Add to master list if it's not a duplicate ID
        if (card && !idToCard.has(card.id)) {
          allCards.push(card);
          idToCard.set(card.id, card);
          const nm = (card.name||'').trim();
          if (nm && !nameToId.has(nm)) nameToId.set(nm, card.id);
        }
      }
      stmt.free();

    } catch (e) {
      console.error(`[CS-DB] Error processing ${url}:`, e);
    }
  }
  edoproDbLoaded = edoproDbs.length > 0;
  console.log(`[CS-DB] Finished loading all custom databases. Total cards: ${allCards.length}`);
}

function capitalize(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function compareWithOperator(value, input){
  const str = String(input).trim(); if (!str) return true;
  const parts = str.split(',').map(s=>s.trim()).filter(Boolean);
  const test = (token) => { const m = token.match(/^(>=|<=|>|<|=)?\s*(\?|\d+)$/); if (!m) return true; const op = m[1] || '='; if (m[2] === '?') return true; const num = parseInt(m[2],10); if (Number.isNaN(num)) return true; switch(op){ case '>': return value>num; case '>=': return value>=num; case '<': return value<num; case '<=': return value<=num; default: return value===num; } };
  return parts.every(test);
}
function detectCardCategory(card){ const t=(card.type||'').toLowerCase(); if (t.includes('spell')) return 'Spell'; if (t.includes('trap')) return 'Trap'; return 'Monster'; }
function normalizeCardType(card, category){ const typeStr=(card.type||'').toLowerCase(); const raceStr=(card.race||'').toLowerCase(); const catLower=(category||detectCardCategory(card)||'').toLowerCase(); if (catLower==='monster'){ if (typeStr.includes('link')) return 'Link'; if (typeStr.includes('xyz')) return 'Xyz'; if (typeStr.includes('synchro')) return 'Synchro'; if (typeStr.includes('fusion')) return 'Fusion'; if (typeStr.includes('ritual')) return 'Ritual'; const isEff=(typeStr.includes('effect')||typeStr.includes('spirit')||typeStr.includes('tuner')||typeStr.includes('flip')||typeStr.includes('gemini')||typeStr.includes('union')); if (isEff) return 'Effect'; if (typeStr.includes('normal')) return 'Normal'; return null; } else if (catLower==='spell'){ if (raceStr.includes('quick')) return 'Quick-Play'; if (raceStr.includes('continuous')) return 'Continuous'; if (raceStr.includes('equip')) return 'Equip'; if (raceStr.includes('field')) return 'Field'; if (raceStr.includes('ritual')) return 'Ritual'; if (raceStr.includes('normal')) return 'Normal'; return null; } else if (catLower==='trap'){ if (raceStr.includes('continuous')) return 'Continuous'; if (raceStr.includes('counter')) return 'Counter'; if (raceStr.includes('normal')) return 'Normal'; return null; } return null; }
function isTokenOrSkill(card){
  const t = (card.type || '').toLowerCase();
  const f = (card.frameType || '').toLowerCase();
  const n = (card.name || '').toLowerCase();
  
  // Filter out tokens ALWAYS - check type, frameType, and name
  if (t.includes('token') || f.includes('token') || n.includes('token')) return true;
  
  // Additional token detection patterns
  if (t.includes('counter') && n.includes('counter')) return true;
  if (n.includes('token') || n.includes('counter')) return true;
  
  // Filter out skills unless they are from anime_cards.js
  const isSkill = t.includes('skill') || f.includes('skill');
  if (isSkill) {
    // If anime_cards.js is loaded and this card is in it, allow
    if (typeof allAnimeCardsData !== 'undefined' && card.id && allAnimeCardsData[card.id]) return false;
    return true;
  }
  return false;
}
function isExtraDeckCard(card){ const t=(card.type||'').toLowerCase(); return t.includes('fusion')||t.includes('synchro')||t.includes('xyz')||t.includes('link'); }

// Missing ID fetch and stubs removed

// Image fallback/mirrors removed; API-provided image URLs are used directly

// Formatting helpers for preview
function buildTypeLine(card){
  try {
    const cat = detectCardCategory(card);
    if (cat === 'Monster'){
      const parts = [];
      const race = card.race ? String(card.race) : null;
      const typeStr = card.type ? String(card.type) : '';
      if (race) parts.push(race);
      // Extract core type from type string (e.g., Effect/Fusion/...)
      const core = [];
      const lowers = typeStr.toLowerCase();
      if (lowers.includes('link')) core.push('Link');
      else if (lowers.includes('xyz')) core.push('Xyz');
      else if (lowers.includes('synchro')) core.push('Synchro');
      else if (lowers.includes('fusion')) core.push('Fusion');
      else if (lowers.includes('ritual')) core.push('Ritual');
      else if (lowers.includes('normal')) core.push('Normal');
      if (lowers.includes('effect')) core.push('Effect');
      if (lowers.includes('pendulum')) core.push('Pendulum');
      if (core.length) parts.push(core.join(' '));
      if (card.attribute) parts.push(`[${card.attribute}]`);
      return parts.join(' / ');
    }
    // Spell/Trap
    const race = card.race ? String(card.race) : 'Normal';
    return `${race} ${cat}`;
  } catch { return card?.type || ''; }
}
function buildStatsLine(card){
  try {
    const cat = detectCardCategory(card);
    if (cat !== 'Monster') return '';
    const isLink = /link/i.test(card.type||'');
    const hasPend = /pendulum/i.test(card.type||'') || card.scale != null || card.pend_scale != null;
    const parts = [];
    const lvl = card.level ?? card.linkval ?? null;
    if (lvl != null){ parts.push(isLink ? `LINK-${lvl}` : `Level ${lvl}`); }
    const atk = (card.atk != null && card.atk !== -2) ? card.atk : '?';
    const def = isLink ? null : ((card.def != null && card.def !== -2) ? card.def : '?');
    parts.push(`ATK ${atk}${def!=null?` / DEF ${def}`:''}`);
    if (hasPend){ const sc = card.scale ?? card.pend_scale; if (sc != null) parts.push(`Scale ${sc}`); }
    return parts.join('  •  ');
  } catch { return ''; }
}

// Minimal styles for preview metadata if not already in CSS
(()=>{
  try {
    const id = 'cs-preview-style';
    if (document.getElementById(id)) return;
    const style = document.createElement('style'); style.id = id; style.textContent = `
      #card-preview { position: fixed; z-index: 1000; display: none; }
      #card-preview .preview-content { display: flex; gap: 12px; padding: 8px; background: var(--panel-bg, rgba(0,0,0,0.85)); color: var(--text, #fff); border-radius: 6px; box-shadow: 0 6px 24px rgba(0,0,0,0.35); max-width: min(92vw, 980px); }
      #card-preview .preview-image img { width: 280px; height: auto; display: block; border-radius: 4px; }
      #card-preview .preview-meta { max-width: 560px; display: flex; flex-direction: column; gap: 6px; }
      #card-preview .pm-name { font-weight: 700; font-size: 16px; line-height: 1.2; }
      #card-preview .pm-type { opacity: 0.9; font-size: 12px; }
      #card-preview .pm-stats { font-size: 12px; }
      #card-preview .pm-limit { font-size: 12px; color: #ffcc66; }
      #card-preview .pm-desc { font-size: 12px; line-height: 1.35; max-height: 220px; overflow: auto; }
      #card-preview .pm-prints { font-size: 11px; opacity: 0.9; }
    `; document.head.appendChild(style);
  } catch {}
})();

// Simple HTML escape
function escapeHtml(s){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

// Populate attribute and monster type options (same as main builder)
function populateFilterOptions(){
  const attributes = new Set();
  allCards.forEach(c => { if (c.attribute) attributes.add((c.attribute||'').toLowerCase()); });
  const fill = (select, values) => {
    if (!select) return;
    const current = select.value;
    const arr = Array.isArray(values) ? values.slice() : Array.from(values);
    select.innerHTML = '<option value="all" selected>All</option>' + arr.sort().map(v => `<option value="${v}">${capitalize(v)}</option>`).join('');
    if (arr.includes(current)) select.value = current; else select.value = 'all';
  };
  fill(fAttribute, attributes);
  if (fRace) {
    const current = fRace.value;
    const opts = ['<option value="all" selected>All</option>'].concat(MONSTER_TYPES.map(t => `<option value="${t}">${t}</option>`));
    fRace.innerHTML = opts.join('');
    if (MONSTER_TYPES.includes(current)) fRace.value = current; else fRace.value = 'all';
  }
}

// Update card-type dropdown based on selected category
function updateCardTypeOptions(){
  if (!fCardType) return;
  const category = fCategory ? fCategory.value : 'all';
  const prev = fCardType.value;
  fCardType.innerHTML = '';
  const addOption = (val, label) => {
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = label; fCardType.appendChild(opt);
  };
  addOption('all', 'All');
  let options = [];
  const cat = (category || 'all').toLowerCase();
  if (cat === 'monster') options = ['Normal','Effect','Fusion','Synchro','Xyz','Link','Ritual'];
  else if (cat === 'spell') options = ['Normal','Quick-Play','Continuous','Ritual','Equip','Field'];
  else if (cat === 'trap') options = ['Normal','Continuous','Counter'];
  else { fCardType.value = 'all'; return; }
  for (const o of options) addOption(o, o);
  if (options.includes(prev)) fCardType.value = prev; else fCardType.value = 'all';
}

// Disable filters until a category is selected (mirror main builder behavior)
function updateFilterEnablement(){
  const category = fCategory ? fCategory.value : 'all';
  const setDis = (el, flag) => {
    if (!el) return;
    el.disabled = flag;
    const isSelect = el.tagName === 'SELECT';
    if (flag) {
      if (isSelect) { if ([...el.options].some(o => o.value === 'all')) el.value = 'all'; }
      else { el.value = ''; }
    } else {
      if (isSelect) {
        const values = new Set([...el.options].map(o => o.value));
        if (!el.value || !values.has(el.value)) { if (values.has('all')) el.value = 'all'; }
      }
    }
  };
  const none = (!category || category === 'all');
  if (none) {
    setDis(fCardType, true); setDis(fAttribute, true); setDis(fRace, true); setDis(fLevel, true); setDis(fScale, true); setDis(fAtk, true); setDis(fDef, true);
    monsterTagCheckboxes.forEach(cb => { cb.checked = false; cb.disabled = true; });
    return;
  }
  setDis(fCardType, false);
  const isMonster = (category || '').toLowerCase() === 'monster';
  setDis(fAttribute, !isMonster); setDis(fRace, !isMonster); setDis(fLevel, !isMonster);
  const pendulumChecked = monsterTagCheckboxes.some(cb => !cb.disabled && cb.value.toLowerCase() === 'pendulum' && cb.checked);
  setDis(fScale, !(isMonster && pendulumChecked));
  setDis(fAtk, !isMonster); setDis(fDef, !isMonster);
  monsterTagCheckboxes.forEach(cb => { cb.disabled = !isMonster; if (!isMonster) cb.checked = false; });
}

function onCharacterChange(){
  const name = characterSelect.value;
  
  // Save current character's deck before switching
  if (currentCharacterName) {
    saveCurrentCharacterDeck();
  }
  
  activeChar = characters.find(c => c.name === name) || null;
  currentCharacterName = name || null;
  
  if (!activeChar) {
    poolSet = null;
    limitsMap = null;
    staplesSet = null;
    staplesMax = null;
    unlimitedSpecialSet = null;
    requiredSet = null;
    
    // Clear deck when no character selected
    deck.main = [];
    deck.extra = [];
    deck.side = [];
    
    if (charlistCurrent) charlistCurrent.textContent = '';
    refreshSearchResults();
    renderDeck();
    return;
  }

  // Set up character restrictions
  poolSet = new Set([...activeChar.pool, ...activeChar.staples]);
  requiredSet = new Set(activeChar.required || []);
  
  limitsMap = new Map();
  unlimitedSpecialSet = new Set(activeChar.special_unlimited);
  staplesSet = new Set(activeChar.staples);
  staplesMax = activeChar.staplesMax;
  
  // Apply ban/limit rules
  activeChar.banned.forEach(id => limitsMap.set(id, 0));
  activeChar.limited.forEach(id => limitsMap.set(id, 1));
  activeChar.semi.forEach(id => limitsMap.set(id, 2));
  
  // Try to load saved deck for this character
  const deckLoaded = loadCharacterDeck(name);
  
  if (!deckLoaded) {
    // No saved deck, start fresh and add required cards
    deck.main = [];
    deck.extra = [];
    deck.side = [];
    
    // Add required cards to deck automatically for new decks
    activeChar.required.forEach(id => {
      const card = idToCard.get(id);
      if (card) {
        if (isExtraDeckCard(card)) {
          addToDeck(card, 'extra');
        } else {
          addToDeck(card, 'main');
        }
      }
    });
  } else {
    // Deck was loaded, but ensure required cards are still present
    ensureRequiredCards();
  }
  
  if (charlistCurrent) charlistCurrent.textContent = activeChar.name;
  
  refreshSearchResults();
  renderDeck();
  
  // Check for missing required cards after a short delay to let deck render
  setTimeout(checkMissingRequiredCards, 100);
}

// Deck mechanics
const deck = { main: [], extra: [], side: [] };
let requiredSet = null; // required cards for active character

// Character-specific deck memory
let characterDecks = new Map(); // character name -> saved deck state
let currentCharacterName = null;

// Save current deck for the active character
function saveCurrentCharacterDeck() {
  if (!currentCharacterName) return;
  
  const deckCopy = {
    main: [...deck.main],
    extra: [...deck.extra],
    side: [...deck.side]
  };
  
  characterDecks.set(currentCharacterName, deckCopy);
  
  // Also save to localStorage for persistence across page refreshes
  try {
    const savedDecks = {};
    characterDecks.forEach((deckData, charName) => {
      savedDecks[charName] = deckData;
    });
    localStorage.setItem('genesys-character-decks', JSON.stringify(savedDecks));
  } catch (e) {
    console.warn('Failed to save character decks to localStorage:', e);
  }
}

// Load saved deck for a character
function loadCharacterDeck(characterName) {
  if (!characterName) return false;
  
  const savedDeck = characterDecks.get(characterName);
  if (savedDeck) {
    deck.main = [...savedDeck.main];
    deck.extra = [...savedDeck.extra];
    deck.side = [...savedDeck.side];
    return true;
  }
  return false;
}

// Initialize character decks from localStorage
function initializeCharacterDecks() {
  try {
    const saved = localStorage.getItem('genesys-character-decks');
    if (saved) {
      const savedDecks = JSON.parse(saved);
      characterDecks = new Map(Object.entries(savedDecks));
    }
  } catch (e) {
    console.warn('Failed to load character decks from localStorage:', e);
    characterDecks = new Map();
  }
}
function addToDeck(card, zone){
  if (activeChar && poolSet && !poolSet.has(card.id)) return; // out of pool
  // enforce per-card limits
  let limit = limitsMap && limitsMap.has(card.id) ? limitsMap.get(card.id) : 3;
  if (unlimitedSpecialSet && unlimitedSpecialSet.has(card.id)) limit = Infinity;
  if (limit === 0) return; // forbidden
  // enforce staples cap if provided
  if (staplesSet && staplesMax != null && staplesSet.has(card.id)){
    const cur = countStaples();
    if (cur >= staplesMax){
      if (importStatus){ importStatus.textContent = `Staples limit reached (${cur}/${staplesMax})`; importStatus.style.color = '#ff4d4f'; }
      return;
    }
  }
  const totalCopies = countCopies(card.id);
  if (totalCopies >= limit) return;
  const tgt = zone==='extra'? deck.extra : (zone==='side'? deck.side : deck.main);
  if (zone==='extra' && !isExtraDeckCard(card)) deck.main.push(card.id); else tgt.push(card.id);
  
  // Auto-save the deck for current character
  saveCurrentCharacterDeck();
  
  renderDeck();
}
function countCopies(id){ return deck.main.filter(x=>x===id).length + deck.extra.filter(x=>x===id).length + deck.side.filter(x=>x===id).length; }
function renderDeck(){
  const renderZone = (grid, ids, zone) => {
    grid.innerHTML='';
    ids.forEach(id => {
      const c = idToCard.get(id); if (!c) return;
      const el = document.createElement('div'); el.className='card'; el.dataset.cardId=id;
      el.draggable = true; el.addEventListener('dragstart', (e)=> onDragStartFromDeck(e,id)); el.addEventListener('dragend', onDragEndGlobal);
      const img = document.createElement('img'); img.alt=c.name; img.loading='lazy'; el.appendChild(img);
      // Always use user's GitHub repo for images (.jpg), scale down
      const fallbackJsDelivrJpg = `https://cdn.jsdelivr.net/gh/JustBryant/KingdomsImages@main/CS_Images/${c.id}.jpg`;
      
      img.src = fallbackJsDelivrJpg;
      img.onerror = function() {
        console.log('Deck failed to load:', img.src);
        if (img.src.includes('JustBryant/KingdomsImages')) {
          console.log('Deck trying character-showdown repo via jsDelivr');
          const charShowdownUrl = `https://cdn.jsdelivr.net/gh/franluque2/character-showdown@main/pics/${c.id}.jpg`;
          img.src = charShowdownUrl;
        } else {
          console.log('Deck all fallbacks failed for card:', c.id);
          // Hide image and show placeholder
          img.style.display = 'none';
          const placeholder = document.createElement('div');
          placeholder.style.width = '100%';
          placeholder.style.height = '100%';
          placeholder.style.backgroundColor = '#666';
          placeholder.style.borderRadius = '8px';
          placeholder.style.display = 'flex';
          placeholder.style.alignItems = 'center';
          placeholder.style.justifyContent = 'center';
          placeholder.style.color = '#ccc';
          placeholder.style.fontSize = '10px';
          placeholder.style.textAlign = 'center';
          placeholder.textContent = 'No Image';
          img.parentNode.appendChild(placeholder);
        }
      };
      // Always scale deck grid images to fit properly in grid
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';

      // Character list badges on deck cards too
      if (limitsMap && limitsMap.has(c.id)){
        const lim = limitsMap.get(c.id);
        let status=null; if (lim===0) status='banned'; else if (lim===1) status='limited'; else if (lim===2) status='semi';
        if (status){
          const b = document.createElement('span'); b.className = `banlist-badge ${status}`;
          if (status==='limited') b.textContent='1'; else if (status==='semi') b.textContent='2';
          b.title = status==='banned'? `Forbidden (${activeChar?.name||''})` : status==='limited'? `Limited (${activeChar?.name||''})` : `Semi-Limited (${activeChar?.name||''})`;
          el.appendChild(b);
        }
      }
      if (unlimitedSpecialSet && unlimitedSpecialSet.has(c.id)){
        const ub = document.createElement('span');
        ub.className = 'banlist-badge unlimited-special';
        ub.textContent = '∞';
        ub.title = `Unlimited Special (${activeChar?.name||''})`;
        el.appendChild(ub);
      }

      el.title = 'Left/Right: remove  |  Ctrl+Right-Click: add copy';
      el.addEventListener('click', ()=> removeFromDeckZone(zone, id));
      el.addEventListener('contextmenu', (e)=>{ e.preventDefault(); if (e.ctrlKey){ const cardObj=idToCard.get(id); if (cardObj) addToDeck(cardObj, zone); } else { removeFromDeckZone(zone, id); } });

      el.addEventListener('mouseenter',(e)=>showPreview(null,e,c)); el.addEventListener('mousemove',(e)=>positionPreview(e)); el.addEventListener('mouseleave', hidePreview);
      grid.appendChild(el);
    });
    const capacity = zone==='main'?60:15; const remaining = Math.max(0, capacity-ids.length);
    for (let i=0;i<remaining;i++){ const ph=document.createElement('div'); ph.className='slot-placeholder'; grid.appendChild(ph); }
  };
  renderZone(mainDeckGrid, deck.main, 'main');
  renderZone(extraDeckGrid, deck.extra, 'extra');
  renderZone(sideDeckGrid, deck.side, 'side');
  mainCount.textContent = `(${deck.main.length}/60)`;
  extraCount.textContent = `(${deck.extra.length}/15)`;
  sideCount.textContent = `(${deck.side.length}/15)`;
  // Update staples counter if applicable
  if (importStatus){
    if (staplesSet && staplesMax != null){
      const cur = countStaples();
      importStatus.textContent = `Staples: ${cur}/${staplesMax}`;
      importStatus.style.color = cur > staplesMax ? '#ff4d4f' : 'var(--text-muted)';
    } else {
      importStatus.textContent = '';
      importStatus.style.color = 'var(--text-muted)';
    }
    checkMissingRequiredCards();
  }
}
function removeFromDeckZone(zone, id){
  if (requiredSet && requiredSet.has(id)){
    const cardName = idToCard.get(id)?.name || 'This card';
    
    // Use custom confirmation dialog
    showCustomConfirm(
      'Remove Required Card?',
      `"${cardName}" is REQUIRED for this character. Removing it may make your deck invalid for this character.`,
      () => {
        // User confirmed removal
        const arr = zone==='extra'? deck.extra : (zone==='side'? deck.side : deck.main);
        const i=arr.indexOf(id); if (i>=0) arr.splice(i,1);
        saveCurrentCharacterDeck(); // Save after removal
        hidePreview(); renderDeck();
      }
    );
    return;
  }
  
  const arr = zone==='extra'? deck.extra : (zone==='side'? deck.side : deck.main);
  const i=arr.indexOf(id); if (i>=0) arr.splice(i,1);
  saveCurrentCharacterDeck(); // Save after removal
  hidePreview(); renderDeck();
}

function checkMissingRequiredCards() {
  const warningElement = document.getElementById('missing-required-warning');
  if (!warningElement) return;
  
  if (!requiredSet || requiredSet.size === 0) {
    warningElement.style.display = 'none';
    return;
  }
  
  const missingCards = [];
  requiredSet.forEach(id => {
    if (countCopies(id) === 0) {
      const card = idToCard.get(id);
      if (card) {
        missingCards.push(card.name);
      }
    }
  });
  
  if (missingCards.length > 0) {
    const cardList = missingCards.length === 1 
      ? `"${missingCards[0]}"` 
      : missingCards.slice(0, -1).map(name => `"${name}"`).join(', ') + ` and "${missingCards[missingCards.length - 1]}"`;
    
    warningElement.textContent = `⚠️ Missing required ${missingCards.length === 1 ? 'card' : 'cards'}: ${cardList}`;
    warningElement.style.display = 'block';
  } else {
    warningElement.style.display = 'none';
  }
}
function clearDeck(){ 
  const hasRequiredCards = requiredSet && requiredSet.size > 0;
  
  deck.main=[]; deck.extra=[]; deck.side=[]; 
  
  if (hasRequiredCards) {
    showNotification(
      '✨ Deck cleared! Required cards have been automatically re-added.',
      'info',
      3000
    );
  }
  
  ensureRequiredCards();
  
  // Auto-save the cleared deck
  saveCurrentCharacterDeck();
  
  renderDeck(); 
}

function ensureRequiredCards(){
  if (!requiredSet || !requiredSet.size) return;
  requiredSet.forEach(id => {
    if (countCopies(id)===0){
      const obj = idToCard.get(id); if (!obj) return;
      const zone = isExtraDeckCard(obj)? 'extra':'main';
      const tgt = zone==='extra'? deck.extra : deck.main;
      tgt.push(id);
    }
  });
}
function countStaples(){
  if (!staplesSet) return 0;
  const all = [...deck.main, ...deck.extra, ...deck.side];
  let n = 0; for (const id of all){ if (staplesSet.has(id)) n++; }
  return n;
}

// Exporters
function exportYdk(){
  const lines = [];
  lines.push('#created by Character Showdown Deck Builder');
  lines.push('#main'); deck.main.forEach(id=>lines.push(String(id)));
  lines.push('#extra'); deck.extra.forEach(id=>lines.push(String(id)));
  lines.push('!side'); deck.side.forEach(id=>lines.push(String(id)));
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='cs-deck.ydk'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
function copyYdke(){
  const enc = (arr) => {
    // Proper YDKE encoding: convert card IDs to little-endian 32-bit integers
    const buffer = new ArrayBuffer(arr.length * 4);
    const view = new DataView(buffer);
    
    for (let i = 0; i < arr.length; i++) {
      view.setUint32(i * 4, parseInt(arr[i]), true); // true = little-endian
    }
    
    // Convert ArrayBuffer to base64
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };
  
  const code = `ydke://${enc(deck.main)}!${enc(deck.extra)}!${enc(deck.side)}!`;
  
  // Try modern clipboard API first
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(
      () => showNotification('📋 YDKE code copied to clipboard!', 'success', 2500), 
      () => fallbackCopyYdke(code)
    );
  } else {
    fallbackCopyYdke(code);
  }
}

function fallbackCopyYdke(code) {
  try {
    // Fallback method using temporary textarea
    const textarea = document.createElement('textarea');
    textarea.value = code;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    
    if (successful) {
      showNotification('📋 YDKE code copied to clipboard!', 'success', 2500);
    } else {
      showNotification('❌ Failed to copy YDKE code', 'error', 3000);
    }
  } catch (err) {
    console.error('Failed to copy YDKE code:', err);
    showNotification('❌ Failed to copy YDKE code', 'error', 3000);
  }
}

// Drag & Drop (subset from main)
function setupDragAndDrop(){
  const zones=[{el:mainDeckGrid,zone:'main'},{el:extraDeckGrid,zone:'extra'},{el:sideDeckGrid,zone:'side'}];
  zones.forEach(({el,zone})=>{ if(!el) return; el.addEventListener('dragover',(e)=>onZoneDragOver(e,zone)); el.addEventListener('dragenter',(e)=>onZoneDragEnter(e,zone)); el.addEventListener('dragleave',(e)=>onZoneDragLeave(e,zone)); el.addEventListener('drop',(e)=>onZoneDrop(e,zone)); });
}
function onDragStartFromSearch(e, card){ const payload={src:'search',id:card.id}; e.dataTransfer.setData('text/plain', JSON.stringify(payload)); e.dataTransfer.effectAllowed='copy'; }
function onDragStartFromDeck(e, id){ let srcZone='main'; if (deck.extra.includes(id)) srcZone='extra'; else if (deck.side.includes(id)) srcZone='side'; const payload={src:'deck',id,srcZone}; e.dataTransfer.setData('text/plain', JSON.stringify(payload)); e.dataTransfer.effectAllowed='move'; }
function onDragEndGlobal(){ [mainDeckGrid,extraDeckGrid,sideDeckGrid].forEach(el=>{ if(!el) return; el.classList.remove('drag-over'); el.classList.remove('drag-over-invalid'); }); }
function parseDragData(e){ try { return JSON.parse(e.dataTransfer.getData('text/plain')||'{}'); } catch { return {}; } }
function canDropToZone(card, zone){ if (zone==='extra') return isExtraDeckCard(card); return true; }
function onZoneDragOver(e, zone){ const data=parseDragData(e); if(!data||!data.id) return; const card=idToCard.get(data.id); if(!card) return; const valid=canDropToZone(card,zone); if(!valid){ e.dataTransfer.dropEffect='none'; return; } e.preventDefault(); e.dataTransfer.dropEffect=data.src==='deck'?'move':'copy'; }
function onZoneDragEnter(e, zone){ const data=parseDragData(e); const card=data&&data.id? idToCard.get(data.id):null; const valid=card? canDropToZone(card,zone):false; const el=(zone==='main'?mainDeckGrid:zone==='extra'?extraDeckGrid:sideDeckGrid); if (!el) return; if(valid){ el.classList.add('drag-over'); el.classList.remove('drag-over-invalid'); } else { el.classList.add('drag-over-invalid'); el.classList.remove('drag-over'); } }
function onZoneDragLeave(e, zone){ const el=(zone==='main'?mainDeckGrid:zone==='extra'?extraDeckGrid:sideDeckGrid); if(!el) return; if(!el.contains(e.relatedTarget)){ el.classList.remove('drag-over'); el.classList.remove('drag-over-invalid'); } }
function onZoneDrop(e, zone){ e.preventDefault(); const data=parseDragData(e); if(!data||!data.id) return; const card=idToCard.get(data.id); if(!card) return; const el=(zone==='main'?mainDeckGrid:zone==='extra'?extraDeckGrid:sideDeckGrid); if(el){ el.classList.remove('drag-over'); el.classList.remove('drag-over-invalid'); } if(!canDropToZone(card,zone)) return; if (data.src==='search'){ const copies=countCopies(card.id); const limit=limitsMap&&limitsMap.has(card.id)? limitsMap.get(card.id):3; if (activeChar && poolSet && !poolSet.has(card.id)) return; if (limit===0) return; if (copies>=limit) return; const target=zone==='extra'? deck.extra : (zone==='side'? deck.side : deck.main); target.push(card.id); saveCurrentCharacterDeck(); renderDeck(); } else if (data.src==='deck'){ let fromArr=deck.main, toArr=deck.main; if(data.srcZone==='extra') fromArr=deck.extra; else if(data.srcZone==='side') fromArr=deck.side; if(zone==='extra') toArr=deck.extra; else if(zone==='side') toArr=deck.side; if(fromArr===toArr) return; if(!canDropToZone(card,zone)) return; const idx=fromArr.indexOf(card.id); if(idx>=0) fromArr.splice(idx,1); toArr.push(card.id); saveCurrentCharacterDeck(); renderDeck(); } }

// Preview (subset)
function showPreview(url, evt, card = null){
  if(!previewEl) return;
  // Build basic shell (we'll attach fallback loading for the <img>)
  const name = card?.name || 'Card';
  const content = document.createElement('div');
  content.className = 'preview-content';
  const imgWrap = document.createElement('div'); imgWrap.className = 'preview-image';
  const img = document.createElement('img'); img.alt = name;
  imgWrap.appendChild(img); content.appendChild(imgWrap);
  // Extra info panel
  const info = document.createElement('div');
  info.className = 'preview-meta';
  if (card) {
    const title = document.createElement('div');
    title.className = 'pm-name';
    title.textContent = card.name || 'Card';
    info.appendChild(title);

    const typeLine = document.createElement('div');
    typeLine.className = 'pm-type';
    typeLine.textContent = buildTypeLine(card);
    info.appendChild(typeLine);

    const statsLine = document.createElement('div');
    statsLine.className = 'pm-stats';
    statsLine.textContent = buildStatsLine(card);
    info.appendChild(statsLine);

    if (activeChar && limitsMap && limitsMap.has(card.id)){
      const lim = limitsMap.get(card.id);
      const limitDiv = document.createElement('div');
      limitDiv.className = 'pm-limit';
      let limText = lim===0?'Forbidden':lim===1?'Limited':lim===2?'Semi-Limited':'Up to 3 copies';
      if (unlimitedSpecialSet && unlimitedSpecialSet.has(card.id)) limText = 'Unlimited (Special Rule)';
      limitDiv.textContent = `${limText}${activeChar?` (${activeChar.name})`:''}`;
      info.appendChild(limitDiv);
    }

    const desc = document.createElement('div');
    desc.className = 'pm-desc';
    const safe = escapeHtml(card.desc||'');
    desc.innerHTML = safe.replace(/\n/g,'<br>');
    info.appendChild(desc);

    if (Array.isArray(card.card_sets) && card.card_sets.length){
      const prints = document.createElement('div');
      prints.className = 'pm-prints';
      const list = card.card_sets.slice(0,3).map(s => `${s.set_name} (${s.set_code}${s.set_rarity?` • ${s.set_rarity}`:''})`).join(' • ');
      prints.textContent = list;
      info.appendChild(prints);
    }
  }
  content.appendChild(info);

  previewEl.innerHTML = '';
  previewEl.appendChild(content);
  // Always use user's GitHub repo for images (.jpg)
  if (card && card.id) {
    const fallbackJsDelivrJpg = `https://cdn.jsdelivr.net/gh/JustBryant/KingdomsImages@main/CS_Images/${card.id}.jpg`;
    
    img.src = fallbackJsDelivrJpg;
    img.onerror = function() {
      console.log('Preview failed to load:', img.src);
      if (img.src.includes('JustBryant/KingdomsImages')) {
        console.log('Preview trying character-showdown repo via jsDelivr');
        const charShowdownUrl = `https://cdn.jsdelivr.net/gh/franluque2/character-showdown@main/pics/${card.id}.jpg`;
        img.src = charShowdownUrl;
      } else {
        console.log('Preview all fallbacks failed for card:', card.id);
        // Hide image and show placeholder
        img.style.display = 'none';
        const placeholder = document.createElement('div');
        placeholder.style.width = '200px';
        placeholder.style.height = '290px';
        placeholder.style.backgroundColor = '#666';
        placeholder.style.borderRadius = '8px';
        placeholder.style.display = 'flex';
        placeholder.style.alignItems = 'center';
        placeholder.style.justifyContent = 'center';
        placeholder.style.color = '#ccc';
        placeholder.style.fontSize = '14px';
        placeholder.style.textAlign = 'center';
        placeholder.textContent = 'No Image';
        img.parentNode.appendChild(placeholder);
      }
    };
  }
  previewEl.style.display='block'; positionPreview(evt);
}
function positionPreview(evt){ if(!previewEl) return; const pad=16; const r=previewEl.getBoundingClientRect(); let x=evt.clientX+pad; let y=evt.clientY+pad; const vw=window.innerWidth; const vh=window.innerHeight; if(x+r.width>vw-pad) x=evt.clientX-r.width-pad; if(y+r.height>vh-pad) y=evt.clientY-r.height-pad; x=Math.max(pad, Math.min(x, vw-r.width-pad)); y=Math.max(pad, Math.min(y, vh-r.height-pad)); previewEl.style.left=`${x}px`; previewEl.style.top=`${y}px`; }
function hidePreview(){ if(!previewEl) return; previewEl.style.display='none'; }

// Convert character fields that may be names to ids; support poolNames, staplesNames, bannedNames, limitedNames, semiNames
function resolveCharacterIds(ch){
  const mapToIds = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.map(val => {
      const num = Number(val);
      
      if (!isNaN(num) && Number.isFinite(num)) {
        return num;
      }
      if (typeof val === 'string' && nameToId.has(val)) {
        return nameToId.get(val);
      }
      return null;
    }).filter(id => id !== null);
  };

  return {
    name: ch.name,
    pool: [...new Set([...mapToIds(ch.pool), ...mapToIds(ch.poolNames)])],
    staples: [...new Set([...mapToIds(ch.staples), ...mapToIds(ch.staplesNames)])],
    banned: [...new Set([...mapToIds(ch.banned), ...mapToIds(ch.bannedNames)])],
    limited: [...new Set([...mapToIds(ch.limited), ...mapToIds(ch.limitedNames)])],
    semi: [...new Set([...mapToIds(ch.semi), ...mapToIds(ch.semiNames)])],
    staplesMax: ch.staplesMax,
    required: mapToIds(ch.required || []),
    special_unlimited: mapToIds(ch.special_unlimited || ch.specialUnlimited || [])
  };
}

async function loadCsConfig(){ /* removed */ }

// CardScripts-related removed

// Lazy name resolver removed

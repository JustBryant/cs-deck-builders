document.addEventListener('DOMContentLoaded', initializeDeckBuilder);

// Shared-ish DOM refs
const loadingOverlay = document.getElementById('loading-overlay');
const themeToggleBtn = document.getElementById('theme-toggle');
const previewEl = document.getElementById('card-preview');
// Search UI
const searchBar = document.getElementById('search-bar');
const searchResults = document.getElementById('search-results');
const searchSortKey = document.getElementById('search-sort-key');
const searchSortOrder = document.getElementById('search-sort-order');
const fCategory = document.getElementById('f-category');
const fAttribute = document.getElementById('f-attribute');
const fRace = document.getElementById('f-race');
const fCardType = document.getElementById('f-type');
const fLevel = document.getElementById('f-level');
const fScale = document.getElementById('f-scale');
const fLimit = document.getElementById('f-limit');
const fAtk = document.getElementById('f-atk');
const fDef = document.getElementById('f-def');
const fClearBtn = document.getElementById('f-clear');
const monsterTagCheckboxes = Array.from(document.querySelectorAll('.f-monster-tag'));

// Banlist UI
const banlistSelect = document.getElementById('banlist-select');
const genesysMaxWrap = document.getElementById('genesys-max-wrap');
const genesysMaxInput = document.getElementById('genesys-max');
const genesysCurrentSpan = document.getElementById('genesys-current');

  // Always use user's GitHub repo for images (.jpg then .png)
  const fallbackJsDelivrJpg = `https://cdn.jsdelivr.net/gh/JustBryant/KingdomsImages@main/CS_Images/${card.id}.jpg`;
  const fallbackJsDelivrPng = `https://cdn.jsdelivr.net/gh/JustBryant/KingdomsImages@main/CS_Images/${card.id}.png`;
  img.dataset.src = fallbackJsDelivrJpg;
  img.onerror = function() {
    if (img.src !== fallbackJsDelivrPng) {
      img.src = fallbackJsDelivrPng;
      img.onerror = function() {
        img.src = 'https://cdn.jsdelivr.net/gh/ProjectIgnis/images@master/pics/placeholder.jpg';
      };
    }
  };
  img.style.width = '120px';
  img.style.height = '175px';
  img.style.objectFit = 'cover';
  div.appendChild(img);
// Deck state
const deck = {
  main: [], // array of ids
  extra: [],
  side: [],
};

// Constants
const MONSTER_TYPES = [
  'Aqua','Beast','Beast-Warrior','Cyberse','Dinosaur','Divine-Beast','Dragon','Fairy','Fiend','Fish','Insect','Machine','Plant','Psychic','Pyro','Reptile','Rock','Sea Serpent','Spellcaster','Thunder','Warrior','Winged Beast','Wyrm','Zombie','Creator God','Illusion'
];

async function initializeDeckBuilder() {
  initTheme();
  showLoading(true, 'Loading Card Database...');
  try {
    // pre-populate Type list
    if (fRace) {
      const opts = ['<option value="all" selected>All</option>'].concat(MONSTER_TYPES.map(t => `<option value="${t}">${t}</option>`));
      fRace.innerHTML = opts.join('');
      fRace.value = 'all';
    }
    const response = await fetch('https://db.ygoprodeck.com/api/v7/cardinfo.php?format=genesys&misc=yes');
    if (!response.ok) throw new Error(`Network error: ${response.status} ${response.statusText}`);
    const payload = await response.json();
    allCards = (payload.data || []).filter(c => !isTokenOrSkill(c));

    // Build maps
    allCards.forEach(card => {
      cardDatabase.set(card.name.toLowerCase(), card);
      idToCard.set(card.id, card);
      // misc_info genesys_points is used directly when needed (Genesys mode)
    });

    // Wire events
    searchBar.addEventListener('input', handleSearch);
    // Enter key triggers a full refresh using current filters
    searchBar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        refreshSearchResults();
      }
    });
    document.getElementById('search-button').addEventListener('click', () => refreshSearchResults());
    if (searchSortKey) searchSortKey.addEventListener('change', refreshSearchResults);
    if (searchSortOrder) searchSortOrder.addEventListener('change', refreshSearchResults);

    [fCategory,fAttribute,fRace,fCardType,fLevel,fScale,fLimit,fAtk,fDef].forEach(el => el && el.addEventListener('input', refreshSearchResults));
    monsterTagCheckboxes.forEach(cb => cb.addEventListener('change', () => { updateFilterEnablement(); refreshSearchResults(); }));
    if (fCategory) fCategory.addEventListener('change', () => { updateFilterEnablement(); updateCardTypeOptions(); refreshSearchResults(); });
    if (fClearBtn) fClearBtn.addEventListener('click', clearFilters);

    if (banlistSelect) banlistSelect.addEventListener('change', onBanlistChange);
    if (genesysMaxInput) genesysMaxInput.addEventListener('input', updateGenesysPoints);

    if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
    window.addEventListener('mousemove', (e) => positionPreview(e));
    window.addEventListener('mousedown', hidePreview);
  // Infinite scroll: render next chunk when near the bottom of the results container
  if (searchResults) {
    searchResults.addEventListener('scroll', () => {
      const nearBottom = searchResults.scrollTop + searchResults.clientHeight >= searchResults.scrollHeight - 120;
      if (nearBottom) renderNextChunk();
    });
    // Hide preview while scrolling the results
    searchResults.addEventListener('scroll', () => hidePreview());
  }

    clearDeckBtn.addEventListener('click', clearDeck);
    exportYdkBtn.addEventListener('click', exportYdk);
    copyYdkeBtn.addEventListener('click', copyYdke);
  if (importYdkBtn) importYdkBtn.addEventListener('click', () => ydkFileInput && ydkFileInput.click());
  if (ydkFileInput) ydkFileInput.addEventListener('change', onYdkFileSelected);
  if (importLflistBtn) importLflistBtn.addEventListener('click', () => lflistFileInput && lflistFileInput.click());
  if (lflistFileInput) lflistFileInput.addEventListener('change', onLflistSelected);
  if (importAllowlistBtn) importAllowlistBtn.addEventListener('click', () => allowlistFileInput && allowlistFileInput.click());
  if (allowlistFileInput) allowlistFileInput.addEventListener('change', onAllowlistSelected);
    if (importYdkeBtn) importYdkeBtn.addEventListener('click', importYdkeSmart);
    // Modal wiring
    if (ydkeModalBackdrop && ydkeModalInput && ydkeModalImport) {
      ydkeModalImport.addEventListener('click', onYdkeModalImport);
      if (ydkeModalClose) ydkeModalClose.addEventListener('click', closeYdkeModal);
      if (ydkeModalCancel) ydkeModalCancel.addEventListener('click', closeYdkeModal);
      ydkeModalBackdrop.addEventListener('click', (e) => { if (e.target === ydkeModalBackdrop) closeYdkeModal(); });
      ydkeModalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { onYdkeModalImport(); }
        if (e.key === 'Escape') { closeYdkeModal(); }
      });
    }

    populateFilterOptions();
    updateCardTypeOptions();
    updateFilterEnablement();

    handleSearch({ target: searchBar });

    // Enable drag and drop for deck zones
    setupDragAndDrop();

    // Render initial empty grids with fixed slots (placeholders)
    renderDeck();
  } catch (err) {
    console.error(err);
    showLoading(true, `Error loading database. Refresh page. (${err.message})`);
  } finally {
    showLoading(false);
  }
}

// Theme helpers
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

// Search
let currentResults = [];
let renderedCount = 0;
const SEARCH_CHUNK_SIZE = 60; // number of cards appended per batch
function handleSearch(e) {
  const query = (e.target?.value || '').toLowerCase().trim();
  searchResults.innerHTML = '';

  let results = allCards.filter(c => matchesQueryAndFilters(c, query));
  if (searchSortKey && searchSortOrder) {
    const key = searchSortKey.value || 'alpha';
    const order = (searchSortOrder.value || 'asc').toLowerCase();
    const dir = order === 'desc' ? -1 : 1;
    const cmp = (a, b) => {
      if (key === 'points') {
        const pa = a?.misc_info?.[0]?.genesys_points ?? 0;
        const pb = b?.misc_info?.[0]?.genesys_points ?? 0;
        if (pa === pb) return a.name.localeCompare(b.name);
        return (pa - pb) * dir;
      }
      return a.name.localeCompare(b.name) * dir;
    };
    results = results.slice().sort(cmp);
  }
  currentResults = results;
  renderedCount = 0;
  renderNextChunk();
}

// Helper to re-run search using current search bar text and filters
function refreshSearchResults() {
  handleSearch({ target: { value: searchBar.value } });
}

function renderNextChunk() {
  if (!currentResults || renderedCount >= currentResults.length) return;
  const end = Math.min(renderedCount + SEARCH_CHUNK_SIZE, currentResults.length);
  for (let i = renderedCount; i < end; i++) {
    const card = currentResults[i];
    const cardEl = createCardElement(card);
    cardEl.title = 'Click: Main (L-Click)  |  Right-Click: Extra (if Extra type)  |  Shift+Click: Side  |  Ctrl+Right-Click: Side';
    cardEl.addEventListener('click', (evt) => {
      if (evt.shiftKey) addToDeck(card, 'side');
      else addToDeck(card, isExtraDeckCard(card) ? 'extra' : 'main');
    });
    cardEl.addEventListener('contextmenu', (evt) => {
      evt.preventDefault();
      // Ctrl+Right-Click (or Cmd on macOS) adds to Side; otherwise to Extra
      if (evt.ctrlKey || evt.metaKey) addToDeck(card, 'side');
      else addToDeck(card, 'extra');
    });
    searchResults.appendChild(cardEl);
  }
  renderedCount = end;
}

function createCardElement(card) {
  const div = document.createElement('div');
  div.className = 'card';
  div.dataset.cardId = card.id;
  // Allow dragging search results into deck zones
  div.draggable = true;
  div.addEventListener('dragstart', (e) => onDragStartFromSearch(e, card));
  div.addEventListener('dragend', onDragEndGlobal);
  const img = document.createElement('img');
  img.src = card.card_images[0].image_url_small;
  img.alt = card.name;
  img.loading = 'lazy';
  div.appendChild(img);

  // Banlist indicator: TCG or Imported LFLIST
  const mode = banlistSelect ? banlistSelect.value : 'none';
  let banStatus = null;
  if (mode === 'tcg') banStatus = getTcgBanStatus(card);
  else if (mode === 'lflist') {
    const lim = importedLimits.get(card.id);
    if (lim === 0) banStatus = 'banned';
    else if (lim === 1) banStatus = 'limited';
    else if (lim === 2) banStatus = 'semi';
  }
  if (banStatus) {
    const b = document.createElement('span');
    b.className = `banlist-badge ${banStatus}`;
    if (banStatus === 'limited') b.textContent = '1';
    else if (banStatus === 'semi') b.textContent = '2';
    b.title = banStatus === 'banned' ? `Forbidden (${mode.toUpperCase()})`
      : banStatus === 'limited' ? `Limited (${mode.toUpperCase()})`
      : `Semi-Limited (${mode.toUpperCase()})`;
    div.appendChild(b);
  }

  const official = card?.misc_info?.[0]?.genesys_points ?? 0;
  const pointsMode = banlistSelect ? banlistSelect.value : 'none';
  const effectivePts = (pointsMode === 'allowlist' && importedAllowPoints.has(card.id)) ? (importedAllowPoints.get(card.id) || 0) : official;
  const badge = document.createElement('span');
  badge.className = 'genesys-badge official';
  badge.textContent = effectivePts;
  badge.title = (pointsMode === 'allowlist') ? `Allowlist Points: ${effectivePts}` : `Official Genesys Points: ${official}`;
  div.appendChild(badge);

  const hiResUrl = card.card_images[0]?.image_url || img.src;
  div.addEventListener('mouseenter', (e) => showPreview(hiResUrl, e, card));
  div.addEventListener('mousemove', (e) => positionPreview(e));
  div.addEventListener('mouseleave', hidePreview);

  return div;
}

// Filter logic reused/simplified
function matchesQueryAndFilters(card, query) {
  // When LFLIST mode is active, and a pool is defined, restrict search results to that pool
  if (banlistSelect && banlistSelect.value === 'lflist' && importedPool) {
    if (!importedPool.has(card.id)) return false;
  }
  if (isTokenOrSkill(card)) return false;
  if (query && !card.name.toLowerCase().includes(query)) return false;
  let selectedCategory = null;
  if (fCategory && fCategory.value !== 'all') {
    selectedCategory = fCategory.value;
    const cardCat = detectCardCategory(card);
    if (cardCat.toLowerCase() !== selectedCategory.toLowerCase()) return false;
  }
  if (fAttribute && !fAttribute.disabled && fAttribute.value && fAttribute.value !== 'all') {
    if ((card.attribute || '').toLowerCase() !== fAttribute.value.toLowerCase()) return false;
  }
  if (fCardType && !fCardType.disabled && fCardType.value && fCardType.value !== 'all') {
    const cat = (selectedCategory || detectCardCategory(card));
    const normalized = normalizeCardType(card, cat);
    if (!normalized) return false;
    if (normalized.toLowerCase() !== fCardType.value.toLowerCase()) return false;
  }
  if (fRace && !fRace.disabled && fRace.value && fRace.value !== 'all') {
    if ((card.race || '').toLowerCase() !== fRace.value.toLowerCase()) return false;
  }
  if (monsterTagCheckboxes.length && monsterTagCheckboxes.some(cb => !cb.disabled && cb.checked)) {
    const typeStr = (card.type || '').toLowerCase();
    const frameStr = (card.frameType || '').toLowerCase();
    for (const cb of monsterTagCheckboxes) {
      if (cb.disabled || !cb.checked) continue;
      const tag = cb.value.toLowerCase();
      if (tag === 'pendulum') {
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
  if (fScale && !fScale.disabled && fScale.value) {
    const scale = card.scale ?? card.pend_scale ?? null;
    if (scale === null || scale !== parseInt(fScale.value, 10)) return false;
  }
  const atk = card.atk ?? -1;
  const def = card.def ?? -1;
  if (fAtk && !fAtk.disabled && fAtk.value && !compareWithOperator(atk, fAtk.value)) return false;
  if (fDef && !fDef.disabled && fDef.value && !compareWithOperator(def, fDef.value)) return false;
  if (fLimit && fLimit.value && fLimit.value !== 'all') {
    const raw = (card?.banlist_info?.ban_tcg || '').toLowerCase();
    let status = 'unlimited';
    if (raw) {
      if (raw.includes('ban') || raw.includes('forbid')) status = 'banned';
      else if (raw.includes('semi')) status = 'semi';
      else if (raw.includes('limit')) status = 'limited';
    }
    if (status !== fLimit.value.toLowerCase()) return false;
  }
  return true;
}

function populateFilterOptions() {
  const attributes = new Set();
  allCards.forEach(c => { if (c.attribute) attributes.add(c.attribute.toLowerCase()); });
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

function clearFilters() {
  if (fCategory) fCategory.value = 'all';
  [fAttribute,fRace,fCardType,fLevel,fScale,fLimit,fAtk,fDef].forEach(el => { if (el) el.value = ''; });
  if (fAttribute) fAttribute.value = 'all';
  if (fRace) fRace.value = 'all';
  if (fCardType) fCardType.value = 'all';
  updateCardTypeOptions();
  updateFilterEnablement();
  refreshSearchResults();
}

function capitalize(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function compareWithOperator(value, input) {
  const str = String(input).trim();
  if (!str) return true;
  const parts = str.split(',').map(s => s.trim()).filter(Boolean);
  const test = (token) => {
    const m = token.match(/^(>=|<=|>|<|=)?\s*(\?|\d+)$/);
    if (!m) return true;
    const op = m[1] || '=';
    if (m[2] === '?') return true;
    const num = parseInt(m[2], 10);
    if (Number.isNaN(num)) return true;
    switch (op) {
      case '>': return value > num;
      case '>=': return value >= num;
      case '<': return value < num;
      case '<=': return value <= num;
      case '=': default: return value === num;
    }
  };
  return parts.every(test);
}
function detectCardCategory(card) {
  const t = (card.type || '').toLowerCase();
  if (t.includes('spell')) return 'Spell';
  if (t.includes('trap')) return 'Trap';
  return 'Monster';
}
function normalizeCardType(card, category) {
  const typeStr = (card.type || '').toLowerCase();
  const raceStr = (card.race || '').toLowerCase();
  const catLower = (category || detectCardCategory(card) || '').toLowerCase();
  if (catLower === 'monster') {
    if (typeStr.includes('link')) return 'Link';
    if (typeStr.includes('xyz')) return 'Xyz';
    if (typeStr.includes('synchro')) return 'Synchro';
    if (typeStr.includes('fusion')) return 'Fusion';
    if (typeStr.includes('ritual')) return 'Ritual';
    const isEffectLike = (typeStr.includes('effect') || typeStr.includes('spirit') || typeStr.includes('tuner') || typeStr.includes('flip') || typeStr.includes('gemini') || typeStr.includes('union'));
    if (isEffectLike) return 'Effect';
    if (typeStr.includes('normal')) return 'Normal';
    return null;
  } else if (catLower === 'spell') {
    if (raceStr.includes('quick')) return 'Quick-Play';
    if (raceStr.includes('continuous')) return 'Continuous';
    if (raceStr.includes('equip')) return 'Equip';
    if (raceStr.includes('field')) return 'Field';
    if (raceStr.includes('ritual')) return 'Ritual';
    if (raceStr.includes('normal')) return 'Normal';
    return null;
  } else if (catLower === 'trap') {
    if (raceStr.includes('continuous')) return 'Continuous';
    if (raceStr.includes('counter')) return 'Counter';
    if (raceStr.includes('normal')) return 'Normal';
    return null;
  }
  return null;
}
function updateCardTypeOptions() {
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
function updateFilterEnablement() {
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
  if (fLimit) fLimit.disabled = false;
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

function isTokenOrSkill(card) {
  const t = (card.type || '').toLowerCase();
  const f = (card.frameType || '').toLowerCase();
  return t.includes('token') || f.includes('token') || t.includes('skill') || f.includes('skill');
}
function isExtraDeckCard(card) {
  const t = (card.type || '').toLowerCase();
  return t.includes('fusion') || t.includes('synchro') || t.includes('xyz') || t.includes('link');
}

// Deck ops and banlists
function onBanlistChange() {
  const mode = banlistSelect.value;
  // Avoid layout shifting: keep space reserved and toggle visibility only
  if (genesysMaxWrap) genesysMaxWrap.style.visibility = (mode === 'genesys') ? 'visible' : 'hidden';
  updateGenesysPoints();
  // Re-render search results and deck to update banlist badges visibility
  if (typeof refreshSearchResults === 'function') refreshSearchResults();
  renderDeck();
}
function updateGenesysPoints() {
  const total = deck.main.concat(deck.extra, deck.side).reduce((sum, id) => {
    const c = idToCard.get(id); if (!c) return sum;
    let pts = c?.misc_info?.[0]?.genesys_points ?? 0;
    // If allowlist (genesys) mode is active, override with imported points when present
    if (banlistSelect && banlistSelect.value === 'allowlist') {
      if (importedAllowPoints.has(c.id)) pts = importedAllowPoints.get(c.id) || 0;
    }
    return sum + (pts || 0);
  }, 0);
  genesysCurrentSpan.textContent = `(${total})`;
  // Hide the search-area current points display when we're showing totals in the deck header
  if (genesysCurrentSpan) {
    const modeForDisplay = banlistSelect ? banlistSelect.value : 'none';
    if (modeForDisplay === 'genesys' || modeForDisplay === 'allowlist') {
      genesysCurrentSpan.style.display = 'none';
    } else {
      genesysCurrentSpan.style.display = '';
    }
  }
  // Show deck total points when in Genesys or Allowlist mode
  if (deckPointsSpan) {
    const mode = banlistSelect ? banlistSelect.value : 'none';
    if (mode === 'genesys' || mode === 'allowlist') {
      deckPointsSpan.style.display = '';
      const label = 'Total Points';
      const max = (mode === 'genesys')
        ? (parseInt(genesysMaxInput.value || '100', 10) || 100)
        : (importedAllowMax != null ? importedAllowMax : 100);
      deckPointsSpan.textContent = `${label}: ${total}/${max}`;
      // Highlight in red if over the cap
      deckPointsSpan.classList.toggle('overcap', total > max);
    } else {
      deckPointsSpan.style.display = 'none';
      deckPointsSpan.textContent = '';
      deckPointsSpan.classList.remove('overcap');
    }
  }
}
function addToDeck(card, zone) {
  // Universal copy cap: max 3 copies across Main+Extra+Side
  const mode = banlistSelect.value;
  // Enforce imported LFLIST pool if defined
  if (mode === 'lflist' && importedPool && !importedPool.has(card.id)) { return; }
  const currentCopies = countCopies(card.id);
  // Enforce lflist per-card limit if provided, else 3
  const limit = (mode === 'lflist' && importedLimits.has(card.id)) ? importedLimits.get(card.id) : 3;
  if (currentCopies >= limit) { return; }

  const target = zone === 'extra' ? deck.extra : (zone === 'side' ? deck.side : deck.main);
  if (zone === 'extra' && !isExtraDeckCard(card)) {
    // If not extra type, put in main
    deck.main.push(card.id);
  } else {
    target.push(card.id);
  }
  renderDeck();
}
function countCopies(id) {
  return deck.main.filter(x=>x===id).length + deck.extra.filter(x=>x===id).length + deck.side.filter(x=>x===id).length;
}
function renderDeck() {
  // Determine if over cap to highlight contributing cards
  const modeForDeck = banlistSelect ? banlistSelect.value : 'none';
  const totalPoints = deck.main.concat(deck.extra, deck.side).reduce((sum, id) => {
    const c = idToCard.get(id); if (!c) return sum;
    let pts = c?.misc_info?.[0]?.genesys_points ?? 0;
    if (modeForDeck === 'allowlist' && importedAllowPoints.has(c.id)) pts = importedAllowPoints.get(c.id) || 0;
    return sum + (pts || 0);
  }, 0);
  const maxPoints = (modeForDeck === 'genesys')
    ? (parseInt(genesysMaxInput.value || '100', 10) || 100)
    : (modeForDeck === 'allowlist' && importedAllowMax != null ? importedAllowMax : 100);
  const isOvercap = (modeForDeck === 'genesys' || modeForDeck === 'allowlist') && (totalPoints > maxPoints);

  const renderZone = (grid, ids, zone) => {
    grid.innerHTML = '';
    ids.forEach(id => {
      const card = idToCard.get(id); if (!card) return;
      // If pool is active and no longer matches mode, allow rendering existing deck entries,
      // but do not filter here; pool is enforced in search/add/import paths.
      const el = document.createElement('div'); el.className = 'card'; el.dataset.cardId = id;
      // Make deck cards draggable (move between zones)
      el.draggable = true;
      el.addEventListener('dragstart', (e) => onDragStartFromDeck(e, id));
      el.addEventListener('dragend', onDragEndGlobal);
      const img = document.createElement('img'); img.src = card.card_images[0].image_url_small; img.alt = card.name; img.loading = 'lazy'; el.appendChild(img);
  const mode = banlistSelect ? banlistSelect.value : 'none';
      let banStatus = null;
      if (mode === 'tcg') banStatus = getTcgBanStatus(card);
      else if (mode === 'lflist') {
        const lim = importedLimits.get(card.id);
        if (lim === 0) banStatus = 'banned';
        else if (lim === 1) banStatus = 'limited';
        else if (lim === 2) banStatus = 'semi';
      }
      if (banStatus) {
        const b = document.createElement('span');
        b.className = `banlist-badge ${banStatus}`;
        if (banStatus === 'limited') b.textContent = '1';
        else if (banStatus === 'semi') b.textContent = '2';
        b.title = banStatus === 'banned' ? `Forbidden (${mode.toUpperCase()})`
          : banStatus === 'limited' ? `Limited (${mode.toUpperCase()})`
          : `Semi-Limited (${mode.toUpperCase()})`;
        el.appendChild(b);
      }
      // Show Genesys points badge; override with allowlist points in allowlist mode
      {
        const official = card?.misc_info?.[0]?.genesys_points ?? 0;
        const pts = (mode === 'allowlist' && importedAllowPoints.has(card.id)) ? (importedAllowPoints.get(card.id) || 0) : official;
        const badge = document.createElement('span');
        badge.className = 'genesys-badge official';
        badge.textContent = pts;
        badge.title = (mode === 'allowlist') ? `Allowlist Points: ${pts}` : `Official Genesys Points: ${official}`;
        el.appendChild(badge);
        // Highlight cards that contribute points when over cap
        if (isOvercap && pts > 0) {
          el.classList.add('points-overcap');
        }
      }
  const hi = card.card_images[0]?.image_url || img.src; el.addEventListener('mouseenter', (e)=>showPreview(hi,e,card)); el.addEventListener('mousemove', (e)=>positionPreview(e)); el.addEventListener('mouseleave', hidePreview);
      el.title = 'Left/Right: remove  |  Ctrl+Right-Click: add copy';
      el.addEventListener('click', ()=> removeFromDeckZone(zone, id));
      el.addEventListener('contextmenu', (e)=>{
        e.preventDefault();
        if (e.ctrlKey) {
          const cardObj = idToCard.get(id);
          if (cardObj) addToDeck(cardObj, zone);
        } else {
          removeFromDeckZone(zone, id);
        }
      });
      grid.appendChild(el);
    });
    // Fill remaining slots with placeholders to maintain fixed grid height
    const capacity = zone === 'main' ? 60 : 15;
    const remaining = Math.max(0, capacity - ids.length);
    for (let i = 0; i < remaining; i++) {
      const ph = document.createElement('div');
      ph.className = 'slot-placeholder';
      grid.appendChild(ph);
    }
  };
  renderZone(mainDeckGrid, deck.main, 'main');
  renderZone(extraDeckGrid, deck.extra, 'extra');
  renderZone(sideDeckGrid, deck.side, 'side');
  mainCount.textContent = `(${deck.main.length}/60)`;
  extraCount.textContent = `(${deck.extra.length}/15)`;
  sideCount.textContent = `(${deck.side.length}/15)`;
  updateGenesysPoints();
}
function removeFromDeckZone(zone, id) {
  const arr = zone === 'extra' ? deck.extra : (zone === 'side' ? deck.side : deck.main);
  const i = arr.indexOf(id);
  if (i >= 0) arr.splice(i, 1);
  renderDeck();
}
function clearDeck() {
  deck.main = []; deck.extra = []; deck.side = [];
  renderDeck();
}

// --- Importers ---
async function onYdkFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const stats = importFromYdkText(text);
    setImportStatus(stats ? `Imported .ydk (main ${stats.addedMain}, extra ${stats.addedExtra}, side ${stats.addedSide})` : 'Failed to import .ydk', !stats);
  } catch (err) {
    alert('Failed to read .ydk file');
  } finally {
    e.target.value = '';
  }
}

function importFromYdkText(text) {
  // .ydk format has sections: #main, #extra, !side followed by integer IDs per line
  const lines = text.split(/\r?\n/);
  const idsMain = [];
  const idsExtra = [];
  const idsSide = [];
  let section = 'main';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#created') || line.startsWith('//' )) continue;
    if (line === '#main') { section = 'main'; continue; }
    if (line === '#extra') { section = 'extra'; continue; }
    if (line === '!side') { section = 'side'; continue; }
    const id = parseInt(line, 10);
    if (!Number.isFinite(id)) continue;
    if (section === 'main') idsMain.push(id);
    else if (section === 'extra') idsExtra.push(id);
    else idsSide.push(id);
  }
  return applyImportedIds(idsMain, idsExtra, idsSide);
}

function importYdkeSmart(){
  // Do not use the Clipboard API here to avoid browser paste chips; just open the modal.
  if (!ydkeModalBackdrop || !ydkeModalInput) return;
  ydkeModalInput.value = '';
  if (ydkeModalError) ydkeModalError.textContent = '';
  ydkeModalBackdrop.style.display = 'flex';
  // Focus next frame to ensure it renders before focusing
  setTimeout(()=>{ ydkeModalInput.focus(); }, 0);
}

function closeYdkeModal(){ if (ydkeModalBackdrop) ydkeModalBackdrop.style.display = 'none'; }
function onYdkeModalImport(){
  if (!ydkeModalInput) return;
  const val = ydkeModalInput.value.trim();
  if (!val) { if (ydkeModalError) ydkeModalError.textContent = 'Please paste a YDKE code.'; return; }
  const stats = importFromYdke(val, true);
  if (stats) {
    setImportStatus(`Imported YDKE (main ${stats.addedMain}, extra ${stats.addedExtra}, side ${stats.addedSide})`);
    closeYdkeModal();
  } else {
    if (ydkeModalError) ydkeModalError.textContent = 'Invalid YDKE code.';
  }
}

// (inline paste fallback removed)

function importFromYdke(input, suppressErrors = false) {
  let s = (input || '').trim();
  if (!s) { if (!suppressErrors) alert('Invalid YDKE'); return null; }
  if (s.toLowerCase().startsWith('ydke://')) s = s.slice(7);
  // Accept common separators: '!' (spec) or ';' (our simple export) or '|'
  let parts = s.split(/[;!|]/);
  // YDKE often ends with a trailing separator; remove empties at the end
  while (parts.length && parts[parts.length-1] === '') parts.pop();
  if (parts.length < 3) { if (!suppressErrors) alert('Invalid YDKE'); return null; }
  try {
    const mainIds = decodeYdkePart(parts[0]);
    const extraIds = decodeYdkePart(parts[1]);
    const sideIds = decodeYdkePart(parts[2]);
    const stats = applyImportedIds(mainIds, extraIds, sideIds);
    return stats;
  } catch (e) {
    if (!suppressErrors) alert('Invalid YDKE');
    return null;
  }
}

function decodeYdkePart(raw) {
  if (!raw) return [];
  const csvRe = /^\d+(,\d+)*$/;
  // If already plain CSV (non-base64), accept it directly
  if (csvRe.test(raw)) {
    return raw.split(',').map(s=>parseInt(s,10)).filter(Number.isFinite);
  }
  // Normalize URL-safe base64 and padding
  let b64 = String(raw).replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  const mod = b64.length % 4; if (mod) b64 += '='.repeat(4 - mod);
  let bin = '';
  try {
    bin = atob(b64);
  } catch {
    // As a last resort, try interpreting the input as UTF-8 text containing CSV
    if (csvRe.test(raw)) return raw.split(',').map(s=>parseInt(s,10)).filter(Number.isFinite);
    throw new Error('base64 decode failed');
  }
  // If decoded data looks like CSV text, parse
  if (/\d,\d/.test(bin) && /^[0-9,\s]+$/.test(bin)) {
    return bin.split(',').map(s=>parseInt(s,10)).filter(Number.isFinite);
  }
  // Otherwise treat as binary bytes; try 2-byte and 4-byte groupings, both endiannesses.
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i) & 0xff;
  const candidates = [];
  const score = (arr) => arr.reduce((s,id)=> s + (idToCard.has(id) ? 1 : 0), 0);
  const pushCandidates = (step) => {
    const usable = bytes.length - (bytes.length % step);
    if (usable <= 0) return;
    const idsLE = []; const idsBE = [];
    for (let i=0;i<usable;i+=step) {
      if (step === 2) {
        idsLE.push(bytes[i] | (bytes[i+1] << 8));
        idsBE.push((bytes[i] << 8) | bytes[i+1]);
      } else if (step === 4) {
        idsLE.push(bytes[i] | (bytes[i+1] << 8) | (bytes[i+2] << 16) | (bytes[i+3] << 24 >>> 0));
        idsBE.push(((bytes[i] << 24) >>> 0) | (bytes[i+1] << 16) | (bytes[i+2] << 8) | bytes[i+3]);
      }
    }
    candidates.push(idsLE, idsBE);
  };
  pushCandidates(2);
  pushCandidates(4);
  // Pick the candidate with the best score; fall back to the first if all scores are zero
  let best = candidates[0] || [];
  let bestScore = score(best);
  for (let i=1;i<candidates.length;i++) {
    const sc = score(candidates[i]);
    if (sc > bestScore) { best = candidates[i]; bestScore = sc; }
  }
  return best.filter(Number.isFinite);
}

function setImportStatus(msg, isError=false){
  if (!importStatus) return;
  importStatus.textContent = msg;
  importStatus.style.color = isError ? '#ff6b6b' : 'var(--text-muted)';
  // auto-clear after a few seconds
  clearTimeout(setImportStatus._t);
  setImportStatus._t = setTimeout(()=>{ importStatus.textContent=''; }, 4000);
}

// ----- LFLIST Import -----
async function onLflistSelected(e){
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    parseLflistConf(text);
    // Create or update a dynamic banlist option labeled with the list's title (fallback to filename)
    const label = (importedListTitle && importedListTitle.trim()) ? importedListTitle.trim() : (file.name || 'Imported LFLIST');
    // Remove previous imported option if it exists
    if (importedBanlistOption && importedBanlistOption.parentElement) {
      importedBanlistOption.parentElement.removeChild(importedBanlistOption);
    }
    importedBanlistOption = document.createElement('option');
    importedBanlistOption.value = 'lflist';
    importedBanlistOption.textContent = label;
    // Insert after Genesys option for consistency
    const sel = banlistSelect;
    if (sel) {
      // Find genesys option index
      let insertAfterIndex = -1;
      for (let i=0; i<sel.options.length; i++) {
        if (sel.options[i].value === 'genesys') { insertAfterIndex = i; break; }
      }
      if (insertAfterIndex >= 0 && insertAfterIndex < sel.options.length - 1) {
        sel.add(importedBanlistOption, sel.options[insertAfterIndex + 1]);
      } else {
        sel.add(importedBanlistOption);
      }
      sel.value = 'lflist';
      onBanlistChange();
    }
    setImportStatus(`Imported LFLIST: ${label}. Limits and pool applied.`);
  } catch (err) {
    console.error(err);
    setImportStatus('Failed to import LFLIST', true);
  } finally {
    e.target.value = '';
  }
}

// ----- Allowlist (Genesys) Import -----
async function onAllowlistSelected(e){
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    parseAllowlistJson(text);
    const label = (importedAllowTitle && importedAllowTitle.trim()) ? importedAllowTitle.trim() : (file.name || 'Imported Allowlist');
    // Remove previous allowlist option
    if (importedAllowOption && importedAllowOption.parentElement) {
      importedAllowOption.parentElement.removeChild(importedAllowOption);
    }
    importedAllowOption = document.createElement('option');
    importedAllowOption.value = 'allowlist';
    importedAllowOption.textContent = label;
    // Insert right after Genesys option
    const sel = banlistSelect;
    if (sel) {
      let insertAfterIndex = -1;
      for (let i=0; i<sel.options.length; i++) {
        if (sel.options[i].value === 'genesys') { insertAfterIndex = i; break; }
      }
      if (insertAfterIndex >= 0 && insertAfterIndex < sel.options.length - 1) {
        sel.add(importedAllowOption, sel.options[insertAfterIndex + 1]);
      } else {
        sel.add(importedAllowOption);
      }
      sel.value = 'allowlist';
      onBanlistChange();
    }
    setImportStatus(`Imported Allowlist: ${label}. Points applied${importedAllowMax!=null?`, Max ${importedAllowMax}`:''}.`);
  } catch (err) {
    console.error(err);
    setImportStatus('Failed to import allowlist', true);
  } finally {
    e.target.value = '';
  }
}

function parseAllowlistJson(text){
  importedAllowPoints.clear();
  importedAllowMax = null;
  importedAllowTitle = '';
  let obj = null;
  try { obj = JSON.parse(text); } catch { obj = null; }
  if (!obj || typeof obj !== 'object') return;
  // Optional: if a title is present in JSON, accept it (not standard); otherwise keep empty to fall back to filename
  if (typeof obj.title === 'string') importedAllowTitle = obj.title.trim();
  // Max points lives under key 'genesys'
  if (typeof obj.genesys === 'number') importedAllowMax = obj.genesys;
  // For each other key starting with 'genesys' and followed by an id, map that id to points
  Object.keys(obj).forEach(k => {
    if (k === 'genesys') return;
    if (!k.startsWith('genesys')) return;
    const idStr = k.slice('genesys'.length);
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return;
    const pts = obj[k];
    const val = (typeof pts === 'number' && pts >= 0) ? pts : 0;
    importedAllowPoints.set(id, val);
  });
}

function parseLflistConf(text){
  importedLimits.clear();
  importedPool = new Set();
  importedListTitle = '';
  const lines = text.split(/\r?\n/);
  let inBlock = false;
  let sectionLimit = null; // 0/1/2/3 when in a specific section like forbidden/limited/semi/unlimited
  const isBlockHeader = (s) => /^(#\s*)?(list|begin|ban|banlist|forbidden|limited|semi\-?limited|semi|unlimited|pool)\b/.test(s);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('!')) { importedListTitle = line.slice(1).trim(); continue; }
    const lower = line.toLowerCase();
    if (lower.startsWith('#end')) { inBlock = false; sectionLimit = null; continue; }
    if (lower.startsWith('#')) {
      // If this is one of the known block headers, enter block mode; otherwise treat as comment
      inBlock = isBlockHeader(lower);
      sectionLimit = null;
      if (inBlock) {
        if (/forbidden/.test(lower)) sectionLimit = 0;
        else if (/semi\-?limited|\bsemi\b/.test(lower)) sectionLimit = 2;
        else if (/\blimit|limited\b/.test(lower)) sectionLimit = 1;
        else if (/unlimited/.test(lower)) sectionLimit = 3;
      }
      continue;
    }
    // Try parse "id limit" or "id = limit"
    let m = line.match(/^(\d+)\s*(?:[:=])?\s*(-?\d+)\b/);
    if (m) {
      const id = parseInt(m[1],10); const lim = parseInt(m[2],10);
      if (!Number.isFinite(id)) continue;
      const clamped = Math.max(0, Math.min(3, lim));
      importedLimits.set(id, clamped);
      importedPool.add(id);
      continue;
    }
    // If inside a section with an implied limit, accept bare ID lines
    if (inBlock && sectionLimit !== null) {
      const bare = line.match(/^(\d+)\b/);
      if (bare) {
        const id = parseInt(bare[1],10);
        if (Number.isFinite(id)) {
          importedLimits.set(id, sectionLimit);
          importedPool.add(id);
        }
      }
    }
  }
  if (importedPool && importedPool.size === 0) importedPool = null; // no pool restriction if empty
}

function applyImportedIds(mainIds, extraIds, sideIds) {
  // Reset deck
  deck.main = []; deck.extra = []; deck.side = [];
  const stats = { addedMain: 0, addedExtra: 0, addedSide: 0, skippedUnknown: 0, skippedOverCap: 0 };
  const pushWithRules = (id, targetZoneGuess = 'main') => {
    const card = idToCard.get(id);
    if (!card) { stats.skippedUnknown++; return; } // unknown id; skip silently
    // Enforce imported LFLIST pool and limits if active
    if (banlistSelect && banlistSelect.value === 'lflist') {
  if (importedPool && !importedPool.has(id)) { stats.skippedUnknown++; return; }
      const limit = importedLimits.has(id) ? importedLimits.get(id) : 3;
      const copies = countCopies(id);
      if (copies >= limit) { stats.skippedOverCap++; return; }
    } else {
      const copies = countCopies(id);
      if (copies >= 3) { stats.skippedOverCap++; return; }
    }
    // choose zone (respect extra-deck typing)
    let zone = targetZoneGuess;
    if (targetZoneGuess === 'extra' || (targetZoneGuess !== 'side' && isExtraDeckCard(card))) zone = 'extra';
    else if (targetZoneGuess === 'side') zone = 'side';
    else zone = 'main';
    // enforce capacities
    if (zone === 'main' && deck.main.length >= 60) { stats.skippedOverCap++; return; }
    if (zone === 'extra' && deck.extra.length >= 15) { stats.skippedOverCap++; return; }
    if (zone === 'side' && deck.side.length >= 15) { stats.skippedOverCap++; return; }
    if (zone === 'extra' && !isExtraDeckCard(card)) { zone = 'main'; if (deck.main.length >= 60) { stats.skippedOverCap++; return; } }
    // push
    if (zone === 'main') { deck.main.push(id); stats.addedMain++; }
    else if (zone === 'extra') { deck.extra.push(id); stats.addedExtra++; }
    else { deck.side.push(id); stats.addedSide++; }
  };
  mainIds.forEach(id => pushWithRules(id, 'main'));
  extraIds.forEach(id => pushWithRules(id, 'extra'));
  sideIds.forEach(id => pushWithRules(id, 'side'));
  renderDeck();
  return stats;
}


// Exporters
function exportYdk() {
  const lines = [];
  lines.push('#created by Genesys Deck Builder');
  lines.push('#main');
  deck.main.forEach(id => lines.push(String(id)));
  lines.push('#extra');
  deck.extra.forEach(id => lines.push(String(id)));
  lines.push('!side');
  deck.side.forEach(id => lines.push(String(id)));
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'deck.ydk'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
function copyYdke() {
  // YDKE format: base64 of each section's bytes with semicolons. For simplicity use comma-separated ids and btoa.
  // This simplified encoding might not include quantities/rarities; many apps accept this variant: YDKE:main|extra|side| (base64)
  const enc = (arr) => btoa(arr.join(','));
  const code = `ydke://${enc(deck.main)};${enc(deck.extra)};${enc(deck.side)};`;
  navigator.clipboard.writeText(code).then(()=>{
    alert('YDKE code copied to clipboard');
  }, ()=>{
    alert('Failed to copy YDKE code');
  });
}

// Preview (copied from main with small adjustments)
let previewVisible = false; let lastPreviewKey = '';
function showPreview(url, evt, card = null) {
  if (!previewEl) return;
  const key = `${card?.id || ''}|${url}`;
  if (lastPreviewKey !== key) {
    previewEl.innerHTML = buildPreviewContent(url, card);
    lastPreviewKey = key;
  }
  previewEl.style.display = 'block'; previewVisible = true; positionPreview(evt);
}
function positionPreview(evt) {
  if (!previewEl || !previewVisible) return;
  const pad = 16; const r = previewEl.getBoundingClientRect();
  let x = evt.clientX + pad; let y = evt.clientY + pad;
  const vw = window.innerWidth; const vh = window.innerHeight;
  if (x + r.width > vw - pad) x = evt.clientX - r.width - pad;
  if (y + r.height > vh - pad) y = evt.clientY - r.height - pad;
  x = Math.max(pad, Math.min(x, vw - r.width - pad)); y = Math.max(pad, Math.min(y, vh - r.height - pad));
  previewEl.style.left = `${x}px`; previewEl.style.top = `${y}px`;
}
function hidePreview(){ if (!previewEl) return; previewEl.style.display='none'; previewVisible=false; }
function buildPreviewContent(imgUrl, card){
  const safe = (s)=> (s==null?'' : String(s)); if (!card) return `<div class="preview-content"><div class="preview-image"><img src="${imgUrl}" alt="Card preview"></div></div>`;
  const name = safe(card.name); const category = detectCardCategory(card); const typeLine = buildTypeLine(card, category); const statsLine = buildStatsLine(card); const desc = safe(card.desc);
  return `
    <div class="preview-content">
      <div class="preview-image"><img src="${imgUrl}" alt="${name}"></div>
      <div class="preview-info">
        <div class="preview-name">${escapeHtml(name)}</div>
        <div class="preview-typeline">${escapeHtml(typeLine)}</div>
        ${statsLine ? `<div class="preview-stats">${escapeHtml(statsLine)}</div>` : ''}
        <div class="preview-text">${escapeHtml(desc)}</div>
      </div>
    </div>`;
}
function buildTypeLine(card, category){
  const cat = (category || detectCardCategory(card)).toLowerCase(); const parts = [];
  if (cat === 'monster') { if (card.race) parts.push(card.race); const t=(card.type||'').toLowerCase(); const norm=normalizeCardType(card,'Monster'); if (norm && !['Normal','Effect'].includes(norm)) parts.push(norm);
    const isExtra=['Fusion','Synchro','Xyz','Link','Ritual'].some(x=>parts.includes(x)); if (!isExtra){ const hasEff = t.includes('effect')||t.includes('spirit')||t.includes('tuner')||t.includes('flip')||t.includes('gemini')||t.includes('union'); if (hasEff && !parts.includes('Effect')) parts.push('Effect'); }
    const isPend = (card.scale!=null||card.pend_scale!=null)||t.includes('pendulum')||(card.frameType||'').toLowerCase().includes('pendulum'); if (isPend) parts.push('Pendulum'); return `[${parts.join('/')}]`; }
  else if (cat==='spell'){ parts.push('Spell'); if (card.race) parts.push(card.race); return `[${parts.join('/')}]`; }
  else if (cat==='trap'){ parts.push('Trap'); if (card.race) parts.push(card.race); return `[${parts.join('/')}]`; }
  return '';
}
function buildStatsLine(card){ const t=(card.type||'').toLowerCase(); const parts=[]; const isLink=t.includes('link'); const isXyz=t.includes('xyz'); const isPend=(card.scale!=null||card.pend_scale!=null)||t.includes('pendulum')||(card.frameType||'').toLowerCase().includes('pendulum');
  if (isLink){ if (card.linkval!=null) parts.push(`LINK-${card.linkval}`); }
  else if (isXyz){ if (card.level!=null) parts.push(`RANK ${card.level}`); }
  else if (card.level!=null){ parts.push(`LV ${card.level}`); }
  if (isPend){ const sc=card.scale ?? card.pend_scale; if (sc!=null) parts.push(`SCALE ${sc}`); }
  const atk=card.atk; const def=isLink?null:card.def; const atkStr=(atk!=null?atk:'?'); const defStr=isLink?'—':(def!=null?def:'?'); if (atk!=null||def!=null||isLink) parts.push(`ATK ${atkStr} / DEF ${defStr}`);
  return parts.join(' · ');
}
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

// Utility reuse
function detectCardCategory(card){ const t=(card.type||'').toLowerCase(); if (t.includes('spell')) return 'Spell'; if (t.includes('trap')) return 'Trap'; return 'Monster'; }
function normalizeCardType(card,category){ const typeStr=(card.type||'').toLowerCase(); const raceStr=(card.race||'').toLowerCase(); const catLower=(category||detectCardCategory(card)||'').toLowerCase(); if (catLower==='monster'){ if (typeStr.includes('link')) return 'Link'; if (typeStr.includes('xyz')) return 'Xyz'; if (typeStr.includes('synchro')) return 'Synchro'; if (typeStr.includes('fusion')) return 'Fusion'; if (typeStr.includes('ritual')) return 'Ritual'; const isEff=(typeStr.includes('effect')||typeStr.includes('spirit')||typeStr.includes('tuner')||typeStr.includes('flip')||typeStr.includes('gemini')||typeStr.includes('union')); if (isEff) return 'Effect'; if (typeStr.includes('normal')) return 'Normal'; return null; } else if (catLower==='spell'){ if (raceStr.includes('quick')) return 'Quick-Play'; if (raceStr.includes('continuous')) return 'Continuous'; if (raceStr.includes('equip')) return 'Equip'; if (raceStr.includes('field')) return 'Field'; if (raceStr.includes('ritual')) return 'Ritual'; if (raceStr.includes('normal')) return 'Normal'; return null; } else if (catLower==='trap'){ if (raceStr.includes('continuous')) return 'Continuous'; if (raceStr.includes('counter')) return 'Counter'; if (raceStr.includes('normal')) return 'Normal'; return null; } return null; }

// Determine TCG banlist status for a card
function getTcgBanStatus(card) {
  const raw = (card?.banlist_info?.ban_tcg || '').toLowerCase();
  if (!raw) return null;
  if (raw.includes('ban') || raw.includes('forbid')) return 'banned';
  if (raw.includes('semi')) return 'semi';
  if (raw.includes('limit')) return 'limited';
  return null;
}

// --- Drag & Drop ---
function setupDragAndDrop() {
  const zones = [
    { el: mainDeckGrid, zone: 'main' },
    { el: extraDeckGrid, zone: 'extra' },
    { el: sideDeckGrid, zone: 'side' },
  ];
  zones.forEach(({ el, zone }) => {
    if (!el) return;
    el.addEventListener('dragover', (e) => onZoneDragOver(e, zone));
    el.addEventListener('dragenter', (e) => onZoneDragEnter(e, zone));
    el.addEventListener('dragleave', (e) => onZoneDragLeave(e, zone));
    el.addEventListener('drop', (e) => onZoneDrop(e, zone));
  });
}

function onDragStartFromSearch(e, card) {
  const payload = { src: 'search', id: card.id };
  e.dataTransfer.setData('text/plain', JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'copy';
  try {
    const img = e.currentTarget.querySelector('img');
    if (img) {
      const ghost = createScaledDragImage(img.src, 90);
      const gw = 90; const gh = Math.round(gw * 86 / 59);
      e.dataTransfer.setDragImage(ghost, Math.round(gw/2), Math.round(gh/2));
    }
  } catch {}
}
function onDragStartFromDeck(e, id) {
  // Determine the source zone from where the card resides
  let srcZone = 'main';
  if (deck.extra.includes(id)) srcZone = 'extra';
  else if (deck.side.includes(id)) srcZone = 'side';
  const payload = { src: 'deck', id, srcZone };
  e.dataTransfer.setData('text/plain', JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'move';
  try {
    const img = e.currentTarget.querySelector('img');
    if (img) {
      const ghost = createScaledDragImage(img.src, 90);
      const gw = 90; const gh = Math.round(gw * 86 / 59);
      e.dataTransfer.setDragImage(ghost, Math.round(gw/2), Math.round(gh/2));
    }
  } catch {}
}
let __dragGhostEl = null;
function onDragEndGlobal() {
  // Clear zone highlighting
  [mainDeckGrid, extraDeckGrid, sideDeckGrid].forEach(el => {
    if (!el) return;
    el.classList.remove('drag-over');
    el.classList.remove('drag-over-invalid');
  });
  // Clean up ghost
  if (__dragGhostEl && __dragGhostEl.parentNode) {
    __dragGhostEl.parentNode.removeChild(__dragGhostEl);
  }
  __dragGhostEl = null;
}

function parseDragData(e) {
  try { return JSON.parse(e.dataTransfer.getData('text/plain') || '{}'); }
  catch { return {}; }
}

function canDropToZone(card, zone) {
  if (zone === 'extra') return isExtraDeckCard(card);
  return true; // main or side accept all
}

function onZoneDragOver(e, zone) {
  const data = parseDragData(e);
  if (!data || !data.id) return;
  const card = idToCard.get(data.id);
  if (!card) return;
  const valid = canDropToZone(card, zone);
  if (!valid) {
    e.dataTransfer.dropEffect = 'none';
    return;
  }
  e.preventDefault();
  e.dataTransfer.dropEffect = data.src === 'deck' ? 'move' : 'copy';
}
function onZoneDragEnter(e, zone) {
  const data = parseDragData(e);
  const card = data && data.id ? idToCard.get(data.id) : null;
  const valid = card ? canDropToZone(card, zone) : false;
  const el = (zone === 'main' ? mainDeckGrid : zone === 'extra' ? extraDeckGrid : sideDeckGrid);
  if (!el) return;
  if (valid) { el.classList.add('drag-over'); el.classList.remove('drag-over-invalid'); }
  else { el.classList.add('drag-over-invalid'); el.classList.remove('drag-over'); }
}
function onZoneDragLeave(e, zone) {
  const el = (zone === 'main' ? mainDeckGrid : zone === 'extra' ? extraDeckGrid : sideDeckGrid);
  if (!el) return;
  // Only clear if leaving the zone (not entering a child)
  if (!el.contains(e.relatedTarget)) {
    el.classList.remove('drag-over');
    el.classList.remove('drag-over-invalid');
  }
}
function onZoneDrop(e, zone) {
  e.preventDefault();
  const data = parseDragData(e);
  if (!data || !data.id) return;
  const card = idToCard.get(data.id);
  if (!card) return;
  const el = (zone === 'main' ? mainDeckGrid : zone === 'extra' ? extraDeckGrid : sideDeckGrid);
  if (el) { el.classList.remove('drag-over'); el.classList.remove('drag-over-invalid'); }
  if (!canDropToZone(card, zone)) return;

  if (data.src === 'search') {
    // Add to target zone (respect copy cap & genesys limit; no prompts)
    const copies = countCopies(card.id);
    const mode = banlistSelect.value;
    const limit = (mode === 'lflist' && importedLimits.has(card.id)) ? importedLimits.get(card.id) : 3;
  if (mode === 'lflist' && importedPool && !importedPool.has(card.id)) return;
    if (copies >= limit) return;
    // No points cap blocking on drop; visual over-cap cues handled in renderDeck
    // Push into the right array
    const target = zone === 'extra' ? deck.extra : (zone === 'side' ? deck.side : deck.main);
    target.push(card.id);
    renderDeck();
  } else if (data.src === 'deck') {
    // Move between zones if destination differs
    let fromArr = deck.main, toArr = deck.main;
    if (data.srcZone === 'extra') fromArr = deck.extra; else if (data.srcZone === 'side') fromArr = deck.side;
    if (zone === 'extra') toArr = deck.extra; else if (zone === 'side') toArr = deck.side;
    // If same zone, do nothing
    if (fromArr === toArr) return;
    // Enforce copy cap implicitly unaffected (move doesn't change count), enforce legality
    if (!canDropToZone(card, zone)) return;
    const idx = fromArr.indexOf(card.id);
    if (idx >= 0) fromArr.splice(idx, 1);
    toArr.push(card.id);
    renderDeck();
  }
}

function createScaledDragImage(src, targetWidth) {
  const w = targetWidth; const h = Math.round(w * 86 / 59);
  const ghost = document.createElement('div');
  ghost.style.width = `${w}px`;
  ghost.style.height = `${h}px`;
  ghost.style.backgroundImage = `url('${src}')`;
  ghost.style.backgroundSize = 'cover';
  ghost.style.backgroundPosition = 'center';
  ghost.style.borderRadius = '6px';
  ghost.style.boxShadow = '0 6px 14px rgba(0,0,0,0.45)';
  ghost.style.border = '1px solid rgba(0,0,0,0.25)';
  ghost.style.position = 'fixed';
  ghost.style.left = '-9999px';
  ghost.style.top = '-9999px';
  ghost.style.zIndex = '999999';
  document.body.appendChild(ghost);
  __dragGhostEl = ghost;
  return ghost;
}

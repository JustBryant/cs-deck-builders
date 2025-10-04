document.addEventListener('DOMContentLoaded', initializeApp);

// DOM references
const searchBar = document.getElementById('search-bar');
const searchResults = document.getElementById('search-results');
const pointList = document.getElementById('point-list');
const importBtn = document.getElementById('import-btn');
const downloadBtn = document.getElementById('download-allowlist');
const loadingOverlay = document.getElementById('loading-overlay');
const listSearchInput = document.getElementById('list-search');
const themeToggleBtn = document.getElementById('theme-toggle');
const previewEl = document.getElementById('card-preview');
// Sorting controls
const searchSortKey = document.getElementById('search-sort-key');
const searchSortOrder = document.getElementById('search-sort-order');
const listSortKey = document.getElementById('list-sort-key');
const listSortOrder = document.getElementById('list-sort-order');
// Points modal refs
const pmBackdrop = document.getElementById('points-modal-backdrop');
const pmTitle = document.getElementById('points-modal-title');
const pmCardname = document.getElementById('points-modal-cardname');
const pmHint = document.getElementById('points-modal-hint');
const pmInput = document.getElementById('points-modal-input');
const pmError = document.getElementById('points-modal-error');
const pmOk = document.getElementById('points-modal-ok');
const pmCancel = document.getElementById('points-modal-cancel');
const pmClose = document.getElementById('points-modal-close');

// Data stores
const cardDatabase = new Map(); // name(lower) -> card
const idToCard = new Map();     // id -> card
const pointListCards = new Map(); // id -> { card, points }
const officialGenesysList = {}; // name -> points (rebuilt dynamically)
let allCards = []; // raw array for convenience
// Search render state
let currentResults = [];
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
        allCards = payload.data || [];

        // clear any placeholder data
        for (const k in officialGenesysList) delete officialGenesysList[k];

        allCards.forEach(card => {
            cardDatabase.set(card.name.toLowerCase(), card);
            idToCard.set(card.id, card);
            const pts = card?.misc_info?.[0]?.genesys_points;
            if (typeof pts === 'number' && pts > 0) {
                officialGenesysList[card.name] = pts;
            }
        });
        console.log(`Loaded ${allCards.length} cards. Official Genesys entries: ${Object.keys(officialGenesysList).length}`);

        // Wire events
        searchBar.addEventListener('input', handleSearch);
        searchBar.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                refreshSearchResults();
            }
        });
        // Infinite scroll for search results
        if (searchResults) {
            searchResults.addEventListener('scroll', () => {
                const nearBottom = searchResults.scrollTop + searchResults.clientHeight >= searchResults.scrollHeight - 120;
                if (nearBottom) renderNextChunk();
            });
            // Hide preview while scrolling the results
            searchResults.addEventListener('scroll', () => hidePreview());
        }
        if (pointList) {
            // Hide preview while scrolling the point list
            pointList.addEventListener('scroll', () => hidePreview());
        }
        const searchButton = document.getElementById('search-button');
        if (searchButton) searchButton.addEventListener('click', () => {
            refreshSearchResults();
        });
        if (searchSortKey) searchSortKey.addEventListener('change', refreshSearchResults);
        if (searchSortOrder) searchSortOrder.addEventListener('change', refreshSearchResults);
        importBtn.addEventListener('click', handleImport);
    downloadBtn.addEventListener('click', handleDownloadAllowlist);
        document.getElementById('toggle-select-mode').addEventListener('click', toggleSelectionMode);
        document.getElementById('add-selected-official').addEventListener('click', addSelectedOfficial);
        document.getElementById('add-selected-custom').addEventListener('click', addSelectedCustom);
    document.getElementById('clear-selection').addEventListener('click', clearSelection);
    if (listSearchInput) listSearchInput.addEventListener('input', renderPointList);
    if (listSortKey) listSortKey.addEventListener('change', renderPointList);
    if (listSortOrder) listSortOrder.addEventListener('change', renderPointList);
    // Filters listen
    [fCategory,fAttribute,fRace,fCardType,fLevel,fScale,fLimit,fAtk,fDef].forEach(el => el && el.addEventListener('input', refreshSearchResults));
    monsterTagCheckboxes.forEach(cb => cb.addEventListener('change', () => { updateFilterEnablement(); refreshSearchResults(); }));
    if (fCategory) {
        fCategory.addEventListener('change', () => {
            updateFilterEnablement();
            updateCardTypeOptions();
            refreshSearchResults();
        });
    }
    if (fClearBtn) fClearBtn.addEventListener('click', clearFilters);

    if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);

    populateFilterOptions();
    updateCardTypeOptions();
    updateFilterEnablement();
    // Global mousemove to reposition preview if visible
    window.addEventListener('mousemove', (e) => positionPreview(e));
    window.addEventListener('mousedown', hidePreview);

    // Modal wiring
    if (pmCancel) pmCancel.addEventListener('click', closePointsModal);
    if (pmClose) pmClose.addEventListener('click', closePointsModal);
    if (pmBackdrop) pmBackdrop.addEventListener('click', (e) => { if (e.target === pmBackdrop) closePointsModal(); });
    if (pmInput) pmInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); confirmPointsModal(); }
        if (e.key === 'Escape') { e.preventDefault(); closePointsModal(); }
    });
    if (pmOk) pmOk.addEventListener('click', confirmPointsModal);

        updateSelectionToolbarState();
    } catch (err) {
        console.error(err);
        showLoading(true, `Error loading database. Refresh page. (${err.message})`);
        return;
    } finally {
        showLoading(false);
    }
}

// --- Theme ---
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

// --- Search ---
function handleSearch(e) {
    const query = e.target.value.toLowerCase().trim();
    searchResults.innerHTML = '';

    const renderedIds = new Set();

    // Always show currently selected cards first (pinned) regardless of query
    if (selectedSearchCardIds.size > 0) {
        const group = document.createElement('div');
        group.style.display = 'contents'; // so cards flow naturally in grid
        selectedSearchCardIds.forEach(id => {
            const card = idToCard.get(id);
            if (!card) return;
            const cardEl = createCardElement(card, false);
            cardEl.classList.add('selected');
            cardEl.title = 'Selected - click to unselect';
            // selection click handler (selectionMode not required here to allow deselect anytime while still selected)
            cardEl.addEventListener('click', () => {
                toggleSearchCardSelection(card.id, cardEl);
            });
            // prevent context menu actions while pinned (still allow right-click remove from list if already added?) we keep consistent with below
            cardEl.addEventListener('contextmenu', (evt) => {
                evt.preventDefault();
                if (pointListCards.has(card.id)) {
                    removeCardFromPointList(card.id);
                } else {
                    addCardToPointList(card, 'prompt');
                }
            });
            searchResults.appendChild(cardEl);
            renderedIds.add(card.id);
        });
    }

    // Allow empty query so filters alone can drive results

    // Compute full result set once; exclude already-pinned selected cards to avoid duplicates
    let allFiltered = allCards.filter(c => matchesQueryAndFilters(c, query));
    // Apply sorting for search results
    if (searchSortKey && searchSortOrder) {
        const key = searchSortKey.value || 'alpha';
        const order = (searchSortOrder.value || 'asc').toLowerCase();
        const dir = order === 'desc' ? -1 : 1;
        const cmp = (a, b) => {
            if (key === 'points') {
                const pa = a?.misc_info?.[0]?.genesys_points ?? officialGenesysList[a.name] ?? 0;
                const pb = b?.misc_info?.[0]?.genesys_points ?? officialGenesysList[b.name] ?? 0;
                if (pa === pb) return a.name.localeCompare(b.name);
                return (pa - pb) * dir;
            }
            return a.name.localeCompare(b.name) * dir;
        };
        allFiltered = allFiltered.slice().sort(cmp);
    }
    currentResults = allFiltered.filter(c => !renderedIds.has(c.id));
    renderedCount = 0;
    renderNextChunk();
}

function matchesQueryAndFilters(card, query) {
    // Always exclude Tokens and Skill cards from search
    const typeLower = (card.type || '').toLowerCase();
    const frameLower = (card.frameType || '').toLowerCase();
    if (typeLower.includes('token') || frameLower.includes('token')) return false;
    if (typeLower.includes('skill') || frameLower.includes('skill')) return false;

    if (query && !card.name.toLowerCase().includes(query)) return false;
    // Category normalization and filter
    let selectedCategory = null;
    if (fCategory && fCategory.value !== 'all') {
        selectedCategory = fCategory.value;
        const cardCat = detectCardCategory(card);
        if (cardCat.toLowerCase() !== selectedCategory.toLowerCase()) return false;
    }
    // Attribute (Monsters only)
    if (fAttribute && !fAttribute.disabled && fAttribute.value && fAttribute.value !== 'all') {
        if ((card.attribute || '').toLowerCase() !== fAttribute.value.toLowerCase()) return false;
    }
    // Card Type (per-category normalized)
    if (fCardType && !fCardType.disabled && fCardType.value && fCardType.value !== 'all') {
        const cat = (selectedCategory || detectCardCategory(card));
        const normalized = normalizeCardType(card, cat);
        if (!normalized) return false; // don't guess; exclude unknowns
        if (normalized.toLowerCase() !== fCardType.value.toLowerCase()) return false;
    }
    // Race/Type (Monster species like Warrior/Dragon) - apply only when enabled
    if (fRace && !fRace.disabled && fRace.value && fRace.value !== 'all') {
        if ((card.race || '').toLowerCase() !== fRace.value.toLowerCase()) return false;
    }
    // Monster tags (Pendulum, Tuner, FLIP, Spirit, Gemini, Union) - apply only when enabled
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
    // Level/Rank (single comparator input)
    const level = card.level ?? card.linkval ?? 0;
    if (fLevel && !fLevel.disabled && fLevel.value && !compareWithOperator(level, fLevel.value)) return false;
    // Pendulum Scale (only applies when enabled, i.e., Monster + Pendulum tag)
    if (fScale && !fScale.disabled && fScale.value) {
        const scale = card.scale ?? card.pend_scale ?? null;
        if (scale === null || scale !== parseInt(fScale.value, 10)) return false;
    }
    // ATK/DEF (single comparator inputs)
    const atk = card.atk ?? -1;
    const def = card.def ?? -1;
    if (fAtk && !fAtk.disabled && fAtk.value && !compareWithOperator(atk, fAtk.value)) return false;
    if (fDef && !fDef.disabled && fDef.value && !compareWithOperator(def, fDef.value)) return false;
    // TCG Limit filtering using YGOPRODeck banlist_info.ban_tcg
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
    // Attributes
    const attributes = new Set();
    allCards.forEach(c => {
        if (c.attribute) attributes.add(c.attribute.toLowerCase());
    });
    const fill = (select, values) => {
        if (!select) return;
        const current = select.value;
        const arr = Array.isArray(values) ? values.slice() : Array.from(values);
        select.innerHTML = '<option value="all" selected>All</option>' + arr.sort().map(v => `<option value="${v}">${capitalize(v)}</option>`).join('');
        if (arr.includes(current)) {
            select.value = current;
        } else {
            select.value = 'all';
        }
    };
    fill(fAttribute, attributes);
    // Type (race) -> use canonical monster types list
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

// Parse comparator input like '>2000', '>=1500', '<1000', '<=7', '=0', or raw number (equals). Also supports comma-separated multi-conditions.
function compareWithOperator(value, input) {
    const str = String(input).trim();
    if (!str) return true;
    const parts = str.split(',').map(s => s.trim()).filter(Boolean);
    const test = (token) => {
        const m = token.match(/^(>=|<=|>|<|=)?\s*(\?|\d+)$/);
        if (!m) return true; // ignore invalid token
        const op = m[1] || '=';
        if (m[2] === '?') {
            // '?' means unknown/any; always passes
            return true;
        }
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
    // All tokens must pass
    return parts.every(test);
}

// Determine top-level category for a card
function detectCardCategory(card) {
    const t = (card.type || '').toLowerCase();
    if (t.includes('spell')) return 'Spell';
    if (t.includes('trap')) return 'Trap';
    return 'Monster';
}

// Normalize card type based on selected category for filtering
// Monster -> one of: Normal, Effect, Fusion, Synchro, Xyz, Link, Ritual
//   Note: Subtypes like Spirit, Tuner, FLIP, Gemini, Union are considered Effect for filtering purposes
// Spell -> one of: Normal, Quick-Play, Continuous, Equip, Field, Ritual
// Trap -> one of: Normal, Continuous, Counter
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
        // Treat subtype-only monsters as Effect (Spirit, Tuner, FLIP, Gemini, Union)
        const isEffectLike = (
            typeStr.includes('effect') ||
            typeStr.includes('spirit') ||
            typeStr.includes('tuner') ||
            typeStr.includes('flip') ||
            typeStr.includes('gemini') ||
            typeStr.includes('union')
        );
        if (isEffectLike) return 'Effect';
        if (typeStr.includes('normal')) return 'Normal';
        return null; // unknown (e.g., 'tuner'); do not force to Normal
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
        opt.value = val;
        opt.textContent = label;
        fCardType.appendChild(opt);
    };
    addOption('all', 'All');
    let options = [];
    const cat = (category || 'all').toLowerCase();
    if (cat === 'monster') {
        options = ['Normal','Effect','Fusion','Synchro','Xyz','Link','Ritual'];
    } else if (cat === 'spell') {
        options = ['Normal','Quick-Play','Continuous','Ritual','Equip','Field'];
    } else if (cat === 'trap') {
        options = ['Normal','Continuous','Counter'];
    } else {
        // No category selected
        fCardType.value = 'all';
        return;
    }
    for (const o of options) addOption(o, o);
    // reset selection to 'all' or previous if still valid
    if (options.includes(prev)) fCardType.value = prev; else fCardType.value = 'all';
}

function updateFilterEnablement() {
    const category = fCategory ? fCategory.value : 'all';
    const setDis = (el, flag) => {
        if (!el) return;
        el.disabled = flag;
        const isSelect = el.tagName === 'SELECT';
        if (flag) {
            // On disable: selects go to 'all' if available; inputs cleared
            if (isSelect) {
                if ([...el.options].some(o => o.value === 'all')) el.value = 'all';
            } else {
                el.value = '';
            }
        } else {
            // On enable: ensure selects default to 'all' if empty or invalid
            if (isSelect) {
                const values = new Set([...el.options].map(o => o.value));
                if (!el.value || !values.has(el.value)) {
                    if (values.has('all')) el.value = 'all';
                }
            }
        }
    };
    // Limit is always enabled
    if (fLimit) fLimit.disabled = false;
    // Default: disable all (except category and limit) when no category selected
    const none = (!category || category === 'all');
    if (none) {
        setDis(fCardType, true);
        setDis(fAttribute, true);
        setDis(fRace, true);
        setDis(fLevel, true);
        setDis(fScale, true);
        setDis(fAtk, true);
        setDis(fDef, true);
        monsterTagCheckboxes.forEach(cb => { cb.checked = false; cb.disabled = true; });
        return;
    }
    // Card Type enabled for any category selection
    setDis(fCardType, false);
    const cat = (category || '').toLowerCase();
    const isMonster = cat === 'monster';
    // Only Monster enables Attribute, Type(race), Lv/Rank, ATK, DEF
    setDis(fAttribute, !isMonster);
    setDis(fRace, !isMonster);
    setDis(fLevel, !isMonster);
    // Scale is enabled only when Pendulum tag is checked
    const pendulumChecked = monsterTagCheckboxes.some(cb => !cb.disabled && cb.value.toLowerCase() === 'pendulum' && cb.checked);
    setDis(fScale, !(isMonster && pendulumChecked));
    setDis(fAtk, !isMonster);
    setDis(fDef, !isMonster);
    monsterTagCheckboxes.forEach(cb => { cb.disabled = !isMonster; if (!isMonster) cb.checked = false; });
}

// --- Import Official List ---
async function handleImport() {
    showLoading(true, 'Importing Official Genesys List...');
    try {
        pointListCards.clear();
        for (const [name, pts] of Object.entries(officialGenesysList)) {
            const card = cardDatabase.get(name.toLowerCase());
            if (card) {
                pointListCards.set(card.id, { card, points: pts });
            }
        }
        renderPointList();
        refreshVisibleSearchBadges();
    } finally {
        showLoading(false);
    }
}

// --- Element Creation ---
function createCardElement(card, showPoints = true, points = 0) {
    const div = document.createElement('div');
    div.className = 'card';
    div.dataset.cardId = card.id;

    const img = document.createElement('img');
    img.src = card.card_images[0].image_url_small;
    img.alt = card.name;
    img.loading = 'lazy';
    div.appendChild(img);

    // Hover preview handlers (use high-res image on hover)
    const hiResUrl = card.card_images[0]?.image_url || img.src;
    div.addEventListener('mouseenter', (e) => showPreview(hiResUrl, e, card));
    div.addEventListener('mousemove', (e) => positionPreview(e));
    div.addEventListener('mouseleave', hidePreview);

    if (showPoints) {
        const span = document.createElement('span');
        span.className = 'points';
        span.textContent = points;
        span.title = 'Click to edit points';
        span.addEventListener('click', (e) => {
            e.stopPropagation();
            openPointEditor(card.id);
        });
        div.appendChild(span);
    } else {
        // Genesys official badge for search results
        const official = card?.misc_info?.[0]?.genesys_points ?? officialGenesysList[card.name] ?? 0;
        const assigned = pointListCards.get(card.id)?.points;
        const display = (assigned != null ? assigned : official);
        const badge = document.createElement('span');
        badge.className = 'genesys-badge';
        badge.textContent = display;
        badge.title = (assigned != null)
            ? `Assigned Points: ${assigned}`
            : `Official Genesys Points: ${official}`;
        badge.classList.add(assigned != null ? 'assigned' : 'official');
        div.appendChild(badge);
        div.classList.add('selectable');
        if (selectedSearchCardIds.has(card.id)) div.classList.add('selected');
    }
    return div;
}

function renderNextChunk() {
    if (!currentResults || renderedCount >= currentResults.length) return;
    const end = Math.min(renderedCount + SEARCH_CHUNK_SIZE, currentResults.length);
    for (let i = renderedCount; i < end; i++) {
        const card = currentResults[i];
    const cardEl = createCardElement(card, false);
        cardEl.title = 'Click: add (custom points) | Shift+Click: add official points';
        cardEl.addEventListener('click', (evt) => {
            if (selectionMode) {
                toggleSearchCardSelection(card.id, cardEl);
                return;
            }
            if (evt.shiftKey) {
                addCardToPointList(card, 'official');
            } else {
                addCardToPointList(card, 'prompt');
            }
        });
        cardEl.addEventListener('contextmenu', (evt) => {
            evt.preventDefault();
            if (selectionMode) return;
            if (pointListCards.has(card.id)) {
                removeCardFromPointList(card.id);
            } else {
                addCardToPointList(card, 'prompt');
            }
        });
        searchResults.appendChild(cardEl);
    }
    renderedCount = end;
}

// --- Point List Management ---
function addCardToPointList(card, mode = 'official', overridePoints = null) {
    if (pointListCards.has(card.id)) {
        // Already there -> open editor
        openPointEditor(card.id);
        return;
    }

    let resolved = 0;
    const official = card?.misc_info?.[0]?.genesys_points ?? 0;

    if (typeof mode === 'number') {
        resolved = mode;
    } else if (mode === 'prompt') {
        // Use modal to prompt for points
        openPointsModal({
            title: 'Set Points',
            cardName: card.name,
            hint: `Official: ${official}`,
            initial: (overridePoints !== null ? overridePoints : (official || 0)),
            onConfirm: (val) => {
                pointListCards.set(card.id, { card, points: val });
                renderPointList();
                updateSearchCardBadge(card.id);
            }
        });
        return; // will complete in callback
    } else { // 'official'
        resolved = official || 0;
    }
    pointListCards.set(card.id, { card, points: resolved });
    renderPointList();
    updateSearchCardBadge(card.id);
}

function renderPointList() {
    pointList.innerHTML = '';
    const q = (listSearchInput?.value || '').trim().toLowerCase();
    let items = [...pointListCards.values()]
        .filter(entry => !q || entry.card.name.toLowerCase().includes(q));
    // Apply sorting for list
    if (listSortKey && listSortOrder) {
        const key = listSortKey.value || 'alpha';
        const order = (listSortOrder.value || 'asc').toLowerCase();
        const dir = order === 'desc' ? -1 : 1;
        const cmp = (a, b) => {
            if (key === 'points') {
                if (a.points === b.points) return a.card.name.localeCompare(b.card.name);
                return (a.points - b.points) * dir;
            }
            return a.card.name.localeCompare(b.card.name) * dir;
        };
        items = items.slice().sort(cmp);
    } else {
        items = items.slice().sort((a,b) => a.card.name.localeCompare(b.card.name));
    }
    items.forEach(entry => {
        const el = createCardElement(entry.card, true, entry.points);
        el.addEventListener('click', () => openPointEditor(entry.card.id));
        el.addEventListener('contextmenu', (e) => { e.preventDefault(); removeCardFromPointList(entry.card.id); });
        el.title = 'Left: edit | Right: remove';
        pointList.appendChild(el);
    });
    updateTotalPoints();
}

function openPointEditor(cardId) {
    const entry = pointListCards.get(cardId);
    if (!entry) return;
    const current = entry.points;
    openPointsModal({
        title: 'Edit Points',
        cardName: entry.card.name,
        hint: '',
        initial: current,
        onConfirm: (val) => {
            if (val === current) return;
            entry.points = val;
            const node = pointList.querySelector(`[data-card-id="${cardId}"] .points`);
            if (node) node.textContent = val;
            updateTotalPoints();
            updateSearchCardBadge(cardId);
        }
    });
}

function updateTotalPoints() {
    const total = [...pointListCards.values()].reduce((sum, e) => sum + (e.points || 0), 0);
    const el = document.getElementById('total-points');
    if (el) el.textContent = `(${total})`;
}

function removeCardFromPointList(cardId) {
    if (!pointListCards.has(cardId)) return;
    pointListCards.delete(cardId);
    const node = pointList.querySelector(`[data-card-id="${cardId}"]`);
    if (node?.parentElement) node.parentElement.removeChild(node);
    updateTotalPoints();
    updateSearchCardBadge(cardId);
}

// --- Export / Download ---
function buildAllowlistJson() {
    // Match python script Genesys format: { "genesys": maxPoints, "genesys<id>": pointValue, ... }
    // Only include entries with >0 points, as 0-point cards are free (not present) per script logic
    const maxPointsInput = document.getElementById('max-genesys');
    let maxPoints = parseInt(maxPointsInput?.value || '100', 10);
    if (isNaN(maxPoints) || maxPoints <= 0) maxPoints = 100;
    const obj = { genesys: maxPoints };
    [...pointListCards.values()].forEach(entry => {
        if (entry.points > 0) {
            obj[`genesys${entry.card.id}`] = entry.points;
        }
    });
    return JSON.stringify(obj, null, 2);
}

function handleDownloadAllowlist() {
    if (pointListCards.size === 0) {
        if (!confirm('Point list is empty. Download empty allowlist.json anyway?')) return;
    }
    const json = buildAllowlistJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'allowlist.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- Selection Mode ---
function toggleSelectionMode() {
    selectionMode = !selectionMode;
    if (!selectionMode) {
        clearSelection();
    }
    const btn = document.getElementById('toggle-select-mode');
    btn.textContent = selectionMode ? 'Selection: On' : 'Selection: Off';
    updateSelectionToolbarState();
}

function toggleSearchCardSelection(cardId, element) {
    if (selectedSearchCardIds.has(cardId)) {
        selectedSearchCardIds.delete(cardId);
        element.classList.remove('selected');
    } else {
        selectedSearchCardIds.add(cardId);
        element.classList.add('selected');
    }
    updateSelectionToolbarState();
    refreshSearchResults();
}

function updateSelectionToolbarState() {
    const countSpan = document.getElementById('selection-count');
    const addOfficialBtn = document.getElementById('add-selected-official');
    const addCustomBtn = document.getElementById('add-selected-custom');
    const clearBtn = document.getElementById('clear-selection');
    countSpan.textContent = `${selectedSearchCardIds.size} selected`;
    const disabled = !selectionMode || selectedSearchCardIds.size === 0;
    addOfficialBtn.disabled = disabled;
    addCustomBtn.disabled = disabled;
    clearBtn.disabled = !selectionMode || selectedSearchCardIds.size === 0;
}

function addSelectedOfficial() {
    if (selectedSearchCardIds.size === 0) return;
    selectedSearchCardIds.forEach(id => {
        const card = idToCard.get(id);
        if (card && !pointListCards.has(id)) addCardToPointList(card, 'official');
    });
    clearSelection();
}

function addSelectedCustom() {
    if (selectedSearchCardIds.size === 0) return;
    openPointsModal({
        title: 'Apply Points to Selected',
        cardName: `${selectedSearchCardIds.size} cards`,
        hint: 'This will set the same points for all selected cards.',
        initial: 0,
        onConfirm: (val) => {
            selectedSearchCardIds.forEach(id => {
                const card = idToCard.get(id);
                if (!card) return;
                if (!pointListCards.has(id)) {
                    addCardToPointList(card, val); // explicit numeric
                } else {
                    const entry = pointListCards.get(id);
                    entry.points = val;
                    const span = pointList.querySelector(`[data-card-id="${id}"] .points`);
                    if (span) span.textContent = val;
                    updateSearchCardBadge(id);
                }
            });
            updateTotalPoints();
            clearSelection();
            refreshVisibleSearchBadges();
        }
    });
}

function clearSelection() {
    selectedSearchCardIds.clear();
    document.querySelectorAll('#search-results .card.selected').forEach(el => el.classList.remove('selected'));
    updateSelectionToolbarState();
    refreshSearchResults();
}

// helper to re-run search render when selection changes without losing query
function refreshSearchResults() {
    // create a faux event-like object
    handleSearch({ target: searchBar });
}

// --- Hover Preview ---
let previewVisible = false;
let lastPreviewKey = '';
function showPreview(url, evt, card = null) {
    if (!previewEl) return;
    const key = `${card?.id || ''}|${url}`;
    if (lastPreviewKey !== key) {
        previewEl.innerHTML = buildPreviewContent(url, card);
        lastPreviewKey = key;
    }
    previewEl.style.display = 'block';
    previewVisible = true;
    positionPreview(evt);
}
function positionPreview(evt) {
    if (!previewEl || !previewVisible) return;
    const pad = 16; // gap from cursor and viewport edges
    const imgBox = previewEl.getBoundingClientRect();
    let x = evt.clientX + pad;
    let y = evt.clientY + pad;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (x + imgBox.width > vw - pad) x = evt.clientX - imgBox.width - pad;
    if (y + imgBox.height > vh - pad) y = evt.clientY - imgBox.height - pad;
    // Fallback clamp
    x = Math.max(pad, Math.min(x, vw - imgBox.width - pad));
    y = Math.max(pad, Math.min(y, vh - imgBox.height - pad));
    previewEl.style.left = `${x}px`;
    previewEl.style.top = `${y}px`;
}
function hidePreview() {
    if (!previewEl) return;
    previewEl.style.display = 'none';
    previewVisible = false;
}

function buildPreviewContent(imgUrl, card) {
    const safe = (s) => (s == null ? '' : String(s));
    if (!card) return `<div class="preview-content"><div class="preview-image"><img src="${imgUrl}" alt="Card preview"></div></div>`;
    const name = safe(card.name);
    const frame = (card.frameType || '').toLowerCase();
    const category = detectCardCategory(card);
    const typeLine = buildTypeLine(card, category);
    const statsLine = buildStatsLine(card);
    const desc = safe(card.desc);
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

function buildTypeLine(card, category) {
    // Examples:
    // Monster: "[Dragon/Effect/Pendulum]"
    // Spell:   "[Spell/Quick-Play]"
    // Trap:    "[Trap/Counter]"
    const cat = (category || detectCardCategory(card)).toLowerCase();
    const parts = [];
    if (cat === 'monster'.toLowerCase()) {
        // species (race)
        if (card.race) parts.push(card.race);
        const t = (card.type || '').toLowerCase();
        // card type tags based on normalize and inherent tags
        const norm = normalizeCardType(card, 'Monster');
        if (norm && !['Normal','Effect'].includes(norm)) parts.push(norm);
        // add Effect if not Normal and not already covered by Fusion/Synchro/Xyz/Link/Ritual
        const isExtra = ['Fusion','Synchro','Xyz','Link','Ritual'].some(x => parts.includes(x));
        if (!isExtra) {
            const hasEffectLike = t.includes('effect') || t.includes('spirit') || t.includes('tuner') || t.includes('flip') || t.includes('gemini') || t.includes('union');
            if (hasEffectLike && !parts.includes('Effect')) parts.push('Effect');
        }
        // Pendulum tag
        const isPendulum = (card.scale != null || card.pend_scale != null) || (card.type || '').toLowerCase().includes('pendulum') || (card.frameType || '').toLowerCase().includes('pendulum');
        if (isPendulum) parts.push('Pendulum');
        return `[${parts.join('/')}]`;
    } else if (cat === 'spell') {
        parts.push('Spell');
        if (card.race) parts.push(card.race);
        return `[${parts.join('/')}]`;
    } else if (cat === 'trap') {
        parts.push('Trap');
        if (card.race) parts.push(card.race);
        return `[${parts.join('/')}]`;
    }
    return '';
}

function buildStatsLine(card) {
    // For Monsters: show Level/Rank/Link, Scale if Pendulum, ATK/DEF (or ATK/Link)
    const t = (card.type || '').toLowerCase();
    const parts = [];
    const isLink = t.includes('link');
    const isXyz = t.includes('xyz');
    const isPendulum = (card.scale != null || card.pend_scale != null) || t.includes('pendulum') || (card.frameType || '').toLowerCase().includes('pendulum');
    if (isLink) {
        if (card.linkval != null) parts.push(`LINK-${card.linkval}`);
    } else if (isXyz) {
        if (card.level != null) parts.push(`RANK ${card.level}`);
    } else if (card.level != null) {
        parts.push(`LV ${card.level}`);
    }
    if (isPendulum) {
        const sc = card.scale ?? card.pend_scale;
        if (sc != null) parts.push(`SCALE ${sc}`);
    }
    // ATK/DEF or ATK/— (Link has no DEF)
    const atk = card.atk;
    const def = isLink ? null : card.def;
    const atkStr = (atk != null ? atk : '?');
    const defStr = isLink ? '—' : (def != null ? def : '?');
    if (atk != null || def != null || isLink) parts.push(`ATK ${atkStr} / DEF ${defStr}`);
    return parts.join(' · ');
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// --- Points Modal Controller ---
let pmState = null; // { onConfirm }
function openPointsModal({ title, cardName, hint, initial, onConfirm }) {
    if (!pmBackdrop) return;
    pmState = { onConfirm };
    pmTitle.textContent = title || 'Set Points';
    pmCardname.textContent = cardName || '';
    pmHint.textContent = hint || '';
    pmError.textContent = '';
    pmInput.value = (typeof initial === 'number' ? String(initial) : (initial || ''));
    pmBackdrop.style.display = 'flex';
    // focus input next frame for better UX
    setTimeout(() => { pmInput?.focus(); pmInput?.select(); }, 0);
}
function closePointsModal() {
    if (!pmBackdrop) return;
    pmBackdrop.style.display = 'none';
    pmState = null;
}
function confirmPointsModal() {
    if (!pmState) { closePointsModal(); return; }
    const raw = pmInput.value.trim();
    if (raw === '') { pmError.textContent = 'Please enter a number.'; return; }
    const val = parseInt(raw, 10);
    if (isNaN(val) || val < 0) { pmError.textContent = 'Points must be a non-negative integer.'; return; }
    const cb = pmState.onConfirm;
    closePointsModal();
    try { cb?.(val); } catch {}
}

// Keep search badges in sync
function updateSearchCardBadge(cardId) {
    const badge = searchResults?.querySelector(`[data-card-id="${cardId}"] .genesys-badge`);
    if (!badge) return;
    const card = idToCard.get(cardId);
    if (!card) return;
    const official = card?.misc_info?.[0]?.genesys_points ?? officialGenesysList[card.name] ?? 0;
    const assigned = pointListCards.get(cardId)?.points;
    const display = (assigned != null ? assigned : official);
    badge.textContent = display;
    badge.title = (assigned != null) ? `Assigned Points: ${assigned}` : `Official Genesys Points: ${official}`;
    badge.classList.toggle('assigned', assigned != null);
    badge.classList.toggle('official', assigned == null);
}
function refreshVisibleSearchBadges() {
    if (!searchResults) return;
    searchResults.querySelectorAll('.card').forEach(cardEl => {
        const id = parseInt(cardEl.dataset.cardId, 10);
        if (!isNaN(id)) updateSearchCardBadge(id);
    });
}

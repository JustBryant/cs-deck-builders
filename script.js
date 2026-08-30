let allCards = [];
let filteredCards = [];
// Deck as arrays: ordered list of card IDs (allows duplicates and preserves insertion order)
let deck = { main: [], extra: [], side: [] };
// Banlist mapping: cardId (string) -> allowedCopies (number). If absent, defaultAllowed applies.
let banlist = {};
const DEFAULT_ALLOWED = 3;
function parseLflist(text) {
    const map = {};
    if (!text) return map;
    const lines = String(text).split(/\r?\n/);
    for (let raw of lines) {
        let line = raw.trim();
        if (!line || line.startsWith('#') || line.startsWith('//')) continue;
        // Common patterns: "12345678 1", "12345678=1", "12345678:1"
        let m = line.match(/^(\d+)\s*[=:\s]\s*(\d+)$/);
        if (m) { map[String(m[1])] = Number(m[2]); continue; }
        // Some lflist lines may be like "12345678" meaning forbidden? skip
        m = line.match(/^(\d+)$/);
        if (m) { map[String(m[1])] = 0; continue; }
        // Try to find two numbers in the line
        m = line.match(/(\d+).*?(\d+)/);
        if (m) { map[String(m[1])] = Number(m[2]); continue; }
    }
    return map;
}

function loadBanlistFromText(text, sourceName) {
    banlist = parseLflist(text);
    const status = document.getElementById('banlist-status');
    const count = Object.keys(banlist).length;
    // Intentionally do not update status text (avoid showing "Loaded X entries")
    updateAllBanBadges();
    updateDeckDisplay();
}

function clearBanlist() {
    banlist = {};
    const status = document.getElementById('banlist-status'); // no status text changes
    updateAllBanBadges();
    updateDeckDisplay();
}

function allowedCopiesFor(cardId) {
    if (!cardId) return DEFAULT_ALLOWED;
    const id = String(cardId);
    if (banlist.hasOwnProperty(id)) return Number(banlist[id]);
    return DEFAULT_ALLOWED;
}

// Flash an invalid container. Accepts either a DOM element or a section id string.
function invalidFlash(target) {
    try {
        let el = null;
        if (!target) return;
        if (typeof target === 'string') {
            el = document.getElementById(`${target}-deck`);
        } else if (target instanceof Element) {
            el = target;
        }
        if (!el) return;
        el.classList.add('invalid');
        setTimeout(()=>el.classList.remove('invalid'),700);
    } catch (e) {}
}

// Backwards-compatible alias used elsewhere
function invalidFlashContainer(section) { invalidFlash(section); }

// Deck slot counts
const MAIN_SLOTS = 60;
const EXTRA_SLOTS = 15;
const SIDE_SLOTS = 15;

/**
 * Ensure persistent empty slots exist in each deck grid so slots
 * are always visible even when no cards have been added.
 */
function ensureDeckSlots() {
    const main = document.getElementById('main-deck');
    const extra = document.getElementById('extra-deck');
    const side = document.getElementById('side-deck');
    // If the page already contains visual `.card-slot` elements (designer-controlled),
    // convert them into `.deck-slot` instead of wiping the container so we preserve
    // the visual layout and CSS. This prevents the script from overriding designer
    // slots while still attaching required drag/drop handlers.
    function tryConvertVisualSlots(container, expectedCount, sectionName) {
        if (!container) return false;
        const visual = container.querySelectorAll('.card-slot');
        if (visual && visual.length === expectedCount) {
            // convert each visual slot into a functional deck-slot
            visual.forEach((el, idx) => {
                el.classList.remove('card-slot');
                el.classList.add('deck-slot', 'empty');
                el.dataset.index = idx;
                el.dataset.section = sectionName;
                el.addEventListener('dragover', slotDragOver);
                el.addEventListener('dragenter', slotDragEnter);
                el.addEventListener('dragleave', slotDragLeave);
                el.addEventListener('drop', slotDrop);
            });
            return true;
        }
        return false;
    }

    if (main) {
        if (!tryConvertVisualSlots(main, MAIN_SLOTS, 'main')) {
            if (main.querySelectorAll('.deck-slot').length !== MAIN_SLOTS) {
                main.innerHTML = '';
                for (let i = 0; i < MAIN_SLOTS; i++) {
                    const s = document.createElement('div');
                    s.className = 'deck-slot empty';
                    s.dataset.index = i;
                    s.dataset.section = 'main';
                    // drag handlers
                    s.addEventListener('dragover', slotDragOver);
                    s.addEventListener('dragenter', slotDragEnter);
                    s.addEventListener('dragleave', slotDragLeave);
                    s.addEventListener('drop', slotDrop);
                    main.appendChild(s);
                }
            }
        }
    }

    if (extra) {
        if (!tryConvertVisualSlots(extra, EXTRA_SLOTS, 'extra')) {
            if (extra.querySelectorAll('.deck-slot').length !== EXTRA_SLOTS) {
                extra.innerHTML = '';
                for (let i = 0; i < EXTRA_SLOTS; i++) {
                    const s = document.createElement('div');
                    s.className = 'deck-slot empty';
                    s.dataset.index = i;
                    s.dataset.section = 'extra';
                    s.addEventListener('dragover', slotDragOver);
                    s.addEventListener('dragenter', slotDragEnter);
                    s.addEventListener('dragleave', slotDragLeave);
                    s.addEventListener('drop', slotDrop);
                    extra.appendChild(s);
                }
            }
        }
    }

    if (side) {
        if (!tryConvertVisualSlots(side, SIDE_SLOTS, 'side')) {
            if (side.querySelectorAll('.deck-slot').length !== SIDE_SLOTS) {
                side.innerHTML = '';
                for (let i = 0; i < SIDE_SLOTS; i++) {
                    const s = document.createElement('div');
                    s.className = 'deck-slot empty';
                    s.dataset.index = i;
                    s.dataset.section = 'side';
                    s.addEventListener('dragover', slotDragOver);
                    s.addEventListener('dragenter', slotDragEnter);
                    s.addEventListener('dragleave', slotDragLeave);
                    s.addEventListener('drop', slotDrop);
                    side.appendChild(s);
                }
            }
        }
    }

    // Attach container-level drop handlers so dropping anywhere in the grid works
    if (main) attachContainerDropHandlers(main, 'main');
    if (extra) attachContainerDropHandlers(extra, 'extra');
    if (side) attachContainerDropHandlers(side, 'side');
    }

function attachContainerDropHandlers(container, section) {
    // Avoid adding multiple listeners
    if (container._hasDnD) return;
    container._hasDnD = true;
    container.addEventListener('dragover', function(e) { e.preventDefault(); container.classList.add('drag-over'); });
    container.addEventListener('dragleave', function(e) { container.classList.remove('drag-over'); });
    container.addEventListener('drop', function(e) {
        if (window._kp_drop_handled) return;
        window._kp_drop_handled = true;
        try {
            e.preventDefault(); container.classList.remove('drag-over');
            // if the data is from-deck (moving/removing), try to parse payload
            let raw = e.dataTransfer.getData('application/x-deck');
            if (!raw) {
                // fallback: some browsers only preserve text/plain; we prefix deck drags with 'deck:'
                const plain = e.dataTransfer.getData('text/plain');
                if (plain && plain.startsWith('deck:')) raw = plain.slice(5);
            }
            if (raw) {
                try {
                    const payload = JSON.parse(raw);
                    // dropping from a slot onto a container should be treated as move to that section
                        if (payload && payload.action === 'from-deck') {
                        // validate that target accepts the card before removing from source
                        const card = allCards.find(c => String(c.id) === String(payload.cardId));
                        const type = (card && card.type) ? String(card.type) : '';
                        const isExtraType = /fusion|synchro|xyz|link/i.test(type);
                        const isMonster = /monster/i.test(type);
                        const acceptForTarget = (section === 'extra') ? (isMonster && isExtraType) : (section === 'main' ? !(isMonster && isExtraType) : true);
                        if (!acceptForTarget) {
                            // flash invalid
                            container.classList.add('invalid');
                            setTimeout(()=>container.classList.remove('invalid'),700);
                            return;
                        }
                        // perform move
                        if (payload.section && payload.cardId) {
                            // prefer removing the exact slot if provided
                            removeFromDeck(payload.cardId, payload.section, payload.slotIndex);
                        }
                        tryAddCardToSection(payload.cardId, section);
                        // clear global payload marker so dragend doesn't double-remove
                        try { window._kp_drag_payload = null; } catch (ex) {}
                        return;
                    }
                } catch (e) {}
            }
            const id = e.dataTransfer.getData('text/plain'); if (!id) return; tryAddCardToSection(id, section);
        } finally { setTimeout(()=>{ window._kp_drop_handled = false; }, 0); }
    });
}

function slotDragOver(e) { e.preventDefault(); /* allow drop */ }
function slotDragEnter(e) { e.preventDefault(); this.classList.add('drag-over'); }
function slotDragLeave(e) { this.classList.remove('drag-over'); }
function slotDrop(e) {
    if (window._kp_drop_handled) return;
    window._kp_drop_handled = true;
    try {
        e.preventDefault(); e.stopPropagation(); this.classList.remove('drag-over');
        const section = this.dataset.section || (this.closest('.deck-grid') ? this.closest('.deck-grid').id.replace('-deck','') : null);
        // try to read deck payload (move) first
        let raw = e.dataTransfer.getData('application/x-deck');
        if (!raw) {
            const plain = e.dataTransfer.getData('text/plain');
            if (plain && plain.startsWith('deck:')) raw = plain.slice(5);
        }
        if (raw) {
            try {
                const payload = JSON.parse(raw);
                if (payload && payload.action === 'from-deck') {
                    // perform move to this section
                    if (payload.section && payload.cardId) removeFromDeck(payload.cardId, payload.section, payload.slotIndex);
                    tryAddCardToSection(payload.cardId, section);
                    try { window._kp_drag_payload = null; } catch (ex) {}
                    return;
                }
            } catch (err) {}
        }
        // fallback: plain card id from search
        const id = e.dataTransfer.getData('text/plain'); if (!id) return; tryAddCardToSection(id, section);
    } finally { setTimeout(()=>{ window._kp_drop_handled = false; }, 0); }
}

function slotDragStart(e) {
    // dragging a card out of the deck to remove or move
    const cardId = this.dataset.cardId;
    const section = this.dataset.section || (this.closest('.deck-grid') ? this.closest('.deck-grid').id.replace('-deck','') : null);
    if (!cardId) { e.preventDefault(); return; }
    try {
        const slotIndex = (this.dataset.slotIndex !== undefined) ? Number(this.dataset.slotIndex) : null;
        const payload = JSON.stringify({ action: 'from-deck', cardId: String(cardId), section: String(section), slotIndex: slotIndex });
        e.dataTransfer.setData('application/x-deck', payload);
        // also set plain text for compatibility
        e.dataTransfer.setData('text/plain', String(cardId));
        e.dataTransfer.effectAllowed = 'move';
    } catch (ex) {}
}

function tryAddCardToSection(cardId, section) {
    const card = allCards.find(c => String(c.id) === String(cardId));
    if (!card) return;
    const type = (card.type||'').toLowerCase();
    const isExtraType = /fusion|synchro|xyz|link/i.test(type);
    const isMonster = /monster/i.test(type);
    const target = section;
    const containerEl = document.getElementById(`${target}-deck`);
    const invalidFlash = (el) => { if (!el) return; el.classList.add('invalid'); setTimeout(()=>el.classList.remove('invalid'), 700); };

    if (target === 'extra') {
        if (isMonster && isExtraType) { const ok = addToDeck(cardId, 'extra'); if (!ok) { invalidFlash(containerEl); } updateDeckDisplay(); return; }
        invalidFlash(containerEl);
        return;
    }
    if (target === 'main') {
        if (isMonster && isExtraType) { invalidFlash(containerEl); return; }
        const okMain = addToDeck(cardId, 'main'); if (!okMain) { invalidFlash(containerEl); } updateDeckDisplay(); return;
    }
    if (target === 'side') {
        const okSide = addToDeck(cardId, 'side'); if (!okSide) { invalidFlash(containerEl); } updateDeckDisplay(); return;
    }
}

function invalidFlashContainer(section) {
    const containerEl = document.getElementById(`${section}-deck`);
    if (!containerEl) return;
    containerEl.classList.add('invalid');
    setTimeout(()=>containerEl.classList.remove('invalid'), 700);
}

// Allow dropping a deck card onto the search panel to remove it from its section
const searchPanel = document.querySelector('.search-section');
if (searchPanel) {
    searchPanel.addEventListener('dragover', (e) => { e.preventDefault(); });
    searchPanel.addEventListener('drop', (e) => {
        e.preventDefault();
        // try application/x-deck first, then fallback to text/plain 'deck:' prefix
        let raw = e.dataTransfer.getData('application/x-deck');
        if (!raw) {
            const plain = e.dataTransfer.getData('text/plain');
            if (plain && plain.startsWith('deck:')) raw = plain.slice(5);
        }
        if (!raw) return;
        try {
            const payload = JSON.parse(raw);
            console.log('searchPanel drop payload:', payload);
            if (payload && payload.action === 'from-deck') {
                removeFromDeck(payload.cardId, payload.section, payload.slotIndex);
                try { window._kp_drag_payload = null; } catch (ex) {}
                updateDeckDisplay();
            }
        } catch (err) {}
    });
}

// Pagination state (5 rows x 4 cols => 20 per page)
let currentPage = 1;
const pageSize = 20;

// Replace with your GitHub repo URL for images (use raw.githubusercontent for direct image links)
const imageBaseUrl = 'https://raw.githubusercontent.com/JustBryant/KDR-Revamped-Images/main/full_tcg/';

// Hardcoded end date for Kingdoms Purists format - change this to your cutoff date
const HARDCODED_END_DATE = '2016-07-22';

// Filter option lists
const monsterMainTypes = ['Any','Normal','Effect','Ritual','Fusion','Synchro','Xyz','Link','Pendulum'];
const monsterSubTypes = ['Any','Flip','Gemini','Spirit','Toon','Tuner','Union'];
const races = ['Any','Warrior','Spellcaster','Fairy','Fiend','Zombie','Machine','Aqua','Pyro','Rock','Winged Beast','Plant','Insect','Thunder','Dragon','Beast','Beast-Warrior','Dinosaur','Fish','Sea Serpent','Reptile','Psychic','Divine-Beast','Creator God','Wyrm','Cyberse','Illusion'];
const spellTypes = ['Any','Normal','Continuous','Equip','Quick-Play','Field','Ritual'];
const trapTypes = ['Any','Normal','Continuous','Counter'];
const attributes = ['Any','EARTH','WATER','FIRE','WIND','LIGHT','DARK','DIVINE'];


function populateFilterOptions() {
    // Populate cs-style filter selects
    const attrSel = document.getElementById('f-attribute');
    const raceSel = document.getElementById('f-race');
    const typeSel = document.getElementById('f-type');
    // Clear existing options to avoid duplicates (HTML may include a placeholder option)
    attrSel.innerHTML = '';
    raceSel.innerHTML = '';
    typeSel.innerHTML = '';
    // Attributes
    attributes.forEach(a => { const o = document.createElement('option'); o.value = a === 'Any' ? 'all' : a; o.textContent = a === 'Any' ? 'All' : a; attrSel.appendChild(o); });
    // Races
    races.forEach(r => { const o = document.createElement('option'); o.value = r === 'Any' ? 'all' : r; o.textContent = r === 'Any' ? 'All' : r; raceSel.appendChild(o); });
    // Default type options (all)
    const defaultType = document.createElement('option'); defaultType.value = 'all'; defaultType.textContent = 'All'; typeSel.appendChild(defaultType);
}

function updateFilterVisibility() {
    const catRaw = document.getElementById('f-category').value || 'all';
    const cat = String(catRaw).toLowerCase();
    const typeSel = document.getElementById('f-type');
    const raceSel = document.getElementById('f-race');
    const attrSel = document.getElementById('f-attribute');
    const tags = document.querySelectorAll('.f-monster-tag');
    const levelIn = document.getElementById('f-level');
    const scaleIn = document.getElementById('f-scale');
    const atkIn = document.getElementById('f-atk');
    const defIn = document.getElementById('f-def');

    // Reset type/race lists
    typeSel.innerHTML = '';
    raceSel.innerHTML = '';

    if (cat === 'monster') {
        // Monster: enable all filters
        attrSel.disabled = false;
        typeSel.disabled = false;
        raceSel.disabled = false;
        levelIn.disabled = false;
        scaleIn.disabled = false;
        atkIn.disabled = false;
        defIn.disabled = false;
        tags.forEach(t => t.disabled = false);

        monsterMainTypes.forEach(t => { const o = document.createElement('option'); o.value = t === 'Any' ? 'all' : t; o.textContent = t === 'Any' ? 'All' : t; typeSel.appendChild(o); });
        races.forEach(r => { const o = document.createElement('option'); o.value = r === 'Any' ? 'all' : r; o.textContent = r === 'Any' ? 'All' : r; raceSel.appendChild(o); });
    } else if (cat === 'spell') {
        // Spell: only type dropdown usable (spell subtypes)
        attrSel.disabled = true;
        typeSel.disabled = false;
        raceSel.disabled = true;
        levelIn.disabled = true;
        scaleIn.disabled = true;
        atkIn.disabled = true;
        defIn.disabled = true;
        tags.forEach(t => t.disabled = true);

        spellTypes.forEach(t => { const o = document.createElement('option'); o.value = t === 'Any' ? 'all' : t; o.textContent = t === 'Any' ? 'All' : t; typeSel.appendChild(o); });
    } else if (cat === 'trap') {
        // Trap: only type dropdown usable (trap subtypes)
        attrSel.disabled = true;
        typeSel.disabled = false;
        raceSel.disabled = true;
        levelIn.disabled = true;
        scaleIn.disabled = true;
        atkIn.disabled = true;
        defIn.disabled = true;
        tags.forEach(t => t.disabled = true);

        trapTypes.forEach(t => { const o = document.createElement('option'); o.value = t === 'Any' ? 'all' : t; o.textContent = t === 'Any' ? 'All' : t; typeSel.appendChild(o); });
    } else {
        // All: disable everything except the search bar
        attrSel.disabled = true;
        typeSel.disabled = true;
        raceSel.disabled = true;
        levelIn.disabled = true;
        scaleIn.disabled = true;
        atkIn.disabled = true;
        defIn.disabled = true;
        tags.forEach(t => t.disabled = true);

        // populate selects minimally with 'All'
        const o = document.createElement('option'); o.value = 'all'; o.textContent = 'All'; typeSel.appendChild(o);
        races.forEach(r => { const o2 = document.createElement('option'); o2.value = r === 'Any' ? 'all' : r; o2.textContent = r === 'Any' ? 'All' : r; raceSel.appendChild(o2); });
    }
}

async function loadCards() {
    // Initially empty, user must apply date filter to load cards
    displayCards([]);
}

function displayCards(cardList) {
    const results = document.getElementById('search-results');
    results.innerHTML = '';
    const total = (cardList && cardList.length) ? cardList.length : 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * pageSize;
    const pageCards = (cardList || []).slice(start, start + pageSize);

    // Render exactly pageSize slots (placeholders for empty slots)
    for (let i = 0; i < pageSize; i++) {
        const div = document.createElement('div');
        div.className = 'card';
        if (i < pageCards.length) {
            const card = pageCards[i];
            const imgSrc = `${imageBaseUrl}${card.id}.jpg`;
            div.dataset.cardId = card.id;
            div.draggable = true;
            div.addEventListener('dragstart', (ev) => {
                try { ev.dataTransfer.setData('text/plain', String(card.id)); ev.dataTransfer.effectAllowed = 'copy'; } catch (e) {}
            });
            // Right-click to add to deck (Ctrl+Right -> side)
            div.addEventListener('contextmenu', (ev) => {
                ev.preventDefault();
                ev.stopImmediatePropagation();
                const cardId = card.id;
                const isCtrl = ev.ctrlKey;
                if (isCtrl) {
                    const ok = addToDeck(cardId, 'side'); if (!ok) invalidFlashContainer('side');
                } else {
                    // decide default destination: extra if monster extra-type, otherwise main
                    const type = (card.type||'').toLowerCase();
                    const isExtraType = /fusion|synchro|xyz|link/i.test(type);
                    const target = (isExtraType && /monster/i.test(type)) ? 'extra' : 'main';
                    const ok = addToDeck(cardId, target); if (!ok) invalidFlashContainer(target);
                }
            });
            // hover visual for search results
            div.addEventListener('mouseenter', function() { this.classList.add('hovered'); });
            div.addEventListener('mouseleave', function() { this.classList.remove('hovered'); });
            const allowed = allowedCopiesFor(card.id);
            let badge = '';
            // Do not show an indicator for unlimited cards (3 or more)
            if (allowed === 0) {
                const STOP_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="#b71c1c" stroke-width="2" fill="none"/><line x1="6.5" y1="6.5" x2="17.5" y2="17.5" stroke="#b71c1c" stroke-width="2" stroke-linecap="round"/></svg>';
                badge = `<span class="ban-badge forbidden">${STOP_SVG}</span>`;
            } else if (allowed === 1) badge = '<span class="ban-badge limited">1</span>';
            else if (allowed === 2) badge = '<span class="ban-badge limited">2</span>';
            // else leave badge empty for unlimited
            div.innerHTML = `
                <div class="card-image">${badge}<img src="${imgSrc}" alt="${card.name}" onerror="this.style.display='none'"></div>
                <div class="card-info"><div class="card-name">${card.name}</div><div class="card-type">${card.type || ''} ${card.race ? '- ' + card.race : ''}</div></div>
            `;
            // click to preview
            div.addEventListener('click', () => showCardPreviewById(card.id));
            // Middle-click on search result: add another copy to default section
            div.addEventListener('auxclick', (ev) => {
                if (ev.button === 1) {
                    ev.preventDefault();
                    ev.stopImmediatePropagation();
                    const type = (card.type||'').toLowerCase();
                    const isExtraType = /fusion|synchro|xyz|link/i.test(type);
                    const target = (isExtraType && /monster/i.test(type)) ? 'extra' : 'main';
                    const ok = addToDeck(card.id, target); if (!ok) invalidFlashContainer(target);
                }
            });
        } else {
            // empty placeholder
            div.innerHTML = `
                <div class="card-image empty"></div>
                <div class="card-info"><div class="card-name muted">Empty</div></div>
            `;
            div.classList.add('empty');
        }
        results.appendChild(div);
    }

    updatePaginationControls(total, totalPages);
}

function updateAllBanBadges() {
    // Update badges in search results and visible slots
    const cards = document.querySelectorAll('#search-results .card');
    cards.forEach(div => {
        const id = div.dataset.cardId;
        const imgWrap = div.querySelector('.card-image');
        if (!imgWrap) return;
        const existing = imgWrap.querySelector('.ban-badge');
        if (existing) existing.remove();
        if (!id) return;
        const allowed = allowedCopiesFor(id);
        // Do not show a badge for unlimited cards (3 or more)
        if (allowed === null || allowed === undefined) return;
        if (allowed >= 3) return;
        const badgeEl = document.createElement('span'); badgeEl.className = 'ban-badge';
        if (allowed === 0) {
            badgeEl.classList.add('forbidden');
            const STOP_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="#b71c1c" stroke-width="2" fill="none"/><line x1="6.5" y1="6.5" x2="17.5" y2="17.5" stroke="#b71c1c" stroke-width="2" stroke-linecap="round"/></svg>';
            badgeEl.innerHTML = STOP_SVG;
            badgeEl.setAttribute('aria-label', 'Forbidden');
            badgeEl.title = 'Forbidden';
        } else if (allowed === 1) {
            badgeEl.classList.add('limited'); badgeEl.textContent = '1';
            badgeEl.setAttribute('aria-label', 'Limited (1)');
            badgeEl.title = 'Limited — 1 copy allowed';
        } else if (allowed === 2) {
            badgeEl.classList.add('limited'); badgeEl.textContent = '2';
            badgeEl.setAttribute('aria-label', 'Semi-limited (2)');
            badgeEl.title = 'Semi-limited — 2 copies allowed';
        }
        imgWrap.prepend(badgeEl);
    });

    // Also update badges on deck slots (cards placed in decks)
    const slots = document.querySelectorAll('.deck-grid .deck-slot.has-card');
    slots.forEach(slot => {
        const id = slot.dataset.cardId;
        // Remove any existing badge
        const existing = slot.querySelector('.ban-badge');
        if (existing) existing.remove();
        if (!id) return;
        const allowed = allowedCopiesFor(id);
        if (allowed === null || allowed === undefined) return;
        if (allowed >= 3) return;
        const badgeEl = document.createElement('span'); badgeEl.className = 'ban-badge';
        if (allowed === 0) {
            badgeEl.classList.add('forbidden');
            const STOP_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="#b71c1c" stroke-width="2" fill="none"/><line x1="6.5" y1="6.5" x2="17.5" y2="17.5" stroke="#b71c1c" stroke-width="2" stroke-linecap="round"/></svg>';
            badgeEl.innerHTML = STOP_SVG;
            badgeEl.setAttribute('aria-label', 'Forbidden');
            badgeEl.title = 'Forbidden';
        } else if (allowed === 1) {
            badgeEl.classList.add('limited'); badgeEl.textContent = '1';
            badgeEl.setAttribute('aria-label', 'Limited (1)');
            badgeEl.title = 'Limited — 1 copy allowed';
        } else if (allowed === 2) {
            badgeEl.classList.add('limited'); badgeEl.textContent = '2';
            badgeEl.setAttribute('aria-label', 'Semi-limited (2)');
            badgeEl.title = 'Semi-limited — 2 copies allowed';
        }
        // Prefer putting the badge into the image wrapper so it aligns
        // exactly with the image edges; fallback to the slot container.
        const slotImgWrap = slot.querySelector('.card-image');
        if (slotImgWrap) slotImgWrap.prepend(badgeEl);
        else slot.prepend(badgeEl);
    });
}

function showCardPreviewById(cardId) {
    const card = allCards.find(c => c.id == cardId);
    if (!card) return clearCardPreview();
    const img = document.getElementById('preview-image');
    const wrap = document.getElementById('preview-image-wrap');
    const info = document.getElementById('preview-info');
    const empty = document.getElementById('preview-empty');
    const nameEl = document.getElementById('preview-name');
    const typeEl = document.getElementById('preview-typeline');
    const statsEl = document.getElementById('preview-stats');
    const descEl = document.getElementById('preview-desc');
    img.src = `${imageBaseUrl}${card.id}.jpg`;
    img.alt = card.name;
    img.style.display = '';
    nameEl.textContent = card.name || '';
    typeEl.textContent = `${card.type || ''}${card.race ? ' — ' + card.race : ''}`;
    const parts = [];
    if (card.level) parts.push('Lvl ' + card.level);
    if (card.atk !== null && card.atk !== undefined) parts.push('ATK ' + card.atk);
    if (card.def !== null && card.def !== undefined) parts.push('DEF ' + card.def);
    statsEl.textContent = parts.join(' | ');
    // Render description with Pendulum / Monster effect sections if present
    const raw = card.desc || '';
    // Helper to safely create text nodes with preserved line breaks
    function appendPreText(parent, text) {
        const el = document.createElement('div');
        el.className = 'effect-text';
        el.textContent = text;
        parent.appendChild(el);
    }

    // Normalize bracketed labels like "[ Pendulum Effect ]" or "[ Monster Effect ]"
    const normalized = raw.replace(/\[\s*(Pendulum Effect|Pendulum|Monster Effect|Monster)[^\]]*\]/ig, '$1');
    // Try to extract Pendulum Effect and Monster Effect blocks (case-insensitive)
    const pendulumMatch = normalized.match(/Pendulum Effect\s*[:\-–]?\s*([\s\S]*?)(?=(?:\n?\s*Monster Effect\s*[:\-–]?\s*)|$)/i);
    const monsterMatch = normalized.match(/Monster Effect\s*[:\-–]?\s*([\s\S]*)/i);
    descEl.innerHTML = '';
    function cleanEffectText(s) {
        if (!s) return '';
        // trim and remove any stray bracket characters or leading punctuation
        s = String(s).trim();
        // remove a leading closing bracket that can appear when descriptions use '[ Pendulum Effect ] ...'
        s = s.replace(/^[\]\)\}\:\-\–\s]+/, '');
        // remove any leading opening bracket and optional label remnants
        s = s.replace(/^\[+\s*/, '');
        // remove trailing closing bracket(s)
        s = s.replace(/\s*\]+$/, '');
        return s.trim();
    }

    if (pendulumMatch && pendulumMatch[1] && pendulumMatch[1].trim()) {
        const heading = document.createElement('div');
        heading.className = 'effect-heading';
        const strong = document.createElement('strong'); strong.textContent = 'Pendulum Effect';
        heading.appendChild(strong);
        descEl.appendChild(heading);
        appendPreText(descEl, cleanEffectText(pendulumMatch[1]));
    }
    if (monsterMatch && monsterMatch[1] && monsterMatch[1].trim()) {
        const heading = document.createElement('div');
        heading.className = 'effect-heading';
        const strong = document.createElement('strong'); strong.textContent = 'Monster Effect';
        heading.appendChild(strong);
        descEl.appendChild(heading);
        appendPreText(descEl, cleanEffectText(monsterMatch[1]));
    }
    // Fallback: show entire description if no specific pendulum/monster blocks found
    if (!pendulumMatch && !monsterMatch) {
        // If the raw description starts with a bracketed label like '[ Pendulum Effect ]' or '[ Monster Effect ]',
        // strip that outer label so we don't show the square brackets.
        let fallback = raw;
        fallback = fallback.replace(/^\s*\[[^\]]*(Pendulum|Monster)[^\]]*\]\s*/i, '');
        appendPreText(descEl, fallback);
    }
    info.style.display = '';
    if (empty) empty.style.display = 'none';
}

function clearCardPreview() {
    const img = document.getElementById('preview-image');
    const info = document.getElementById('preview-info');
    const empty = document.getElementById('preview-empty');
    if (img) { img.src = ''; img.style.display = 'none'; }
    if (info) info.style.display = 'none';
    if (empty) empty.style.display = '';
}

function addToDeck(cardId, section) {
    const card = allCards.find(c => String(c.id) === String(cardId));
    if (!card) return false;
    // Enforce section compatibility: Extra deck only accepts extra-type monsters
    try {
        const type = (card.type||'').toLowerCase();
        const isExtraType = /fusion|synchro|xyz|link/i.test(type);
        const isMonster = /monster/i.test(type);
        if (section === 'extra') {
            if (!(isMonster && isExtraType)) return false;
        } else if (section === 'main') {
            if (isMonster && isExtraType) return false;
        }
    } catch (e) {}
    // Prevent accidental duplicate adds from rapid duplicate events (e.g., middle-click firing twice)
    try {
        const now = Date.now();
        const last = window._last_manual_add || null;
        if (last && last.cardId == String(cardId) && last.section == section && (now - last.time) < 250) {
            return false;
        }
        window._last_manual_add = { cardId: String(cardId), section: section, time: now };
        setTimeout(() => { try { window._last_manual_add = null; } catch(e){} }, 300);
    } catch(e) {}
    // enforce copies per card according to banlist across entire deck (main+extra+side)
    const combined = (Array.isArray(deck.main) ? deck.main : Object.entries(deck.main||{}).flatMap(([id,count])=>Array(count).fill(id)))
                   .concat(Array.isArray(deck.extra) ? deck.extra : Object.entries(deck.extra||{}).flatMap(([id,count])=>Array(count).fill(id)))
                   .concat(Array.isArray(deck.side) ? deck.side : Object.entries(deck.side||{}).flatMap(([id,count])=>Array(count).fill(id)));
    const totalCount = combined.filter(id=>String(id)===String(cardId)).length;
    const allowed = allowedCopiesFor(cardId);
    if (totalCount >= allowed) return false;
    deck[section].push(String(cardId));
    console.log('addToDeck:', section, cardId, 'now', deck[section].slice(0,10));
    updateDeckDisplay();
    return true;
}

// Type priority function: lower numbers sort earlier.
function cardTypePriority(type) {
    if (!type) return 99;
    const t = String(type).toLowerCase();
    if (/effect/.test(t)) return 1;
    if (/normal/.test(t) && /monster/.test(t)) return 2;
    if (/fusion/.test(t)) return 3;
    if (/ritual/.test(t)) return 4;
    if (/synchro/.test(t)) return 5;
    if (/xyz/.test(t)) return 6;
    if (/link/.test(t)) return 7;
    if (/pendulum/.test(t)) return 8;
    if (/monster/.test(t)) return 9;
    if (/spell/.test(t)) return 20;
    if (/trap/.test(t)) return 21;
    return 99;
}

// Sort a single deck section in-place: groups by type priority, then alphabetically by name.
function sortDeck(section) {
    if (!Array.isArray(deck[section])) return;
    // Build array of objects {id, name, type}
    const mapped = deck[section].map(id => {
        const card = allCards.find(c => String(c.id) === String(id));
        return { id: String(id), name: card ? (card.name || '') : String(id), type: card ? (card.type || '') : '' };
    });
    mapped.sort((a,b) => {
        const pa = cardTypePriority(a.type);
        const pb = cardTypePriority(b.type);
        if (pa !== pb) return pa - pb;
        // stable secondary sort: card name, case-insensitive
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    // Replace deck section preserving as strings
    deck[section] = mapped.map(x => x.id);
}

function sortAllDecks() {
    sortDeck('main');
    sortDeck('extra');
    sortDeck('side');
    updateDeckDisplay();
}

// Pagination helpers
function updatePaginationControls(totalCount, totalPages) {
    const info = document.getElementById('page-info');
    const prev = document.getElementById('page-prev');
    const next = document.getElementById('page-next');
    if (info) info.textContent = `Page ${currentPage} of ${totalPages} (${totalCount} results)`;
    if (prev) prev.disabled = currentPage <= 1;
    if (next) next.disabled = currentPage >= totalPages;
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        displayCards(filteredCards);
    }
}

function nextPage() {
    const total = (filteredCards && filteredCards.length) ? filteredCards.length : 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage < totalPages) {
        currentPage++;
        displayCards(filteredCards);
    }
}

function removeFromDeck(cardId, section) {
    // Optional third argument `slotIndex` will remove that exact copy at that index.
    const args = Array.from(arguments);
    const slotIndex = (args.length >= 3) ? Number(args[2]) : null;
    if (!deck[section] || deck[section].length === 0) return;
    if (slotIndex !== null && !Number.isNaN(slotIndex) && slotIndex >= 0 && slotIndex < deck[section].length) {
        // only remove if the id at that index matches
        if (String(deck[section][slotIndex]) === String(cardId)) {
            deck[section].splice(slotIndex, 1);
        } else {
            // fallback to removing the first matching copy
            const idx = deck[section].findIndex(id => String(id) === String(cardId));
            if (idx === -1) return;
            deck[section].splice(idx, 1);
        }
    } else {
        const idx = deck[section].findIndex(id => String(id) === String(cardId));
        if (idx === -1) return;
        deck[section].splice(idx, 1);
    }
    console.log('removeFromDeck:', section, cardId, 'now', deck[section].slice(0,10));
    updateDeckDisplay();
}

function updateDeckDisplay() {
    updateSection('main', 'main-deck', 'main-count');
    updateSection('extra', 'extra-deck', 'extra-count');
    updateSection('side', 'side-deck', 'side-count');
    // Update archetype summary after sections are refreshed
    try { updateDeckArchetypes().catch(() => {}); } catch (e) {}
    // Ensure banlist badges are refreshed for both search results and deck slots
    try { updateAllBanBadges(); } catch (e) {}
}

async function updateDeckArchetypes() {
    const el = document.getElementById('deck-archetypes');
    if (!el) return;
    // Ensure authoritative mapping is available; try to fetch it if missing.
    if (!(typeof window !== 'undefined' && window.CARD_ARCHETYPES && Object.keys(window.CARD_ARCHETYPES).length > 0)) {
        try {
            if (location && String(location.protocol).startsWith('http')) {
                const resp = await fetch('card-archetypes-authoritative.json');
                if (resp && resp.ok) {
                    const mapping = await resp.json();
                    if (mapping && typeof mapping === 'object') {
                        window.CARD_ARCHETYPES = mapping;
                        console.log('Loaded CARD_ARCHETYPES from card-archetypes-authoritative.json');
                    }
                }
            }
        } catch (e) {
            console.warn('Could not fetch authoritative archetype mapping:', e);
        }
    }
    // If still missing, warn and clear display (authoritative-only mode)
    if (!(typeof window !== 'undefined' && window.CARD_ARCHETYPES && Object.keys(window.CARD_ARCHETYPES).length > 0)) {
        console.warn('CARD_ARCHETYPES mapping not available — archetype counts disabled (authoritative-only mode)');
        el.textContent = '';
        return;
    }
    // Build combined deck list
    const mainArr = Array.isArray(deck.main) ? deck.main : Object.entries(deck.main||{}).flatMap(([id,count])=>Array(count).fill(id));
    const extraArr = Array.isArray(deck.extra) ? deck.extra : Object.entries(deck.extra||{}).flatMap(([id,count])=>Array(count).fill(id));
    const sideArr = Array.isArray(deck.side) ? deck.side : Object.entries(deck.side||{}).flatMap(([id,count])=>Array(count).fill(id));
    const combined = mainArr.concat(extraArr).concat(sideArr);
    if (!combined || combined.length === 0) { el.textContent = ''; return; }

    const counts = {};
    const archetypes = (typeof window !== 'undefined' && window.CARD_ARCHETYPES) ? window.CARD_ARCHETYPES : {};
    // Ensure we have an explicit whitelist; if missing, try fetching it (strict enforcement)
    let whitelistArr = Array.isArray(window.ARCHETYPE_WHITELIST) ? window.ARCHETYPE_WHITELIST : null;
    if (!Array.isArray(whitelistArr)) {
        try {
            if (location && String(location.protocol).startsWith('http')) {
                const wresp = await fetch('archetype-whitelist.json');
                if (wresp && wresp.ok) {
                    const wjson = await wresp.json();
                    if (Array.isArray(wjson)) {
                        window.ARCHETYPE_WHITELIST = wjson;
                        whitelistArr = wjson;
                        console.log('Loaded ARCHETYPE_WHITELIST from archetype-whitelist.json');
                    }
                }
            }
        } catch (e) {
            console.warn('Could not fetch archetype whitelist:', e);
        }
    }
    // If whitelist still missing, enforce strict policy: do not display archetypes.
    if (!Array.isArray(whitelistArr) || whitelistArr.length === 0) {
        console.warn('Archetype whitelist missing or empty — no archetypes will be displayed (strict whitelist enforcement)');
        el.textContent = '';
        return;
    }
    const allowedNorm = new Set(whitelistArr.map(s => String(s).trim().toLowerCase()));
    const blacklist = (typeof window !== 'undefined' && Array.isArray(window.ARCHETYPE_BLACKLIST))
        ? window.ARCHETYPE_BLACKLIST.map(s => String(s).toLowerCase())
        : [];
    // Normalize function: lower-case and collapse non-alphanumerics to spaces
    const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const blacklistNorm = new Set(blacklist.map(normalize));
    const isBlacklisted = (name) => {
        if (!name) return false;
        const n = normalize(name);
        if (!n) return false;
        for (const b of blacklistNorm) {
            if (!b) continue;
            // Only blacklist when the normalized archetype name contains the blacklist token
            // as a substring — do not blacklist shorter names just because a blacklist entry
            // contains them (e.g., don't let "Magician Girl" blacklist "Magician").
            if (n.indexOf(b) !== -1) return true;
        }
        return false;
    };

    // Use ONLY the authoritative mapping `window.CARD_ARCHETYPES`.
    for (const id of combined) {
        const key = String(id);
        const list = archetypes[key];
        if (!list || !Array.isArray(list)) continue;
        for (const name of list) {
            if (!name) continue;
            const n = String(name).trim();
            if (!n) continue;
            // Only count archetypes that are explicitly on the whitelist (case-insensitive)
            if (!allowedNorm.has(n.toLowerCase())) continue;
            if (isBlacklisted(n)) continue;
            counts[n] = (counts[n] || 0) + 1;
        }
    }
    const entries = Object.entries(counts).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (entries.length === 0) { el.textContent = ''; return; }
    // Limit display to top 12 archetypes to avoid overflowing UI
    const maxShow = 12;
    const parts = entries.slice(0, maxShow).map(([k,v]) => `${k} (${v})`);
    el.textContent = 'Archetypes: ' + parts.join(', ');
}

// Expose for external callers (card-archetypes loader) and initialize once
try { window.updateDeckArchetypes = updateDeckArchetypes; } catch (e) {}

// App scaling: scale the main app to fit smaller windows while preserving layout proportions.
(function(){
    const baseWidth = 1400; // design width to scale from
    const baseHeight = 900; // design height to scale from
    const el = document.getElementById('app-root');
    if (!el) return;
    function setAppScale() {
        try {
            const w = window.innerWidth || document.documentElement.clientWidth;
            const h = window.innerHeight || document.documentElement.clientHeight;
            const scale = Math.min(1, w / baseWidth, h / baseHeight);
            el.style.transformOrigin = 'top center';
            el.style.transform = `scale(${scale})`;
            // when scaled down, allow page scrolling if content requires it
            if (scale < 1) document.body.style.overflow = 'auto';
            else document.body.style.overflow = '';
        } catch (e) { /* noop */ }
    }
    window.addEventListener('resize', setAppScale);
    document.addEventListener('DOMContentLoaded', setAppScale);
    // run once now
    setAppScale();
})();

function updateSection(section, divId, countId) {
    const div = document.getElementById(divId);
    if (!div) return;
    // ensure persistent slots exist
    ensureDeckSlots();
    // collect an ordered array of card ids expanded by count
    let expanded = [];
    if (Array.isArray(deck[section])) {
        expanded = deck[section].slice();
    } else {
        // backward compatibility if deck uses object mapping
        for (const [id, count] of Object.entries(deck[section] || {})) {
            for (let i = 0; i < count; i++) expanded.push(id);
        }
    }

    // get slots for this section
    const slots = Array.from(div.querySelectorAll('.deck-slot'));
    let total = 0;
    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        slot.innerHTML = '';
        slot.classList.remove('has-card');
        slot.classList.remove('empty');
        const cardId = expanded[i];
        if (cardId) {
            const card = allCards.find(c => c.id == cardId);
            if (card) {
                const img = document.createElement('img');
                img.src = `${imageBaseUrl}${card.id}.jpg`;
                img.alt = card.name;
                img.onerror = function() { this.style.display = 'none'; };
                // Wrap image in .card-image so badges can be positioned relative to the image
                const wrap = document.createElement('div');
                wrap.className = 'card-image';
                wrap.appendChild(img);
                slot.appendChild(wrap);
                slot.classList.add('has-card');
                slot.dataset.cardId = card.id;
                // expose slot index so we can remove this exact copy later
                slot.dataset.slotIndex = i;
                // hover visual: indicate which slot is hovered
                slot.addEventListener('mouseenter', function() { this.classList.add('hovered'); });
                slot.addEventListener('mouseleave', function() { this.classList.remove('hovered'); });
                // clicking a slot shows preview
                slot.onclick = () => showCardPreviewById(card.id);
                // Right-click on slot: remove this card from the deck (single copy)
                slot.addEventListener('contextmenu', function(ev) {
                    ev.preventDefault();
                    ev.stopImmediatePropagation();
                    const cid = this.dataset.cardId;
                    const sec = this.dataset.section || section;
                    const idx = Number(this.dataset.slotIndex);
                    if (cid) removeFromDeck(cid, sec, idx);
                });
                // Middle-click on slot: add another copy of this card to same section
                slot.addEventListener('auxclick', function(ev) {
                    if (ev.button === 1) {
                        ev.preventDefault();
                        ev.stopImmediatePropagation();
                        const cid = this.dataset.cardId;
                        const sec = this.dataset.section || section;
                        if (cid) {
                            const ok = addToDeck(cid, sec);
                            if (!ok) invalidFlashContainer(sec);
                        }
                    }
                });
                // make slot draggable so user can drag card out to remove/move
                slot.draggable = true;
                slot.dataset.section = section;
                slot.ondragstart = null; // clear any previous handler
                // inline dragstart handler to avoid potential scope issues
                slot.addEventListener('dragstart', function(e) {
                    const cardId = this.dataset.cardId;
                    const section = this.dataset.section || (this.closest('.deck-grid') ? this.closest('.deck-grid').id.replace('-deck','') : null);
                    if (!cardId) { e.preventDefault(); return; }
                    try {
                        const slotIdx = (this.dataset && this.dataset.slotIndex !== undefined) ? Number(this.dataset.slotIndex) : null;
                        const payloadObj = { action: 'from-deck', cardId: String(cardId), section: String(section), slotIndex: slotIdx };
                        const payload = JSON.stringify(payloadObj);
                        // set both a custom mime and a text/plain fallback that many browsers preserve
                        e.dataTransfer.setData('application/x-deck', payload);
                        e.dataTransfer.setData('text/plain', 'deck:' + payload);
                        e.dataTransfer.effectAllowed = 'move';
                        // mark global dragging payload so dragend can detect drops outside handlers
                        try { window._kp_drag_payload = payloadObj; } catch (ex) {}
                    } catch (ex) {}
                });
                // when drag ends, if no drop handler cleared the payload, treat as discard (remove single copy)
                slot.addEventListener('dragend', function(e) {
                    try {
                        const p = window._kp_drag_payload;
                        if (p && p.action === 'from-deck') {
                            // no handler cleared the payload => user dropped outside valid targets
                            removeFromDeck(p.cardId, p.section);
                            updateDeckDisplay();
                        }
                    } catch (err) {}
                    try { window._kp_drag_payload = null; } catch (ex) {}
                });
                total += 1;
            } else {
                // unknown card id - leave as empty placeholder
                slot.classList.add('empty');
            }
        } else {
            // empty slot
            slot.classList.add('empty');
            slot.removeAttribute('data-card-id');
            slot.onclick = () => clearCardPreview();
            slot.draggable = false;
            slot.ondragstart = null;
        }
    }

    // update textual count
    const el = document.getElementById(countId);
    if (el) el.textContent = `(${total}/${section==='main'?MAIN_SLOTS:(section==='extra'?EXTRA_SLOTS:SIDE_SLOTS)})`;
}

function checkLegality() {
    const mainCount = Array.isArray(deck.main) ? deck.main.length : Object.values(deck.main || {}).reduce((a,b)=>a+b,0);
    const extraCount = Array.isArray(deck.extra) ? deck.extra.length : Object.values(deck.extra || {}).reduce((a,b)=>a+b,0);
    const sideCount = Array.isArray(deck.side) ? deck.side.length : Object.values(deck.side || {}).reduce((a,b)=>a+b,0);
    let message = '';
    if (mainCount < 40 || mainCount > 60) message += 'Main deck must be 40-60 cards. ';
    if (extraCount > 15) message += 'Extra deck max 15 cards. ';
    if (sideCount > 15) message += 'Side deck max 15 cards. ';
    // Check banlist limits
    const combined = (Array.isArray(deck.main) ? deck.main : Object.entries(deck.main||{}).flatMap(([id,count])=>Array(count).fill(id)))
                   .concat(Array.isArray(deck.extra) ? deck.extra : Object.entries(deck.extra||{}).flatMap(([id,count])=>Array(count).fill(id)))
                   .concat(Array.isArray(deck.side) ? deck.side : Object.entries(deck.side||{}).flatMap(([id,count])=>Array(count).fill(id)));
    const freq = {};
    for (const id of combined) freq[id] = (freq[id]||0)+1;
    for (const id in freq) {
        const allowed = allowedCopiesFor(id);
        if (freq[id] > allowed) message += `Card ${id} exceeds allowed ${allowed}. `;
    }
    if (!message) message = 'Deck is legal!';
    const lm = document.getElementById('legalityMessage'); if (lm) lm.textContent = message;
}

function exportYDKE() {
    const main = Array.isArray(deck.main) ? deck.main.map(Number) : Object.entries(deck.main||{}).flatMap(([id,count])=>Array(count).fill(Number(id)));
    const extra = Array.isArray(deck.extra) ? deck.extra.map(Number) : Object.entries(deck.extra||{}).flatMap(([id,count])=>Array(count).fill(Number(id)));
    const side = Array.isArray(deck.side) ? deck.side.map(Number) : Object.entries(deck.side||{}).flatMap(([id,count])=>Array(count).fill(Number(id)));
    const ydke = createYDKE(main, extra, side);
    // Copy to clipboard or display
    navigator.clipboard.writeText(ydke).then(() => {
        alert('YDKE code copied to clipboard: ' + ydke);
    });
}

function createYDKE(main, extra, side) {
    // We'll construct each section buffer separately below
    // Convert bytes to base64 safely in chunks
    function bytesToBase64(u8) {
        const CHUNK = 0x8000; // 32KB
        let s = '';
        for (let i = 0; i < u8.length; i += CHUNK) {
            s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + CHUNK)));
        }
        return btoa(s);
    }

    // Build separate section buffers: each section encoded as [count:uint32LE][id:uint32LE...]
    function sectionBase64(arr) {
        const buf = new ArrayBuffer(4 + arr.length * 4);
        const dv = new DataView(buf);
        let off = 0;
        dv.setUint32(off, arr.length, true); off += 4;
        for (const id of arr) { dv.setUint32(off, Number(id), true); off += 4; }
        return bytesToBase64(new Uint8Array(buf));
    }

    const main64 = sectionBase64(main);
    const extra64 = sectionBase64(extra);
    const side64 = sectionBase64(side);
    // Return three blocks separated by '!' and trailing '!'
    return 'ydke://' + main64 + '!' + extra64 + '!' + side64 + '!';
}

async function applyDateFilter() {
    const endDateInput = HARDCODED_END_DATE;
    const results = document.getElementById('search-results');
    results.innerHTML = '<p>Loading cards...</p>';
    try {
        const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?dateregion=tcg&enddate=${endDateInput}`;
        const response = await fetch(url);
        const data = await response.json();
        allCards = data.data.map(card => ({
            id: card.id,
            name: card.name,
            type: card.type,
            race: card.race || card.type, // race field
            attribute: card.attribute || null,
            desc: card.desc || card.desc || '',
            atk: typeof card.atk === 'number' ? card.atk : (card.atk === undefined ? null : Number(card.atk)),
            def: typeof card.def === 'number' ? card.def : (card.def === undefined ? null : Number(card.def)),
            level: card.level || null,
            releaseDate: card.card_sets ? new Date(card.card_sets[0].tcg_date) : null
        }));
        filteredCards = allCards;
        displayCards(filteredCards);
    } catch (error) {
        console.error('Error loading cards:', error);
        results.innerHTML = '<p>Error loading cards. Please check your internet connection.</p>';
    }
}

// Search button & bar
document.getElementById('search-button').addEventListener('click', () => filterCards());
document.getElementById('search-bar').addEventListener('input', () => filterCards());

// Deck controls mapping
document.getElementById('clear-deck').addEventListener('click', clearDeck);
const sortBtn = document.getElementById('sort-deck');
if (sortBtn) sortBtn.addEventListener('click', () => { sortAllDecks(); });
document.getElementById('copy-ydke').addEventListener('click', exportYDKE);
const applyBtn = document.getElementById('applyFilter');
if (applyBtn) applyBtn.addEventListener('click', applyDateFilter);
document.getElementById('export-ydk').addEventListener('click', () => downloadYDK());
// Pagination event wiring
const _pagePrev = document.getElementById('page-prev');
const _pageNext = document.getElementById('page-next');
if (_pagePrev) _pagePrev.addEventListener('click', prevPage);
if (_pageNext) _pageNext.addEventListener('click', nextPage);

// Wire up cs-style filter UI
document.getElementById('f-category').addEventListener('change', updateFilterVisibility);
const clearFiltersBtn = document.getElementById('f-clear');
if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => { populateFilterOptions(); updateFilterVisibility(); const sb = document.getElementById('search-bar'); if (sb) sb.value=''; displayCards([]); });
}

// Attempt to load banlist from a workspace-provided JS file first (defines
// `window.WORKSPACE_BANLIST_TEXT`), then fall back to fetching the raw
// `Purist.lflist.conf` over HTTP. If neither is available the UI will show
// a helpful message instructing the user to either serve the folder or
// include `purist-banlist.js` in the project.
function autoLoadWorkspaceBanlist() {
    // Preferred: `purist-banlist.js` included in the page that defines
    // `window.WORKSPACE_BANLIST_TEXT`.
    try {
        if (window && window.WORKSPACE_BANLIST_TEXT) {
            loadBanlistFromText(window.WORKSPACE_BANLIST_TEXT, 'Purist.lflist.conf (in-page)');
            return;
        }
    } catch (e) {}

    // Fallback: try to fetch the raw file via HTTP from the workspace root.
    fetch('./Purist.lflist.conf').then(r => {
        if (!r.ok) throw new Error('no-banlist');
        return r.text();
    }).then(txt => {
        loadBanlistFromText(txt, 'Purist.lflist.conf');
    }).catch(() => {
        const status = document.getElementById('banlist-status');
        if (status) status.textContent = 'No workspace Purist.lflist.conf found — include purist-banlist.js or serve folder via HTTP';
    });
}

// Populate filters on load
populateFilterOptions();
updateFilterVisibility();
// Ensure deck slot placeholders are present on initial load
ensureDeckSlots();
// Automatically load the cardpool on open
applyDateFilter();
// Try to load banlist from workspace (in-page wrapper or raw file)
autoLoadWorkspaceBanlist();

// Global drop handler: if user drops a deck card outside of deck containers or search panel,
// treat it as removing that single copy (discard). Avoid acting when drop was on a deck-grid (those handlers handle moves).
document.addEventListener('drop', function(e) {
    if (window._kp_drop_handled) return;
    window._kp_drop_handled = true;
    try {
        // If dropped inside a deck-grid or the search section, don't handle here
        if (e.target && (e.target.closest && (e.target.closest('.deck-grid') || e.target.closest('.search-section') || e.target.closest('#search-results')))) return;
        let raw = e.dataTransfer.getData('application/x-deck');
        if (!raw) {
            const plain = e.dataTransfer.getData('text/plain');
            if (plain && plain.startsWith('deck:')) raw = plain.slice(5);
        }
        if (!raw) return;
        const payload = JSON.parse(raw);
        if (payload && payload.action === 'from-deck') {
            removeFromDeck(payload.cardId, payload.section, payload.slotIndex);
            try { window._kp_drag_payload = null; } catch (ex) {}
            updateDeckDisplay();
        }
    } catch (err) { }
    finally { setTimeout(()=>{ window._kp_drop_handled = false; }, 0); }
});

// Theme (dark mode) helpers
function setTheme(dark) {
    const body = document.body;
    const btn = document.getElementById('theme-toggle');
    if (dark) {
        body.setAttribute('data-theme', 'dark');
        if (btn) btn.textContent = 'Light Mode';
        localStorage.setItem('kp_theme', 'dark');
    } else {
        body.removeAttribute('data-theme');
        if (btn) btn.textContent = 'Dark Mode';
        localStorage.setItem('kp_theme', 'light');
    }
}

function initTheme() {
    const saved = localStorage.getItem('kp_theme');
    let dark = false;
    if (saved === 'dark') dark = true;
    else if (saved === 'light') dark = false;
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) dark = true;
    setTheme(dark);
}

// Wire theme toggle button
const themeBtn = document.getElementById('theme-toggle');
if (themeBtn) {
    themeBtn.addEventListener('click', () => {
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        setTheme(!isDark);
    });
}
// initialize on load
initTheme();

// Combined filter implementation
function parseComparatorExpression(expr) {
    if (!expr) return null;
    expr = expr.trim();
    if (expr === '?') return (v) => v === null || v === undefined;
    const tokens = expr.split(',').map(s => s.trim()).filter(Boolean);
    const checks = tokens.map(tok => {
        if (/^>=\s*\d+$/.test(tok)) { const n = Number(tok.replace(/[^0-9]/g, '')); return v => v !== null && v >= n; }
        if (/^<=\s*\d+$/.test(tok)) { const n = Number(tok.replace(/[^0-9]/g, '')); return v => v !== null && v <= n; }
        if (/^>\s*\d+$/.test(tok)) { const n = Number(tok.replace(/[^0-9]/g, '')); return v => v !== null && v > n; }
        if (/^<\s*\d+$/.test(tok)) { const n = Number(tok.replace(/[^0-9]/g, '')); return v => v !== null && v < n; }
        if (/^\d+-\d+$/.test(tok)) { const [a,b]=tok.split('-').map(Number); return v => v!==null && v>=a && v<=b; }
        if (/^\d+$/.test(tok)) { const n=Number(tok); return v => v!==null && v===n; }
        return null;
    }).filter(Boolean);
    if (checks.length===0) return null;
    return (val) => checks.some(fn => fn(val));
}

function filterCards() {
    // reset to first page when applying filters
    currentPage = 1;
    const qRaw = (document.getElementById('search-bar').value||'');
    const q = String(qRaw).toLowerCase();
    const normalize = (s) => String(s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
    const qNorm = normalize(qRaw);
    const cat = document.getElementById('f-category').value;
    const attr = document.getElementById('f-attribute').value;
    const type = document.getElementById('f-type').value;
    const race = document.getElementById('f-race').value;
    const levelExpr = document.getElementById('f-level').value;
    const atkExpr = document.getElementById('f-atk').value;
    const defExpr = document.getElementById('f-def').value;
    const levelMatcher = parseComparatorExpression(levelExpr);
    const atkMatcher = parseComparatorExpression(atkExpr);
    const defMatcher = parseComparatorExpression(defExpr);
    const tagEls = document.querySelectorAll('.f-monster-tag:checked');
    const tags = Array.from(tagEls).map(e=>e.value.toLowerCase());

    // Helper: parse the API `card.type` into category and subtype for reliable matching
    const parseCardType = (t) => {
        if (!t) return { category: null, subtype: null };
        const s = String(t);
        const sLow = s.toLowerCase();
        // canonicalize raw type into tokens (split on non-alphanumerics)
        const rawNorm = sLow.replace(/[^a-z0-9]+/g, ' ').trim();
        const tokens = rawNorm ? rawNorm.split(/\s+/) : [];

        const has = (tok) => tokens.indexOf(tok) !== -1;

        // Monster
        if (sLow.indexOf('monster') !== -1) {
            // common monster subtypes
            if (has('pendulum')) return { category: 'monster', subtype: 'Pendulum' };
            if (has('fusion')) return { category: 'monster', subtype: 'Fusion' };
            if (has('synchro')) return { category: 'monster', subtype: 'Synchro' };
            if (has('xyz')) return { category: 'monster', subtype: 'Xyz' };
            if (has('link')) return { category: 'monster', subtype: 'Link' };
            if (has('ritual')) return { category: 'monster', subtype: 'Ritual' };
            if (has('flip')) return { category: 'monster', subtype: 'Flip' };
            if (has('gemini')) return { category: 'monster', subtype: 'Gemini' };
            if (has('spirit')) return { category: 'monster', subtype: 'Spirit' };
            if (has('tuner')) return { category: 'monster', subtype: 'Tuner' };
            if (has('union')) return { category: 'monster', subtype: 'Union' };
            if (has('normal')) return { category: 'monster', subtype: 'Normal' };
            return { category: 'monster', subtype: 'Effect' };
        }

        // Spell
        if (sLow.indexOf('spell') !== -1) {
            if (has('continuous')) return { category: 'spell', subtype: 'Continuous' };
            if (has('equip')) return { category: 'spell', subtype: 'Equip' };
            // quick-play may appear as 'quick-play' or 'quick play' -> token 'quick' covers it
            if (has('quick')) return { category: 'spell', subtype: 'Quick-Play' };
            if (has('field')) return { category: 'spell', subtype: 'Field' };
            if (has('ritual')) return { category: 'spell', subtype: 'Ritual' };
            if (has('normal')) return { category: 'spell', subtype: 'Normal' };
            return { category: 'spell', subtype: null };
        }

        // Trap
        if (sLow.indexOf('trap') !== -1) {
            if (has('continuous')) return { category: 'trap', subtype: 'Continuous' };
            if (has('counter')) return { category: 'trap', subtype: 'Counter' };
            if (has('normal')) return { category: 'trap', subtype: 'Normal' };
            return { category: 'trap', subtype: null };
        }

        return { category: null, subtype: null };
    };

    // Debug: when filtering Spells/Traps, show counts by parsed subtype to help diagnose
    try {
        const sampleCats = allCards.reduce((acc, c) => {
            const p = parseCardType(c.type);
            if (!p || !p.category) return acc;
            acc[p.category] = acc[p.category] || {};
            const sub = p.subtype || 'NONE';
            acc[p.category][sub] = (acc[p.category][sub] || 0) + 1;
            return acc;
        }, {});
        console.debug('card type distribution (sample):', sampleCats);
        // Debug: list some raw `card.type` values for spells/traps that produced NONE subtype
        try {
            const spellNone = [];
            const trapNone = [];
            for (const c of allCards) {
                const p = parseCardType(c.type);
                if (!p || !p.category) continue;
                if (p.category === 'spell' && !p.subtype && spellNone.length < 20) {
                    if (!spellNone.includes(String(c.type))) spellNone.push(String(c.type));
                }
                if (p.category === 'trap' && !p.subtype && trapNone.length < 20) {
                    if (!trapNone.includes(String(c.type))) trapNone.push(String(c.type));
                }
                if (spellNone.length >= 20 && trapNone.length >= 20) break;
            }
            if (spellNone.length) console.debug('sample raw spell.type values with NONE subtype:', spellNone);
            if (trapNone.length) console.debug('sample raw trap.type values with NONE subtype:', trapNone);
        } catch (e) {}
    } catch (e) {}

    // Debugging aid: if user searches a specific name, log where matching cards are filtered out
    if (q && q.length > 2) {
        try {
            const nameMatches = allCards.filter(c => c.name && String(c.name).toLowerCase().includes(q));
            if (nameMatches.length === 0) {
                console.debug('Search debug - no direct name matches for', q);
            } else {
                // For each matching card, explain which filters (if any) would exclude it
                const explain = (c) => {
                    const reasons = [];
                    const parsed = parseCardType(c.type || '');
                    // category
                    if (cat && cat !== 'all' && cat !== 'All') {
                        if (!parsed.category || parsed.category.toLowerCase() !== String(cat).toLowerCase()) reasons.push('category mismatch (' + (parsed.category||'none') + ' != ' + String(cat) + ')');
                    }
                    // attribute
                    if (attr && attr !== 'all') {
                        if (!c.attribute || c.attribute.toLowerCase() !== attr.toLowerCase()) reasons.push('attribute mismatch (' + (c.attribute||'none') + ' != ' + attr + ')');
                    }
                    // type/subtype
                    if (type && type !== 'all') {
                        if (parsed.category === 'spell' || parsed.category === 'trap') {
                            const want = String(type).toLowerCase();
                            const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
                            const wantNorm = norm(want);
                            const gotNorm = norm(parsed.subtype || '');
                            const rawTypeNorm = norm(String(c.type || ''));
                            const rawRaceNorm = norm(String(c.race || ''));
                            if (!(gotNorm === wantNorm || rawTypeNorm.indexOf(wantNorm) !== -1 || rawRaceNorm.indexOf(wantNorm) !== -1)) {
                                reasons.push('subtype mismatch (want=' + type + ', parsed=' + (parsed.subtype||'none') + ', rawType=' + (c.type||'') + ', race=' + (c.race||'') + ')');
                            }
                        } else {
                            if (!c.type || c.type.toLowerCase().indexOf(type.toLowerCase())===-1) reasons.push('type contains-mismatch (' + (c.type||'') + ' !includes ' + type + ')');
                        }
                    }
                    // race
                    if (race && race !== 'all') {
                        if (!c.race || c.race.toLowerCase() !== race.toLowerCase()) reasons.push('race mismatch (' + (c.race||'') + ' != ' + race + ')');
                    }
                    // tags
                    const tagEls = document.querySelectorAll('.f-monster-tag:checked');
                    const tagsChecked = Array.from(tagEls).map(e=>e.value.toLowerCase());
                    for (const t of tagsChecked) {
                        if (!c.type || c.type.toLowerCase().indexOf(t)===-1) reasons.push('tag mismatch ('+t+')');
                    }
                    // atk/def
                    if (atkMatcher && !atkMatcher(c.atk)) reasons.push('atk mismatch');
                    if (defMatcher && !defMatcher(c.def)) reasons.push('def mismatch');
                    return reasons;
                };
                for (const c of nameMatches) {
                    console.debug('Search debug - match', c.id, c.name, 'type="' + c.type + '" race="' + c.race + '" =>', explain(c).length ? explain(c) : ['passes filters']);
                }
            }
        } catch (e) { console.warn('Search debug error', e); }
    }

    const out = allCards.filter(card => {
        if (q) {
            const nameLow = card.name ? String(card.name).toLowerCase() : '';
            const descLow = card.desc ? String(card.desc).toLowerCase() : '';
            const nameNorm = normalize(card.name);
            const descNorm = normalize(card.desc);
            const inName = (nameLow && nameLow.includes(q)) || (qNorm && nameNorm && nameNorm.includes(qNorm));
            const inDesc = (descLow && descLow.includes(q)) || (qNorm && descNorm && descNorm.includes(qNorm));
            // token match: ensure all query tokens appear somewhere in the combined normalized text
            const combinedNorm = normalize((card.name||'') + ' ' + (card.desc||'') + ' ' + (Array.isArray(card.archetypes)?card.archetypes.join(' '):''));
            const tokens = qNorm.split(' ').filter(Boolean);
            const tokensMatch = tokens.length > 0 ? tokens.every(t => combinedNorm.indexOf(t) !== -1) : false;
            if (!inName && !inDesc && !tokensMatch) return false;
        }
        const parsed = parseCardType(card.type);
        if (cat && cat !== 'all' && cat !== 'All') {
            // Match category (monster/spell/trap) case-insensitively
            if (!parsed.category || parsed.category.toLowerCase() !== String(cat).toLowerCase()) return false;
        }
        if (attr && attr !== 'all') {
            if (!card.attribute || card.attribute.toLowerCase() !== attr.toLowerCase()) return false;
        }
        if (type && type !== 'all') {
            // For Spell/Trap subtypes, use parsed.subtype for exact matches
            if (parsed.category === 'spell' || parsed.category === 'trap') {
                const want = String(type).toLowerCase();
                const gotSubtype = parsed.subtype ? String(parsed.subtype).toLowerCase() : '';
                const rawType = card.type ? String(card.type).toLowerCase() : '';
                const rawRace = card.race ? String(card.race).toLowerCase() : '';
                // Normalize tokens for loose matching (handles 'Quick-Play' vs 'Quick Play')
                const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
                const wantNorm = norm(want);
                const gotNorm = norm(gotSubtype);
                const rawTypeNorm = norm(rawType);
                const rawRaceNorm = norm(rawRace);
                // Match if parsed subtype equals requested OR raw card.type or card.race contains the requested token
                if (gotNorm === wantNorm) {
                    // ok
                } else if (rawTypeNorm.indexOf(wantNorm) !== -1) {
                    // ok
                } else if (rawRaceNorm.indexOf(wantNorm) !== -1) {
                    // ok
                } else {
                    return false;
                }
            } else {
                // For monsters/types fall back to previous contains-match behavior
                if (!card.type || card.type.toLowerCase().indexOf(type.toLowerCase())===-1) return false;
            }
        }
        if (race && race !== 'all') {
            if (!card.race || card.race.toLowerCase() !== race.toLowerCase()) return false;
        }
        // tags (e.g., tuner, pendulum)
        for (const t of tags) {
            if (!card.type || card.type.toLowerCase().indexOf(t)===-1) return false;
        }
        if (atkMatcher) {
            if (!atkMatcher(card.atk)) return false;
        }
        if (defMatcher) {
            if (!defMatcher(card.def)) return false;
        }
        return true;
    });
    filteredCards = out;
    displayCards(filteredCards);
}

// Clear deck contents
function clearDeck() {
    deck = { main: [], extra: [], side: [] };
    updateDeckDisplay();
    const status = document.getElementById('import-status'); if (status) status.textContent = '';
    const lm = document.getElementById('legalityMessage'); if (lm) lm.textContent = '';
}

// Create plain .ydk text and trigger download
function createYDKText(mainArr, extraArr, sideArr) {
    let lines = [];
    lines.push('#created by Kingdoms Purists Builder');
    lines.push('#main');
    mainArr.forEach(id => lines.push(String(id)));
    lines.push('#extra');
    extraArr.forEach(id => lines.push(String(id)));
    lines.push('!side');
    sideArr.forEach(id => lines.push(String(id)));
    return lines.join('\n');
}

function downloadYDK() {
    const main = Array.isArray(deck.main) ? deck.main.map(Number) : Object.entries(deck.main||{}).flatMap(([id,count])=>Array(count).fill(Number(id)));
    const extra = Array.isArray(deck.extra) ? deck.extra.map(Number) : Object.entries(deck.extra||{}).flatMap(([id,count])=>Array(count).fill(Number(id)));
    const side = Array.isArray(deck.side) ? deck.side.map(Number) : Object.entries(deck.side||{}).flatMap(([id,count])=>Array(count).fill(Number(id)));
    const content = createYDKText(main, extra, side);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'deck.ydk';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
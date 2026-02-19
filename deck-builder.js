// Minimal, robust deck-builder logic tailored for deck_builder_custom.html
// Keeps designer DOM (card-slot / card-tile) intact and wires interactions
(function(){
  const DEFAULT_ALLOWED = 3;
  let allCards = [];
  let filteredCards = [];
  const pageSize = 20;
  let currentPage = 1;
  // guard to prevent duplicate adds from multiple drop events in quick succession
  let _kp_last_drop_key = null;
  let _kp_last_drop_time = 0;
  // pageSize already defined above

  // Deck model
  const deck = { main: [], extra: [], side: [] };
  let banlist = {};

  function allowedCopiesFor(cardId){
    if (!cardId) return DEFAULT_ALLOWED;
    const id = String(cardId);
    if (banlist.hasOwnProperty(id)) return Number(banlist[id]);
    return DEFAULT_ALLOWED;
  }

  // Preserve visual slots if designer provided them: convert .card-slot -> .deck-slot
  function ensureDeckSlots() {
    const mapping = [ ['main-deck', 60, 'main'], ['extra-deck', 15, 'extra'], ['side-deck', 15, 'side'] ];
    mapping.forEach(([id, count, section]) => {
      const container = document.getElementById(id);
      if (!container) return;
      // prefer designer-provided .card-slot elements; convert them in-place
      const visualCardSlots = Array.from(container.querySelectorAll('.card-slot'));
      if (visualCardSlots.length > 0) {
        // Preserve designer-provided `.card-slot` elements exactly; attach handlers and dataset only.
        visualCardSlots.forEach((el, idx) => {
          el.dataset.index = idx;
          el.dataset.section = section;
          attachSlotHandlers(el);
        });
      }
      // ensure we have at least `count` slots (preserve any existing DOM). Append missing slots rather than wiping.
      const existing = Array.from(container.querySelectorAll('.deck-slot, .card-slot'));
      if (existing.length < count) {
        for (let i = existing.length; i < count; i++) {
          const s = document.createElement('div');
          // create missing slots using the original `card-slot` class so designer markup is consistent
          s.className = 'card-slot empty';
          s.dataset.index = i;
          s.dataset.section = section;
          attachSlotHandlers(s);
          container.appendChild(s);
        }
      } else if (existing.length > count) {
        // if there are more slots than expected, leave them alone to avoid destroying designer DOM
      }
      attachContainerHandlers(container, section);
    });
  }

  function attachContainerHandlers(container, section){
    if (container._kp_attached) return; container._kp_attached = true;
    container.addEventListener('dragover', e=>{ e.preventDefault(); container.classList.add('drag-over'); });
    container.addEventListener('dragleave', e=>{ container.classList.remove('drag-over'); });
    container.addEventListener('drop', e=>{ e.preventDefault(); container.classList.remove('drag-over');
      // Read payload (application/x-deck) or text/plain 'deck:' fallback
      let raw = e.dataTransfer.getData('application/x-deck');
      if (!raw){ const p = e.dataTransfer.getData('text/plain'); if (p && p.startsWith('deck:')) raw = p.slice(5); }
      if (raw){ try { const payload = JSON.parse(raw); if (payload && payload.action==='from-deck'){ if (payload.section && payload.cardId) removeFromDeck(payload.cardId, payload.section); tryAddCardToSection(payload.cardId, section); try{ window._kp_drag_payload = null }catch(ex){} return; } } catch(err){} }
      const id = e.dataTransfer.getData('text/plain'); if (!id) return; tryAddCardToSection(id, section);
    });
  }

  function attachSlotHandlers(slot){
    slot.addEventListener('dragover', e=>{ e.preventDefault(); });
    slot.addEventListener('dragenter', e=>{ e.preventDefault(); slot.classList.add('drag-over'); });
    slot.addEventListener('dragleave', e=>{ slot.classList.remove('drag-over'); });
    slot.addEventListener('drop', e=>{
      // Prevent the container-level drop handler from also running for the same event.
      e.stopPropagation();
      e.preventDefault();
      slot.classList.remove('drag-over');
      const section = slot.dataset.section || null;
      let raw = e.dataTransfer.getData('application/x-deck');
      if (!raw){ const p = e.dataTransfer.getData('text/plain'); if (p && p.startsWith('deck:')) raw = p.slice(5); }
      if (raw){ try{ const payload = JSON.parse(raw); if (payload && payload.action==='from-deck'){ if (payload.section && payload.cardId) removeFromDeck(payload.cardId, payload.section); tryAddCardToSection(payload.cardId, section); try{ window._kp_drag_payload = null }catch(ex){} return; } } catch(err){} }
      const id = e.dataTransfer.getData('text/plain'); if(!id) return; tryAddCardToSection(id, section);
    });
    // make slot a drop target; dragstart for filled slots will be attached when they hold a card
  }

  function tryAddCardToSection(cardId, section, bypassDedupe=false){
    // Prevent accidental duplicate adds from multiple drop events or handlers firing.
    try{
      if (!bypassDedupe){
        const key = String(cardId) + '|' + String(section);
        const now = Date.now();
        if (_kp_last_drop_key === key && (now - _kp_last_drop_time) < 800){
          // ignore duplicate add within short window
          return false;
        }
        _kp_last_drop_key = key; _kp_last_drop_time = now;
      }
    }catch(e){}
    const card = allCards.find(c=>String(c.id)===String(cardId));
    // allow if unknown card (image-based) but still add
    if (!card) {
      // still permit up to allowed copies by id
    }
    // enforce banlist across whole deck
    const combined = deck.main.concat(deck.extra).concat(deck.side);
    const count = combined.filter(id=>String(id)===String(cardId)).length;
    const allowed = allowedCopiesFor(cardId);
    if (count >= allowed) { flashInvalid(section); return false; }
    if (!['main','extra','side'].includes(section)) section = 'main';
    deck[section].push(String(cardId));
    updateDeckDisplay();
    return true;
  }

  function flashInvalid(section){ const el = document.getElementById(section+'-deck'); if (!el) return; el.classList.add('invalid'); setTimeout(()=>el.classList.remove('invalid'),700); }

  function removeFromDeck(cardId, section, slotIndex){
    if (!deck[section] || deck[section].length===0) return;
    if (slotIndex !== undefined && slotIndex !== null && !Number.isNaN(Number(slotIndex))){
      if (String(deck[section][slotIndex]) === String(cardId)) deck[section].splice(slotIndex,1);
      else { const idx = deck[section].findIndex(id=>String(id)===String(cardId)); if (idx!==-1) deck[section].splice(idx,1); }
    } else {
      const idx = deck[section].findIndex(id=>String(id)===String(cardId)); if (idx!==-1) deck[section].splice(idx,1);
    }
    updateDeckDisplay();
  }

  // Insert a card into a specific position in a section (e.g., after a clicked slot).
  // Respects banlist / allowed copies and updates the visual display.
  function insertCardAtPosition(cardId, section, index){
    if (!cardId) return false;
    if (!['main','extra','side'].includes(section)) section = 'main';
    const combined = deck.main.concat(deck.extra).concat(deck.side);
    const count = combined.filter(id=>String(id)===String(cardId)).length;
    const allowed = allowedCopiesFor(cardId);
    if (count >= allowed) { flashInvalid(section); return false; }
    const pos = Number.isFinite(Number(index)) ? Math.max(0, Math.floor(Number(index))) : deck[section].length;
    const insertAt = Math.min(deck[section].length, pos);
    deck[section].splice(insertAt, 0, String(cardId));
    updateDeckDisplay();
    return true;
  }

  function updateDeckDisplay(){
    ensureDeckSlots();
    ['main','extra','side'].forEach(section=>{
      const container = document.getElementById(section+'-deck');
      if (!container) return;
      const slots = Array.from(container.querySelectorAll('.deck-slot, .card-slot'));
      const expanded = Array.isArray(deck[section]) ? deck[section].slice() : [];
      let total = 0;
      for (let i=0;i<slots.length;i++){
        const s = slots[i];
        s.classList.remove('has-card');
        s.classList.remove('empty');
        delete s.dataset.cardId;
        // ensure an inner tile-surface exists so deck slots match search tiles
        let surface = s.querySelector('.tile-slot');
        if (!surface){
          surface = document.createElement('div');
          surface.className = 'tile-slot';
          s.prepend(surface);
        }
        // ensure a card-image wrapper exists inside the inner surface (preserve other designer children)
        let imgWrap = surface.querySelector('.card-image');
        if (!imgWrap) { imgWrap = document.createElement('div'); imgWrap.className = 'card-image'; surface.prepend(imgWrap); }
        imgWrap.innerHTML = '';
        if (expanded[i]){
          const id = expanded[i];
          const card = allCards.find(c=>String(c.id)===String(id));
          const img = document.createElement('img'); img.src = card ? (`https://raw.githubusercontent.com/JustBryant/KDR-Revamped-Images/main/small_tcg/${card.id}.jpg`) : (''); img.alt = card ? card.name : String(id);
          img.onerror = function(){ this.style.display='none'; };
          imgWrap.appendChild(img);
          s.classList.add('has-card');
          // also mark inner surface as filled so shared styles and badge logic can target it
          surface.classList.add('has-card');
          s.dataset.cardId = id;
          s.dataset.slotIndex = i;
          s.dataset.section = section;
          // attach dragstart for filled slot (ensure we don't add duplicate listeners)
          s.draggable = true;
            if (!s._kp_drag_attached){
            s._kp_drag_attached = true;
            s.addEventListener('dragstart', function(e){ const cid = this.dataset.cardId; const sec = this.dataset.section; if (!cid) { e.preventDefault(); return; } try{ const payload = JSON.stringify({ action:'from-deck', cardId:String(cid), section:String(sec) }); e.dataTransfer.setData('application/x-deck', payload); e.dataTransfer.setData('text/plain', 'deck:'+payload); e.dataTransfer.effectAllowed = 'move'; try{ window._kp_drag_payload = { action:'from-deck', cardId:String(cid), section:String(sec) }; }catch(ex){} }catch(ex){} });
            // middle-click on a deck slot -> insert another copy adjacent to this slot
            s.addEventListener('auxclick', function(ev){ try{ if (ev && ev.button === 1){ ev.preventDefault(); ev.stopPropagation(); const cid = this.dataset.cardId; const sec = this.dataset.section || section; const idx = Number(this.dataset.slotIndex); try{ if (window.showCardPreviewById) window.showCardPreviewById(cid); }catch(e){} insertCardAtPosition(cid, sec, idx+1); } }catch(e){} });
            // fallback for browsers that don't support 'auxclick'
            s.addEventListener('mousedown', function(ev){ try{ if (ev && ev.button === 1){ ev.preventDefault(); ev.stopPropagation(); const cid = this.dataset.cardId; const sec = this.dataset.section || section; const idx = Number(this.dataset.slotIndex); try{ if (window.showCardPreviewById) window.showCardPreviewById(cid); }catch(e){} insertCardAtPosition(cid, sec, idx+1); } }catch(e){} });
            s.addEventListener('contextmenu', function(ev){ ev.preventDefault(); ev.stopPropagation(); try{ if (window.showCardPreviewById) window.showCardPreviewById(this.dataset.cardId); }catch(e){} removeFromDeck(this.dataset.cardId, section, Number(this.dataset.slotIndex)); });
              // left-click on a deck slot -> show preview
              s.addEventListener('click', function(ev){ try{ ev.stopPropagation(); const cid = this.dataset.cardId; if (!cid) return; if (window.showCardPreviewById) window.showCardPreviewById(cid); }catch(e){} });
            // hover highlight archetypes for this card
            if (!s._kp_hover_attached){
              s._kp_hover_attached = true;
              s.addEventListener('mouseenter', function(ev){ try{ const cid = this.dataset.cardId; if (!cid) return; highlightArchetypesForCard(cid); }catch(e){} });
              s.addEventListener('mouseleave', function(ev){ try{ clearArchetypeHighlights(); }catch(e){} });
            }
          }
          total++;
        } else {
          s.classList.add('empty'); s.draggable = false;
        }
      }
      const countEl = document.getElementById(section+'-count'); if (countEl) countEl.textContent = `(${total}/${section==='main'?60:(section==='extra'?15:15)})`;
    });
    // update archetypes/badges if other scripts provide mapping, then refresh banlist badges
    try { if (window.updateDeckArchetypes) window.updateDeckArchetypes(); } catch(e){}
    try{ if (typeof updateAllBadges === 'function') updateAllBadges(); }catch(e){}
  }

    // --- Export helpers (YDK & YDKE) attached to window so the page export UI can call them ---
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

    function downloadYDK(){
      const main = Array.isArray(deck.main) ? deck.main.map(Number) : Object.entries(deck.main||{}).flatMap(([id,count])=>Array(count).fill(Number(id)));
      const extra = Array.isArray(deck.extra) ? deck.extra.map(Number) : Object.entries(deck.extra||{}).flatMap(([id,count])=>Array(count).fill(Number(id)));
      const side = Array.isArray(deck.side) ? deck.side.map(Number) : Object.entries(deck.side||{}).flatMap(([id,count])=>Array(count).fill(Number(id)));
      const content = createYDKText(main, extra, side);
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'deck.ydk'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }

    function createYDKE(main, extra, side){
      function bytesToBase64(u8){
        const CHUNK = 0x8000; let s=''; for (let i=0;i<u8.length;i+=CHUNK){ s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i+CHUNK))); } return btoa(s);
      }
      function sectionBase64(arr){ const buf = new ArrayBuffer(4 + arr.length*4); const dv = new DataView(buf); let off=0; dv.setUint32(off, arr.length, true); off+=4; for (const id of arr){ dv.setUint32(off, Number(id), true); off+=4; } return bytesToBase64(new Uint8Array(buf)); }
      const main64 = sectionBase64(main); const extra64 = sectionBase64(extra); const side64 = sectionBase64(side);
      return 'ydke://' + main64 + '!' + extra64 + '!' + side64 + '!';
    }

    function exportYDKE(){
      const main = Array.isArray(deck.main) ? deck.main.map(Number) : Object.entries(deck.main||{}).flatMap(([id,count])=>Array(count).fill(Number(id)));
      const extra = Array.isArray(deck.extra) ? deck.extra.map(Number) : Object.entries(deck.extra||{}).flatMap(([id,count])=>Array(count).fill(Number(id)));
      const side = Array.isArray(deck.side) ? deck.side.map(Number) : Object.entries(deck.side||{}).flatMap(([id,count])=>Array(count).fill(Number(id)));
      const ydke = createYDKE(main, extra, side);
      try{ navigator.clipboard.writeText(ydke).then(()=>{ alert('YDKE copied to clipboard'); }).catch(()=>{ alert('YDKE: unable to copy to clipboard.'); }); }catch(e){ alert('YDKE created.'); }
    }

    // expose to global scope for UI wiring
    window.downloadYDK = downloadYDK;
    window.exportYDKE = exportYDKE;

    // Parse .ydk file contents into arrays
    function parseYDK(text){
      const lines = String(text||'').split(/\r?\n/).map(l=>l.trim());
      const main = [], extra = [], side = [];
      let section = 'main';
      for (const ln of lines){ if (!ln) continue; if (ln.startsWith('#') || ln.startsWith('//')){
          const l = ln.replace(/^#+/,'').toLowerCase(); if (l.indexOf('main')!==-1) section='main'; else if (l.indexOf('extra')!==-1) section='extra'; else if (l.indexOf('side')!==-1 || l.indexOf('!side')!==-1) section='side'; continue; }
        if (ln.indexOf('!side')===0){ section='side'; continue; }
        // numeric ids only
        const m = ln.match(/(\d+)/); if (!m) continue; const id = String(Number(m[1])); if (section==='main') main.push(id); else if (section==='extra') extra.push(id); else side.push(id);
      }
      return { main, extra, side };
    }

    // Parse YDKE string (ydke://<base64>!<base64>!<base64>!) into arrays
    function parseYDKE(text){
      let t = String(text||'').trim(); if (t.toLowerCase().startsWith('ydke://')) t = t.slice(7);
      // ensure trailing separator removal
      if (t.endsWith('!')) t = t.slice(0,-1);
      const parts = t.split('!');
      const out = [[],[],[]];
      for (let i=0;i<3;i++){ const p = parts[i] || ''; if (!p) continue; try{ const binStr = atob(p); const len = binStr.length; const u8 = new Uint8Array(len); for (let j=0;j<len;j++) u8[j]=binStr.charCodeAt(j); const dv = new DataView(u8.buffer); let off=0; if (u8.length < 4) continue; const count = dv.getUint32(off, true); off+=4; for (let n=0;n<count;n++){ if (off+4 <= u8.length){ const id = dv.getUint32(off, true); off+=4; out[i].push(String(id)); } else break; } }catch(e){ /* ignore parse errors */ } }
      return { main: out[0], extra: out[1], side: out[2] };
    }

    // Import deck from text (format 'ydk' or 'ydke') - returns a Promise resolving with a report
    async function importDeckFromText(text, format){
      try{
        let parsed = { main: [], extra: [], side: [] };
        if (!text) return { report: ['No content provided'] };
        if (format === 'ydk') {
          parsed = parseYDK(text);
        } else if (format === 'ydke') {
          parsed = parseYDKE(text);
        } else if (String(text).toLowerCase().startsWith('ydke://')) {
          parsed = parseYDKE(text);
        } else {
          parsed = parseYDK(text);
        }

        // Now validate parsed ids against available `allCards` (which are limited to HARDCODED_END_DATE)
        const report = [];
        // Build a map of occurrences per section in original order
        const sections = ['main','extra','side'];
        const original = { main: parsed.main.slice(), extra: parsed.extra.slice(), side: parsed.side.slice() };

        const kept = { main: [], extra: [], side: [] };

        // For each unique id appearing, process allowed copies and presence
        const combinedOrder = original.main.concat(original.extra, original.side);
        const uniqueIds = Array.from(new Set(combinedOrder));
        const missingIds = [];
        for (const id of uniqueIds){
          const totalCount = combinedOrder.filter(x=>String(x)===String(id)).length;
          const foundCard = allCards.find(c => String(c.id)===String(id));
          if (!foundCard){
            report.push(`${id} — Removed: Not yet released.`);
            missingIds.push(String(id));
            continue; // drop all copies
          }
          const allowed = allowedCopiesFor(id);
          if (allowed <= 0){
            report.push(`${foundCard.name || id} (${id}) — Removed: Forbidden`);
            continue;
          }
          if (totalCount <= allowed){
            // keep all copies as-is
            for (const sec of sections){ for (const v of original[sec]){ if (String(v)===String(id)) kept[sec].push(String(v)); } }
          } else {
            // need to trim to `allowed` copies preserving section order (main -> extra -> side)
            let remaining = allowed;
            for (const sec of sections){
              for (const v of original[sec]){
                if (String(v)!==String(id)) continue;
                if (remaining > 0){ kept[sec].push(String(v)); remaining--; }
                else { /* skip */ }
              }
            }
            const removed = totalCount - allowed;
            if (removed === 1) {
              report.push(`${foundCard.name || id} (${id}) — Removed: 1 Copy (Limit: ${allowed})`);
            } else {
              report.push(`${foundCard.name || id} (${id}) — Removed: ${removed} Copies`);
            }
          }
        }

        // Replace deck with kept arrays
        deck.main = kept.main;
        deck.extra = kept.extra;
        deck.side = kept.side;
        updateDeckDisplay();

        // For any missing ids, attempt to fetch their names from the public API so the report can show names
        if (missingIds.length > 0){
          try{
            await Promise.all(missingIds.map(async mid => {
              try{
                const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${encodeURIComponent(mid)}`;
                const r = await fetch(url);
                if (!r.ok) return;
                const jd = await r.json();
                if (jd && jd.data && jd.data[0] && jd.data[0].name){
                  const nm = String(jd.data[0].name || '').trim();
                  // update any report entries that begin with the numeric id
                  for (let i=0;i<report.length;i++){
                    if (report[i].indexOf(mid + ' —') === 0){
                      report[i] = `${nm} (${mid}) — Removed: Not yet released.`;
                    }
                  }
                }
              }catch(e){}
            }));
          }catch(e){}
        }

        return { report };
      }catch(e){ console.error('importDeckFromText failed', e); return { report: ['Import failed: ' + String(e)] }; }
    }

    // expose import function
    window.importDeckFromText = importDeckFromText;

  /* Pagination helpers for search results */
  function totalPages(){
    const total = (filteredCards && filteredCards.length) ? filteredCards.length : (allCards && allCards.length ? allCards.length : 0);
    return Math.max(1, Math.ceil(total / pageSize));
  }

  function updatePager(){
    try{
      const prev = document.getElementById('pager-prev');
      const next = document.getElementById('pager-next');
      const status = document.getElementById('pager-status');
      const tp = totalPages();
      if (currentPage > tp) currentPage = tp;
      if (currentPage < 1) currentPage = 1;
      if (status) status.textContent = currentPage + ' / ' + tp;
      if (prev) prev.disabled = (currentPage <= 1);
      if (next) next.disabled = (currentPage >= tp);
    }catch(e){}
  }

  function goToPage(n){
    const tp = totalPages();
    n = Math.max(1, Math.min(tp, Number(n)||1));
    if (n === currentPage) return;
    currentPage = n;
    const start = (currentPage-1)*pageSize;
    const slice = (filteredCards && filteredCards.length) ? filteredCards.slice(start, start+pageSize) : allCards.slice(start, start+pageSize);
    displayCards(slice);
    updatePager();
  }

  function prevPage(){ goToPage(currentPage-1); }
  function nextPage(){ goToPage(currentPage+1); }

  // Render search results into existing #card-list tiles (do not replace DOM)
  function displayCards(cards){
    const visual = document.getElementById('card-list');
    if (!visual) return;
    const slots = Array.from(visual.querySelectorAll('.card-tile'));
    // ensure we have pageSize slots; if not, create or trim to exactly pageSize
    if (slots.length !== pageSize){ visual.innerHTML=''; for (let i=0;i<pageSize;i++){ const t=document.createElement('div'); t.className='card-tile empty'; t.dataset.slotIndex=i; t.tabIndex=0; visual.appendChild(t); } }
    const finalSlots = Array.from(visual.querySelectorAll('.card-tile'));
    for (let i=0;i<finalSlots.length;i++){
      const slot = finalSlots[i]; slot.innerHTML=''; slot.classList.remove('has-card'); delete slot.dataset.cardId;
      const card = cards[i] || null;
        if (!card) { 
          slot.classList.add('empty'); 
          // clear any handlers when slot is empty
          slot.onclick = null; slot.ondragstart = null; slot.oncontextmenu = null; slot.draggable = false; 
          continue; 
        }
      // Create an inner slot-like surface so the search tile matches deck slots exactly.
      const slotSurface = document.createElement('div'); slotSurface.className = 'card-slot tile-slot'; slotSurface.dataset.filled = 'false';
      const wrap = document.createElement('div'); wrap.className='card-image';
      const img = document.createElement('img'); img.src = `https://raw.githubusercontent.com/JustBryant/KDR-Revamped-Images/main/small_tcg/${card.id}.jpg`; img.alt = card.name; img.onerror=function(){this.style.display='none'};
      wrap.appendChild(img);
      slotSurface.appendChild(wrap);
      slot.appendChild(slotSurface);
      slot.dataset.cardId = String(card.id);
      slot.classList.add('has-card');
      // also mark inner surface as filled so shared styles and badge logic can target it
      slotSurface.classList.add('has-card');
      // drag from search -> deck
      slot.draggable = true;
      // replace handlers rather than adding multiple listeners repeatedly
      slot.ondragstart = function(e){ try{ e.dataTransfer.setData('text/plain', String(card.id)); e.dataTransfer.effectAllowed='copy'; }catch(ex){} };
      slot.onclick = function(ev){ ev.stopPropagation(); if (window.showCardPreviewById) window.showCardPreviewById(card.id); };
      // right-click add (replace existing handler). Ctrl + Right-Click adds to the side deck.
      slot.oncontextmenu = function(ev){
        ev.preventDefault(); ev.stopPropagation();
        // Ctrl (or Meta on macOS) + RightClick -> side deck
        try{ if (window.showCardPreviewById) window.showCardPreviewById(card.id); }catch(e){}
        if (ev.ctrlKey || ev.metaKey) { tryAddCardToSection(card.id, 'side', true); return; }
        const t = String(card.type||'').toLowerCase();
        const isExtraType = /fusion|synchro|xyz|link/i.test(t);
        const target = (isExtraType && /monster/i.test(t)) ? 'extra':'main';
        tryAddCardToSection(card.id, target, true);
      };
    }
    try{ if (typeof updateAllBadges === 'function') updateAllBadges(); }catch(e){}
  }

  // Simple filter wrapper: uses a very small set of fields (name/type/race)
  function filterCards(){
    const q = (document.getElementById('search-input') && document.getElementById('search-input').value||'').toLowerCase();
    const category = (document.getElementById('filter-category') && document.getElementById('filter-category').value||'').toLowerCase();
    const cardTypeFilter = (document.getElementById('filter-cardtype') && document.getElementById('filter-cardtype').value||'').toLowerCase();
    const attrFilter = (document.getElementById('filter-attr') && document.getElementById('filter-attr').value||'').toLowerCase();
    const raceFilter = (document.getElementById('filter-type') && document.getElementById('filter-type').value||'').toLowerCase();
    const chkPend = (document.getElementById('chk-pendulum') && document.getElementById('chk-pendulum').checked) || false;
    const chkTuner = (document.getElementById('chk-tuner') && document.getElementById('chk-tuner').checked) || false;
    const chkFlip = (document.getElementById('chk-flip') && document.getElementById('chk-flip').checked) || false;
    const chkSpirit = (document.getElementById('chk-spirit') && document.getElementById('chk-spirit').checked) || false;
    const chkGemini = (document.getElementById('chk-gemini') && document.getElementById('chk-gemini').checked) || false;
    const chkUnion = (document.getElementById('chk-union') && document.getElementById('chk-union').checked) || false;
    const levelFilterRaw = (document.getElementById('filter-level') && document.getElementById('filter-level').value) || '';
    const levelFilter = levelFilterRaw !== '' ? Number(levelFilterRaw) : null;
    const scaleFilterRaw = (document.getElementById('filter-scale') && document.getElementById('filter-scale').value) || '';
    const scaleFilter = scaleFilterRaw !== '' ? Number(scaleFilterRaw) : null;
    const atkFilterRaw = (document.getElementById('filter-atk') && document.getElementById('filter-atk').value) || '';
    const defFilterRaw = (document.getElementById('filter-def') && document.getElementById('filter-def').value) || '';

    // helper: parse comparison input like '<300', '<=300', '>300', '>=300', '=300', '300',
    // or ranges like '100-300' or '100..300'. Returns an object describing the comparator,
    // or null if the input is empty / unsupported.
    function parseComparator(input){
      if (!input || String(input).trim()==='') return null;
      let s = String(input).trim();
      // normalize common unicode operators and remove inner whitespace
      s = s.replace(/\u2264/g, '<=').replace(/\u2265/g, '>=').replace(/\u2212/g,'-');
      s = s.replace(/\s+/g,'');
      // allow ranges like 100-300 or 100..300
      const range = s.match(/^(\d+)\s*(?:-|\.\.)\s*(\d+)$/);
      if (range){ const a = Number(range[1]), b = Number(range[2]); if (!Number.isNaN(a) && !Number.isNaN(b)) return { op: 'range', min: Math.min(a,b), max: Math.max(a,b) }; }
      // operators: <, <=, >, >=, =, ==
      const m = s.match(/^([<>]=?|==?|=)\s*(\d+)$/);
      if (m){ let op = m[1]; if (op === '=') op = '=='; return { op: op, value: Number(m[2]) }; }
      // plain number => exact match
      const m2 = s.match(/^(\d+)$/);
      if (m2) return { op: '==', value: Number(m2[1]) };
      // if parsing failed, return null but log for debugging in dev console
      try{ if (typeof console !== 'undefined' && console && console.debug) console.debug('parseComparator: failed to parse input', input); }catch(e){}
      return null;
    }
    const atkFilter = parseComparator(atkFilterRaw);
    const defFilter = parseComparator(defFilterRaw);

    const out = allCards.filter(c=>{
      // Category filter: if set to Monster/Spell/Trap, only include those categories.
      if (category) {
        const t = String(c.type||'').toLowerCase();
        if (category === 'monster') {
          if (!/monster/i.test(t)) return false;
        } else if (category === 'spell') {
          if (!/spell/i.test(t)) return false;
        } else if (category === 'trap') {
          if (!/trap/i.test(t)) return false;
        }
      }
      // Card Type filter: follow legacy logic using parsed subtype for Spell/Trap and contains-match for Monster
      if (cardTypeFilter) {
        const parsed = parseCardType(c.type);
        if (parsed && (parsed.category === 'spell' || parsed.category === 'trap')){
          const want = String(cardTypeFilter || '').toLowerCase();
          const norm = s => String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
          const wantNorm = norm(want);
          const gotSubtype = parsed.subtype ? parsed.subtype.toLowerCase() : '';
          const gotNorm = norm(gotSubtype);
          const rawTypeNorm = norm(String(c.type||''));
          const rawRaceNorm = norm(String(c.race||''));
          if (!(gotNorm === wantNorm || rawTypeNorm.indexOf(wantNorm) !== -1 || rawRaceNorm.indexOf(wantNorm) !== -1)) return false;
        } else {
          // Monster or unknown: fallback to simple contains
          if (!c.type || String(c.type).toLowerCase().indexOf(cardTypeFilter) === -1) return false;
        }
      }
      // Attribute filter (e.g., LIGHT/DARK)
      if (attrFilter) {
        if (!c.attribute || String(c.attribute).toLowerCase() !== attrFilter) return false;
      }
      // Type / Race filter (e.g., Spellcaster, Warrior)
      if (raceFilter) {
        if (!c.race || String(c.race).toLowerCase() !== raceFilter) return false;
      }
      // Characteristic checkboxes (pendulum, tuner, flip, spirit, gemini, union)
      const parsed = parseCardType(c.type);
      if (chkPend) {
        const isPend = (parsed && parsed.subtype && String(parsed.subtype).toLowerCase().indexOf('pendulum') !== -1) || (c.scale !== null && c.scale !== undefined);
        if (!isPend) return false;
      }
      if (chkTuner) { if (!(parsed && parsed.subtype && String(parsed.subtype).toLowerCase().indexOf('tuner') !== -1) && !(String(c.type||'').toLowerCase().indexOf('tuner')!==-1)) return false; }
      if (chkFlip) { if (!(parsed && parsed.subtype && String(parsed.subtype).toLowerCase().indexOf('flip') !== -1) && !(String(c.type||'').toLowerCase().indexOf('flip')!==-1)) return false; }
      if (chkSpirit) { if (!(parsed && parsed.subtype && String(parsed.subtype).toLowerCase().indexOf('spirit') !== -1) && !(String(c.type||'').toLowerCase().indexOf('spirit')!==-1)) return false; }
      if (chkGemini) { if (!(parsed && parsed.subtype && String(parsed.subtype).toLowerCase().indexOf('gemini') !== -1) && !(String(c.type||'').toLowerCase().indexOf('gemini')!==-1)) return false; }
      if (chkUnion) { if (!(parsed && parsed.subtype && String(parsed.subtype).toLowerCase().indexOf('union') !== -1) && !(String(c.type||'').toLowerCase().indexOf('union')!==-1)) return false; }
      // Level / Rank filter (exact match)
      if (levelFilter !== null) {
        const lvl = (c.level !== undefined && c.level !== null) ? Number(c.level) : ((c.rank !== undefined && c.rank !== null) ? Number(c.rank) : null);
        if (lvl === null || Number.isNaN(lvl) || lvl !== levelFilter) return false;
      }
      // Scale filter (exact match)
      if (scaleFilter !== null) {
        const sc = (c.scale !== undefined && c.scale !== null) ? Number(c.scale) : null;
        if (sc === null || Number.isNaN(sc) || sc !== scaleFilter) return false;
      }
      // ATK / DEF filters with comparison support
      if (atkFilter !== null) {
        const a = (c.atk !== undefined && c.atk !== null) ? Number(c.atk) : null;
        if (a === null || Number.isNaN(a)) return false;
        const op = atkFilter.op;
        if (op === 'range'){ const min = atkFilter.min, max = atkFilter.max; if (!(a >= min && a <= max)) return false; }
        else { const v = atkFilter.value; if (op === '==') { if (a !== v) return false; } else if (op === '<') { if (!(a < v)) return false; } else if (op === '<=') { if (!(a <= v)) return false; } else if (op === '>') { if (!(a > v)) return false; } else if (op === '>=') { if (!(a >= v)) return false; } }
      }
      if (defFilter !== null) {
        const d = (c.def !== undefined && c.def !== null) ? Number(c.def) : null;
        if (d === null || Number.isNaN(d)) return false;
        const op2 = defFilter.op;
        if (op2 === 'range'){ const min2 = defFilter.min, max2 = defFilter.max; if (!(d >= min2 && d <= max2)) return false; }
        else { const v2 = defFilter.value; if (op2 === '==') { if (d !== v2) return false; } else if (op2 === '<') { if (!(d < v2)) return false; } else if (op2 === '<=') { if (!(d <= v2)) return false; } else if (op2 === '>') { if (!(d > v2)) return false; } else if (op2 === '>=') { if (!(d >= v2)) return false; } }
      }

      // text search still applies when provided
      if (q){ if (!(c.name && c.name.toLowerCase().includes(q)) && !(c.desc && c.desc.toLowerCase().includes(q))) return false; }
      return true;
    });
    filteredCards = out;
    currentPage = 1;
    updatePager();
    displayCards(filteredCards.slice((currentPage-1)*pageSize, (currentPage-1)*pageSize + pageSize));
  }

  // Fetch cards by end date (wrap original API call but resilient)
  async function applyDateFilter(){
    const results = document.getElementById('card-list'); if (results) results.innerHTML = ''; try{
      const HARDCODED_END_DATE = '2014-08-15';
      const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?dateregion=tcg&enddate=${HARDCODED_END_DATE}`;
      const resp = await fetch(url);
      const data = await resp.json();
      allCards = (data && data.data) ? data.data.map(card=>({
        id: card.id,
        name: card.name,
        type: card.type,
        race: card.race,
        desc: card.desc||'',
        atk: (card.atk !== undefined) ? card.atk : null,
        def: (card.def !== undefined) ? card.def : null,
        attribute: card.attribute || null,
        level: (card.level !== undefined) ? card.level : (card.rank !== undefined ? card.rank : null),
        scale: (card.scale !== undefined) ? card.scale : (card.pendulum_scale !== undefined ? card.pendulum_scale : null)
      })) : [];
      filteredCards = allCards.slice();
      currentPage = 1;
      updatePager();
      // populate dynamic selects now that `allCards` is available
      try{ updateCardTypeOptions(); updateTypeOptions(); }catch(e){}
      displayCards(filteredCards.slice(0,pageSize));
    }catch(e){ console.warn('applyDateFilter failed',e); }
  }

  // Banlist loader (simple text parse). If a global WORKSPACE_BANLIST_TEXT exists prefer it.
  function parseLflist(text){ const map={}; if (!text) return map; const lines=String(text).split(/\r?\n/); for (let raw of lines){ let line=raw.trim(); if(!line||line.startsWith('#')||line.startsWith('//')) continue; let m=line.match(/^(\d+)\s*[=:\s]\s*(\d+)$/); if (m){ map[String(m[1])]=Number(m[2]); continue;} m=line.match(/^(\d+)$/); if (m){ map[String(m[1])]=0; continue;} m=line.match(/(\d+).*?(\d+)/); if (m){ map[String(m[1])]=Number(m[2]); continue; } } return map; }

  function autoLoadBanlist(){ try{ if (window.WORKSPACE_BANLIST_TEXT){ banlist = parseLflist(window.WORKSPACE_BANLIST_TEXT); updateAllBadges(); return; } }catch(e){} fetch('./Purist.lflist.conf').then(r=>{ if (!r.ok) throw new Error('no'); return r.text() }).then(t=>{ banlist = parseLflist(t); updateAllBadges(); }).catch(()=>{ /* optional: no banlist available */ }); }

  function updateAllBadges(){ // update badges in search tiles and deck slots
    try{ if (typeof console !== 'undefined' && console && console.debug) console.debug('updateAllBadges: banlist entries=', Object.keys(banlist||{}).length); }catch(e){}
    let _badgeAdded = 0;
    // scan search tiles (don't rely on .has-card class; use dataset.cardId if present)
    const tileCandidates = document.querySelectorAll('#card-list .card-tile');
    try{ if (typeof console !== 'undefined' && console && console.debug) console.debug('updateAllBadges: tile candidates=', tileCandidates.length); }catch(e){}
    tileCandidates.forEach(div=>{
      const id = div.dataset.cardId;
      if (!id) return;
      // prefer to attach badge to the slot surface (if present) so absolute positioning aligns to slot
      const surface = div.querySelector('.card-slot') || div;
      if (!surface) return;
      const existing = surface.querySelector('.ban-badge'); if (existing) existing.remove();
      const allowed = allowedCopiesFor(id);
      if (allowed>=3) return;
      const badge = document.createElement('span'); badge.className='ban-badge';
      const icon = document.createElement('img'); icon.className = 'ban-icon';
      if (allowed === 0){ icon.src = './forbidden.svg'; icon.alt = 'Forbidden'; badge.title = 'Forbidden'; badge.setAttribute('aria-label','Forbidden'); }
      else if (allowed === 1){ icon.src = './limited.svg'; icon.alt = 'Limited'; badge.title = 'Limited'; badge.setAttribute('aria-label','Limited'); }
      else if (allowed === 2){ icon.src = './semi2.svg'; icon.alt = 'Semi-limited'; badge.title = 'Semi-limited'; badge.setAttribute('aria-label','Semi-limited'); }
      badge.appendChild(icon);
      surface.prepend(badge);
      _badgeAdded++;
    });
    // deck slots badges (include designer's .card-slot elements)
    // Only scan card-slot / deck-slot elements inside deck containers to avoid touching search tile internals
    const slotCandidates = document.querySelectorAll('#main-deck .deck-slot, #main-deck .card-slot, #extra-deck .deck-slot, #extra-deck .card-slot, #side-deck .deck-slot, #side-deck .card-slot');
    try{ if (typeof console !== 'undefined' && console && console.debug) console.debug('updateAllBadges: slot candidates=', slotCandidates.length); }catch(e){}
    slotCandidates.forEach(s=>{
      // remove any existing badge first so stale badges do not persist when card is removed
      const existingOnSlot = s.querySelector(':scope > .ban-badge'); if (existingOnSlot) existingOnSlot.remove();
      const imgWrap = s.querySelector('.card-image'); if (imgWrap){ const existing = imgWrap.querySelector('.ban-badge'); if (existing) existing.remove(); }
      const id = s.dataset.cardId;
      if (!id) return;
      const allowed = allowedCopiesFor(id);
      if (allowed>=3) return;
      const badge = document.createElement('span'); badge.className='ban-badge';
      const icon = document.createElement('img'); icon.className = 'ban-icon';
      if (allowed === 0){ icon.src = './forbidden.svg'; icon.alt = 'Forbidden'; badge.title = 'Forbidden'; }
      else if (allowed === 1){ icon.src = './limited.svg'; icon.alt = 'Limited'; badge.title = 'Limited'; }
      else if (allowed === 2){ icon.src = './semi2.svg'; icon.alt = 'Semi-limited'; badge.title = 'Semi-limited'; }
      badge.appendChild(icon);
      // attach to the slot element itself so absolute positioning is consistent
      s.prepend(badge);
      _badgeAdded++;
    });
    try{ if (typeof console !== 'undefined' && console && console.debug) console.debug('updateAllBadges: badges added=', _badgeAdded); }catch(e){}
  }

  // Provide an updater that summarizes archetypes present in the current deck
  async function updateDeckArchetypes(){
    try{
      const listEl = document.getElementById('deck-archetypes-list');
      if (!listEl) return Promise.resolve();
      let mapping = (window.CARD_ARCHETYPES && typeof window.CARD_ARCHETYPES === 'object') ? window.CARD_ARCHETYPES : {};
      // prepare blacklist normalization once and apply during counting so blacklist takes priority
      const rawBl = Array.isArray(window.ARCHETYPE_BLACKLIST) ? window.ARCHETYPE_BLACKLIST : [];
      const rawWl = Array.isArray(window.ARCHETYPE_WHITELIST) ? window.ARCHETYPE_WHITELIST : [];
      const normalize = s => String(s||'').toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,' ').trim();
      const normBl = rawBl.map(x=>normalize(x)).filter(Boolean);
      const normWl = rawWl.map(x=>normalize(x)).filter(Boolean);
      if (typeof console !== 'undefined' && console && console.debug) console.debug('updateDeckArchetypes: whitelist=', rawWl, 'blacklist=', rawBl, 'normWl=', normWl, 'normBl=', normBl);
      const counts = {};
      ['main','extra','side'].forEach(section => {
        const arr = Array.isArray(deck[section]) ? deck[section] : [];
        arr.forEach(id => {
          const key = String(id);
          const archetypes = mapping[key] || mapping[Number(key)] || [];
          if (!Array.isArray(archetypes) || archetypes.length === 0) return;
          archetypes.forEach(a => {
            const na = normalize(a);
            // blacklist takes absolute priority
            if (normBl.length && normBl.some(b => b && (na === b || na.indexOf(b) !== -1))) return;
            // if a whitelist exists, require the archetype to match the whitelist (exact or substring)
            if (normWl.length && !normWl.some(w => w && (na === w || na.indexOf(w) !== -1))) return;
            counts[a] = (counts[a] || 0) + 1;
          });
        });
      });
      let entries = Object.keys(counts).map(name => ({ name, count: counts[name] }));
      entries.sort((a,b) => (b.count - a.count) || a.name.localeCompare(b.name));
      // render
      listEl.innerHTML = '';
      if (entries.length === 0) {
        // If the in-memory mapping was filtered/empty (whitelist), try loading the authoritative file directly
        try{
          const resp = await fetch('card-archetypes-authoritative.json');
          if (resp && resp.ok){
            const auth = await resp.json();
            if (auth && typeof auth === 'object'){
              mapping = auth;
              // recompute counts using authoritative mapping
              const counts2 = {};
              ['main','extra','side'].forEach(section => {
                const arr = Array.isArray(deck[section]) ? deck[section] : [];
                arr.forEach(id => {
                  const key = String(id).replace(/^0+/, '');
                  const archetypes = mapping[key] || mapping[Number(key)] || [];
                  if (!Array.isArray(archetypes) || archetypes.length === 0) return;
                          archetypes.forEach(a => {
                            const na = normalize(a);
                            if (normBl.length && normBl.some(b => b && (na === b || na.indexOf(b) !== -1))) return;
                            if (normWl.length && !normWl.some(w => w && (na === w || na.indexOf(w) !== -1))) return;
                            counts2[a] = (counts2[a] || 0) + 1;
                          });
                });
              });
              entries = Object.keys(counts2).map(name => ({ name, count: counts2[name] }));
              entries.sort((a,b) => (b.count - a.count) || a.name.localeCompare(b.name));
            }
          }
        }catch(e){ /* ignore fetch errors */ }
      }
              // Apply blacklist filter if provided. Use normalized substring matching so blacklist takes priority.
              try{
                const rawBl = Array.isArray(window.ARCHETYPE_BLACKLIST) ? window.ARCHETYPE_BLACKLIST : [];
                const normalize = s => String(s||'').toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,' ').trim();
                const normBl = rawBl.map(x=>normalize(x)).filter(Boolean);
                if (normBl.length){
                  entries = entries.filter(e=>{
                    const name = normalize(e.name);
                    // exclude if any blacklist entry is equal or is a substring of the archetype name
                    for (const b of normBl){ if (b && (name === b || name.indexOf(b) !== -1)) return false; }
                    return true;
                  });
                }
              }catch(e){}
              if (entries.length === 0) { listEl.textContent = 'None'; return Promise.resolve(); }
      for (const e of entries){
        const row = document.createElement('div'); row.className = 'archetype-item';
        const n = document.createElement('div'); n.className = 'name'; n.textContent = e.name;
        const c = document.createElement('div'); c.className = 'count'; c.textContent = `(${e.count})`;
        row.appendChild(n); row.appendChild(c); listEl.appendChild(row);
      }
      return Promise.resolve();
    }catch(err){ console.warn('updateDeckArchetypes failed', err); return Promise.resolve(); }
  }

  // Highlight archetype entries that relate to a given card id
  function highlightArchetypesForCard(cardId){
    try{
      const listEl = document.getElementById('deck-archetypes-list'); if (!listEl) return;
      const mapping = (window.CARD_ARCHETYPES && typeof window.CARD_ARCHETYPES === 'object') ? window.CARD_ARCHETYPES : {};
      const archetypes = mapping[String(cardId)] || mapping[Number(cardId)] || [];
      if (!Array.isArray(archetypes) || archetypes.length === 0) return;
      const normalize = s => String(s||'').toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,' ').trim();
      const normArch = archetypes.map(a=>normalize(a)).filter(Boolean);
      const items = Array.from(listEl.querySelectorAll('.archetype-item'));
      items.forEach(it => {
        try{
          const nameEl = it.querySelector('.name'); if (!nameEl) return;
          const nm = normalize(nameEl.textContent || nameEl.innerText || '');
          const match = normArch.some(a => a && (nm === a || nm.indexOf(a)!==-1 || a.indexOf(nm)!==-1));
          if (match) it.classList.add('archetype-highlight'); else it.classList.remove('archetype-highlight');
        }catch(e){}
      });
    }catch(e){ console.warn('highlightArchetypesForCard failed', e); }
  }

  function clearArchetypeHighlights(){
    try{ const listEl = document.getElementById('deck-archetypes-list'); if (!listEl) return; const items = Array.from(listEl.querySelectorAll('.archetype-item.archetype-highlight')); items.forEach(it=>it.classList.remove('archetype-highlight')); }catch(e){}
  }

  // public API for other page scripts to call
  window.KPBuilder = {
    init: function(){ ensureDeckSlots(); applyDateFilter(); autoLoadBanlist(); bindUI(); },
    displayCards: displayCards,
    updateDeckDisplay: updateDeckDisplay,
    addToDeck: tryAddCardToSection,
    removeFromDeck: removeFromDeck,
    updateAllBadges: updateAllBadges,
    updateDeckArchetypes: updateDeckArchetypes
  };

  // expose updater for archetypes to global scope for `card-archetypes.js` to call
  try{ window.updateDeckArchetypes = updateDeckArchetypes; }catch(e){}

  // Show a larger preview of a card in the preview pane. Uses the repo's full_tcg images.
  window.showCardPreviewById = function(cardId){
    try{
      const id = String(cardId);
      const card = allCards.find(c=>String(c.id)===id) || { id: id, name: id, type:'', race:'', desc:'' };
      const previewImage = document.querySelector('.preview-image');
      const nameEl = document.querySelector('.card-name');
      const metaEl = document.querySelector('.card-meta');
      const textEl = document.querySelector('.card-text');
      if (previewImage){
        // keep the container but reset contents to a placeholder while loading
        previewImage.classList.remove('loaded');
        previewImage.classList.add('loading');
        previewImage.innerHTML = '';
        const ph = document.createElement('div'); ph.className = 'placeholder'; ph.textContent = 'Loading preview...';
        previewImage.appendChild(ph);
        const img = document.createElement('img');
        img.src = `https://raw.githubusercontent.com/JustBryant/KDR-Revamped-Images/main/full_tcg/${card.id}.jpg`;
        img.alt = card.name || String(card.id);
        img.style.borderRadius = '6px';
        img.onload = function(){
          // replace placeholder with image and mark loaded
          previewImage.innerHTML = '';
          previewImage.appendChild(img);
          previewImage.classList.remove('loading');
          previewImage.classList.add('loaded');
          img.style.opacity = '1';
        };
        img.onerror = function(){
          // show friendly placeholder when image fails
          previewImage.innerHTML = '';
          const fail = document.createElement('div'); fail.className='placeholder'; fail.textContent = 'No preview available'; previewImage.appendChild(fail);
          previewImage.classList.remove('loading');
        };
      }
      if (nameEl) nameEl.textContent = card.name || ('#'+id);
      if (metaEl) metaEl.textContent = [card.type||'', card.race||'', 'ID: '+card.id].filter(Boolean).join(' • ');
      if (textEl) {
        const desc = card.desc || '';
        // If this is a Pendulum monster, try to split into Pendulum Effect and Monster Effect
        const parsedType = parseCardType(card.type);
        const isPendulum = parsedType && parsedType.subtype && String(parsedType.subtype).toLowerCase().indexOf('pendulum') !== -1;
        if (isPendulum && desc){
          // Normalize bracket tokens and search case-insensitively for sections
          const txt = String(desc);
          const pendulumMatch = txt.match(/\[\s*Pendulum\s*Effect\s*\]([\s\S]*?)(?=(\[\s*Monster\s*Effect\s*\]|$))/i);
          const monsterMatch = txt.match(/\[\s*Monster\s*Effect\s*\]([\s\S]*?)(?=(\[\s*Pendulum\s*Effect\s*\]|$))/i);
          // Clear existing content and build structured nodes
          textEl.innerHTML = '';
          if (pendulumMatch && pendulumMatch[1]){
            const title = document.createElement('div'); title.className = 'preview-effect-title'; title.textContent = '[Pendulum Effect]';
            const p = document.createElement('div'); p.className = 'preview-effect-body'; p.textContent = pendulumMatch[1].trim();
            textEl.appendChild(title);
            textEl.appendChild(p);
          }
          if (monsterMatch && monsterMatch[1]){
            const title2 = document.createElement('div'); title2.className = 'preview-effect-title'; title2.textContent = '[Monster Effect]';
            const p2 = document.createElement('div'); p2.className = 'preview-effect-body'; p2.textContent = monsterMatch[1].trim();
            // ensure spacing between sections
            if (textEl.childNodes.length) textEl.appendChild(document.createElement('br'));
            textEl.appendChild(title2);
            textEl.appendChild(p2);
          }
          // fallback: if regex didn't find both sections, just show original desc
          if (!pendulumMatch && !monsterMatch){ textEl.textContent = desc; }
        } else {
          textEl.textContent = desc;
        }
      }
    }catch(e){ console.warn('showCardPreviewById failed', e); }
  };

  function bindUI(){
    const apply = document.getElementById('apply-filters'); if (apply) apply.addEventListener('click', filterCards);
    const clear = document.getElementById('clear-filters'); if (clear) clear.addEventListener('click', ()=>{ document.getElementById('search-input').value=''; filterCards(); });
    // pager controls
    const prev = document.getElementById('pager-prev'); if (prev) prev.addEventListener('click', prevPage);
    const next = document.getElementById('pager-next'); if (next) next.addEventListener('click', nextPage);
    // Category-driven filter locking
    const cat = document.getElementById('filter-category');
    if (cat) {
      cat.addEventListener('change', ()=>{ updateFilterAvailability(); updateCardTypeOptions(); });
    }
    // ensure initial availability and card-type options state
    try{ updateFilterAvailability(); updateCardTypeOptions(); }catch(e){}
    // page prev/next could be added if pager UI exists
    // wire add-to preview buttons
    const addMain = document.getElementById('add-to-deck'); if (addMain) addMain.addEventListener('click', ()=>{ /* no-op: preview-driven add is page-specific */ });
    // update badges after any external archetype loader sets mapping
    window.addEventListener('load', ()=>{ setTimeout(updateAllBadges,100); });
  }

  // Update availability of other filters based on selected Category.
  // Rules:
  // - If Category === 'monster' => enable all other filters
  // - If Category === 'spell' or 'trap' => enable only `filter-cardtype`, disable/clear others
  // - If Category is empty/Any => disable/clear all other filters
  function updateFilterAvailability(){
    const catEl = document.getElementById('filter-category');
    const cat = (catEl && (String(catEl.value||'').trim().toLowerCase())) || '';
    const ids = ['filter-attr','filter-cardtype','filter-type','filter-level','filter-scale','filter-atk','filter-def','chk-pendulum','chk-tuner','chk-flip','chk-spirit','chk-gemini','chk-union'];
    ids.forEach(id=>{
      const el = document.getElementById(id);
      if (!el) return;
      // default: disable and clear
      let shouldEnable = false;
      if (cat === 'monster') {
        shouldEnable = true; // all enabled for monster
      } else if (cat === 'spell' || cat === 'trap') {
        // only card-type should be enabled for spell/trap
        shouldEnable = (id === 'filter-cardtype');
      } else {
        shouldEnable = false;
      }
      // apply enabled/disabled state and clear values when disabling
      if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')){
        el.disabled = !shouldEnable;
        if (!shouldEnable) el.checked = false;
      } else {
        el.disabled = !shouldEnable;
        if (!shouldEnable) el.value = '';
      }
    });
  }

  // Populate `#filter-cardtype` options based on Category selection
  function updateCardTypeOptions(){
    const catEl = document.getElementById('filter-category');
    const ctEl = document.getElementById('filter-cardtype');
    if (!ctEl) return;
    const cat = (catEl && String(catEl.value||'').trim().toLowerCase()) || '';
    // helper to set options
    function setOptions(list){
      ctEl.innerHTML = '';
      const any = document.createElement('option'); any.value=''; any.textContent='Any'; ctEl.appendChild(any);
      list.forEach(opt=>{ const o = document.createElement('option'); o.value = opt; o.textContent = opt; ctEl.appendChild(o); });
    }
    if (cat === 'monster'){
      setOptions(['Normal','Effect','Ritual','Fusion','Synchro','Xyz','Link']);
    } else if (cat === 'spell'){
      setOptions(['Normal','Continuous','Quick-Play','Equip','Ritual','Field']);
    } else if (cat === 'trap'){
      setOptions(['Normal','Continuous','Counter']);
    } else {
      // Any / empty: reset to minimal options
      setOptions([]);
    }
  }

  // Populate `#filter-type` with all unique races/types present in `allCards`.
  // Called after cards are loaded so the list reflects the dataset.
  function updateTypeOptions(){
    const el = document.getElementById('filter-type');
    if (!el) return;
    // collect unique races from allCards — but only for Monster category
    const set = new Set();
    allCards.forEach(c=>{
      try{
        const parsed = parseCardType(c.type);
        const isMonster = (parsed && parsed.category === 'monster') || (String(c.type||'').toLowerCase().indexOf('monster') !== -1);
        if (isMonster && c.race) set.add(String(c.race).trim());
      }catch(e){}
    });
    const arr = Array.from(set).filter(Boolean).sort((a,b)=>a.localeCompare(b));
    // rebuild options
    el.innerHTML = '';
    const any = document.createElement('option'); any.value=''; any.textContent='Any'; el.appendChild(any);
    arr.forEach(r=>{ const o = document.createElement('option'); o.value = r; o.textContent = r; el.appendChild(o); });
  }

  // Parse the API `card.type` into { category, subtype } for robust matching
  function parseCardType(t){
    if (!t) return { category: null, subtype: null };
    const s = String(t);
    const sLow = s.toLowerCase();
    const rawNorm = sLow.replace(/[^a-z0-9]+/g, ' ').trim();
    const tokens = rawNorm ? rawNorm.split(/\s+/) : [];
    const has = tok => tokens.indexOf(tok) !== -1;
    if (sLow.indexOf('monster') !== -1) {
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
    if (sLow.indexOf('spell') !== -1) {
      if (has('continuous')) return { category: 'spell', subtype: 'Continuous' };
      if (has('equip')) return { category: 'spell', subtype: 'Equip' };
      if (has('quick')) return { category: 'spell', subtype: 'Quick-Play' };
      if (has('field')) return { category: 'spell', subtype: 'Field' };
      if (has('ritual')) return { category: 'spell', subtype: 'Ritual' };
      if (has('normal')) return { category: 'spell', subtype: 'Normal' };
      return { category: 'spell', subtype: null };
    }
    if (sLow.indexOf('trap') !== -1) {
      if (has('continuous')) return { category: 'trap', subtype: 'Continuous' };
      if (has('counter')) return { category: 'trap', subtype: 'Counter' };
      if (has('normal')) return { category: 'trap', subtype: 'Normal' };
      return { category: 'trap', subtype: null };
    }
    return { category: null, subtype: null };
  }

  // auto-init on DOM ready
  document.addEventListener('DOMContentLoaded', ()=>{ try{ window.KPBuilder && window.KPBuilder.init(); }catch(e){} });

})();

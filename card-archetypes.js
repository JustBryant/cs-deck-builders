(function(){
  // Load the authoritative JSON mapping and expose it as window.CARD_ARCHETYPES
  // Load authoritative mapping first, then apply a local whitelist of archetype names
  // Prefer embedded blacklist/whitelist if page provides `window.ARCHETYPE_WHITELIST` / `window.ARCHETYPE_BLACKLIST`.
  // Fallback to fetching `archetype-whitelist.json` only for legacy setups; we will NOT fetch a separate blacklist file.
  Promise.all([
    fetch('card-archetypes-authoritative.json').then(r => r.ok ? r.json() : {}).catch(()=>({})),
    fetch('archetype-whitelist.json').then(r => r.ok ? r.json() : null).catch(() => null)
  ])
  .then(([mapping, wlData]) => {
    try {
      if (!mapping || typeof mapping !== 'object') mapping = {};
      // `wlData` may be either an array (legacy whitelist) or an object {
      //   whitelist: [...], blacklist: [...]
      // }
      let whitelist = null;
      let blacklist = null;
      // If the page already provided embedded arrays, use them and prefer embedded blacklist.
      if (Array.isArray(window.ARCHETYPE_WHITELIST)) whitelist = window.ARCHETYPE_WHITELIST;
      if (Array.isArray(window.ARCHETYPE_BLACKLIST)) blacklist = window.ARCHETYPE_BLACKLIST;
      // Otherwise fall back to the fetched whitelist (legacy file). Do NOT attempt to fetch a separate blacklist file.
      if (!whitelist && Array.isArray(wlData)) whitelist = wlData;
      if (!blacklist && wlData && typeof wlData === 'object' && Array.isArray(wlData.blacklist)) blacklist = wlData.blacklist;
      // If a whitelist is provided (array of canonical archetype names), filter each card's series list
      if (Array.isArray(whitelist)) {
        const allowedNorm = new Set(whitelist.map(s => String(s).trim().toLowerCase()));
        let kept = 0, removed = 0;
        for (const cid of Object.keys(mapping)) {
          const arr = Array.isArray(mapping[cid]) ? mapping[cid] : [];
          const filtered = arr.map(s => String(s).trim()).filter(s => allowedNorm.has(String(s).trim().toLowerCase()));
          if (filtered.length > 0) { mapping[cid] = filtered; kept++; }
          else { delete mapping[cid]; removed++; }
        }
        console.log('Applied archetype whitelist — kept', kept, 'card entries; removed', removed);
      }
      // Expose both whitelist and blacklist to window for other scripts
      try{ if (Array.isArray(whitelist)) window.ARCHETYPE_WHITELIST = whitelist; }catch(e){}
      try{ window.ARCHETYPE_BLACKLIST = Array.isArray(blacklist) ? blacklist : []; }catch(e){}
      window.CARD_ARCHETYPES = mapping;
      console.log('CARD_ARCHETYPES loaded', Object.keys(mapping).length, 'entries; whitelist size:', Array.isArray(whitelist)?whitelist.length:0, 'blacklist size:', Array.isArray(blacklist)?blacklist.length:0);
      // Refresh UI summary if the page has exposed the updater
      try { if (typeof window.updateDeckArchetypes === 'function') window.updateDeckArchetypes().catch(() => {}); } catch (e) {}
    } catch (err) {
      console.warn('Error processing card archetypes:', err);
      window.CARD_ARCHETYPES = mapping || {};
    }
  })
  .catch(err => {
    console.warn('Failed to load card-archetypes-authoritative.json or whitelist', err);
    window.CARD_ARCHETYPES = {};
  });
})();

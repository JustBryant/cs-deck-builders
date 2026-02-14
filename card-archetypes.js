(function(){
  // Load the authoritative JSON mapping and expose it as window.CARD_ARCHETYPES
  // Load authoritative mapping first, then apply a local whitelist of archetype names
  Promise.all([
    fetch('card-archetypes-authoritative.json').then(r => r.ok ? r.json() : {}),
    fetch('archetype-whitelist.json').then(r => r.ok ? r.json() : null).catch(() => null)
  ])
  .then(([mapping, whitelist]) => {
    try {
      if (!mapping || typeof mapping !== 'object') mapping = {};
      // If a whitelist is provided (array of canonical archetype names), filter each card's series list
      if (Array.isArray(whitelist)) {
        const allowed = new Set(whitelist.map(s => String(s).trim()));
        for (const cid of Object.keys(mapping)) {
          const arr = Array.isArray(mapping[cid]) ? mapping[cid] : [];
          const filtered = arr.map(s => String(s).trim()).filter(s => allowed.has(s));
          if (filtered.length > 0) mapping[cid] = filtered;
          else delete mapping[cid];
        }
      }
      window.CARD_ARCHETYPES = mapping;
      console.log('CARD_ARCHETYPES loaded', Object.keys(mapping).length, 'entries; whitelist size:', Array.isArray(whitelist)?whitelist.length:0);
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

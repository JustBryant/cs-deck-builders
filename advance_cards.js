const CATEGORY_ORDER = ['Normal Monster','Effect Monster','Fusion Monster','Synchro Monster','Xyz Monster','Link Monster','Ritual Monster','Pendulum Monster','Spell','Trap','Other'];

let cards = [];
let currentPage = 1;
let pageSize = 48;

function totalPages(count){
  return Math.max(1, Math.ceil(count / pageSize));
}

function renderPager(count){
  const status = document.getElementById('page-status');
  const tp = totalPages(count);
  if(currentPage > tp) currentPage = tp;
  status.textContent = `Page ${currentPage} / ${tp}`;
}

function gotoPage(n, count){
  const tp = totalPages(count);
  if(n < 1) n = 1;
  if(n > tp) n = tp;
  currentPage = n;
  renderGrid();
}

function categorize(card){
  const typ = (card.type||'').toLowerCase();
  if(typ.includes('spell')) return 'Spell';
  if(typ.includes('trap')) return 'Trap';
  if(typ.includes('monster')){
    if(typ.includes('fusion')) return 'Fusion Monster';
    if(typ.includes('synchro')) return 'Synchro Monster';
    if(typ.includes('xyz')) return 'Xyz Monster';
    if(typ.includes('link')) return 'Link Monster';
    if(typ.includes('ritual')) return 'Ritual Monster';
    if(typ.includes('pendulum')) return 'Pendulum Monster';
    if(typ.includes('normal')) return 'Normal Monster';
    return 'Effect Monster';
  }
  return 'Other';
}

function renderGrid(){
  const root = document.getElementById('grid-root');
  root.innerHTML = '';
  const q = (document.getElementById('search').value||'').toLowerCase();
  const sort = document.getElementById('sort').value;

  let list = cards.slice();
  if(q) list = list.filter(c=> (c.name||'').toLowerCase().includes(q));

  if(sort==='name_asc') list.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
  else if(sort==='name_desc') list.sort((a,b)=> (b.name||'').localeCompare(a.name||''));
  else if(sort==='type_name') list.sort((a,b)=> { const ta=categorize(a), tb=categorize(b); if(ta!==tb) return ta.localeCompare(tb); return (a.name||'').localeCompare(b.name||''); });

  // pagination: compute slice
  const count = list.length;
  const tp = totalPages(count);
  renderPager(count);
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pageList = list.slice(start, end);

  for(const c of pageList){
    const tile = document.createElement('div'); tile.className='card-tile';
    const img = document.createElement('img');
    // Prefer the small art from our GitHub repo for fast thumbnails
    let thumbUrl = '';
    if (c.id) {
      thumbUrl = `https://raw.githubusercontent.com/JustBryant/KDR-Revamped-Images/main/small_tcg/${c.id}.jpg`;
    }
    // use eager loading for the visible page to make thumbnails appear fast
    img.loading = 'eager';
    img.alt = c.name || '';
    img.dataset.name = c.name || '';
    // Try small github thumb first, fall back to stored image URL, then to empty
    img.src = thumbUrl || c.image || '';
    img.onerror = function(){
      // if thumb fails, try the larger API image if available
      if (this.src !== (c.image || '')){
        if (c.image){ this.src = c.image; return; }
      }
      // final fallback: hide broken image
      this.style.display = 'none';
    };
    tile.appendChild(img);
    // hover preview behavior
    img.addEventListener('mouseenter', (e)=> showPreview(e, c));
    img.addEventListener('mousemove', movePreview);
    img.addEventListener('mouseleave', hidePreview);
    root.appendChild(tile);
  }
}

function showPreview(evt, card){
  const p = document.getElementById('preview');
  const pi = document.getElementById('preview-img');
  // cancel any previous preview work
  previewToken += 1;
  const token = previewToken;

  // hide immediately so previous image never flashes
  p.style.display = 'none';
  pi.src = '';

  // build candidate urls: GH full art by id, then stored image
  const candidates = [];
  if(card.id) candidates.push(`https://raw.githubusercontent.com/JustBryant/KDR-Revamped-Images/main/full_tcg/${card.id}.jpg`);
  if(card.image) candidates.push(card.image);

  function tryCandidate(i){
    if(token !== previewToken) return; // aborted
    if(i >= candidates.length){
      // last resort: fetch from API
      if(card.id){
        fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${encodeURIComponent(card.id)}`).then(r=>r.json()).then(j=>{
          if(token !== previewToken) return;
          try{
            const url = j && j.data && j.data[0] && j.data[0].card_images && j.data[0].card_images[0] && j.data[0].card_images[0].image_url;
            if(url){
              const tester = new Image();
              tester.onload = ()=>{ if(token !== previewToken) return; pi.src = url; p.style.display='block'; movePreview(evt); };
              tester.onerror = ()=>{ if(token !== previewToken) return; p.style.display='none'; };
              tester.src = url;
            } else {
              if(token === previewToken) p.style.display='none';
            }
          }catch(e){ if(token === previewToken) p.style.display='none'; }
        }).catch(()=>{ if(token === previewToken) p.style.display='none'; });
      } else {
        if(token === previewToken) p.style.display='none';
      }
      return;
    }

    const url = candidates[i];
    const tester = new Image();
    tester.onload = ()=>{ if(token !== previewToken) return; pi.src = url; p.style.display='block'; movePreview(evt); };
    tester.onerror = ()=>{ if(token !== previewToken) return; tryCandidate(i+1); };
    tester.src = url;
  }

  tryCandidate(0);
}

function movePreview(e){
  const p = document.getElementById('preview');
  const w = p.offsetWidth; const h = p.offsetHeight;
  let x = e.clientX + 20; let y = e.clientY + 20;
  // keep inside viewport
  if(x + w > window.innerWidth) x = e.clientX - w - 20;
  if(y + h > window.innerHeight) y = e.clientY - h - 20;
  p.style.left = x + 'px'; p.style.top = y + 'px';
}

function hidePreview(){
  const p = document.getElementById('preview'); p.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('search').addEventListener('input', renderGrid);
  document.getElementById('sort').addEventListener('change', renderGrid);
  document.getElementById('page-prev').addEventListener('click', ()=> gotoPage(currentPage-1, cards.length));
  document.getElementById('page-next').addEventListener('click', ()=> gotoPage(currentPage+1, cards.length));
  document.getElementById('page-size').addEventListener('change', (e)=>{ pageSize = parseInt(e.target.value||48,10); currentPage = 1; renderGrid(); });
  // load the manual_cards.json from repo root (visual-only; no uploads)
  // try multiple locations for manual_cards.json to handle different deploy setups
  const tryPaths = [
    'manual_cards.json',
    './manual_cards.json',
    'outputs/manual_cards.json',
    './outputs/manual_cards.json',
    // fallback to raw GitHub URL for this repo (main branch)
    'https://raw.githubusercontent.com/JustBryant/cs-deck-builders/main/manual_cards.json',
    'https://raw.githubusercontent.com/JustBryant/cs-deck-builders/main/outputs/manual_cards.json'
  ];

  async function fetchFirst(paths){
    for(const p of paths){
      try{
        console.debug('Attempting to fetch', p);
        const r = await fetch(p);
        if(!r.ok) { console.debug('Not found or error', p, r.status); continue; }
        const j = await r.json();
        if(Array.isArray(j)) return j;
      }catch(err){ console.debug('Fetch error', p, err); }
    }
    return null;
  }

  fetchFirst(tryPaths).then(j=>{
    if(Array.isArray(j) && j.length>0){
      cards = j.map(x=>({id: x.id, name: x.name, type: x.type, image: x.image||''}));
      renderGrid();
    } else {
      const root = document.getElementById('grid-root'); root.innerHTML = '<div style="color:var(--muted)">No advance cards available.</div>';
      console.warn('manual_cards.json not found in any candidate path. Tried:', tryPaths);
    }
  });
});

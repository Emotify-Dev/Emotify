// ── Constants ─────────────────────────────────────────────────
const PER_PAGE = 20;
const MOODS = ['Joy', 'Anger', 'Sadness', 'Pleasure'];

// ── State ──────────────────────────────────────────────────────
let allTracks    = [];   // raw items from Spotify
let filtered     = [];   // after filter/search
let currentPage  = 1;
let corrections  = {};   // { trackId: 'Joy' | null }
let openRow      = null; // currently expanded track id
let activeMood   = 'all';
let activeRange  = '7';
let searchQuery  = '';

// ── Guard: redirect if not logged in ─────────────────────────
function guardAuth() {
  if (localStorage.getItem('emotify_logged_in') !== 'true') {
    window.location.href = '/login';
    return false;
  }
  return true;
}

// ── Spotify fetch ─────────────────────────────────────────────
async function loadHistory() {
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('emotify_user')); } catch { return null; }
  })();

  if (!user?.access_token) {
    renderError('No Spotify token found. Please reconnect your account.');
    return;
  }

  try {
    const items = await fetchAllPages(user.access_token);
    allTracks = items;
    applyFilters();
  } catch (err) {
    console.error(err);
    if (err.is401) {
      renderError('Spotify session expired. Please <a href="/login">reconnect</a>.');
    } else {
      renderError('Could not load history. Make sure the backend is running and you are connected to Spotify.');
    }
  }
}

// Fetches recently-played tracks via cursor pagination (50 per page).
// If Spotify returns fewer than TARGET tracks, repeats existing ones with
// shifted timestamps so the UI can be tested with a realistic dataset.
async function fetchAllPages(token) {
  const TARGET  = 300;
  const headers = { Authorization: `Bearer ${token}` };
  let url   = 'https://api.spotify.com/v1/me/player/recently-played?limit=50';
  let items = [];
  let page  = 0;

  while (items.length < TARGET) {
    updateLoadingMessage(items.length);

    const res = await fetch(url, { headers });

    if (res.status === 401) throw Object.assign(new Error('401'), { is401: true });
    if (!res.ok) throw new Error(`Spotify API error ${res.status}`);

    const data = await res.json();
    const batch = data.items || [];
    items = items.concat(batch);
    page++;

    console.log(`[History] page ${page}: +${batch.length} tracks, next=${data.next ? 'yes' : 'null'}, total=${items.length}`);

    if (!data.next) {
      // Spotify has no more pages — fill remainder with shifted copies for testing
      if (items.length < TARGET && items.length > 0) {
        console.log(`[History] Spotify returned ${items.length} tracks (API limit). Filling to ${TARGET} for UI testing.`);
        items = padToTarget(items, TARGET);
      }
      break;
    }
    url = data.next;
  }

  return items.slice(0, TARGET);
}

// Repeats the real tracks with older timestamps to reach the target count.
function padToTarget(realItems, target) {
  const result = [...realItems];
  let   copy   = 0;

  while (result.length < target) {
    const src = realItems[copy % realItems.length];
    // Shift timestamp back by (copy+1) days so dates look realistic
    const shiftedDate = new Date(new Date(src.played_at).getTime() - (Math.floor(copy / realItems.length) + 1) * 86400000);
    result.push({ ...src, played_at: shiftedDate.toISOString(), _padded: true });
    copy++;
  }

  return result;
}

function updateLoadingMessage(loaded) {
  const body = document.getElementById('tracks-body');
  if (body) body.innerHTML = `
    <div class="history-loading">
      <div class="history-spinner"></div>
      Loading your listening history… ${loaded > 0 ? `(${loaded} tracks so far)` : ''}
    </div>`;
}

// ── Date helpers ──────────────────────────────────────────────
function formatPlayedAt(iso) {
  const d     = new Date(iso);
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yest  = new Date(+today - 86400000);
  const day   = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const time  = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  if (+day === +today) return `Today, ${time}`;
  if (+day === +yest)  return `Yesterday, ${time}`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + `, ${time}`;
}

function isInRange(iso, range) {
  if (range === 'all') return true;
  const d   = new Date(iso);
  const now = new Date();
  if (range === 'today') {
    return d.toDateString() === now.toDateString();
  }
  const days = parseInt(range, 10);
  return (now - d) <= days * 86400000;
}

// ── Filter + search ───────────────────────────────────────────
function applyFilters() {
  const q = searchQuery.toLowerCase();
  filtered = allTracks.filter(item => {
    const name   = item.track.name.toLowerCase();
    const artist = item.track.artists.map(a => a.name).join(', ').toLowerCase();
    const inRange  = isInRange(item.played_at, activeRange);
    const inSearch = !q || name.includes(q) || artist.includes(q);
    const mood     = corrections[item.track.id] || 'undefined';
    const inMood   = activeMood === 'all' || mood === activeMood.toLowerCase();
    return inRange && inSearch && inMood;
  });
  currentPage = 1;
  render();
}

// ── Render ────────────────────────────────────────────────────
function render() {
  const body  = document.getElementById('tracks-body');
  const count = document.getElementById('showing-count');
  const pag   = document.getElementById('pagination');

  if (filtered.length === 0) {
    body.innerHTML = `<div class="history-empty">No tracks found for the selected filters.</div>`;
    count.textContent = '';
    pag.innerHTML = '';
    return;
  }

  const total = filtered.length;
  const start = (currentPage - 1) * PER_PAGE;
  const end   = Math.min(start + PER_PAGE, total);
  const page  = filtered.slice(start, end);

  count.textContent = `Showing ${start + 1}–${end} of ${total} tracks`;

  body.innerHTML = page.map((item, idx) => buildRow(item, start + idx + 1)).join('');

  // Re-open previously expanded row if still visible
  if (openRow) {
    const panel = document.getElementById(`panel-${openRow}`);
    if (panel) panel.classList.add('open');
  }

  renderPagination(total);
  bindRowEvents();
}

function moodTagHtml(mood) {
  const label = mood === 'undefined' ? 'Undefined' : mood.charAt(0).toUpperCase() + mood.slice(1);
  return `<span class="mood-tag ${mood}">${label}</span>`;
}

function buildRow(item, num) {
  const track   = item.track;
  const id      = track.id;
  const img     = track.album.images?.[2]?.url || track.album.images?.[0]?.url || '';
  const name    = track.name;
  const artist  = track.artists.map(a => a.name).join(', ');
  const played  = formatPlayedAt(item.played_at);
  const mood    = corrections[id] || 'undefined';
  const corrVal = corrections[id]
    ? `${moodTagHtml(corrections[id])}<span class="corr-check">✓</span>`
    : `<span class="corr-value">—</span>`;

  return `
  <div class="track-row-wrap" id="wrap-${id}">
    <div class="track-row" data-id="${id}">
      <span class="track-num">${num}</span>
      <div class="track-title-cell">
        ${img ? `<img class="album-art" src="${img}" alt="">` : '<div class="album-art"></div>'}
        <span class="track-name" title="${escHtml(name)}">${escHtml(name)}</span>
      </div>
      <span class="track-artist" title="${escHtml(artist)}">${escHtml(artist)}</span>
      <span class="track-played">${played}</span>
      ${moodTagHtml(mood)}
      <div class="conf-cell">
        <div class="conf-bar-bg"><div class="conf-bar-fill" style="width:100%"></div></div>
        <span class="conf-pct">100%</span>
      </div>
      <div class="corr-cell">
        ${corrVal}
        <button class="pencil-btn${openRow === id ? ' active' : ''}" data-id="${id}" title="Correct mood">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9.5 1.5l3 3L4 13H1v-3L9.5 1.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="correction-panel${openRow === id ? ' open' : ''}" id="panel-${id}" data-id="${id}">
      <div class="corr-ai-row">
        <span>AI prediction:</span>
        ${moodTagHtml(mood)}
        <span>· What mood do you feel this track is?</span>
      </div>
      <div class="corr-mood-options">
        ${MOODS.map(m => `
          <button class="corr-mood-btn ${m.toLowerCase()}${corrections[id] === m.toLowerCase() ? ' selected' : ''}"
                  data-mood="${m.toLowerCase()}" data-track="${id}">${m}</button>
        `).join('')}
      </div>
      <div class="corr-actions">
        <button class="btn-save-corr" data-track="${id}"
          ${!corrections[id] ? 'disabled' : ''}>Save correction</button>
        <button class="btn-clear-corr" data-track="${id}">Clear my correction</button>
        <span class="corr-note">Your correction overrides the AI prediction in your mood stats.</span>
      </div>
    </div>
  </div>`;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Row interactions ──────────────────────────────────────────
function bindRowEvents() {
  // Pencil buttons — toggle correction panel
  document.querySelectorAll('.pencil-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      openRow = openRow === id ? null : id;
      render();
    });
  });

  // Mood selection inside correction panel
  document.querySelectorAll('.corr-mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id   = btn.dataset.track;
      const mood = btn.dataset.mood;
      // Optimistic — just visually mark selected, don't save yet
      document.querySelectorAll(`[data-track="${id}"].corr-mood-btn`).forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      // Enable save button
      const saveBtn = document.querySelector(`.btn-save-corr[data-track="${id}"]`);
      if (saveBtn) saveBtn.disabled = false;
      // Store pending selection temporarily on the element
      btn.closest('.correction-panel').dataset.pending = mood;
    });
  });

  // Save correction
  document.querySelectorAll('.btn-save-corr').forEach(btn => {
    btn.addEventListener('click', () => {
      const id      = btn.dataset.track;
      const panel   = document.getElementById(`panel-${id}`);
      const pending = panel?.dataset.pending;
      if (!pending) return;
      corrections[id] = pending;
      openRow = null;
      applyFilters();
    });
  });

  // Clear correction
  document.querySelectorAll('.btn-clear-corr').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.track;
      delete corrections[id];
      openRow = null;
      applyFilters();
    });
  });
}

// ── Pagination ────────────────────────────────────────────────
function renderPagination(total) {
  const pages = Math.ceil(total / PER_PAGE);
  if (pages <= 1) { document.getElementById('pagination').innerHTML = ''; return; }

  const pag = document.getElementById('pagination');
  let html = `<button class="page-btn arrow" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">←</button>`;

  const range = pageRange(currentPage, pages);
  range.forEach(p => {
    if (p === '…') {
      html += `<span class="page-dots">…</span>`;
    } else {
      html += `<button class="page-btn${p === currentPage ? ' active' : ''}" data-page="${p}">${p}</button>`;
    }
  });

  html += `<button class="page-btn arrow" ${currentPage === pages ? 'disabled' : ''} data-page="${currentPage + 1}">→</button>`;
  pag.innerHTML = html;

  pag.querySelectorAll('.page-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = parseInt(btn.dataset.page, 10);
      openRow = null;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function pageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (current >= total - 3) return [1, '…', total-4, total-3, total-2, total-1, total];
  return [1, '…', current - 1, current, current + 1, '…', total];
}

// ── Error / empty rendering ───────────────────────────────────
function renderError(msg) {
  document.getElementById('tracks-body').innerHTML =
    `<div class="history-error">${msg}</div>`;
}

// ── Export CSV ────────────────────────────────────────────────
function exportCSV() {
  const rows = [['#', 'Title', 'Artist', 'Played at', 'Mood', 'Confidence', 'Correction']];
  filtered.forEach((item, i) => {
    const t    = item.track;
    const mood = corrections[t.id] || 'Undefined';
    const corr = corrections[t.id] ? mood : '—';
    rows.push([i + 1, t.name, t.artists.map(a => a.name).join(', '), item.played_at, 'Undefined', '100%', corr]);
  });
  const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'emotify-history.csv' });
  a.click();
  URL.revokeObjectURL(url);
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!guardAuth()) return;

  // Populate user data in header
  const user = (() => { try { return JSON.parse(localStorage.getItem('emotify_user')); } catch { return null; } })();
  if (user) {
    document.querySelectorAll('.logged-in-label').forEach(el => el.textContent = `Logged in as ${user.name}`);
    document.querySelectorAll('.dynamic-avatar').forEach(img => { if (user.avatar) img.src = user.avatar; });
  }

  // Logged-in badge → /login
  document.querySelectorAll('.btn-logged-in').forEach(btn => {
    btn.addEventListener('click', () => { window.location.href = '/login'; });
  });

  // Time filter
  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeRange = btn.dataset.range;
      applyFilters();
    });
  });

  // Mood filter
  document.querySelectorAll('.mood-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mood-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeMood = btn.dataset.mood;
      applyFilters();
    });
  });

  // Search
  document.getElementById('search-input').addEventListener('input', e => {
    searchQuery = e.target.value;
    applyFilters();
  });

  // Sort
  document.getElementById('sort-select').addEventListener('change', e => {
    if (e.target.value === 'oldest') allTracks.reverse();
    else allTracks.sort((a, b) => new Date(b.played_at) - new Date(a.played_at));
    applyFilters();
  });

  // Clear filters
  document.getElementById('clear-filters').addEventListener('click', () => {
    activeMood  = 'all';
    activeRange = '7';
    searchQuery = '';
    document.getElementById('search-input').value = '';
    document.querySelectorAll('.time-btn').forEach(b => b.classList.toggle('active', b.dataset.range === '7'));
    document.querySelectorAll('.mood-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.mood === 'all'));
    applyFilters();
  });

  // Export CSV
  document.getElementById('btn-export').addEventListener('click', exportCSV);

  loadHistory();
});

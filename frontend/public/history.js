// ── Constants ─────────────────────────────────────────────────
const PER_PAGE = 20;
const MOODS    = ['Joy', 'Anger', 'Sadness', 'Pleasure'];
const ML_API   = 'http://localhost:5001';

// ── State ──────────────────────────────────────────────────────
let allTracks   = [];   // raw items from Spotify
let filtered    = [];   // after filter/search
let currentPage = 1;
let corrections = {};   // { trackId: 'joy' | ... }
let openRow     = null; // currently expanded track id
let activeMood  = 'all';
let activeRange = '7';
let searchQuery = '';

let analysisCache = {};      // trackId → {mood, confidence, scores} | {error}
let analyzingSet  = new Set(); // track IDs currently in-flight

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

// Fetches recently-played tracks via Spotify cursor pagination.
// Spotify stores up to ~50 recent plays — follows next-cursors to collect all available.
async function fetchAllPages(token) {
  const headers = { Authorization: `Bearer ${token}` };
  let url   = 'https://api.spotify.com/v1/me/player/recently-played?limit=50';
  let items = [];

  while (url) {
    const res = await fetch(url, { headers });

    if (res.status === 401) throw Object.assign(new Error('401'), { is401: true });
    if (!res.ok) throw new Error(`Spotify API error ${res.status}`);

    const data = await res.json();
    items = items.concat(data.items || []);
    url   = data.next || null;
  }

  return items;
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

    const id       = item.track.id;
    const corrMood = corrections[id];
    const aiResult = analysisCache[id];
    const aiMood   = aiResult?.mood ? aiResult.mood.toLowerCase() : null;
    const mood     = corrMood || aiMood || 'undefined';
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
    updateAnalysisStatus(0);
    return;
  }

  const total = filtered.length;
  const start = (currentPage - 1) * PER_PAGE;
  const end   = Math.min(start + PER_PAGE, total);
  const page  = filtered.slice(start, end);

  count.textContent = `Showing ${start + 1}–${end} of ${total} tracks`;

  body.innerHTML = page.map((item, idx) => buildRow(item, start + idx + 1)).join('');

  if (openRow) {
    const panel = document.getElementById(`panel-${openRow}`);
    if (panel) panel.classList.add('open');
  }

  renderPagination(total);
  bindRowEvents();

  // Trigger analysis for any unanalyzed tracks on this page
  const needsAnalysis = page.filter(
    item => !analysisCache[item.track.id] && !analyzingSet.has(item.track.id)
  );
  if (needsAnalysis.length > 0) {
    analyzeCurrentPage(needsAnalysis);
  }

  // Update status indicator
  updateAnalysisStatus(analyzingSet.size);
}

function moodTagHtml(mood) {
  const label = mood === 'undefined'  ? 'Undefined'
              : mood === 'analyzing'  ? '…'
              : mood.charAt(0).toUpperCase() + mood.slice(1);
  return `<span class="mood-tag ${mood}">${label}</span>`;
}

function buildRow(item, num) {
  const track   = item.track;
  const id      = track.id;
  const img     = track.album.images?.[2]?.url || track.album.images?.[0]?.url || '';
  const name    = track.name;
  const artist  = track.artists.map(a => a.name).join(', ');
  const played  = formatPlayedAt(item.played_at);

  const corrMood    = corrections[id];
  const aiResult    = analysisCache[id];
  const isAnalyzing = analyzingSet.has(id);
  const aiMood      = aiResult?.mood ? aiResult.mood.toLowerCase() : null;

  // mood shown in the row: user correction > AI > analyzing placeholder > undefined
  const displayMood = corrMood
    || (isAnalyzing ? 'analyzing' : (aiMood || 'undefined'));

  // confidence
  const confPct   = aiResult?.confidence != null
    ? Math.round(aiResult.confidence * 100)
    : null;
  const confWidth = confPct != null ? `${confPct}%` : '0%';

  const corrVal = corrections[id]
    ? `${moodTagHtml(corrections[id])}<span class="corr-check">✓</span>`
    : `<span class="corr-value">—</span>`;

  const confCell = isAnalyzing
    ? `<div class="conf-cell"><span class="conf-pct">…</span></div>`
    : `<div class="conf-cell">
        <div class="conf-bar-bg"><div class="conf-bar-fill" style="width:${confWidth}"></div></div>
        <span class="conf-pct">${confPct != null ? confPct + '%' : '—'}</span>
       </div>`;

  // AI mood shown in correction panel (always the raw prediction, not the correction)
  const aiPanelMood = isAnalyzing ? 'analyzing' : (aiMood || 'undefined');

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
      ${moodTagHtml(displayMood)}
      ${confCell}
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
        ${moodTagHtml(aiPanelMood)}
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

// ── Analysis status banner ────────────────────────────────────
function updateAnalysisStatus(count) {
  const el = document.getElementById('analysis-status');
  if (!el) return;
  if (count > 0) {
    el.textContent = `Analyzing ${count} track${count === 1 ? '' : 's'}…`;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

// ── ML batch analysis ─────────────────────────────────────────
async function analyzeCurrentPage(tracks) {
  if (!tracks.length) return;

  const user = (() => {
    try { return JSON.parse(localStorage.getItem('emotify_user')); } catch { return null; }
  })();

  tracks.forEach(item => analyzingSet.add(item.track.id));
  updateAnalysisStatus(analyzingSet.size);
  // Re-render to show "…" placeholders (avoids full render if correction panel open)
  document.querySelectorAll('.mood-tag').forEach(el => {
    const wrap = el.closest('.track-row-wrap');
    if (!wrap) return;
    const id = wrap.id.replace('wrap-', '');
    if (analyzingSet.has(id) && !el.closest('.correction-panel')) {
      el.className = 'mood-tag analyzing';
      el.textContent = '…';
    }
  });

  const payload = {
    token:  user?.access_token || null,
    tracks: tracks.map(item => ({
      id:          item.track.id,
      name:        item.track.name,
      artist:      item.track.artists[0]?.name || '',
      preview_url: item.track.preview_url || null,
    })),
  };

  try {
    const res = await fetch(`${ML_API}/api/analyze/batch`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      Object.assign(analysisCache, data.results || {});
    }
  } catch (e) {
    console.warn('[Emotify] ML service unavailable:', e.message);
  } finally {
    tracks.forEach(item => analyzingSet.delete(item.track.id));
    render();
  }
}

// ── Row interactions ──────────────────────────────────────────
function bindRowEvents() {
  document.querySelectorAll('.pencil-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      openRow = openRow === id ? null : id;
      render();
    });
  });

  document.querySelectorAll('.corr-mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id   = btn.dataset.track;
      const mood = btn.dataset.mood;
      document.querySelectorAll(`[data-track="${id}"].corr-mood-btn`).forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      const saveBtn = document.querySelector(`.btn-save-corr[data-track="${id}"]`);
      if (saveBtn) saveBtn.disabled = false;
      btn.closest('.correction-panel').dataset.pending = mood;
    });
  });

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
  const rows = [['#', 'Title', 'Artist', 'Played at', 'Mood', 'Confidence', 'Correction', 'Spotify Track ID']];

  filtered.forEach((item, i) => {
    const t      = item.track;
    const aiRes  = analysisCache[t.id];
    const aiMood = aiRes?.mood || 'Undefined';
    const corrMood = corrections[t.id];
    const mood   = corrMood
      ? corrMood.charAt(0).toUpperCase() + corrMood.slice(1)
      : aiMood;
    const corr   = corrMood ? mood : '—';
    const conf   = aiRes?.confidence != null
      ? Math.round(aiRes.confidence * 100) + '%'
      : '—';

    rows.push([
      i + 1,
      t.name,
      t.artists.map(a => a.name).join(', '),
      item.played_at,
      mood,
      conf,
      corr,
      t.id,
    ]);
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

  const user = (() => { try { return JSON.parse(localStorage.getItem('emotify_user')); } catch { return null; } })();
  if (user) {
    document.querySelectorAll('.logged-in-label').forEach(el => el.textContent = `Logged in as ${user.name}`);
    document.querySelectorAll('.dynamic-avatar').forEach(img => { if (user.avatar) img.src = user.avatar; });
  }

  document.querySelectorAll('.btn-logged-in').forEach(btn => {
    btn.addEventListener('click', () => { window.location.href = '/login'; });
  });

  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeRange = btn.dataset.range;
      applyFilters();
    });
  });

  document.querySelectorAll('.mood-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mood-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeMood = btn.dataset.mood;
      applyFilters();
    });
  });

  document.getElementById('search-input').addEventListener('input', e => {
    searchQuery = e.target.value;
    applyFilters();
  });

  document.getElementById('sort-select').addEventListener('change', e => {
    if (e.target.value === 'oldest') allTracks.reverse();
    else allTracks.sort((a, b) => new Date(b.played_at) - new Date(a.played_at));
    applyFilters();
  });

  document.getElementById('clear-filters').addEventListener('click', () => {
    activeMood  = 'all';
    activeRange = '7';
    searchQuery = '';
    document.getElementById('search-input').value = '';
    document.querySelectorAll('.time-btn').forEach(b => b.classList.toggle('active', b.dataset.range === '7'));
    document.querySelectorAll('.mood-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.mood === 'all'));
    applyFilters();
  });

  document.getElementById('btn-export').addEventListener('click', exportCSV);

  loadHistory();
});

const BACKEND = 'http://localhost:4000';
const STORAGE_KEY  = 'emotify_logged_in';
const USER_KEY     = 'emotify_user';

// ── State helpers ─────────────────────────────────────────────
function isLoggedIn() { return localStorage.getItem(STORAGE_KEY) === 'true'; }
function setLoggedIn(v) { localStorage.setItem(STORAGE_KEY, String(v)); }

function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}
function setUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }
function clearUser() { localStorage.removeItem(USER_KEY); localStorage.removeItem(STORAGE_KEY); }

// ── Populate UI with real Spotify user data ───────────────────
function applyUserData() {
  const user = getUser();
  if (!user) return;

  const name   = user.name || 'User';
  const avatar = user.avatar || '/images/Spotify_Profile_Avatar.png';
  const now    = new Date();
  const loginTime = now.toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  // Header: "Logged in as NAME"
  document.querySelectorAll('.logged-in-label').forEach(el => {
    el.textContent = `Logged in as ${name}`;
  });

  // All avatar images
  document.querySelectorAll('.dynamic-avatar').forEach(img => {
    img.src = avatar;
    img.alt = name;
  });

  // Connected card: welcome text
  document.querySelectorAll('.welcome-text').forEach(el => {
    el.textContent = `Welcome, ${name}. Let's set up your mood profile.`;
  });

  // Connected card: user name
  document.querySelectorAll('.dynamic-name').forEach(el => {
    el.textContent = name;
  });

  // Connected card: last login time
  document.querySelectorAll('.dynamic-login-time').forEach(el => {
    el.textContent = `Last login: ${loginTime}`;
  });
}

// ── Show/hide elements based on login state ───────────────────
function applyLoginState() {
  const loggedIn = isLoggedIn();
  const page = document.body.dataset.page;

  document.querySelectorAll('[data-guest]').forEach(el =>
    el.classList.toggle('hidden', loggedIn));

  document.querySelectorAll('[data-auth]').forEach(el =>
    el.classList.toggle('hidden', !loggedIn));

  if (page === 'main') {
    document.querySelectorAll('[data-main-guest]').forEach(el =>
      el.classList.toggle('hidden', loggedIn));
  }

  if (page === 'login') {
    document.getElementById('connect-card')?.classList.toggle('hidden', loggedIn);
    document.getElementById('connected-card')?.classList.toggle('hidden', !loggedIn);
  }

  if (loggedIn) applyUserData();
}

// ── Handle return from Spotify OAuth ─────────────────────────
async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);

  if (params.has('spotify_data')) {
    try {
      const raw  = params.get('spotify_data');
      // base64url → standard base64
      const b64  = raw.replace(/-/g, '+').replace(/_/g, '/');
      const user = JSON.parse(atob(b64));
      setUser(user);
      setLoggedIn(true);
    } catch (e) {
      console.error('Failed to parse spotify_data', e);
    }
    // Clean up URL so refresh doesn't re-process
    window.history.replaceState({}, '', '/login');
  }

  if (params.has('error')) {
    console.error('Spotify auth error:', params.get('error'));
    window.history.replaceState({}, '', '/login');
  }
}

// ── Bind interactive events ───────────────────────────────────
function bindEvents() {
  const page = document.body.dataset.page;

  // ── Main page ────────────────────────────────────────────────
  if (page === 'main') {
    // "Connect with Spotify" buttons → go to login page first
    document.querySelectorAll('.btn-go-login').forEach(btn => {
      btn.addEventListener('click', () => {
        window.location.href = '/login';
      });
    });
  }

  // ── Login page ───────────────────────────────────────────────
  if (page === 'login') {
    // "Connect Spotify" card button → backend OAuth
    document.getElementById('btn-connect-spotify')?.addEventListener('click', () => {
      window.location.href = `${BACKEND}/auth/spotify`;
    });

    // "Log out" button
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
      // Tell backend to clear session (fire-and-forget)
      fetch(`${BACKEND}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
      clearUser();
      applyLoginState();
    });

    // "Learn how it works" smooth scroll
    document.getElementById('btn-learn')?.addEventListener('click', e => {
      e.preventDefault();
      document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // ── Both pages ───────────────────────────────────────────────
  // "Logged in as" badge → go to login page
  document.querySelectorAll('.btn-logged-in').forEach(btn => {
    btn.addEventListener('click', () => { window.location.href = '/login'; });
  });
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (document.body.dataset.page === 'login') {
    await handleOAuthCallback(); // must run before applyLoginState
  }
  applyLoginState();
  bindEvents();
});

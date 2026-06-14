const path = require('path');
// .env lives in the project root (one level above backend/)
require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
  override: true,
});
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const cors = require('cors');
const querystring = require('querystring');

const app = express();
const PORT = process.env.PORT || 4000;

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI = 'http://localhost:4000/callback',
  FRONTEND_URL = 'http://localhost:3000',
  SESSION_SECRET = 'emotify-dev-secret',
} = process.env;

const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-read-recently-played',
  'user-read-currently-playing',
  'user-read-playback-state',
  'playlist-read-private',
].join(' ');

// ── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 24 * 60 * 60 * 1000 },
}));

// ── Routes ────────────────────────────────────────────────────

// Step 1: redirect user to Spotify login
app.get('/auth/spotify', (req, res) => {
  if (!SPOTIFY_CLIENT_ID) {
    return res.status(500).send('SPOTIFY_CLIENT_ID not set in .env');
  }
  const params = querystring.stringify({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: SPOTIFY_SCOPES,
    show_dialog: false,
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

// Step 2: Spotify redirects back here with ?code=
// Handles both /callback and /auth/callback depending on what's set in Spotify Dashboard
async function handleCallback(req, res) {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect(`${FRONTEND_URL}/login?error=${error || 'no_code'}`);
  }

  try {
    // Exchange authorization code for tokens
    const tokenRes = await axios.post(
      'https://accounts.spotify.com/api/token',
      querystring.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' +
            Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
        },
      }
    );

    const { access_token, refresh_token } = tokenRes.data;

    // Fetch Spotify user profile
    const profileRes = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const p = profileRes.data;
    const user = {
      id: p.id,
      name: p.display_name || p.id,
      email: p.email || '',
      avatar: p.images?.[0]?.url || null,
      access_token,
      refresh_token,
    };

    // Keep tokens in server session (for future backend-side Spotify calls)
    req.session.user = user;

    // Pass non-sensitive profile data to frontend via base64 URL param
    // (access_token is included so the frontend can also call Spotify directly)
    const encoded = Buffer.from(JSON.stringify(user)).toString('base64url');
    res.redirect(`${FRONTEND_URL}/login?spotify_data=${encoded}`);
  } catch (err) {
    console.error('OAuth error:', err.response?.data || err.message);
    res.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
  }
}

app.get('/callback', handleCallback);
app.get('/auth/callback', handleCallback);

// Current session user (for future protected API calls)
app.get('/auth/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const { id, name, email, avatar } = req.session.user;
  res.json({ id, name, email, avatar });
});

// Logout — clears server session; frontend clears localStorage
app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Start ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Emotify backend  →  http://localhost:${PORT}`);
  if (!SPOTIFY_CLIENT_ID) {
    console.warn('⚠  SPOTIFY_CLIENT_ID missing — copy .env.example to .env and fill in credentials');
  }
});

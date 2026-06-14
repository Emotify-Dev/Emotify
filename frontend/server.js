const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve PNG assets from the frontend root under /images/
app.use('/images', express.static(__dirname));

// Serve static files (CSS, JS, HTML) from public/
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/history', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'history.html')));

app.listen(PORT, () => {
  console.log(`Emotify running at http://localhost:${PORT}`);
});

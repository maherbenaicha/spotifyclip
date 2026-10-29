// ─────────────────────────────────────────────────────────────
// bridge/demo.js — Une fausse chanson, pour tester sans Spotify
//
// Il imite exactement le pont Windows : il écrit une ligne JSON
// toutes les 400 ms. C'est pratique pour comprendre le "protocole"
// entre le pont et l'app, et pour tester n'importe où.
// ─────────────────────────────────────────────────────────────

const song = {
  key: 'demo|Bohemian Rhapsody',
  title: 'Bohemian Rhapsody',
  artist: 'Queen',
  album: 'A Night at the Opera',
  app: 'demo',
  durationMs: 354_000,
};

// Une petite pochette dessinée en SVG (dégradé + cercle)
const coverSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#e2475b"/><stop offset="1" stop-color="#2b2f8f"/>
  </linearGradient></defs>
  <rect width="300" height="300" fill="url(#g)"/>
  <circle cx="150" cy="150" r="70" fill="#f4c14f" opacity="0.9"/>
</svg>`;

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const startedAt = Date.now();
let first = true;

send({ type: 'ready' });

setInterval(() => {
  const positionMs = (Date.now() - startedAt) % song.durationMs;
  const msg = { type: 'state', track: { ...song, isPlaying: true, positionMs } };
  if (first) {
    msg.cover = { type: 'image/svg+xml', data: Buffer.from(coverSvg).toString('base64') };
    first = false;
  }
  send(msg);
}, 400);

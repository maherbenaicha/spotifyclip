// ─────────────────────────────────────────────────────────────
// nowplaying.js — "Qu'est-ce qui joue en ce moment ?"
//
// La page interroge le pont local (/api/now-playing), qui lit
// lui-même les infos que Windows connaît sur la musique en cours.
// Pas de compte développeur, pas de Premium : ça marche avec
// l'appli Spotify gratuite (et aussi Deezer, YouTube Music...).
// ─────────────────────────────────────────────────────────────

// Renvoie :
//   undefined → pas d'info pour l'instant (on garde l'état précédent)
//   null      → rien ne joue
//   un objet  → le morceau en cours
export async function getNowPlaying() {
  let res;
  try {
    res = await fetch('/api/now-playing', { cache: 'no-store' });
  } catch {
    throw new Error('BRIDGE_DOWN'); // le serveur (npm run dev) est arrêté
  }
  if (!res.ok) throw new Error('BRIDGE_DOWN');

  const data = await res.json();
  if (data.status === 'unsupported') throw new Error('UNSUPPORTED');
  if (data.status === 'starting') return undefined;
  if (data.status === 'error') {
    console.warn('[pont]', data.message);
    return undefined;
  }

  const t = data.track;
  if (!t) return null;

  return {
    id: t.key,
    title: t.title,
    // "Artiste 1, Artiste 2" → ['Artiste 1', 'Artiste 2']
    artists: (t.artist || '').split(/\s*[,;]\s*/).filter(Boolean),
    album: t.album || '',
    cover: t.coverVersion ? `/api/cover?v=${t.coverVersion}` : '',
    durationMs: t.durationMs || 0,
    // null = l'appli ne donne pas la position : main.js utilisera son propre chrono
    progressMs: t.positionMs ?? null,
    isPlaying: Boolean(t.isPlaying),
    app: appName(t.app),
    fetchedAt: performance.now(),
  };
}

// "Spotify.exe" ou "SpotifyAB.SpotifyMusic_..." → "Spotify"
function appName(id = '') {
  if (/spotify/i.test(id)) return 'Spotify';
  if (/chrome/i.test(id)) return 'Chrome';
  if (/msedge/i.test(id)) return 'Edge';
  if (/firefox/i.test(id)) return 'Firefox';
  if (/deezer/i.test(id)) return 'Deezer';
  if (id === 'demo') return 'démo';
  return id.split(/[!.\\]/)[0] || '';
}

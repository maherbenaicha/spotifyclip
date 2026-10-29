// ─────────────────────────────────────────────────────────────
// lyrics.js — Récupère les paroles synchronisées sur LRCLIB
//
// LRCLIB (lrclib.net) est une base de paroles gratuite et ouverte.
// Les paroles "synchronisées" sont au format LRC :
//     [00:12.34] Première ligne
//     [00:15.80] Deuxième ligne
// Chaque ligne a l'instant (minutes:secondes) où elle est chantée.
// ─────────────────────────────────────────────────────────────

const API = 'https://lrclib.net/api';
const cache = new Map(); // une chanson déjà cherchée n'est pas redemandée

// Transforme un texte LRC en tableau [{ time: millisecondes, text }]
export function parseLrc(lrc) {
  if (!lrc) return [];
  const lines = [];
  const stamp = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(stamp)];
    if (!stamps.length) continue;
    const text = raw.replace(stamp, '').trim();
    for (const [, min, sec] of stamps) {
      const time = Math.round((Number(min) * 60 + Number(sec.replace(':', '.'))) * 1000);
      lines.push({ time, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

// Trouve la ligne en cours : la dernière dont l'instant est passé.
// (recherche dichotomique : rapide même pour une longue chanson)
export function currentLineIndex(lines, ms) {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= ms) { found = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return found;
}

// "Song - Remastered 2011" ou "Song (feat. X)" → "Song"
export function cleanTitle(title) {
  return title
    .replace(/\s*[-–]\s*(remaster(ed)?|live|radio edit|mono|stereo|version|edit|bonus).*$/i, '')
    .replace(/\s*[([](feat\.?|ft\.?|with|from|remaster(ed)?)[^)\]]*[)\]]/gi, '')
    .trim();
}

function toResult(data) {
  return {
    synced: parseLrc(data.syncedLyrics),
    plain: data.plainLyrics || '',
    instrumental: Boolean(data.instrumental),
  };
}

const EMPTY = { synced: [], plain: '', instrumental: false };

export async function fetchLyrics(track) {
  if (cache.has(track.id)) return cache.get(track.id);

  const artist = track.artists[0] || '';
  let result = EMPTY;

  try {
    // 1) Recherche exacte (titre + artiste + album + durée)
    //    (LRCLIB exige la durée pour cette recherche : on la saute si on ne l'a pas)
    let res;
    if (track.durationMs > 0) {
      const exact = new URLSearchParams({
        track_name: track.title,
        artist_name: artist,
        album_name: track.album,
        duration: String(Math.round(track.durationMs / 1000)),
      });
      res = await fetch(`${API}/get?${exact}`);
      if (res.ok) result = toResult(await res.json());
    }

    // 2) Sinon, recherche plus large avec un titre nettoyé
    if (!result.synced.length && !result.instrumental) {
      const search = new URLSearchParams({ track_name: cleanTitle(track.title), artist_name: artist });
      res = await fetch(`${API}/search?${search}`);
      if (res.ok) {
        const list = await res.json();
        // On préfère un résultat synchronisé dont la durée est proche (± 5 s)
        const target = track.durationMs / 1000;
        const best =
          (target > 0 && list.find((x) => x.syncedLyrics && Math.abs(x.duration - target) < 5)) ||
          list.find((x) => x.syncedLyrics) ||
          list[0];
        if (best) result = toResult(best);
      }
    }
  } catch (err) {
    console.warn('[lyrics] LRCLIB injoignable :', err);
    return EMPTY; // pas de cache : on retentera au prochain passage
  }

  cache.set(track.id, result);
  return result;
}

// ─────────────────────────────────────────────────────────────
// main.js — Le chef d'orchestre
//
// Il relie toutes les pièces :
//   nowplaying.js → quelle chanson joue, et où on en est (via Windows)
//   lyrics.js     → les paroles synchronisées de cette chanson
//   palette.js    → les couleurs de la pochette
//   audio.js      → l'énergie du son (basses, aigus, beats)
//   visuals.js    → le clip animé
//
// Deux boucles tournent en parallèle :
//   • toutes les 0,5 s : on demande au pont ce qui joue ;
//   • 60 fois par seconde : on met à jour l'image et les paroles.
// ─────────────────────────────────────────────────────────────

import { getNowPlaying } from './nowplaying.js';
import { fetchLyrics, currentLineIndex } from './lyrics.js';
import { extractPalette, DEFAULT_PALETTE } from './palette.js';
import { AudioReactor } from './audio.js';
import { Visuals } from './visuals.js';

const $ = (id) => document.getElementById(id);

const ui = {
  welcome: $('welcome'),
  welcomeAction: $('welcome-action'),
  nowPlaying: $('now-playing'),
  cover: $('np-cover'),
  title: $('np-title'),
  artist: $('np-artist'),
  progress: $('np-progress'),
  controls: $('controls'),
  audioStatus: $('audio-status'),
  btnSystem: $('btn-system'),
  btnMic: $('btn-mic'),
  btnFull: $('btn-full'),
  prev: document.querySelector('.line.prev'),
  current: document.querySelector('.line.current'),
  next: document.querySelector('.line.next'),
  hint: document.querySelector('#lyrics .hint'),
  toast: $('toast'),
};

// ── État de l'application ──
const state = {
  track: null,       // morceau en cours (ou null)
  cover: '',         // adresse de la pochette affichée
  lyrics: null,      // { synced, plain, instrumental }
  lineIndex: -2,     // ligne affichée (-2 = rien encore)
  offsetMs: 0,       // décalage manuel des paroles (touches ← →)
  clockMs: 0,        // chrono de secours si l'appli ne donne pas la position
};

const audio = new AudioReactor();
const visuals = new Visuals($('stage'));

// ─────────────── Notifications ───────────────
let toastTimer;
function toast(message, ms = 2600) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), ms);
}

// ─────────────── Écran d'accueil (en cas de problème) ───────────────
function showProblem(html) {
  ui.welcome.hidden = false;
  ui.controls.hidden = true;
  ui.nowPlaying.hidden = true;
  setLines('', '', '');
  ui.welcomeAction.innerHTML = html;
}

function hideProblem() {
  if (ui.welcome.hidden) return;
  ui.welcome.hidden = true;
  ui.controls.hidden = false;
  if (state.track) ui.nowPlaying.hidden = false;
  state.lineIndex = -2;
}

// ─────────────── Paroles ───────────────
function setLines(prev, current, next, hint = '') {
  ui.prev.textContent = prev;
  ui.current.textContent = current;
  ui.next.textContent = next;
  ui.hint.textContent = hint;
}

// Une ligne vide dans un LRC = un passage instrumental
const show = (line) => (line ? line.text || '♪' : '');

function renderLyrics(progressMs) {
  const { track, lyrics } = state;
  if (!ui.welcome.hidden) return;

  if (!track) {
    if (state.lineIndex !== -3) {
      setLines('', '', '', 'Lance une chanson sur Spotify');
      state.lineIndex = -3;
    }
    return;
  }
  if (!lyrics) return; // en cours de chargement

  if (lyrics.instrumental) return setLines('', '♪', '', 'Instrumental');
  if (!lyrics.synced.length) {
    return setLines('', '', '', lyrics.plain ? 'Paroles non synchronisées' : 'Pas de paroles trouvées');
  }

  const index = currentLineIndex(lyrics.synced, progressMs + state.offsetMs);
  if (index === state.lineIndex) return;
  state.lineIndex = index;

  const lines = lyrics.synced;
  const hint = track.progressMs == null ? 'position estimée · ← → pour recaler' : '';
  setLines(show(lines[index - 1]), index < 0 ? '♪' : show(lines[index]), show(lines[index + 1]), hint);

  // Relance l'animation d'entrée de la ligne courante
  ui.current.classList.remove('enter');
  void ui.current.offsetWidth; // force le navigateur à "oublier" l'ancienne animation
  ui.current.classList.add('enter');
}

// ─────────────── Changement de chanson ───────────────
async function onTrackChange(track) {
  state.lyrics = null;
  state.lineIndex = -2;
  state.offsetMs = 0;
  state.clockMs = 0;

  if (!track) {
    ui.nowPlaying.hidden = true;
    document.title = 'spotifyclip';
    return;
  }

  ui.nowPlaying.hidden = !ui.welcome.hidden;
  ui.title.textContent = track.title;
  ui.artist.textContent = [track.artists.join(', '), track.app].filter(Boolean).join(' · ');
  document.title = `${track.title} · spotifyclip`;
  setLines('', '', '', 'Recherche des paroles…');

  const lyrics = await fetchLyrics(track);
  if (state.track?.id !== track.id) return; // la chanson a changé entre-temps
  state.lyrics = lyrics;
}

// La pochette peut arriver un peu après le titre : on la gère à part
async function onCoverChange(url) {
  state.cover = url;
  ui.cover.src = url || '';
  ui.cover.style.visibility = url ? 'visible' : 'hidden';
  const palette = url ? await extractPalette(url) : DEFAULT_PALETTE;
  if (state.cover === url) visuals.setPalette(palette);
}

// ─────────────── Boucle 1 : interroger le pont ───────────────
async function poll() {
  try {
    const track = await getNowPlaying();
    hideProblem();
    if (track !== undefined) {
      const changed = (track?.id ?? null) !== (state.track?.id ?? null);
      state.track = track;
      if (changed) onTrackChange(track);
      const cover = track?.cover ?? '';
      if (cover !== state.cover) onCoverChange(cover);
    }
  } catch (err) {
    if (err.message === 'UNSUPPORTED') {
      showProblem(`<p class="error">Le pont lit la musique via <strong>Windows</strong> : il ne marche pas sur ce système.<br>
        Pour tester quand même, lance <code>npm run demo</code>.</p>`);
    } else {
      showProblem(`<p class="error">Le serveur local ne répond pas.<br>
        Ouvre un terminal dans le dossier du projet et lance <code>npm run dev</code>.</p>`);
    }
  }
  setTimeout(poll, document.hidden ? 3000 : 500);
}

// Position actuelle dans la chanson
function currentProgress() {
  const t = state.track;
  if (!t) return 0;
  if (t.progressMs == null) return state.clockMs; // chrono de secours
  const elapsed = t.isPlaying ? performance.now() - t.fetchedAt : 0;
  const ms = t.progressMs + elapsed;
  return t.durationMs ? Math.min(ms, t.durationMs) : ms;
}

// ─────────────── Boucle 2 : animation (≈ 60 images/s) ───────────────
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const timeSec = now / 1000;
  const playing = state.track?.isPlaying ?? false;
  if (playing) state.clockMs += dt * 1000;
  const progressMs = currentProgress();

  audio.update(timeSec, playing);
  visuals.update(timeSec, dt, audio);
  renderLyrics(progressMs);

  document.documentElement.style.setProperty('--pulse', audio.bass.toFixed(3));
  const duration = state.track?.durationMs;
  ui.progress.style.width = duration ? `${(progressMs / duration) * 100}%` : '0';
  requestAnimationFrame(frame);
}

// ─────────────── Boutons & clavier ───────────────
function updateAudioButtons(source) {
  ui.btnSystem.classList.toggle('on', source === 'system');
  ui.btnMic.classList.toggle('on', source === 'mic');
  ui.audioStatus.textContent = { system: 'son du PC', mic: 'micro', none: 'son simulé' }[source];
}
audio.onSourceChange = updateAudioButtons;

ui.btnSystem.addEventListener('click', async () => {
  if (audio.source === 'system') return audio.stop();
  try {
    await audio.useSystemAudio();
    toast('Son du PC capté. Les visuels suivent maintenant la musique.');
  } catch (err) {
    if (err.message === 'NO_AUDIO_TRACK') {
      toast('Pas de son reçu : choisis "Écran entier" et coche "Partager l\'audio du système".', 6000);
    } else if (err.name !== 'NotAllowedError') {
      toast('Capture du son impossible dans ce navigateur. Essaie Chrome ou Edge.', 5000);
    }
  }
});

ui.btnMic.addEventListener('click', async () => {
  if (audio.source === 'mic') return audio.stop();
  try {
    await audio.useMicrophone();
    toast('Micro activé.');
  } catch {
    toast('Micro refusé ou introuvable.');
  }
});

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}
ui.btnFull.addEventListener('click', toggleFullscreen);

window.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  // ← → : avancer ou retarder les paroles si elles sont décalées
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const step = state.track?.progressMs == null ? 1000 : 200; // pas plus grand en mode estimé
    state.offsetMs += e.key === 'ArrowRight' ? step : -step;
    state.lineIndex = -2;
    toast(`Décalage des paroles : ${state.offsetMs > 0 ? '+' : ''}${(state.offsetMs / 1000).toFixed(1)} s`);
  }
});

// Cache les contrôles quand la souris ne bouge plus (mode "clip")
let idleTimer;
function wake() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (state.track) document.body.classList.add('idle');
  }, 3000);
}
['mousemove', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, wake));

// ─────────────── Démarrage ───────────────
ui.controls.hidden = false;
wake();
requestAnimationFrame(frame);
poll();

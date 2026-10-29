// ─────────────────────────────────────────────────────────────
// audio.js — "L'oreille" de l'app
//
// Spotify ne nous donne pas le son. Alors on écoute ce qui sort
// de l'ordinateur (partage d'écran avec "Partager l'audio du système")
// ou, à défaut, le micro. La Web Audio API découpe le son en
// fréquences (FFT) : basses, médiums, aigus. On en tire aussi les
// "beats" (coups de grosse caisse) pour faire réagir l'image.
//
// Sans source audio, on simule une pulsation douce : l'app reste jolie.
// ─────────────────────────────────────────────────────────────

export class AudioReactor {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.stream = null;
    this.freq = null;
    this.source = 'none'; // 'system' | 'mic' | 'none'

    // Valeurs publiques, entre 0 et 1, lues par les visuels
    this.bass = 0;
    this.mid = 0;
    this.treble = 0;
    this.level = 0;
    this.beat = 0; // vaut 1 au moment d'un beat puis redescend

    this.peak = 0.25; // gain automatique : s'adapte au volume
    this.bassHistory = [];
    this.lastBeatAt = 0;
    this.onSourceChange = () => {};
  }

  // Capture du son de l'ordinateur (Chrome / Edge sous Windows).
  // Il faut choisir "Écran entier" et cocher "Partager l'audio du système".
  async useSystemAudio() {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
      systemAudio: 'include',
    });
    if (!stream.getAudioTracks().length) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('NO_AUDIO_TRACK');
    }
    // On n'a pas besoin de l'image : on la met en pause pour économiser.
    stream.getVideoTracks().forEach((t) => { t.enabled = false; });
    this.#connect(stream, 'system');
  }

  async useMicrophone() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.#connect(stream, 'mic');
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.analyser = null;
    this.source = 'none';
    this.onSourceChange(this.source);
  }

  #connect(stream, kind) {
    this.stop();
    this.ctx ??= new AudioContext();
    this.ctx.resume();
    const node = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.75;
    node.connect(this.analyser); // PAS vers les haut-parleurs : sinon écho
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.stream = stream;
    this.source = kind;
    this.peak = 0.25;
    // Si l'utilisateur arrête le partage depuis la barre du navigateur
    stream.getAudioTracks()[0].addEventListener('ended', () => this.stop());
    this.onSourceChange(this.source);
  }

  // Moyenne d'énergie entre deux fréquences (en Hz)
  #band(fromHz, toHz) {
    const hzPerBin = this.ctx.sampleRate / this.analyser.fftSize;
    const from = Math.max(1, Math.floor(fromHz / hzPerBin));
    const to = Math.min(this.freq.length - 1, Math.ceil(toHz / hzPerBin));
    let sum = 0;
    for (let i = from; i <= to; i++) sum += this.freq[i];
    return sum / ((to - from + 1) * 255);
  }

  // Appelée à chaque image (≈ 60 fois par seconde)
  update(timeSec, isPlaying) {
    let bass, mid, treble;

    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.freq);
      bass = this.#band(20, 150);
      mid = this.#band(150, 2000);
      treble = this.#band(2000, 9000);
      // Gain automatique : la valeur la plus forte récente devient "1"
      this.peak = Math.max(this.peak * 0.995, bass, mid * 1.4, 0.08);
      bass = Math.min(1, bass / this.peak);
      mid = Math.min(1, (mid * 1.4) / this.peak);
      treble = Math.min(1, (treble * 2.2) / this.peak);
    } else {
      // Simulation : une pulsation à ~100 BPM, plus calme en pause
      const amp = isPlaying ? 1 : 0.25;
      const phase = (timeSec * 100) / 60;
      const kick = Math.pow(1 - (phase % 1), 4);
      bass = amp * (0.25 + 0.55 * kick);
      mid = amp * (0.35 + 0.15 * Math.sin(timeSec * 0.7));
      treble = amp * (0.2 + 0.1 * Math.sin(timeSec * 1.9));
    }

    // Lissage : monte vite, redescend doucement (plus agréable à l'œil)
    const smooth = (prev, next) => (next > prev ? prev + (next - prev) * 0.6 : prev + (next - prev) * 0.12);
    this.bass = smooth(this.bass, bass);
    this.mid = smooth(this.mid, mid);
    this.treble = smooth(this.treble, treble);
    this.level = (this.bass + this.mid + this.treble) / 3;

    // Détection de beat : les basses dépassent nettement leur moyenne récente
    this.bassHistory.push(bass);
    if (this.bassHistory.length > 45) this.bassHistory.shift();
    const avg = this.bassHistory.reduce((a, b) => a + b, 0) / this.bassHistory.length;
    const now = timeSec * 1000;
    if (bass > avg * 1.3 && bass > 0.3 && now - this.lastBeatAt > 280) {
      this.beat = 1;
      this.lastBeatAt = now;
    } else {
      this.beat *= 0.9;
    }
  }
}

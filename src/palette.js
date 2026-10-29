// ─────────────────────────────────────────────────────────────
// palette.js — Extrait 3 couleurs de la pochette de l'album
//
// On dessine la pochette en tout petit (32×32 pixels), on regroupe
// les pixels par couleurs proches, puis on garde les couleurs les
// plus présentes ET les plus vives. Résultat : l'ambiance du clip
// colle automatiquement à l'univers visuel de l'album.
// ─────────────────────────────────────────────────────────────

export const DEFAULT_PALETTE = [
  [0.95, 0.35, 0.55], // rose
  [0.35, 0.45, 1.0],  // bleu
  [1.0, 0.8, 0.4],    // or
];

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) return [l, l, l];
  const hue = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
}

// Rend une couleur assez vive et lumineuse pour briller sur fond sombre
function vivid([r, g, b]) {
  const [h, s, l] = rgbToHsl(r, g, b);
  return hslToRgb(h, Math.max(s, 0.55), Math.min(Math.max(l, 0.55), 0.72));
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function extractPalette(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(DEFAULT_PALETTE);
    const img = new Image();
    img.crossOrigin = 'anonymous'; // nécessaire pour lire les pixels
    img.onerror = () => resolve(DEFAULT_PALETTE);
    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        // Regroupe les pixels en "seaux" de couleurs proches
        const buckets = new Map();
        for (let i = 0; i < data.length; i += 4) {
          const rgb = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
          const key = rgb.map((c) => Math.round(c * 7)).join(',');
          const bucket = buckets.get(key) || { sum: [0, 0, 0], count: 0 };
          bucket.sum = bucket.sum.map((v, j) => v + rgb[j]);
          bucket.count++;
          buckets.set(key, bucket);
        }

        // Score = présence × vivacité
        const candidates = [...buckets.values()]
          .map(({ sum, count }) => {
            const rgb = sum.map((v) => v / count);
            const [, s, l] = rgbToHsl(...rgb);
            const score = count * (0.3 + s) * (l > 0.08 && l < 0.95 ? 1 : 0.2);
            return { rgb, score };
          })
          .sort((a, b) => b.score - a.score);

        // Garde 3 couleurs bien différentes entre elles
        const picked = [];
        for (const { rgb } of candidates) {
          if (picked.every((p) => distance(p, rgb) > 0.25)) picked.push(rgb);
          if (picked.length === 3) break;
        }
        while (picked.length < 3) picked.push(DEFAULT_PALETTE[picked.length]);
        resolve(picked.map(vivid));
      } catch {
        resolve(DEFAULT_PALETTE); // pixels illisibles (CORS) → palette par défaut
      }
    };
    img.src = url;
  });
}

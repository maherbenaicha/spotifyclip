import { defineConfig } from 'vite';
import { nowPlayingBridge } from './bridge/plugin.js';

// `npm run dev`  → lit la musique en cours via Windows
// `npm run demo` → joue une fausse chanson (pour tester n'importe où)
export default defineConfig(({ mode }) => ({
  plugins: [nowPlayingBridge({ demo: mode === 'demo' })],
  server: {
    host: '127.0.0.1',
    port: 8888,
    open: true,
  },
  build: {
    chunkSizeWarningLimit: 800, // Three.js est gros, c'est normal
  },
}));

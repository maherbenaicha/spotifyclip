// ─────────────────────────────────────────────────────────────
// bridge/plugin.js — Relie le pont Windows à l'application web
//
// Une page web n'a pas le droit de parler directement à Windows.
// Alors, quand tu lances `npm run dev`, ce plugin démarre en coulisse
// le script PowerShell (now-playing.ps1), lit ses lignes JSON, et
// les met à disposition de la page via deux adresses :
//
//   GET /api/now-playing  → { status, track }
//   GET /api/cover        → l'image de la pochette
//
// En mode démo (`npm run demo`), il lance bridge/demo.js à la place :
// une fausse chanson, pour tester sans Spotify ni Windows.
// ─────────────────────────────────────────────────────────────

import { spawn } from 'node:child_process';
import path from 'node:path';

export function nowPlayingBridge({ demo = false } = {}) {
  let state = { status: 'starting', track: null };
  let receivedAt = Date.now();
  let cover = null; // { type, data: Buffer, version }
  let coverVersion = 0;
  let child = null;
  let stopped = false;

  function handleLine(line) {
    let msg;
    try {
      msg = JSON.parse(line.replace(/^﻿/, ''));
    } catch {
      return; // ligne illisible : on l'ignore
    }
    if (msg.type === 'ready') {
      state = { status: 'ok', track: null };
    } else if (msg.type === 'state') {
      receivedAt = Date.now();
      const track = msg.track?.title ? msg.track : null;
      if (msg.cover?.data && track) {
        coverVersion++;
        cover = { type: msg.cover.type, data: Buffer.from(msg.cover.data, 'base64'), key: track.key, version: coverVersion };
      }
      state = { status: 'ok', track };
    } else if (msg.type === 'error') {
      console.warn('[pont] erreur Windows :', msg.message);
    }
  }

  function start(root) {
    if (!demo && process.platform !== 'win32') {
      state = { status: 'unsupported', track: null };
      console.warn('[pont] Le pont fonctionne uniquement sous Windows. Essaie `npm run demo`.');
      return;
    }
    const command = demo ? process.execPath : 'powershell.exe';
    const args = demo
      ? [path.join(root, 'bridge', 'demo.js')]
      : ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'bridge', 'now-playing.ps1')];

    child = spawn(command, args, { windowsHide: true });
    console.log(demo ? '[pont] mode démo lancé' : '[pont] lecture du média Windows lancée');

    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) handleLine(line);
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (text) => console.warn('[pont]', text.trim()));

    child.on('error', (err) => {
      state = { status: 'error', track: null, message: `Impossible de lancer le pont : ${err.message}` };
    });
    // Si le pont s'arrête (bug, mise en veille...), on le relance après 3 s
    child.on('exit', (code) => {
      if (stopped) return;
      state = { status: 'error', track: null, message: `Le pont s'est arrêté (code ${code}), redémarrage…` };
      setTimeout(() => start(root), 3000);
    });
  }

  function stop() {
    stopped = true;
    child?.kill();
  }

  return {
    name: 'now-playing-bridge',
    apply: 'serve',
    configureServer(server) {
      start(server.config.root);
      server.httpServer?.on('close', stop);
      process.on('exit', stop);

      server.middlewares.use('/api/now-playing', (req, res) => {
        let track = state.track;
        if (track) {
          // Ajoute le temps écoulé depuis la dernière lecture du pont
          let positionMs = track.positionMs;
          if (track.isPlaying && positionMs != null) {
            positionMs = Math.min(positionMs + (Date.now() - receivedAt), track.durationMs);
          }
          const coverOk = cover && cover.key === track.key;
          track = { ...track, positionMs, coverVersion: coverOk ? cover.version : 0 };
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ ...state, track }));
      });

      server.middlewares.use('/api/cover', (req, res) => {
        if (!cover) {
          res.statusCode = 404;
          return res.end();
        }
        res.setHeader('Content-Type', cover.type);
        res.setHeader('Cache-Control', 'no-store');
        res.end(cover.data);
      });
    },
  };
}

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

test('shell describes a public online library and includes loading, retry, and track list states', () => {
  for (const id of ['catalog-status', 'catalog-retry', 'track-count', 'track-list', 'empty-state']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(html, /Biblioteca pública/);
  assert.match(html, /internet/);
  assert.match(html, /rel=["']manifest["']/);
});

test('shell no longer loads local database or exposes MP3 import controls', () => {
  assert.doesNotMatch(html, /id=["'](?:file-input|folder-input|start-import|choose-quest-folder|clear-library)["']/);
  assert.doesNotMatch(html, /<script[^>]+(?:db\.js|metadata\.js|jsmediatags)/);
});

test('player exposes native streaming transport, seek, volume, loop, shuffle, and folder scope', () => {
  for (const id of ['audio-deck', 'play-toggle', 'previous-track', 'next-track', 'seek-control', 'volume-control', 'loop-toggle', 'shuffle-toggle', 'folder-filter-options']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(html, /<audio id="audio-deck" preload="metadata"><\/audio>/);
  assert.doesNotMatch(html, /crossorigin/i);
});

test('PWA manifest says the audio streams and updates use a new shell cache version', () => {
  assert.match(manifest.description, /streaming/i);
  assert.match(serviceWorker, /64-media-player-shell-v5/);
});

test('offline shell includes the public catalog and never caches MP3 assets', () => {
  assert.match(serviceWorker, /music-catalog\.json/);
  assert.match(serviceWorker, /64-media-player-shell-v\d+/);
  assert.doesNotMatch(serviceWorker, /db\.js|music\/|release-assets|\.mp3/i);
  assert.match(serviceWorker, /new URL\(event\.request\.url\)\.origin !== self\.location\.origin/);
});

test('stage four shell exposes search, favorites, queue, history, and accessible queue actions', () => {
  for (const id of ['track-search', 'favorites-only', 'queue-panel', 'history-panel', 'queue-list', 'history-list', 'clear-history']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  const combined = `${html}\n${appSource}`;
  assert.match(combined, /data-favorite-id/);
  assert.match(combined, /data-queue-id/);
  assert.match(combined, /data-play-next-id/);
  assert.match(combined, /aria-label=["'][^"']*(?:mover|remover|fila|favorito|hist.rico)/i);
  assert.match(appSource, /audio\.addEventListener\('playing'/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

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

test('offline shell includes the public catalog and never caches MP3 assets', () => {
  assert.match(serviceWorker, /music-catalog\.json/);
  assert.match(serviceWorker, /64-media-player-shell-v\d+/);
  assert.doesNotMatch(serviceWorker, /db\.js|music\/|release-assets|\.mp3/i);
  assert.match(serviceWorker, /new URL\(event\.request\.url\)\.origin !== self\.location\.origin/);
});

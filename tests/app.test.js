const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadApp() {
  const window = { URL };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), { window });
  return window.PlayerApp;
}

test('loads a valid catalog with public HTTPS asset URLs', async () => {
  const app = loadApp();
  const track = { id: 'track-1', assetName: 'track-a.mp3', name: 'a.mp3', title: 'Live', artist: 'Band', album: '', folder: 'Rock', size: 42, duration: null, mimeType: 'audio/mpeg', url: 'https://github.com/example/asset.mp3' };
  const tracks = await app.loadCatalog('./music-catalog.json', async (url) => ({ ok: true, async json() { assert.equal(url, './music-catalog.json'); return { version: 1, tracks: [track] }; } }));
  assert.deepEqual(tracks.map((item) => item.title), ['Live']);
});

test('accepts an empty public catalog', async () => {
  const app = loadApp();
  assert.deepEqual(await app.loadCatalog('./music-catalog.json', async () => ({ ok: true, async json() { return { version: 1, tracks: [] }; } })), []);
});

test('rejects malformed catalogs and non-public audio URLs', async () => {
  const app = loadApp();
  await assert.rejects(app.loadCatalog('./music-catalog.json', async () => ({ ok: true, async json() { return { version: 2, tracks: [] }; } })), /catálogo/);
  await assert.rejects(app.loadCatalog('./music-catalog.json', async () => ({ ok: true, async json() { return { version: 1, tracks: [{ id: 'x', title: 'x', url: 'blob:local' }] }; } })), /catálogo/);
});

test('reports catalog fetch and HTTP errors', async () => {
  const app = loadApp();
  await assert.rejects(app.loadCatalog('./music-catalog.json', async () => { throw new Error('offline'); }), /offline/);
  await assert.rejects(app.loadCatalog('./music-catalog.json', async () => ({ ok: false, status: 503 })), /503/);
});

test('virtual window clamps scroll offsets after a large list deletion', () => {
  const app = loadApp();
  const window = app.virtualWindow(20, 50000, 520);
  assert.equal(window.start < 20, true);
  assert.equal(window.end, 20);
  assert.equal(window.top + window.bottom + (window.end - window.start) * 88, 20 * 88);
});

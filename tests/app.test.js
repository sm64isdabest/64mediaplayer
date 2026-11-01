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

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
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

const tracks = [
  { id: 'a', folder: 'Rock' },
  { id: 'b', folder: 'Pop' },
  { id: 'c', folder: 'Rock' },
  { id: 'd', folder: 'Jazz' },
];

test('shuffle creates a full Fisher-Yates cycle without duplicate IDs', () => {
  const app = loadApp();
  const order = app.buildPlayOrder(tracks, true, () => 0.25);
  assert.equal(order.length, tracks.length);
  assert.deepEqual([...order].sort(), ['a', 'b', 'c', 'd']);
});

test('next shuffle cycle contains every track and avoids an immediate repeat', () => {
  const app = loadApp();
  const order = app.buildNextCycle(tracks, 'a', true, () => 0.5);
  assert.equal(order[order.length - 1], 'a');
  assert.deepEqual([...order].sort(), ['a', 'b', 'c', 'd']);
  assert.notEqual(app.adjacentTrackId(order, 'a', 'next', 'all', true), 'a');
});

test('new shuffle cycle pins the current track first', () => {
  const app = loadApp();
  assert.equal(app.buildPlayOrder(tracks, true, () => 0.1, 'c')[0], 'c');
});

test('linear playback keeps catalog order when a middle track is selected', () => {
  const app = loadApp();
  assert.deepEqual([...app.buildPlayOrder(tracks, false, Math.random, 'c')], ['a', 'b', 'c', 'd']);
});

test('adjacent track navigation handles loop boundaries and automatic track repeat', () => {
  const app = loadApp();
  assert.equal(app.adjacentTrackId(['a', 'b', 'c'], 'b', 'next', 'off', false), 'c');
  assert.equal(app.adjacentTrackId(['a', 'b', 'c'], 'a', 'previous', 'off', false), 'a');
  assert.equal(app.adjacentTrackId(['a', 'b', 'c'], 'c', 'next', 'all', true), 'a');
  assert.equal(app.adjacentTrackId(['a', 'b', 'c'], 'a', 'next', 'track', true), 'a');
  assert.equal(app.adjacentTrackId(['a', 'b', 'c'], 'a', 'next', 'track', false), 'b');
});

test('folder scope selects one or multiple folders and empty selection means all', () => {
  const app = loadApp();
  assert.deepEqual([...app.filterByFolders(tracks, [])].map((track) => track.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual([...app.filterByFolders(tracks, ['Rock', 'Jazz'])].map((track) => track.id), ['a', 'c', 'd']);
});

test('choosing all folders clears previous folder selections', () => {
  const app = loadApp();
  const selected = app.nextFolderSelection(['Rock', 'Jazz'], 'Jazz', true, true);
  assert.equal(selected.size, 0);
});

test('seek clamps finite values and ignores unknown duration', () => {
  const app = loadApp();
  assert.equal(app.seekTarget(20, 10), 10);
  assert.equal(app.seekTarget(-2, 10), 0);
  assert.equal(app.seekTarget(Number.NaN, 10), null);
  assert.equal(app.seekTarget(2, Number.NaN), null);
});

test('Media Session is optional and unsupported actions do not block supported handlers', () => {
  const app = loadApp();
  assert.equal(app.configureMediaSession(null, {}, {}), false);
  const actions = new Map();
  const session = {
    setActionHandler(name, handler) {
      if (name === 'nexttrack') throw new Error('unsupported');
      actions.set(name, handler);
    },
  };
  const metadata = { title: 'Track' };
  class MediaMetadataMock { constructor(value) { Object.assign(this, value); } }
  assert.equal(app.configureMediaSession(session, metadata, { play() {}, nexttrack() {} }, MediaMetadataMock), true);
  assert.equal(session.metadata.title, 'Track');
  assert.equal(actions.has('play'), true);
  assert.equal(actions.has('nexttrack'), false);
});

test('search matches normalized metadata and combines query with favorite filtering', () => {
  const app = loadApp();
  const catalog = [
    { id: 'a', title: 'Coração Valente', artist: 'Björk', album: 'Ao Vivo', folder: 'Música Brasileira' },
    { id: 'b', title: 'Valente', artist: 'Outro', album: '', folder: 'Rock' },
    { id: 'c', title: 'Noite', artist: 'Björk', album: '', folder: 'Rock' },
  ];
  assert.deepEqual([...app.searchTracks(catalog, 'coracao', false, [])].map((track) => track.id), ['a']);
  assert.deepEqual([...app.searchTracks(catalog, 'bjork', true, ['c'])].map((track) => track.id), ['c']);
  assert.deepEqual([...app.searchTracks(catalog, 'rock', false, [])].map((track) => track.id), ['b', 'c']);
});

test('favorite toggle adds and removes IDs without duplicates', () => {
  const app = loadApp();
  assert.deepEqual([...app.toggleFavorite(['a'], 'b')], ['a', 'b']);
  assert.deepEqual([...app.toggleFavorite(['a', 'a', 'b'], 'a')], ['b']);
});

test('play history preserves repeated plays newest first and caps at 100 entries', () => {
  const app = loadApp();
  const history = [{ trackId: 'a', playedAt: 1 }];
  const repeated = app.recordPlay(history, 'a', 2);
  assert.deepEqual(toPlain(repeated), [{ trackId: 'a', playedAt: 2 }, { trackId: 'a', playedAt: 1 }]);
  const full = Array.from({ length: 100 }, (_, index) => ({ trackId: String(index), playedAt: index }));
  const capped = app.recordPlay(full, 'new', 1000);
  assert.equal(capped.length, 100);
  assert.deepEqual(toPlain(capped[0]), { trackId: 'new', playedAt: 1000 });
  assert.equal(capped.some((entry) => entry.trackId === '99'), false);
});

test('queue inserts next, reorders and removes without mutating and ignores invalid indexes', () => {
  const app = loadApp();
  const queue = ['a', 'b', 'a'];
  assert.deepEqual([...app.insertQueueNext(queue, 'c')], ['c', 'a', 'b', 'a']);
  assert.deepEqual([...app.moveQueueItem(queue, 2, 0)], ['a', 'a', 'b']);
  assert.deepEqual([...app.moveQueueItem(queue, -1, 1)], queue);
  assert.deepEqual([...app.moveQueueItem(queue, 0, 3)], queue);
  assert.deepEqual([...app.removeQueueItem(queue, 1)], ['a', 'a']);
  assert.deepEqual([...app.removeQueueItem(queue, 9)], queue);
  assert.deepEqual(queue, ['a', 'b', 'a']);
});

test('stored JSON helpers fall back safely when storage or JSON is unavailable', () => {
  const app = loadApp();
  const fallback = ['safe'];
  assert.deepEqual([...app.loadStoredJson(null, 'key', fallback)], ['safe']);
  assert.deepEqual([...app.loadStoredJson({ getItem: () => '{bad json' }, 'key', fallback)], ['safe']);
  assert.deepEqual([...app.loadStoredJson({ getItem: () => { throw new Error('blocked'); } }, 'key', fallback)], ['safe']);
  assert.equal(app.saveStoredJson(null, 'key', ['value']), false);
  let stored = null;
  assert.equal(app.saveStoredJson({ setItem(key, value) { stored = [key, value]; } }, 'key', ['value']), true);
  assert.deepEqual(stored, ['key', '["value"]']);
  assert.equal(app.saveStoredJson({ setItem() { throw new Error('blocked'); } }, 'key', []), false);
});

test('catalog reconciliation drops orphaned favorites and history entries', () => {
  const app = loadApp();
  const reconciled = app.reconcileCatalogState(
    ['a', 'missing', 'a'],
    [{ trackId: 'missing', playedAt: 1 }, { trackId: 'b', playedAt: 2 }, { trackId: 'b', playedAt: 3 }],
    [{ id: 'a' }, { id: 'b' }],
  );
  assert.deepEqual(toPlain(reconciled), {
    favorites: ['a'],
    history: [{ trackId: 'b', playedAt: 2 }, { trackId: 'b', playedAt: 3 }],
  });
});

test('queue consumption returns its first track and preserves repeated upcoming entries', () => {
  const app = loadApp();
  assert.deepEqual(toPlain(app.consumeQueue(['a', 'a', 'b'])), { trackId: 'a', queue: ['a', 'b'] });
  assert.deepEqual(toPlain(app.consumeQueue([])), { trackId: null, queue: [] });
});

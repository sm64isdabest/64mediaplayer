const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

async function publisher() {
  return import('../scripts/publish-music.mjs');
}

test('asset identity is stable across separators and Unicode normalization', async () => {
  const { createCatalogEntries } = await publisher();
  const files = [{ relativePath: 'Álbum\\Faixa.mp3', name: 'Faixa.mp3', size: 100, type: 'audio/mpeg' }];
  const normalized = [{ relativePath: 'A\u0301lbum/Faixa.mp3', name: 'Faixa.mp3', size: 100, type: 'audio/mpeg' }];
  const first = createCatalogEntries(files, {}, [])[0];
  const second = createCatalogEntries(normalized, {}, [])[0];
  assert.equal(first.id, second.id);
  assert.equal(first.assetName, second.assetName);
  assert.match(first.assetName, /^track-[a-f0-9]{32}\.mp3$/);
});

test('catalog entry uses ID3 fields and the public release asset URL', async () => {
  const { createCatalogEntries } = await publisher();
  const file = { relativePath: 'Rock/track.mp3', name: 'track.mp3', size: 2048, type: 'audio/mpeg' };
  const metadata = { 'Rock/track.mp3': { title: 'Live set', artist: 'Band', album: 'Tour', duration: 77 } };
  const asset = { name: createCatalogEntries([file], metadata, [])[0].assetName, browser_download_url: 'https://release-assets.example/track.mp3' };
  const [track] = createCatalogEntries([file], metadata, [asset]);
  assert.deepEqual(
    { title: track.title, artist: track.artist, album: track.album, folder: track.folder, duration: track.duration, url: track.url },
    { title: 'Live set', artist: 'Band', album: 'Tour', folder: 'Rock', duration: 77, url: 'https://release-assets.example/track.mp3' },
  );
});

test('missing tags use the filename without its extension', async () => {
  const { readTags } = await publisher();
  const result = await readTags(path.join(__dirname, 'does-not-exist.mp3'));
  assert.equal(result.title, 'does-not-exist');
  assert.equal(result.artist, '');
  assert.equal(result.album, '');
  assert.equal(result.duration, null);
});

test('library validation rejects non-MP3 files and tracks larger than 2 GiB', async () => {
  const { validateLibrary } = await publisher();
  const files = [
    { relativePath: 'cover.jpg', name: 'cover.jpg', size: 10 },
    { relativePath: 'large.mp3', name: 'large.mp3', size: 2 ** 31 },
  ];
  const result = validateLibrary(files, []);
  assert.ok(result.errors.some((error) => error.code === 'invalid-type'));
  assert.ok(result.errors.some((error) => error.code === 'file-too-large'));
});

test('library validation enforces the one thousand asset limit and reports missing assets', async () => {
  const { validateLibrary } = await publisher();
  const files = Array.from({ length: 1001 }, (_, index) => ({ relativePath: `track-${index}.mp3`, name: `track-${index}.mp3`, size: 1 }));
  const result = validateLibrary(files, []);
  assert.ok(result.errors.some((error) => error.code === 'too-many-assets'));
  assert.equal(result.missingAssets.length, 1001);
});

test('catalog validation catches normalized duplicate paths', async () => {
  const { validateLibrary } = await publisher();
  const files = [
    { relativePath: 'Album\\track.mp3', name: 'track.mp3', size: 1 },
    { relativePath: 'Album/track.mp3', name: 'track.mp3', size: 1 },
  ];
  const result = validateLibrary(files, []);
  assert.ok(result.errors.some((error) => error.code === 'duplicate-path'));
});

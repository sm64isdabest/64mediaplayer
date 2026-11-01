const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { createHash } = require('node:crypto');

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

test('library validation catches assets that do not match local MP3 digests', async () => {
  const { validateLibrary, makeAssetName } = await publisher();
  const file = { relativePath: 'track.mp3', name: 'track.mp3', size: 10, digest: 'sha256:local' };
  const result = validateLibrary([file], [{ name: makeAssetName(file.relativePath), size: 10, digest: 'sha256:remote', browser_download_url: 'https://asset/track' }]);
  assert.ok(result.errors.some((error) => error.code === 'asset-integrity'));
});

test('library validation catches stale release assets and rejects an empty library', async () => {
  const { validateLibrary, makeAssetName } = await publisher();
  const file = { relativePath: 'track.mp3', name: 'track.mp3', size: 10 };
  const result = validateLibrary([file], [
    { name: makeAssetName(file.relativePath), size: 10, browser_download_url: 'https://asset/track' },
    { name: 'stale.mp3', size: 4, browser_download_url: 'https://asset/stale' },
  ]);
  assert.ok(result.errors.some((error) => error.code === 'unexpected-asset'));
  assert.ok(validateLibrary([], []).errors.some((error) => error.code === 'empty-library'));
});

test('upload plan skips matching digests and replaces only changed assets', async () => {
  const { buildUploadPlan, makeAssetName } = await publisher();
  const files = [
    { relativePath: 'same.mp3', name: 'same.mp3', size: 10, digest: 'sha256:one' },
    { relativePath: 'changed.mp3', name: 'changed.mp3', size: 20, digest: 'sha256:new' },
    { relativePath: 'new.mp3', name: 'new.mp3', size: 30, digest: 'sha256:three' },
  ];
  const existing = [
    { name: makeAssetName('same.mp3'), digest: 'sha256:one', size: 10, browser_download_url: 'https://asset/same' },
    { name: makeAssetName('changed.mp3'), digest: 'sha256:old', size: 20, browser_download_url: 'https://asset/old' },
  ];
  const plan = buildUploadPlan(files, existing);
  assert.deepEqual(plan.map((item) => item.action), ['skip', 'replace', 'upload']);
});

test('asset pages returned by the API are flattened without dropping later pages', async () => {
  const { flattenAssetPages } = await publisher();
  const pages = [[{ name: 'a' }, { name: 'b' }], [{ name: 'c' }]];
  assert.deepEqual(flattenAssetPages(pages).map((asset) => asset.name), ['a', 'b', 'c']);
});

test('failed upload leaves the previous catalog file untouched', async () => {
  const { publishLibrary } = await publisher();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'music-publish-test-'));
  try {
    await fs.mkdir(path.join(root, 'music'));
    await fs.writeFile(path.join(root, 'music', 'test.mp3'), Buffer.from('not an MP3 but the metadata fallback accepts it'));
    const output = path.join(root, 'music-catalog.json');
    const oldCatalog = '{"version":1,"tracks":[]}';
    await fs.writeFile(output, oldCatalog);
    const client = {
      async ensureAuth() {},
      async ensureRelease() {},
      async listAssets() { return []; },
      async uploadFile() { throw new Error('simulated upload interruption'); },
    };
    await assert.rejects(publishLibrary({ root, publish: true, client }), /upload interruption/);
    assert.equal(await fs.readFile(output, 'utf8'), oldCatalog);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('successful publication verifies assets before writing catalog and skips them on rerun', async () => {
  const { publishLibrary, makeAssetName } = await publisher();
  const root = await fs.mkdtemp(path.join(__dirname, '.music-publish-success-'));
  const assets = new Map();
  let uploads = 0;
  try {
    await fs.mkdir(path.join(root, 'music'));
    await fs.writeFile(path.join(root, 'music', 'nested.mp3'), Buffer.from('sample audio bytes'));
    const client = {
      async ensureAuth() {},
      async ensureRelease() {},
      async listAssets() { return [...assets.values()]; },
      async uploadFile(file, name) {
        const bytes = await fs.readFile(file.filePath);
        uploads++;
        assets.set(name, {
          id: uploads,
          name,
          size: bytes.length,
          digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
          browser_download_url: `https://github.com/example/${name}`,
        });
      },
      clearAuth() {},
    };
    const first = await publishLibrary({ root, publish: true, client });
    assert.equal(first.catalog.tracks.length, 1);
    assert.match(first.catalog.tracks[0].url, /^https:\/\//);
    assert.equal(first.catalog.tracks[0].assetName, makeAssetName('nested.mp3'));
    assert.equal(first.uploaded, 1);
    const firstCatalog = await fs.readFile(path.join(root, 'music-catalog.json'), 'utf8');

    const second = await publishLibrary({ root, publish: true, client });
    assert.equal(second.uploaded, 0);
    assert.equal(uploads, 1);
    assert.equal(await fs.readFile(path.join(root, 'music-catalog.json'), 'utf8'), firstCatalog);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadMetadata(parser) {
  const context = { window: { jsmediatags: parser }, Blob, Uint8Array };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'metadata.js'), 'utf8'), context);
  return context.window.MediaMetadata;
}

test('metadata read falls back to the MP3 filename when ID3 tags cannot be read', async () => {
  const parser = { read: (_file, { onError }) => onError(new Error('no tags')) };
  const metadata = loadMetadata(parser);
  const result = await metadata.readMetadata({ name: 'Minha Faixa.mp3' });
  assert.equal(result.title, 'Minha Faixa');
  assert.equal(result.artist, '');
  assert.equal(result.album, '');
  assert.equal(result.cover, null);
});

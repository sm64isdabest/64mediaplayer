const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('shell exposes the import, progress, storage, and library controls', () => {
  for (const id of [
    'file-input',
    'folder-input',
    'import-cancel',
    'import-progress',
    'storage-used',
    'storage-available',
    'track-count',
    'track-list',
    'empty-state',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(html, /rel=["']manifest["']/);
});

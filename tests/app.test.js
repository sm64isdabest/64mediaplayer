const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadApp() {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), { window });
  return window.PlayerApp;
}

test('recognizes MP3 by extension when MIME is empty and rejects other types', () => {
  const app = loadApp();
  assert.equal(app.isMp3({ name: 'MIX.MP3', type: '' }), true);
  assert.equal(app.isMp3({ name: 'audio', type: 'audio/mpeg' }), true);
  assert.equal(app.isMp3({ name: 'track.ogg', type: 'audio/ogg' }), false);
});

test('keeps the relative folder path and uses the chosen collection as fallback', () => {
  const app = loadApp();
  assert.equal(app.folderFor({ name: 'song.mp3', webkitRelativePath: 'Albums/Live/song.mp3' }, ''), 'Albums/Live');
  assert.equal(app.folderFor({ name: 'song.mp3', webkitRelativePath: '' }, 'Concertos'), 'Concertos');
  assert.equal(app.folderFor({ name: 'song.mp3', webkitRelativePath: '' }, ''), 'Sem pasta');
});

test('formats storage measurements using readable binary units', () => {
  const app = loadApp();
  assert.equal(app.formatBytes(1536), '1.5 KB');
  assert.equal(app.formatBytes(1048576), '1.0 MB');
});

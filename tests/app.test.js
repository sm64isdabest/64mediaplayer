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

test('directory fallback hides only the folder picker, preserving file import', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(html, /id="folder-picker"/);
  assert.match(source, /folder-picker/);
});

test('batch cancellation state is isolated per import', () => {
  const app = loadApp();
  const first = app.createBatchControl();
  const second = app.createBatchControl();
  first.cancel();
  assert.equal(first.isCancelled(), true);
  assert.equal(second.isCancelled(), false);
});

test('persistence outcome has a dedicated status element', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(html, /id="storage-persistence"/);
  assert.match(source, /storage-persistence/);
});

test('virtual window clamps scroll offsets after a large list deletion', () => {
  const app = loadApp();
  const window = app.virtualWindow(20, 50000, 520);
  assert.equal(window.start < 20, true);
  assert.equal(window.end, 20);
  assert.equal(window.top + window.bottom + (window.end - window.start) * 88, 20 * 88);
});

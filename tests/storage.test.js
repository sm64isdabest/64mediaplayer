const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadDatabase() {
  const context = { window: {}, indexedDB: {}, IDBKeyRange: {}, console, crypto };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8'), context);
  return context.window.MusicDB;
}

test('duplicate keys normalize unicode and case while keeping byte size', () => {
  const db = loadDatabase();
  assert.equal(db.makeDuplicateKey('Música.MP3', 123), db.makeDuplicateKey('Mu\u0301sica.mp3', 123));
  assert.notEqual(db.makeDuplicateKey('Música.MP3', 123), db.makeDuplicateKey('Música.MP3', 124));
});

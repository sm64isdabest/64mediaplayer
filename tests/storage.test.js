const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadDatabase() {
  const context = { window: {}, indexedDB: new FakeIndexedDB(), IDBKeyRange: {}, console, crypto };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8'), context);
  return context.window.MusicDB;
}

class FakeIndexedDB {
  constructor() { this.db = null; this.version = 0; }
  open(name, version) {
    const request = {};
    queueMicrotask(() => {
      if (!this.db) this.db = new FakeDatabase(name);
      if (version > this.version) {
        this.version = version;
        this.db.version = version;
        request.result = this.db;
        request.transaction = new FakeTransaction(this.db, [], 'versionchange');
        request.onupgradeneeded?.();
      }
      request.result = this.db;
      request.onsuccess?.();
    });
    return request;
  }
}

class FakeDatabase {
  constructor(name) { this.name = name; this.stores = new Map(); this.objectStoreNames = { contains: (name) => this.stores.has(name) }; }
  createObjectStore(name, options) { const store = new FakeStore(name, options.keyPath); this.stores.set(name, store); return store; }
  transaction(names) { return new FakeTransaction(this, Array.isArray(names) ? names : [names]); }
}

class FakeStore {
  constructor(name, keyPath) { this.name = name; this.keyPath = keyPath; this.rows = new Map(); this.indexNames = { contains: (name) => name === 'duplicateKey' || name === 'folder' }; }
  createIndex() {}
  put(row) { const req = {}; queueMicrotask(() => { this.rows.set(row[this.keyPath], row); req.result = row[this.keyPath]; req.onsuccess?.(); }); return req; }
  get(key) { const req = {}; queueMicrotask(() => { req.result = this.rows.get(key); req.onsuccess?.(); }); return req; }
  getAll() { const req = {}; queueMicrotask(() => { req.result = [...this.rows.values()]; req.onsuccess?.(); }); return req; }
  delete(key) { const req = {}; queueMicrotask(() => { this.rows.delete(key); req.onsuccess?.(); }); return req; }
  clear() { this.rows.clear(); }
  index(name) { return { get: (key) => name === 'duplicateKey' ? this.get(key) : this.get(key) }; }
}

class FakeTransaction {
  constructor(db, names, mode = 'readwrite') {
    this.db = db; this.mode = mode; this.pending = 0;
    this.objectStore = (name) => db.stores.get(name);
    this.oncomplete = null; this.onerror = null; this.onabort = null;
    if (mode !== 'versionchange') this.scheduleComplete();
  }
  scheduleComplete() { queueMicrotask(() => { if (!this.pending) this.oncomplete?.(); }); }
}

test('duplicate keys normalize unicode and case while keeping byte size', () => {
  const db = loadDatabase();
  assert.equal(db.makeDuplicateKey('Música.MP3', 123), db.makeDuplicateKey('Mu\u0301sica.mp3', 123));
  assert.notEqual(db.makeDuplicateKey('Música.MP3', 123), db.makeDuplicateKey('Música.MP3', 124));
});

test('direct tracks store a folder reference without audio; blob fallback still stores audio', async () => {
  const db = loadDatabase();
  await db.saveFolderHandle('folder-1', 'Music', { kind: 'directory' });
  await db.saveDirectTrack({ id: 'direct-1', name: 'song.mp3', size: 12, folder: 'folder-1', relativePath: 'album/song.mp3' }, 'folder-1');
  await db.saveTrack({ id: 'blob-1', name: 'other.mp3', size: 5, folder: 'imported' }, { type: 'audio/mpeg' });
  assert.equal(await db.getAudio('direct-1'), null);
  assert.equal((await db.getAudio('blob-1')).type, 'audio/mpeg');
  assert.equal((await db.getFolderHandle('folder-1')).name, 'Music');
  const tracks = await db.listTracks();
  assert.equal(tracks.find((track) => track.id === 'direct-1').source, 'handle');
  assert.equal(tracks.find((track) => track.id === 'blob-1').source, 'blob');
});

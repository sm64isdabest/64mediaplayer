(function (root) {
  'use strict';

  const DB_NAME = '64-media-player';
  const DB_VERSION = 1;
  let openPromise;

  function makeDuplicateKey(name, size) {
    return `${String(name).normalize('NFC').toLowerCase()}::${Number(size)}`;
  }

  function openDB() {
    if (openPromise) return openPromise;
    openPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const tracks = db.objectStoreNames.contains('tracks')
          ? request.transaction.objectStore('tracks')
          : db.createObjectStore('tracks', { keyPath: 'id' });
        if (!tracks.indexNames.contains('folder')) tracks.createIndex('folder', 'folder', { unique: false });
        if (!tracks.indexNames.contains('duplicateKey')) tracks.createIndex('duplicateKey', 'duplicateKey', { unique: true });
        if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); openPromise = null; };
        resolve(db);
      };
      request.onerror = () => { openPromise = null; reject(request.error); };
      request.onblocked = () => reject(new Error('Feche outra aba do player para atualizar o banco.'));
    });
    return openPromise;
  }

  async function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function listTracks() {
    const db = await openDB();
    const tx = db.transaction('tracks', 'readonly');
    return requestResult(tx.objectStore('tracks').getAll());
  }

  async function findDuplicate(name, size) {
    const db = await openDB();
    const tx = db.transaction('tracks', 'readonly');
    return requestResult(tx.objectStore('tracks').index('duplicateKey').get(makeDuplicateKey(name, size)));
  }

  async function saveTrack(track, blob) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['tracks', 'audio'], 'readwrite');
      tx.objectStore('tracks').put({ ...track, duplicateKey: track.duplicateKey || makeDuplicateKey(track.name, track.size) });
      tx.objectStore('audio').put({ id: track.id, blob });
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('Não foi possível salvar esta música.'));
    });
  }

  async function getAudio(id) {
    const db = await openDB();
    const row = await requestResult(db.transaction('audio', 'readonly').objectStore('audio').get(id));
    return row ? row.blob : null;
  }

  async function deleteTrack(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['tracks', 'audio'], 'readwrite');
      tx.objectStore('tracks').delete(id);
      tx.objectStore('audio').delete(id);
      tx.oncomplete = resolve;
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  }

  async function deleteFolder(folder) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['tracks', 'audio'], 'readwrite');
      const tracks = tx.objectStore('tracks');
      const audio = tx.objectStore('audio');
      const cursor = tracks.index('folder').openCursor(IDBKeyRange.only(folder));
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row) return;
        audio.delete(row.primaryKey);
        row.delete();
        row.continue();
      };
      tx.oncomplete = resolve;
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  }

  async function clearLibrary() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['tracks', 'audio'], 'readwrite');
      tx.objectStore('tracks').clear();
      tx.objectStore('audio').clear();
      tx.oncomplete = resolve;
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  }

  root.MusicDB = { openDB, listTracks, findDuplicate, makeDuplicateKey, saveTrack, getAudio, deleteTrack, deleteFolder, clearLibrary };
})(typeof window === 'undefined' ? globalThis : window);

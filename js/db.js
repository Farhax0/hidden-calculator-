// Tiny promise wrapper around IndexedDB.
//   config : { id:'vault', salt, wrapped }                         (key wrapping info)
//   files  : { id, created, size, meta:{iv,data}, thumb:{iv,data}|null }  (encrypted name/type)
//   blobs  : { id, chunks:[{iv,data}, ...] }                         (encrypted file content)

const DB_NAME = 'calc-store';
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('config', { keyPath: 'id' });
        db.createObjectStore('files', { keyPath: 'id' });
        db.createObjectStore('blobs', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('aborted'));
  });
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getConfig() {
  const db = await open();
  return request(db.transaction('config').objectStore('config').get('vault'));
}

export async function putConfig(cfg) {
  const db = await open();
  const tx = db.transaction('config', 'readwrite');
  tx.objectStore('config').put({ ...cfg, id: 'vault' });
  return done(tx);
}

export async function listFiles() {
  const db = await open();
  return request(db.transaction('files').objectStore('files').getAll());
}

export async function addFile(record, blob) {
  const db = await open();
  const tx = db.transaction(['files', 'blobs'], 'readwrite');
  tx.objectStore('blobs').put(blob);
  tx.objectStore('files').put(record);
  return done(tx);
}

export async function getBlob(id) {
  const db = await open();
  return request(db.transaction('blobs').objectStore('blobs').get(id));
}

export async function deleteFile(id) {
  const db = await open();
  const tx = db.transaction(['files', 'blobs'], 'readwrite');
  tx.objectStore('files').delete(id);
  tx.objectStore('blobs').delete(id);
  return done(tx);
}

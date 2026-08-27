const DATABASE_NAME = 'spacedPenguinAudio';
const STORE_NAME = 'stellarTracks';
const TRACK_KEY = 'selectedMp3';

export class StellarTrackStore {
    constructor(indexedDb = globalThis.indexedDB) {
        this.indexedDb = indexedDb;
    }

    open() {
        if (!this.indexedDb) return Promise.reject(new Error('IndexedDB is unavailable'));
        return new Promise((resolve, reject) => {
            const request = this.indexedDb.open(DATABASE_NAME, 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                    request.result.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async save(file) {
        if (!file) return false;
        let database;
        try {
            database = await this.open();
            return await new Promise(resolve => {
                const transaction = database.transaction(STORE_NAME, 'readwrite');
                transaction.objectStore(STORE_NAME).put({
                    blob: file.slice(0, file.size, file.type || 'audio/mpeg'),
                    name: file.name || 'stellar.mp3',
                    type: file.type || 'audio/mpeg',
                    lastModified: file.lastModified || Date.now()
                }, TRACK_KEY);
                transaction.oncomplete = () => resolve(true);
                transaction.onerror = () => resolve(false);
                transaction.onabort = () => resolve(false);
            });
        } catch {
            return false;
        } finally {
            database?.close();
        }
    }

    async load() {
        let database;
        try {
            database = await this.open();
            const record = await new Promise((resolve, reject) => {
                const request = database.transaction(STORE_NAME, 'readonly')
                    .objectStore(STORE_NAME)
                    .get(TRACK_KEY);
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error);
            });
            if (!record?.blob) return null;
            return new File([record.blob], record.name, {
                type: record.type,
                lastModified: record.lastModified
            });
        } catch {
            return null;
        } finally {
            database?.close();
        }
    }

    async clear() {
        let database;
        try {
            database = await this.open();
            return await new Promise(resolve => {
                const transaction = database.transaction(STORE_NAME, 'readwrite');
                transaction.objectStore(STORE_NAME).delete(TRACK_KEY);
                transaction.oncomplete = () => resolve(true);
                transaction.onerror = () => resolve(false);
                transaction.onabort = () => resolve(false);
            });
        } catch {
            return false;
        } finally {
            database?.close();
        }
    }
}

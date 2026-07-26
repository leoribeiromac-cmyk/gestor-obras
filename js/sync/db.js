// GESTOR OBRAS — MÓDULO DE BANCO DE DADOS OFFLINE (IndexedDB)

(function () {
  const DB_NAME = 'gestor_obras_db_v2';
  const DB_VERSION = 2;

  let dbPromise = null;

  function initDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Store de Outbox (Lançamentos e Apontamentos pendentes de sync)
        if (!db.objectStoreNames.contains('outbox')) {
          const outboxStore = db.createObjectStore('outbox', { keyPath: 'clientId' });
          outboxStore.createIndex('status', 'status', { unique: false });
          outboxStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Store de Fotos Offline (Pendente/Enviando/Enviado/Erro)
        if (!db.objectStoreNames.contains('photos')) {
          const photoStore = db.createObjectStore('photos', { keyPath: 'id' });
          photoStore.createIndex('status', 'status', { unique: false });
          photoStore.createIndex('rdoId', 'rdoId', { unique: false });
        }

        // Store de Pendências / Snag List local
        if (!db.objectStoreNames.contains('pendencias')) {
          const pendStore = db.createObjectStore('pendencias', { keyPath: 'id' });
          pendStore.createIndex('obra', 'obra', { unique: false });
        }
      };

      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });

    return dbPromise;
  }

  const DB = {
    async getItem(storeName, key) {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },

    async getAll(storeName) {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },

    async putItem(storeName, item) {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).put(item);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },

    async deleteItem(storeName, key) {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },

    async clearStore(storeName) {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  };

  window.GestorDB = DB;
})();

const STORE_NAME = 'attendanceOfflineQueue';
const DB_NAME = 'sportmancarOfflineDB';
const DB_VERSION = 1;

function getGlobalScope() {
  if (typeof window !== 'undefined') return window;
  if (typeof globalThis !== 'undefined') return globalThis;
  return {};
}

function getMemoryQueue() {
  const scope = getGlobalScope();
  if (!scope.__SPORTMANCAR_OFFLINE_QUEUE__) {
    scope.__SPORTMANCAR_OFFLINE_QUEUE__ = [];
  }
  return scope.__SPORTMANCAR_OFFLINE_QUEUE__;
}

function getIndexedDb() {
  const scope = getGlobalScope();
  return scope.indexedDB || globalThis?.indexedDB || null;
}

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildDedupKey(entry) {
  return [entry.evidenceId, entry.token, entry.sessionId, entry.phase, entry.studentId, entry.action].filter(Boolean).join(':');
}

function openDb() {
  return new Promise((resolve, reject) => {
    const indexedDb = getIndexedDb();
    if (!indexedDb) {
      resolve(null);
      return;
    }

    const request = indexedDb.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('token', 'token', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB'));
  });
}

function normalizeRecord(record) {
  return {
    ...record,
    status: record.status || 'pending',
    createdAt: record.createdAt || new Date().toISOString(),
  };
}

export const OfflineAttendanceQueue = {
  async add(entry) {
    const dedupKey = buildDedupKey(entry);
    if (dedupKey) {
      const existing = (await this.getPending()).find((item) => buildDedupKey(item) === dedupKey);
      if (existing) return existing.id;
    }

    const db = await openDb();
    if (!db) {
      const queue = getMemoryQueue();
      const record = normalizeRecord({ id: generateId(), ...entry, status: 'pending' });
      queue.push(record);
      return record.id;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record = normalizeRecord({ id: generateId(), ...entry, status: 'pending' });
      const req = store.add(record);
      req.onsuccess = () => resolve(record.id);
      req.onerror = () => reject(req.error || new Error('No se pudo guardar el registro'));
    });
  },

  async getPending() {
    const db = await openDb();
    if (!db) {
      return getMemoryQueue().filter((item) => item.status === 'pending');
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('status');
      const req = index.getAll('pending');
      req.onsuccess = () => resolve((req.result || []).map(normalizeRecord));
      req.onerror = () => reject(req.error || new Error('No se pudo leer la cola'));
    });
  },

  async clear() {
    const db = await openDb();
    if (!db) {
      getMemoryQueue().length = 0;
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('No se pudo limpiar la cola'));
    });
  },

  async syncPending({ request }) {
    const pending = await this.getPending();
    for (const item of pending) {
      try {
        const path = item.action === 'offline-sync'
          ? '/attendance/offline/sync'
          : `/attendance/${encodeURIComponent(item.token)}/${item.action}`;
        const response = await request({
          path,
          method: 'POST',
          body: JSON.stringify(item.payload || {}),
        });
        if (response && response.ok !== false) {
          await this.remove(item.id);
        }
      } catch (error) {
        console.warn('No se pudo sincronizar asistencia offline', error);
      }
    }
    return this.getPending();
  },

  async remove(id) {
    const db = await openDb();
    if (!db) {
      const queue = getMemoryQueue();
      const index = queue.findIndex((item) => item.id === id);
      if (index >= 0) queue.splice(index, 1);
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('No se pudo eliminar el registro'));
    });
  },
};

export const registerAttendanceOfflineSupport = () => {
  const scope = getGlobalScope();
  const hasIndexedDb = Boolean(getIndexedDb());
  if (!hasIndexedDb && typeof scope.addEventListener !== 'function') return;

  const syncPendingQueue = () => {
    const navigatorRef = scope.navigator;
    if (!navigatorRef || !navigatorRef.onLine) return;
    OfflineAttendanceQueue.syncPending({
      async request({ path, method, body }) {
        const authToken = scope.sessionStorage?.getItem('erp_api_token') || '';
        const base = scope.__SPORTMANCAR_CONFIG__?.API_BASE_URL || 'http://localhost:5000/api';
        const response = await scope.fetch(`${base}${path}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error?.message || data.message || 'No se pudo sincronizar la asistencia');
        }
        return { ok: true, data };
      },
    }).catch((error) => console.warn('Error sincronizando la cola offline:', error));
  };

  if (typeof scope.addEventListener === 'function') {
    scope.addEventListener('online', syncPendingQueue);
    scope.addEventListener('load', syncPendingQueue);
  }
};

export const getOfflineAttendanceStatus = async () => {
  const pending = await OfflineAttendanceQueue.getPending();
  return {
    pendingCount: pending.length,
    isOffline: typeof navigator !== 'undefined' && !navigator.onLine,
    hasPending: pending.length > 0,
  };
};

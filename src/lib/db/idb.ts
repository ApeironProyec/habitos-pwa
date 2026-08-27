/**
 * Wrapper mínimo de IndexedDB basado en promesas.
 *
 * Se escribe a mano en lugar de usar `idb` o `dexie` por dos razones:
 * el bundle no crece (~1.5 KB vs ~12 KB) y la superficie de API que
 * necesitamos es chica y estable.
 */

export const DB_NAME = 'habitos-local'
export const DB_VERSION = 1

export const STORE = {
  habits: 'habits',
  occurrences: 'occurrences',
  tasks: 'tasks',
  outbox: 'outbox',
  meta: 'meta',
} as const

export type StoreName = (typeof STORE)[keyof typeof STORE]

let dbPromise: Promise<IDBDatabase> | null = null

/** Abre (y migra si hace falta) la base local. Idempotente y cacheado. */
export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible en este entorno'))
      return
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      const db = req.result

      if (!db.objectStoreNames.contains(STORE.habits)) {
        db.createObjectStore(STORE.habits, { keyPath: 'id' })
      }

      if (!db.objectStoreNames.contains(STORE.occurrences)) {
        const s = db.createObjectStore(STORE.occurrences, { keyPath: 'id' })
        // Clave natural del slot: permite deduplicar sin consultar al servidor
        s.createIndex('slot', ['habit_id', 'scheduled_date', 'scheduled_time'], { unique: true })
        s.createIndex('scheduled_date', 'scheduled_date')
        s.createIndex('habit_id', 'habit_id')
      }

      if (!db.objectStoreNames.contains(STORE.tasks)) {
        db.createObjectStore(STORE.tasks, { keyPath: 'id' })
      }

      if (!db.objectStoreNames.contains(STORE.outbox)) {
        const s = db.createObjectStore(STORE.outbox, { keyPath: 'seq', autoIncrement: true })
        s.createIndex('entity', ['table', 'row_id'])
        s.createIndex('created_at', 'created_at')
      }

      if (!db.objectStoreNames.contains(STORE.meta)) {
        db.createObjectStore(STORE.meta, { keyPath: 'key' })
      }
    }

    req.onsuccess = () => {
      const db = req.result
      // Si otra pestaña pide una versión más nueva, cerramos para no bloquearla
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }

    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir IndexedDB'))
    req.onblocked = () => reject(new Error('IndexedDB bloqueada por otra pestaña'))
  })

  return dbPromise
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Ejecuta una operación dentro de una transacción y espera a que se confirme. */
async function withStore<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  const db = await openDB()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode)
    let result: T
    let settled = false

    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Transacción abortada'))

    Promise.resolve(fn(tx.objectStore(store)))
      .then((r) => {
        result = r
        settled = true
      })
      .catch((e) => {
        if (!settled) {
          try {
            tx.abort()
          } catch {
            /* la transacción ya terminó */
          }
        }
        reject(e)
      })
  })
}

export function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return withStore(store, 'readonly', (s) => promisify<T | undefined>(s.get(key) as IDBRequest<T | undefined>))
}

export function idbGetAll<T>(store: StoreName): Promise<T[]> {
  return withStore(store, 'readonly', (s) => promisify<T[]>(s.getAll() as IDBRequest<T[]>))
}

/** Lee por índice; `query` acepta valor exacto o IDBKeyRange. */
export function idbGetAllByIndex<T>(
  store: StoreName,
  index: string,
  query: IDBValidKey | IDBKeyRange
): Promise<T[]> {
  return withStore(store, 'readonly', (s) =>
    promisify<T[]>(s.index(index).getAll(query) as IDBRequest<T[]>)
  )
}

export function idbGetByIndex<T>(
  store: StoreName,
  index: string,
  query: IDBValidKey
): Promise<T | undefined> {
  return withStore(store, 'readonly', (s) =>
    promisify<T | undefined>(s.index(index).get(query) as IDBRequest<T | undefined>)
  )
}

export function idbPut<T>(store: StoreName, value: T): Promise<IDBValidKey> {
  return withStore(store, 'readwrite', (s) => promisify(s.put(value as unknown as object)))
}

/** Escribe muchos registros en UNA sola transacción (mucho más rápido que N puts). */
export function idbPutMany<T>(store: StoreName, values: T[]): Promise<void> {
  if (values.length === 0) return Promise.resolve()
  return withStore(store, 'readwrite', (s) => {
    for (const v of values) s.put(v as unknown as object)
  })
}

export function idbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  return withStore(store, 'readwrite', (s) => {
    s.delete(key)
  })
}

export function idbDeleteMany(store: StoreName, keys: IDBValidKey[]): Promise<void> {
  if (keys.length === 0) return Promise.resolve()
  return withStore(store, 'readwrite', (s) => {
    for (const k of keys) s.delete(k)
  })
}

export function idbClear(store: StoreName): Promise<void> {
  return withStore(store, 'readwrite', (s) => {
    s.clear()
  })
}

/** Añade a un store autoincremental y devuelve la clave asignada. */
export function idbAdd<T>(store: StoreName, value: T): Promise<IDBValidKey> {
  return withStore(store, 'readwrite', (s) => promisify(s.add(value as unknown as object)))
}

// ---------- meta (cursores de sincronización, flags) ----------

export async function metaGet<T>(key: string): Promise<T | undefined> {
  const row = await idbGet<{ key: string; value: T }>(STORE.meta, key)
  return row?.value
}

export async function metaSet<T>(key: string, value: T): Promise<void> {
  await idbPut(STORE.meta, { key, value })
}

/** Borra todo lo local. Se usa al cerrar sesión para no filtrar datos entre cuentas. */
export async function wipeLocal(): Promise<void> {
  await Promise.all([
    idbClear(STORE.habits),
    idbClear(STORE.occurrences),
    idbClear(STORE.tasks),
    idbClear(STORE.outbox),
    idbClear(STORE.meta),
  ])
}

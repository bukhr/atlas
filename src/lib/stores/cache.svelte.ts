import localforage from 'localforage';
import { config } from '$lib/config';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class CacheStore {
  // Cache en memoria (nivel 1)
  #memoryCache = $state(new Map<string, CacheEntry<any>>());
  // Tracking LRU: key → último acceso
  #lastAccessed = new Map<string, number>();

  // Estadísticas
  stats = $derived({
    memoryEntries: this.#memoryCache.size,
    memorySize: this.#estimateMemorySize()
  });

  constructor() {
    this.#startPeriodicCleanup();
  }

  #estimateMemorySize(): number {
    let size = 0;
    for (const entry of this.#memoryCache.values()) {
      size += JSON.stringify(entry.data).length * 2; // Aproximación
    }
    return size;
  }

  async get<T>(key: string): Promise<T | null> {
    // Nivel 1: Memory cache
    const memoryEntry = this.#memoryCache.get(key);
    if (memoryEntry && Date.now() - memoryEntry.timestamp < memoryEntry.ttl) {
      this.#lastAccessed.set(key, Date.now());
      return memoryEntry.data as T;
    }

    // Nivel 2: IndexedDB
    try {
      const idbEntry = await localforage.getItem<CacheEntry<T>>(key);
      if (idbEntry && Date.now() - idbEntry.timestamp < idbEntry.ttl) {
        // Promover a memory cache
        this.#memoryCache.set(key, idbEntry);
        this.#lastAccessed.set(key, Date.now());
        return idbEntry.data;
      }
    } catch (e) {
      console.error('Cache read error:', e);
    }

    return null;
  }

  async set<T>(key: string, data: T, ttl: number): Promise<void> {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl
    };

    // Guardar en ambos niveles
    this.#memoryCache.set(key, entry);
    this.#lastAccessed.set(key, Date.now());

    try {
      await localforage.setItem(key, entry);
    } catch (e) {
      console.error('Cache write error:', e);
    }

    // Evictar si se superó el límite de tamaño
    this.#evictIfNeeded();
  }

  async invalidate(key: string): Promise<void> {
    this.#memoryCache.delete(key);
    this.#lastAccessed.delete(key);
    try {
      await localforage.removeItem(key);
    } catch (e) {
      console.error('Cache invalidate error:', e);
    }
  }

  async invalidateByPrefix(prefix: string): Promise<void> {
    for (const key of this.#memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        this.#memoryCache.delete(key);
        this.#lastAccessed.delete(key);
      }
    }
    try {
      const keys = await localforage.keys();
      await Promise.all(
        keys.filter(k => k.startsWith(prefix)).map(k => localforage.removeItem(k))
      );
    } catch (e) {
      console.error('Cache invalidateByPrefix error:', e);
    }
  }

  async clear(): Promise<void> {
    this.#memoryCache.clear();
    this.#lastAccessed.clear();
    try {
      await localforage.clear();
    } catch (e) {
      console.error('Cache clear error:', e);
    }
  }

  // Limpiar entradas expiradas
  async cleanup(): Promise<number> {
    let cleaned = 0;
    const now = Date.now();

    // Limpiar memory cache
    for (const [key, entry] of this.#memoryCache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.#memoryCache.delete(key);
        this.#lastAccessed.delete(key);
        cleaned++;
      }
    }

    // Limpiar IndexedDB (más costoso, hacer menos frecuente)
    try {
      const keys = await localforage.keys();
      for (const key of keys) {
        const entry = await localforage.getItem<CacheEntry<any>>(key);
        if (entry && now - entry.timestamp > entry.ttl) {
          await localforage.removeItem(key);
          cleaned++;
        }
      }
    } catch (e) {
      console.error('Cache cleanup error:', e);
    }

    return cleaned;
  }

  /**
   * Evicta entradas LRU si el tamaño en memoria supera maxCacheSize.
   */
  #evictIfNeeded(): void {
    const currentSize = this.#estimateMemorySize();
    if (currentSize <= config.cache.maxCacheSize) return;

    // Ordenar por último acceso (más antiguo primero)
    const sorted = [...this.#lastAccessed.entries()].sort((a, b) => a[1] - b[1]);

    let size = currentSize;
    for (const [key] of sorted) {
      if (size <= config.cache.maxCacheSize) break;
      const entry = this.#memoryCache.get(key);
      if (entry) {
        size -= JSON.stringify(entry.data).length * 2;
        this.#memoryCache.delete(key);
        this.#lastAccessed.delete(key);
      }
    }
  }

  /**
   * Cleanup periódico cada 5 minutos (solo en browser).
   */
  #startPeriodicCleanup(): void {
    if (typeof window === 'undefined') return;
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }
}

export const cacheStore = new CacheStore();

// Cache keys helpers
export const cacheKeys = {
  folderChildren: (folderId: string) => `folder:${folderId}`,
  fileMetadata: (fileId: string) => `file:${fileId}`,
  searchResults: (query: string, mode: 'name' | 'fullText' = 'name') => `search:${mode}:${query}`,
  treeStructure: () => 'tree:structure',
  folderOrder: (folderId: string) => `folder-order:${folderId}`
};

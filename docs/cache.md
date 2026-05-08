# Client cache

Atlas caches Drive responses in the browser to keep the tree responsive and minimize Drive API quota usage. The cache lives only in the browser — the server is stateless except for sessions and folder order.

## Two levels

| Level | Backend | Lifetime | Sync? |
|---|---|---|---|
| L1 | `Map` in memory | Until tab closes / reload | Synchronous read/write |
| L2 | IndexedDB via [localforage](https://localforage.github.io/localForage/) | Persists across sessions, per-origin | Asynchronous |

A read tries L1 first, falls back to L2, and on hit promotes the entry to L1.

A write goes to both levels. Writes to L2 are best-effort and won't fail the app if IndexedDB is unavailable.

**File:** `src/lib/stores/cache.svelte.ts`. Singleton: `cacheStore`.

## TTLs

Defined in `src/lib/config.ts`:

| Key prefix | TTL | What it stores |
|---|---|---|
| `folder:{id}` | 2 hours | Children of a folder (Drive listFiles result) |
| `file:{id}` | 1 hour | Metadata for a single file |
| `search:{mode}:{query}` | 30 minutes | Search results |
| `folder-order:{id}` | 5 minutes | Manual folder order from the API |

Entry shape:
```ts
interface CacheEntry<T> {
  data: T;
  timestamp: number;  // Date.now() when written
  ttl: number;        // milliseconds
}
```

Expiration check: `Date.now() - entry.timestamp >= entry.ttl`.

## Eviction

L1 has a soft cap of 50 MB (`config.cache.maxCacheSize`). When exceeded, entries are evicted **least-recently-used first**, tracked by a parallel `Map` of `key → lastAccessedTimestamp`. Eviction only touches L1; L2 remains intact and entries can be re-promoted on the next read.

Periodic cleanup runs every 5 minutes and removes expired entries from L2.

## Invalidation

`cacheStore.invalidate(key)` removes from both levels. Called when:

- A folder is reordered → `cacheStore.invalidate(cacheKeys.folderChildren(id))` to force a fresh read on next expand.
- The user clicks "Refresh" → `driveStore.refreshTree()` invalidates all currently-loaded folder keys.

## Privacy

Cached Drive content lives in the browser's IndexedDB scoped to your deployment's origin. It is not accessible to other origins. On sign-out the cache is **not** cleared — it expires naturally via TTL. If you need immediate clearing, call `cacheStore.clear()` explicitly.

## Configuration

`localforage` uses default settings: IndexedDB → WebSQL → localStorage fallback chain, default DB name `localforage`, default store name `keyvaluepairs`. There is no Atlas-specific configuration on the localforage side.

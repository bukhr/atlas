import { driveService } from '$lib/services/driveService';
import { driveStore } from '$lib/stores/drive.svelte';
import { treeStore } from '$lib/stores/tree.svelte';
import { authStore } from '$lib/stores/auth.svelte';
import { cacheStore, cacheKeys } from '$lib/stores/cache.svelte';
import { config } from '$lib/config';
import { debounce } from '$lib/utils/debounce';
import { trackEvent } from '$lib/analytics';
import type { DriveFile } from '$lib/types';

type SearchMode = 'name' | 'fullText';

class SearchStore {
  query = $state('');
  results = $state<DriveFile[]>([]);
  isSearching = $state(false);
  error = $state<string | null>(null);
  searchMode = $state<SearchMode>('name');
  hasSearched = $state(false);

  isActive = $derived(this.query.trim().length >= 2);

  #abortController: AbortController | null = null;

  #debouncedSearch = debounce((query: string) => {
    this.#executeSearch(query);
  }, 300);

  async #executeSearch(query: string) {
    if (query.trim().length < 2) return;
    trackEvent('search', { search_term: query, search_mode: this.searchMode });

    // Cancelar búsqueda anterior
    if (this.#abortController) {
      this.#abortController.abort();
    }
    this.#abortController = new AbortController();

    // Capturar modo actual para evitar race conditions si cambia durante la ejecución async
    const currentMode = this.searchMode;

    // Revisar cache
    const cacheKey = cacheKeys.searchResults(query, currentMode);
    try {
      const cached = await cacheStore.get<DriveFile[]>(cacheKey);
      if (cached) {
        this.results = cached;
        this.hasSearched = true;
        this.isSearching = false;
        // Pre-cargar padres también para resultados cacheados
        driveStore.preloadAncestors(cached);
        return;
      }
    } catch {
      // Cache miss, continuar con API
    }

    // Verificar que el token sea válido antes de buscar
    const token = await authStore.ensureValidToken();
    if (!token) {
      this.error = 'Sesión expirada. Vuelve a iniciar sesión.';
      this.isSearching = false;
      return;
    }

    this.isSearching = true;
    this.error = null;

    try {
      const results = await driveService.searchFiles(query, {
        mode: currentMode,
        driveId: config.rootFolderId,
        signal: this.#abortController.signal
      });
      this.results = results;
      this.hasSearched = true;

      // Pre-cargar carpetas padre para que el breadcrumb funcione de inmediato
      driveStore.preloadAncestors(results);

      // Guardar en cache
      await cacheStore.set(cacheKey, results, config.cache.searchResults);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return;
      this.error = e instanceof Error ? e.message : 'Error en la búsqueda';
    } finally {
      this.isSearching = false;
    }
  }

  search(query: string) {
    this.query = query;
    if (query.trim().length < 2) {
      this.results = [];
      this.hasSearched = false;
      this.isSearching = false;
      this.error = null;
      return;
    }
    this.isSearching = true;
    this.#debouncedSearch(query);
  }

  clearSearch() {
    this.query = '';
    this.results = [];
    this.isSearching = false;
    this.error = null;
    this.hasSearched = false;
    if (this.#abortController) {
      this.#abortController.abort();
      this.#abortController = null;
    }
  }

  setMode(mode: SearchMode) {
    if (mode === this.searchMode) return;
    this.searchMode = mode;
    if (this.query.trim().length >= 2) {
      // Abortar búsqueda en vuelo del modo anterior para evitar que sus resultados sobrescriban
      if (this.#abortController) {
        this.#abortController.abort();
        this.#abortController = null;
      }
      this.results = [];
      this.hasSearched = false;
      this.isSearching = true;
      // Ejecutar inmediatamente sin debounce (el query ya está escrito)
      this.#executeSearch(this.query);
    }
  }

  selectResult(file: DriveFile) {
    treeStore.clearSearch();
    this.clearSearch();
    driveStore.expandToFileFromUrl(file.id, file, true);
  }
}

export const searchStore = new SearchStore();

import { driveStore } from '$lib/stores/drive.svelte';

interface PrefetchOptions {
  maxDepth: number;
  maxConcurrent: number;
  delay: number;
}

const defaultOptions: PrefetchOptions = {
  maxDepth: 2,
  maxConcurrent: 3,
  delay: 100
};

class PrefetchManager {
  #queue: string[] = [];
  #inProgress = new Set<string>();
  #options: PrefetchOptions;

  constructor(options: Partial<PrefetchOptions> = {}) {
    this.#options = { ...defaultOptions, ...options };
  }

  // Agregar carpetas a la cola de prefetch
  enqueue(folderIds: string[]) {
    for (const id of folderIds) {
      if (!this.#queue.includes(id) && !this.#inProgress.has(id)) {
        this.#queue.push(id);
      }
    }
    this.#processQueue();
  }

  // Procesar cola de prefetch
  async #processQueue() {
    while (
      this.#queue.length > 0 &&
      this.#inProgress.size < this.#options.maxConcurrent
    ) {
      const folderId = this.#queue.shift();
      if (!folderId) continue;

      // Verificar si ya está cargado
      if (driveStore.loadedChildren.has(folderId)) {
        continue;
      }

      this.#inProgress.add(folderId);

      try {
        await driveStore.loadChildren(folderId);
        await this.#delay(this.#options.delay);
      } catch (e) {
        console.warn(`Prefetch failed for ${folderId}:`, e);
      } finally {
        this.#inProgress.delete(folderId);
      }
    }
  }

  #delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Prefetch basado en nodos visibles
  prefetchVisible(visibleNodes: { id: string; hasChildren: boolean }[]) {
    const folderIds = visibleNodes
      .filter((n) => n.hasChildren && !driveStore.loadedChildren.has(n.id))
      .map((n) => n.id);

    this.enqueue(folderIds);
  }

  // Cancelar prefetch pendientes
  clear() {
    this.#queue = [];
  }
}

export const prefetchManager = new PrefetchManager();
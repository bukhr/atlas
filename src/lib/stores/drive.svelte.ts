import { SvelteSet, SvelteMap } from 'svelte/reactivity';
import type { DriveFile, FlatNode, BreadcrumbItem } from '$lib/types';
import { driveService } from '$lib/services/driveService';
import { orderService } from '$lib/services/orderService';
import { cacheStore, cacheKeys } from '$lib/stores/cache.svelte';
import { config } from '$lib/config';
import { trackEvent } from '$lib/analytics';

class DriveStore {
  // Estado reactivo
  rootNodes = $state<DriveFile[]>([]);
  expandedIds = $state(new SvelteSet<string>());
  loadedChildren = $state(new SvelteMap<string, DriveFile[]>());
  selectedFileId = $state<string | null>(null);
  #selectedFileOverride = $state<DriveFile | null>(null);
  // Carpetas ancestras cargadas desde la API para el breadcrumb de búsqueda
  #ancestorNodes = $state(new SvelteMap<string, DriveFile>());
  loadingFolderIds = $state(new SvelteSet<string>());
  isLoading = $state(false);
  isNavigating = $state(false);
  pendingScrollToFileId = $state<string | null>(null);
  error = $state<string | null>(null);

  // Índice de archivos por ID para búsqueda O(1)
  #fileIndex = $state(new SvelteMap<string, DriveFile>());
  // Mapa childId → parentId para breadcrumbs sin recálculo masivo
  #parentMap = $state(new SvelteMap<string, string>());

  // Estado derivado: lista plana para virtualización
  flatList = $derived(this.#flattenTree(this.rootNodes, 0, null));

  // Archivo seleccionado derivado
  selectedFile = $derived.by(() => {
    if (this.#selectedFileOverride) return this.#selectedFileOverride;
    if (!this.selectedFileId) return null;
    return this.#findFileById(this.selectedFileId);
  });

  // Estadísticas derivadas
  stats = $derived({
    totalFiles: this.#fileIndex.size,
    expandedCount: this.expandedIds.size,
    loadedFolders: this.loadedChildren.size
  });

  // Ruta de migas de pan para el archivo seleccionado
  breadcrumbs = $derived.by((): BreadcrumbItem[] => {
    if (!this.selectedFileId) return [];

    const path: BreadcrumbItem[] = [];
    let currentId: string | null = this.selectedFileId;
    let guard = 0;

    while (currentId && guard < 20) {
      guard++;
      let node: DriveFile | null = this.#fileIndex.get(currentId) ?? null;
      // Fallback para archivos de búsqueda no cargados en el árbol
      if (!node && currentId === this.selectedFileId && this.#selectedFileOverride) {
        node = this.#selectedFileOverride;
      }
      if (!node) break;
      path.unshift({ id: node.id, name: node.name });
      // Primero #parentMap (incremental), luego DriveFile.parents (metadato de la API)
      currentId = this.#parentMap.get(currentId) ?? node.parents?.[0] ?? null;
    }

    return path;
  });

  // Métodos privados
  #flattenTree(
    rootNodes: DriveFile[],
    startDepth: number,
    startParentId: string | null
  ): FlatNode[] {
    const result: FlatNode[] = [];
    // Stack: [nodes, currentIndex, depth, parentId]
    const stack: [DriveFile[], number, number, string | null][] = [
      [rootNodes, 0, startDepth, startParentId]
    ];

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const [nodes, , depth, parentId] = top;

      if (top[1] >= nodes.length) {
        stack.pop();
        continue;
      }

      const node = nodes[top[1]++];
      const isFolder = node.mimeType === 'application/vnd.google-apps.folder';
      const isExpanded = this.expandedIds.has(node.id);
      const children = this.loadedChildren.get(node.id) ?? [];

      result.push({
        id: node.id,
        name: node.name,
        depth,
        hasChildren: isFolder,
        isExpanded,
        isLoading: this.loadingFolderIds.has(node.id),
        parentId,
        data: node
      });

      if (isExpanded && children.length > 0) {
        stack.push([children, 0, depth + 1, node.id]);
      }
    }

    return result;
  }

  #findFileById(id: string): DriveFile | null {
    return this.#fileIndex.get(id) ?? null;
  }

  /** Verifica si un archivo existe en el índice del árbol (cargado en algún momento). */
  hasFile(id: string): boolean {
    return this.#fileIndex.has(id);
  }

  /**
   * Registra archivos en #fileIndex y sus relaciones padre en #parentMap.
   */
  #indexFiles(files: DriveFile[], parentId: string): void {
    for (const file of files) {
      this.#fileIndex.set(file.id, file);
      this.#parentMap.set(file.id, parentId);
    }
  }

  /**
   * Carga la cadena de carpetas ancestras de un archivo vía la API
   * para que el breadcrumb pueda mostrar la ruta completa.
   * Se detiene al llegar a config.rootFolderId o a un nodo ya conocido.
   */
  async #loadAncestorChain(file: DriveFile): Promise<void> {
    let currentFile = file;

    // Si el archivo no tiene parents (puede ocurrir con resultados de caché antigua),
    // obtener metadatos frescos del API
    if (!currentFile.parents?.length) {
      try {
        currentFile = await driveService.getFile(currentFile.id);
      } catch {
        return;
      }
    }

    let parentId = currentFile.parents?.[0] ?? null;
    let guard = 0;

    while (parentId && parentId !== config.rootFolderId && guard < 10) {
      guard++;
      // Parar solo si el padre ya está en el árbol cargado (rootNodes o loadedChildren).
      // No parar si solo está en #ancestorNodes: puede que su propio padre aún falte.
      const inTree =
        this.rootNodes.some(n => n.id === parentId) ||
        [...this.loadedChildren.values()].some(ch => ch.some(c => c.id === parentId));
      if (inTree) break;

      // Si ya está en #ancestorNodes no re-fetchear, pero sí continuar la cadena
      const cached = this.#ancestorNodes.get(parentId);
      if (cached) {
        parentId = cached.parents?.[0] ?? null;
        continue;
      }

      try {
        const parent = await driveService.getFile(parentId);
        this.#ancestorNodes.set(parentId, parent);
        this.#fileIndex.set(parentId, parent);
        if (parent.parents?.[0]) {
          this.#parentMap.set(parentId, parent.parents[0]);
        }
        parentId = parent.parents?.[0] ?? null;
      } catch {
        break;
      }
    }
  }

  /**
   * Pre-carga en paralelo los IDs de carpetas padre de una lista de archivos.
   * Llamar después de obtener resultados de búsqueda para que el breadcrumb
   * funcione instantáneamente al seleccionar cualquier resultado.
   */
  async preloadAncestors(files: DriveFile[]): Promise<void> {
    const unknownParentIds = new Set<string>();

    for (const file of files) {
      const parentId = file.parents?.[0];
      if (
        parentId &&
        parentId !== config.rootFolderId &&
        !this.#findFileById(parentId) &&
        !this.#ancestorNodes.has(parentId)
      ) {
        unknownParentIds.add(parentId);
      }
    }

    if (unknownParentIds.size === 0) return;

    const fetched = await driveService.getFileBatch([...unknownParentIds]);
    for (const [id, folder] of fetched) {
      this.#ancestorNodes.set(id, folder);
      this.#fileIndex.set(id, folder);
      if (folder.parents?.[0]) {
        this.#parentMap.set(id, folder.parents[0]);
      }
    }
  }

  /**
   * Resuelve la ruta de carpetas ancestras de cualquier DriveFile.
   * Útil para mostrar el path en resultados de búsqueda.
   * Requiere que los ancestros estén pre-cargados via preloadAncestors().
   */
  resolveFilePath(file: DriveFile): BreadcrumbItem[] {
    const path: BreadcrumbItem[] = [];
    let currentId: string | null = file.parents?.[0] ?? null;
    let guard = 0;

    while (currentId && guard < 20) {
      guard++;
      const node = this.#fileIndex.get(currentId) ?? null;
      if (!node) break;
      path.unshift({ id: node.id, name: node.name });
      currentId = this.#parentMap.get(currentId) ?? node.parents?.[0] ?? null;
    }

    return path;
  }

  // Métodos públicos
  async loadRootFolder() {
    this.isLoading = true;
    this.error = null;

    try {
      const [files, customOrder] = await Promise.all([
        driveService.listFiles(config.rootFolderId),
        orderService.getOrder(config.rootFolderId)
      ]);

      this.rootNodes = this.#applyCustomOrder(files, customOrder);
      this.#indexFiles(this.rootNodes, config.rootFolderId);
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Error loading files';
      console.error('Error loading root folder:', e);
    } finally {
      this.isLoading = false;
    }
  }

  async loadChildren(folderId: string) {
    // Si ya están cargados, no recargar
    if (this.loadedChildren.has(folderId)) return;

    try {
      const [children, customOrder] = await Promise.all([
        driveService.listFiles(folderId),
        orderService.getOrder(folderId)
      ]);

      const ordered = this.#applyCustomOrder(children, customOrder);
      this.loadedChildren.set(folderId, ordered);
      this.#indexFiles(ordered, folderId);
    } catch (e) {
      console.error(`Error loading children for ${folderId}:`, e);
      throw e;
    }
  }

  async toggleExpand(nodeId: string) {
    const node = this.#findFileById(nodeId);
    if (!node) return;

    const isFolder = node.mimeType === 'application/vnd.google-apps.folder';
    if (!isFolder) return;

    if (this.expandedIds.has(nodeId)) {
      // Colapsar
      this.expandedIds.delete(nodeId);
    } else {
      // Expandir: cargar hijos si no están cargados
      if (!this.loadedChildren.has(nodeId)) {
        this.loadingFolderIds.add(nodeId);
        this.expandedIds.add(nodeId);
        try {
          await this.loadChildren(nodeId);
        } finally {
          this.loadingFolderIds.delete(nodeId);
        }
      } else {
        this.expandedIds.add(nodeId);
      }
      trackEvent('folder_expand', { folder_name: node.name });

      // Auto-seleccionar el primer documento (no-carpeta) de la carpeta
      const children = this.loadedChildren.get(nodeId);
      if (children) {
        const firstDoc = children.find(
          (child) => child.mimeType !== 'application/vnd.google-apps.folder'
        );
        if (firstDoc) {
          this.selectFile(firstDoc.id);
        }
      }
    }
  }

  selectFile(fileId: string | null, fileData?: DriveFile) {
    this.selectedFileId = fileId;
    this.#selectedFileOverride = fileData ?? null;

    if (fileId) {
      const file = fileData ?? this.#findFileById(fileId);
      trackEvent('file_open', {
        file_type: file?.mimeType ?? 'unknown',
        file_name: file?.name ?? 'unknown'
      });
    }

    // Cargar ancestros en background para el breadcrumb (solo en resultados de búsqueda)
    if (fileData?.parents?.[0]) {
      this.#loadAncestorChain(fileData);
    }
  }

  // Expandir hasta un archivo específico (para deep linking)
  async expandToFile(fileId: string, path: string[]) {
    for (const folderId of path) {
      if (!this.loadedChildren.has(folderId)) {
        await this.loadChildren(folderId);
      }
      this.expandedIds.add(folderId);
    }
    this.selectedFileId = fileId;
  }

  /**
   * Deep linking: resuelve la cadena de ancestros de un archivo y expande
   * el árbol hasta él. Usado al abrir una URL compartida.
   */
  async expandToFileFromUrl(fileId: string, fileData: DriveFile, collapseOthers = false): Promise<void> {
    this.isNavigating = true;
    try {
      // Construir la cadena de ancestros caminando hacia arriba por parents
      const ancestorPath: string[] = [];
      let parentId = fileData.parents?.[0] ?? null;
      let guard = 0;

      while (parentId && parentId !== config.rootFolderId && guard < 20) {
        guard++;
        ancestorPath.unshift(parentId);
        try {
          const parent = await driveService.getFile(parentId);
          parentId = parent.parents?.[0] ?? null;
        } catch {
          break;
        }
      }

      // Colapsar todo si se pide (navegación desde búsqueda)
      if (collapseOthers) {
        this.expandedIds.clear();
      }

      // Cargar hijos faltantes en paralelo
      await Promise.all(
        ancestorPath
          .filter((id) => !this.loadedChildren.has(id))
          .map((id) => this.loadChildren(id))
      );

      // Expandir todos los ancestros de una vez
      for (const folderId of ancestorPath) {
        this.expandedIds.add(folderId);
      }

      this.selectedFileId = fileId;
      this.#selectedFileOverride = fileData;
      this.pendingScrollToFileId = fileId;
    } finally {
      this.isNavigating = false;
    }
  }

  /**
   * Navega a una carpeta en el árbol: expande la ruta necesaria, la selecciona
   * y hace scroll hasta ella.
   *
   * @param ancestorIds IDs de carpetas ancestras en orden [raíz → padre inmediato],
   *   tal como aparecen en el breadcrumb. Si se proveen, se usan directamente para
   *   evitar re-derivar la cadena (más fiable para resultados de búsqueda).
   */
  async navigateToFolder(
    folderId: string,
    { ancestorIds }: { ancestorIds?: string[] } = {}
  ): Promise<void> {
    // La carpeta raíz es invisible en el árbol; solo colapsar y salir
    if (folderId === config.rootFolderId) {
      this.expandedIds.clear();
      return;
    }

    // Ruta de ancestros: usar la provista directamente (del breadcrumb) o derivar
    let ancestorPath: string[];

    if (ancestorIds !== undefined) {
      // El breadcrumb ya calculó la cadena correcta; excluir el rootFolderId si aparece
      ancestorPath = ancestorIds.filter(id => id !== config.rootFolderId);
    } else {
      // Fallback para llamadas internas: derivar desde #parentMap
      ancestorPath = [];
      let currentId: string | null = folderId;
      let guard = 0;
      while (guard < 20) {
        guard++;
        let parentId: string | null = this.#parentMap.get(currentId) ?? null;
        if (!parentId) {
          const fileData = this.#findFileById(currentId);
          parentId = fileData?.parents?.[0] ?? null;
        }
        if (!parentId || parentId === config.rootFolderId) break;
        ancestorPath.unshift(parentId);
        currentId = parentId;
      }
    }

    // Cargar hijos de ancestros + carpeta destino si es necesario
    for (const id of [...ancestorPath, folderId]) {
      if (!this.loadedChildren.has(id)) {
        await this.loadChildren(id);
      }
    }

    // Colapsar el árbol y expandir solo los ANCESTROS (no la carpeta destino).
    // Así la carpeta queda visible en contexto junto a sus hermanas, sin
    // desplazar la vista con sus hijos pre-expandidos.
    this.expandedIds.clear();
    for (const id of ancestorPath) {
      this.expandedIds.add(id);
    }

    // Seleccionar la carpeta → árbol hace scroll y la resalta
    this.selectedFileId = folderId;
    this.#selectedFileOverride = null;
  }

  /**
   * Aplica un orden custom (de Redis) a una lista de archivos.
   * Items no presentes en el orden custom van al final.
   * Items en el orden pero no en los archivos se ignoran.
   */
  #applyCustomOrder(files: DriveFile[], customOrder: string[] | null): DriveFile[] {
    if (!customOrder || customOrder.length === 0) return files;

    const fileMap = new Map(files.map(f => [f.id, f]));
    const ordered: DriveFile[] = [];

    // Primero los que están en el orden custom
    for (const id of customOrder) {
      const file = fileMap.get(id);
      if (file) {
        ordered.push(file);
        fileMap.delete(id);
      }
    }

    // Luego los nuevos (no en Redis) al final
    for (const file of fileMap.values()) {
      ordered.push(file);
    }

    return ordered;
  }

  /** Callback para notificar errores de reorden al UI */
  onReorderError: ((message: string) => void) | null = null;

  /**
   * Reordena los children de una carpeta de forma optimista.
   * Actualiza el estado local inmediatamente y persiste en S3 async via Lambda.
   * Si el usuario no tiene permisos, revierte el cambio y notifica via onReorderError.
   */
  reorderChildren(folderId: string, orderedIds: string[]) {
    const isRoot = folderId === '__root__' || folderId === config.rootFolderId;
    const actualFolderId = folderId === '__root__' ? config.rootFolderId : folderId;

    const children = isRoot ? this.rootNodes : this.loadedChildren.get(actualFolderId);
    if (!children) return;

    // Snapshot para rollback
    const snapshot = [...children];

    // Optimistic update
    const fileMap = new Map(children.map(f => [f.id, f]));
    const reordered: DriveFile[] = [];
    for (const id of orderedIds) {
      const file = fileMap.get(id);
      if (file) reordered.push(file);
    }

    if (isRoot) {
      this.rootNodes = reordered;
    } else {
      this.loadedChildren.set(actualFolderId, reordered);
    }

    // Invalidar caché para que el próximo refresh obtenga datos frescos
    cacheStore.invalidate(cacheKeys.folderChildren(actualFolderId));

    trackEvent('reorder_attempt', { folder_id: actualFolderId });

    // Persist to S3 via Lambda async
    orderService.saveOrder(actualFolderId, orderedIds).catch(err => {
      trackEvent('reorder_error', { error: err instanceof Error ? err.message : 'unknown' });
      console.error('Failed to save order, reverting:', err);
      // Rollback
      if (isRoot) {
        this.rootNodes = snapshot;
      } else {
        this.loadedChildren.set(actualFolderId, snapshot);
      }

      // Notificar al UI
      if (err instanceof Error && err.message === 'NO_PERMISSION') {
        this.onReorderError?.('No tienes permisos para reordenar esta carpeta');
      } else if (err instanceof Error && err.message === 'TOKEN_EXPIRED') {
        this.onReorderError?.('Tu sesión ha expirado. Recarga la página.');
      } else {
        this.onReorderError?.('Error al guardar el orden. Intenta de nuevo.');
      }
    });
  }

  /**
   * Refresca el árbol: invalida caché de todas las carpetas cargadas
   * y vuelve a cargar desde la API de Drive.
   */
  async refreshTree() {
    // Invalidar caché de children, orden custom y headings de documentos
    const folderIds = [config.rootFolderId, ...this.loadedChildren.keys()];
    await Promise.all([
      ...folderIds.flatMap(id => [
        cacheStore.invalidate(cacheKeys.folderChildren(id)),
        cacheStore.invalidate(cacheKeys.folderOrder(id))
      ]),
      cacheStore.invalidateByPrefix('doc-headings:'),
      cacheStore.invalidateByPrefix('doc-tab-headings:')
    ]);

    // Limpiar children cargados para forzar recarga
    const previouslyExpanded = new Set(this.expandedIds);
    this.loadedChildren.clear();

    // Recargar root
    await this.loadRootFolder();

    // Recargar carpetas que estaban expandidas
    await Promise.all(
      [...previouslyExpanded].map(id => this.loadChildren(id))
    );
  }

  /**
   * Resuelve un path de segmentos de nombre (ej: ["Corp", "subfolder", "doc"])
   * caminando el árbol top-down. Carga hijos y expande carpetas intermedias.
   * Retorna el archivo final o null si algún segmento no matchea.
   */
  async resolvePathToFile(
    segments: string[]
  ): Promise<{ fileId: string; fileData: DriveFile } | null> {
    if (segments.length === 0) return null;

    let currentChildren = this.rootNodes;

    for (let i = 0; i < segments.length; i++) {
      const segmentName = segments[i];
      const match = currentChildren.find((f) => f.name === segmentName);
      if (!match) return null;

      const isLast = i === segments.length - 1;
      if (isLast) {
        return { fileId: match.id, fileData: match };
      }

      // Segmento intermedio: debe ser carpeta
      const isFolder = match.mimeType === 'application/vnd.google-apps.folder';
      if (!isFolder) return null;

      // Cargar hijos si no están cargados
      if (!this.loadedChildren.has(match.id)) {
        await this.loadChildren(match.id);
      }
      this.expandedIds.add(match.id);
      currentChildren = this.loadedChildren.get(match.id) ?? [];
    }

    return null;
  }

  // Limpiar estado
  reset() {
    this.rootNodes = [];
    this.expandedIds.clear();
    this.loadedChildren.clear();
    this.#ancestorNodes.clear();
    this.#fileIndex.clear();
    this.#parentMap.clear();
    this.selectedFileId = null;
    this.#selectedFileOverride = null;
    this.isLoading = false;
    this.error = null;
  }
}

export const driveStore = new DriveStore();

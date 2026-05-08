<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { Sun, Moon, Search, X, FileText, FileSearch, GripVertical, Menu, RefreshCw, Puzzle, Star } from 'lucide-svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { driveStore } from '$lib/stores/drive.svelte';
  import { themeStore } from '$lib/stores/theme.svelte';
  import { treeStore } from '$lib/stores/tree.svelte';
  import { searchStore } from '$lib/stores/search.svelte';
  import { cn } from '$lib/utils/cn';
  import { driveService } from '$lib/services/driveService';
  import { buildUrlPath, parseUrlPath, extractIdFromSlug } from '$lib/utils/urlPath';
  import VirtualTreeView from '$lib/components/tree/VirtualTreeView.svelte';
  import SearchResults from '$lib/components/search/SearchResults.svelte';
  import DocumentPreview from '$lib/components/preview/DocumentPreview.svelte';
  import UserProfile from '$lib/components/UserProfile.svelte';
  import { favoritesStore } from '$lib/stores/favorites.svelte';
  import { getFileIcon, getFileColor } from '$lib/utils/fileTypes';
  import { config } from '$lib/config';


  const CHROME_EXTENSION_URL = import.meta.env.VITE_CHROME_EXTENSION_URL || '';
  const FIREFOX_EXTENSION_URL = import.meta.env.VITE_FIREFOX_EXTENSION_URL || '';

  let extensionUrl = $state(CHROME_EXTENSION_URL);

  let selectedFile = $derived(driveStore.selectedFile);
  let isReady = $state(false);
  let currentTabId = $state<string | undefined>(undefined);
  let currentHeadingId = $state<string | undefined>(undefined);
  let hasExtension = $state(true); // assume installed to avoid flash
  let toastMessage = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(message: string) {
    toastMessage = message;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastMessage = null; }, 4000);
  }

  // Conectar callback de error de reorden
  driveStore.onReorderError = showToast;

  const MIN_SIDEBAR_WIDTH = 200;
  const DEFAULT_SIDEBAR_WIDTH = 320;
  let sidebarWidth = $state(DEFAULT_SIDEBAR_WIDTH);
  let isDragging = $state(false);
  let isMobileSidebarOpen = $state(false);
  let isMobile = $state(false);
  let isRefreshing = $state(false);
  let touchStartX = $state(0);
  let touchStartY = $state(0);
  const SWIPE_THRESHOLD = 50;
  let isRestoringFromHistory = false;
  let activeTab = $state<'files' | 'favorites'>('files');

  $effect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    isMobile = mql.matches;
    function handleMediaChange(e: MediaQueryListEvent) {
      isMobile = e.matches;
      if (!e.matches) isMobileSidebarOpen = false;
    }
    mql.addEventListener('change', handleMediaChange);
    return () => mql.removeEventListener('change', handleMediaChange);
  });

  // Sincronizar URL con el archivo seleccionado (path-based)
  // Usa history API nativa para no interferir con el router de SvelteKit
  $effect(() => {
    const breadcrumbs = driveStore.breadcrumbs;
    if (!isReady) return;

    const appState = {
      selectedFileId: driveStore.selectedFileId ?? null,
      expandedIds: [...driveStore.expandedIds],
      tabId: currentTabId ?? null,
      headingId: currentHeadingId ?? null
    };

    const search = new URLSearchParams();
    if (currentTabId) search.set('tab', currentTabId);
    if (currentHeadingId) search.set('heading', currentHeadingId);
    const searchStr = search.toString() ? `?${search.toString()}` : '';

    let targetUrl: string;
    if (driveStore.selectedFileId && breadcrumbs.length > 0) {
      const pathStr = buildUrlPath(breadcrumbs);
      targetUrl = `/d/${pathStr}${searchStr}`;
    } else if (!driveStore.selectedFileId) {
      targetUrl = '/d';
    } else {
      return;
    }

    const currentFull = decodeURIComponent(window.location.pathname) + window.location.search;
    const urlInSync = currentFull === decodeURIComponent(targetUrl);
    const storedAppState = history.state?.appState;
    const stateInSync = storedAppState
      && storedAppState.selectedFileId === appState.selectedFileId
      && storedAppState.tabId === appState.tabId
      && storedAppState.headingId === appState.headingId;

    const desiredTitle = selectedFile ? `${selectedFile.name} - Atlas` : 'Atlas';

    if (urlInSync && stateInSync) {
      if (document.title !== desiredTitle) document.title = desiredTitle;
      return;
    }

    // Si la URL ya está sincronizada pero falta el appState (típico del deep-link
    // inicial), o solo cambió tab/heading dentro del mismo archivo, replaceState
    // para no inflar el historial. pushState solo cuando cambia el archivo.
    const samePathname = decodeURIComponent(window.location.pathname) === decodeURIComponent(targetUrl.split('?')[0]);
    const useReplace = isRestoringFromHistory || urlInSync || samePathname;
    if (useReplace) {
      history.replaceState({ ...history.state, appState }, '', targetUrl);
    } else {
      history.pushState({ ...history.state, appState }, '', targetUrl);
    }
    // Actualizar el title DESPUÉS del cambio de historial. Hacerlo antes
    // contamina el título de la entry anterior (la que el usuario ve en el
    // dropdown del botón atrás del browser).
    document.title = desiredTitle;
  });

  // Restaurar estado en back/forward del navegador
  $effect(() => {
    function handlePopState() {
      const appState = history.state?.appState;

      isRestoringFromHistory = true;

      if (appState?.selectedFileId) {
        // Restaurar carpetas expandidas
        if (appState.expandedIds) {
          driveStore.expandedIds.clear();
          for (const id of appState.expandedIds) driveStore.expandedIds.add(id);
          const missing = appState.expandedIds.filter((id: string) => !driveStore.loadedChildren.has(id));
          if (missing.length > 0) Promise.all(missing.map((id: string) => driveStore.loadChildren(id)));
        }
        currentTabId = appState.tabId ?? undefined;
        currentHeadingId = appState.headingId ?? undefined;
        driveStore.selectFile(appState.selectedFileId);
      } else {
        // Volver al dashboard inicial: colapsar árbol y limpiar selección
        driveStore.expandedIds.clear();
        currentTabId = undefined;
        currentHeadingId = undefined;
        driveStore.selectFile(null);
      }

      tick().then(() => { isRestoringFromHistory = false; });
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  });

  onMount(async () => {
    // Detect browser extension (skip on mobile — no extensions support)
    const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobileDevice) {
      hasExtension = true; // hide the install button
    } else {
      extensionUrl = /Firefox/i.test(navigator.userAgent) ? FIREFOX_EXTENSION_URL : CHROME_EXTENSION_URL;
      // app-detect.js sets this attribute at document_start.
      const CHROME_EXTENSION_ID = import.meta.env.VITE_CHROME_EXTENSION_ID || '';
      const hasViaAttr = document.documentElement.hasAttribute('data-atlas-ext');
      const hasViaFetch = CHROME_EXTENSION_ID
        ? await fetch(`chrome-extension://${CHROME_EXTENSION_ID}/detect.json`).then(() => true).catch(() => false)
        : false;
      hasExtension = hasViaAttr || hasViaFetch;
      if (!extensionUrl) hasExtension = true;
    }

    // Exponer helper de debug en desarrollo
    if (import.meta.env.DEV) {
      (window as any).debugForceExpire = (opts?: { clearTree?: boolean }) => authStore.debugForceExpire(opts);
    }

    // Primero inicializar autenticación
    await authStore.initialize();

    // Si no está autenticado, redirigir a login guardando la URL actual
    if (!authStore.isAuthenticated) {
      const returnUrl = window.location.pathname + window.location.search;
      goto(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
      return;
    }

    // Si está autenticado, cargar archivos y favoritos en paralelo
    await driveStore.loadRootFolder();
    favoritesStore.load();

    // Deep linking: capturar tab/heading del URL (si vienen)
    const initialUrl = new URL(window.location.href);
    const urlTab = initialUrl.searchParams.get('tab');
    const urlHeading = initialUrl.searchParams.get('heading');
    if (urlTab) currentTabId = urlTab;
    if (urlHeading) currentHeadingId = urlHeading;

    // Deep linking: compatibilidad con URLs antiguas (?file=ID)
    const urlFileId = initialUrl.searchParams.get('file');
    if (urlFileId) {
      try {
        const fileData = await driveService.getFile(urlFileId);
        await driveStore.expandToFileFromUrl(urlFileId, fileData);
      } catch {
        // Silencioso - URL inválida o sin acceso
      }
    } else {
      // Deep linking por path: /d/primera-carpeta/doc--fileId
      const pathParam = $page.params.path;
      if (pathParam) {
        const segments = parseUrlPath(pathParam);
        if (segments.length > 0) {
          const lastSegment = segments[segments.length - 1];
          const fileId = extractIdFromSlug(lastSegment);
          try {
            if (fileId) {
              // URL con ID embebido: resolver directamente por ID
              const fileData = await driveService.getFile(fileId);
              await driveStore.expandToFileFromUrl(fileId, fileData);
            } else {
              // Fallback: URL legacy sin ID, resolver por nombres
              const result = await driveStore.resolvePathToFile(segments);
              if (result) {
                driveStore.selectFile(result.fileId, result.fileData);
              }
            }
          } catch {
            // Silencioso - URL inválida o sin acceso
          }
        }
      } else {
        // Sin deep link: auto-seleccionar primer documento de la raíz
        const firstDoc = driveStore.rootNodes.find(
          (node) => node.mimeType !== 'application/vnd.google-apps.folder'
        );
        if (firstDoc) {
          driveStore.selectFile(firstDoc.id);
        }
      }
    }

    // Activar isReady DESPUÉS del deep linking para que el $effect de
    // sincronización de URL no borre el path prematuramente
    isReady = true;
  });

  // Limpiar tab/heading al cambiar de archivo fuera de popstate. Sin esto,
  // si vienes con deep-link y luego seleccionas otro archivo, los params
  // antiguos persistirían en la URL y tratarían de aplicarse al doc nuevo.
  let lastSelectedFileId: string | null = null;
  $effect(() => {
    const id = driveStore.selectedFileId ?? null;
    if (id === lastSelectedFileId) return;
    const previous = lastSelectedFileId;
    lastSelectedFileId = id;
    if (!isReady) return;
    if (isRestoringFromHistory) return;
    if (previous === null && id !== null) return; // primera selección post-mount
    currentTabId = undefined;
    currentHeadingId = undefined;
  });

  // Efecto para redirigir si se pierde la autenticación (no por token expirado)
  $effect(() => {
    if (isReady && !authStore.isLoading && !authStore.isAuthenticated) {
      const returnUrl = window.location.pathname + window.location.search;
      goto(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    }
  });

  async function handleSelectFavorite(fav: { id: string; name: string; mimeType: string }) {
    if (isMobile) isMobileSidebarOpen = false;
    try {
      const fileData = await driveService.getFile(fav.id);
      driveStore.selectFile(fav.id, fileData);
      await driveStore.expandToFileFromUrl(fav.id, fileData);
    } catch {
      driveStore.selectFile(fav.id);
    }
  }

  function handleSelect(fileId: string) {
    console.log('Selected:', fileId);
    if (isMobile) isMobileSidebarOpen = false;
  }

  function handleExpand(folderId: string) {
    console.log('Expanded:', folderId);
  }

  function startResize(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    isDragging = true;

    function onMove(evt: MouseEvent) {
      const maxWidth = Math.floor(window.innerWidth / 3);
      sidebarWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(maxWidth, startWidth + (evt.clientX - startX)));
    }

    function onUp() {
      isDragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleEdgeSwipeStart(e: TouchEvent) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }

  function handleEdgeSwipeEnd(e: TouchEvent) {
    const deltaX = e.changedTouches[0].clientX - touchStartX;
    const deltaY = Math.abs(e.changedTouches[0].clientY - touchStartY);
    if (deltaY > Math.abs(deltaX)) return;
    if (deltaX > SWIPE_THRESHOLD) {
      isMobileSidebarOpen = true;
    }
  }
</script>

<svelte:head>
  <title>Atlas</title>
</svelte:head>

{#if !isReady}
  <!-- Loading mientras se verifica autenticación -->
  <div class="min-h-screen flex items-center justify-center bg-surface-100 dark:bg-surface-950">
    <div class="flex flex-col items-center gap-4">
      <div class="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full"></div>
      <p class="text-surface-600 dark:text-surface-400">Cargando...</p>
    </div>
  </div>
{:else}
  <div class="h-screen flex flex-col bg-surface-100 dark:bg-surface-950">
    <!-- Header -->
    <header class="h-14 bg-white dark:bg-surface-900 shadow-[0_1px_0_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.05)] flex items-center justify-between px-3 md:px-7">
      <div class="flex items-center gap-3">
        <button
          onclick={() => isMobileSidebarOpen = true}
          class="md:hidden p-2 rounded-md text-surface-600 hover:text-surface-900 hover:bg-surface-100 dark:text-surface-400 dark:hover:text-surface-100 dark:hover:bg-surface-800 transition-colors"
          aria-label="Abrir menú lateral"
          aria-expanded={isMobileSidebarOpen}
          aria-controls="main-sidebar"
        >
          <Menu class="w-5 h-5" />
        </button>
        <button
          onclick={() => {
            driveStore.reset();
            driveStore.loadRootFolder();
          }}
          class="bg-transparent border-none hover:opacity-75 transition-opacity cursor-pointer flex items-center"
        >
          <img src="/atlas-dark.svg" alt="Atlas" class="h-7 block dark:hidden" />
          <img src="/atlas-white.svg" alt="Atlas" class="h-7 hidden dark:block" />
        </button>
      </div>
      <div class="flex items-center gap-3">
        {#if !hasExtension}
          <a
            href={extensionUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-semibold text-white bg-tertiary-500 hover:bg-tertiary-600 transition-colors"
            title="Instalar extensión del navegador"
          >
            <Puzzle class="w-4 h-4" />
            <span class="hidden sm:inline">Instala la Extensión para abrir links</span>
          </a>
        {/if}
        <a
          href="https://github.com/bukhr/atlas"
          target="_blank"
          rel="noopener noreferrer"
          title="Ver repositorio en GitHub"
          class="p-2 rounded-md text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors opacity-80 hover:opacity-100"
        >
          <svg viewBox="0 0 16 16" class="w-5 h-5" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
        </a>
        <a
          href="https://drive.google.com/drive/folders/{config.rootFolderId}"
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir carpeta raíz en Google Drive"
          class="p-2 rounded-md hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors opacity-80 hover:opacity-100"
        >
          <svg viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5">
            <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
            <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
            <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
            <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
            <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
            <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
          </svg>
        </a>
        <button
          onclick={() => themeStore.toggle()}
          class="p-2 rounded-md text-surface-600 hover:text-surface-900 hover:bg-surface-100 dark:text-surface-400 dark:hover:text-surface-100 dark:hover:bg-surface-800 transition-colors"
          aria-label={themeStore.isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {#if themeStore.isDark}
            <Sun class="w-5 h-5" />
          {:else}
            <Moon class="w-5 h-5" />
          {/if}
        </button>
        <UserProfile />
      </div>
    </header>

    <!-- Main content -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Swipe edge zone: invisible strip to open sidebar on mobile -->
      {#if isMobile && !isMobileSidebarOpen}
        <div
          class="fixed inset-y-0 left-0 z-10 w-[30px]"
          ontouchstart={handleEdgeSwipeStart}
          ontouchend={handleEdgeSwipeEnd}
          aria-hidden="true"
        ></div>
      {/if}

      <!-- Overlay backdrop mobile -->
      {#if isMobileSidebarOpen}
        <div
          class="fixed inset-0 bg-black/50 z-20 md:hidden"
          onclick={() => isMobileSidebarOpen = false}
          aria-hidden="true"
        ></div>
      {/if}

      <!-- Sidebar con Tree -->
      <aside
        id="main-sidebar"
        class={cn(
          "flex flex-col bg-white dark:bg-surface-900 overflow-hidden",
          "fixed inset-y-0 left-0 z-30 w-[85vw] max-w-[320px] md:max-w-none",
          "transition-transform duration-300 ease-in-out",
          isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
          "md:relative md:flex-shrink-0 md:translate-x-0 md:w-auto",
          "md:shadow-[2px_0_8px_-2px_rgba(0,0,0,0.08)] dark:md:shadow-[2px_0_8px_-2px_rgba(0,0,0,0.3)]"
        )}
        style={isMobile ? undefined : `width: ${sidebarWidth}px`}
      >
        <!-- Botón de cierre (solo mobile) -->
        <div class="md:hidden flex justify-end p-1">
          <button
            onclick={() => isMobileSidebarOpen = false}
            class="p-1.5 rounded-md text-surface-500 hover:text-surface-700 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
            aria-label="Cerrar menú lateral"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Tab bar -->
        <div class="flex items-center gap-1 px-2 pt-2 pb-3">
          <button
            onclick={() => activeTab = 'files'}
            class="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-colors
              {activeTab === 'files'
                ? 'bg-primary-500 text-white shadow-sm'
                : 'text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'}"
          >
            <Search class="w-3.5 h-3.5" />
            Archivos
          </button>
          <button
            onclick={() => activeTab = 'favorites'}
            class="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-colors
              {activeTab === 'favorites'
                ? 'bg-primary-500 text-white shadow-sm'
                : 'text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'}"
          >
            <Star class="w-3.5 h-3.5" />
            Favoritos
          </button>
        </div>

        {#if activeTab === 'files'}
          <div class="px-2 pb-2 flex flex-col gap-1.5">
            <div class="flex gap-1.5">
              <div class="relative flex-1">
                <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar archivos..."
                  value={searchStore.query}
                  oninput={(e) => {
                    const val = e.currentTarget.value;
                    treeStore.setSearch(val);
                    searchStore.search(val);
                  }}
                  onkeydown={(e) => {
                    if (e.key === 'Escape') {
                      treeStore.clearSearch();
                      searchStore.clearSearch();
                      e.currentTarget.blur();
                    }
                  }}
                  class="w-full pl-8 pr-8 py-2 text-sm border border-surface-400/25 dark:border-surface-700 rounded-lg bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                />
                {#if searchStore.query}
                  <button
                    onclick={() => { treeStore.clearSearch(); searchStore.clearSearch(); }}
                    class="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300"
                    aria-label="Limpiar búsqueda"
                  >
                    <X class="w-4 h-4" />
                  </button>
                {/if}
              </div>
              <button
                onclick={async () => {
                  isRefreshing = true;
                  try { await driveStore.refreshTree(); } finally { isRefreshing = false; }
                }}
                disabled={isRefreshing}
                class="flex-shrink-0 p-2 rounded-lg border border-surface-400/25 dark:border-surface-700 text-surface-500 hover:text-primary-600 dark:text-surface-400 dark:hover:text-primary-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors disabled:opacity-50"
                aria-label="Refrescar árbol de archivos"
                title="Refrescar"
              >
                <RefreshCw class="w-4 h-4 {isRefreshing ? 'animate-spin' : ''}" />
              </button>
            </div>
            {#if searchStore.query}
              <div class="flex items-center gap-1">
                <button
                  onclick={() => searchStore.setMode('name')}
                  class="flex items-center gap-1 px-2 py-0.5 text-xs rounded-md transition-colors {searchStore.searchMode === 'name' ? 'bg-primary-100 dark:bg-primary-900/70 text-primary-700 dark:text-primary-200' : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800'}"
                  aria-label="Buscar por nombre"
                >
                  <FileText class="w-3 h-3" />
                  Nombre
                </button>
                <button
                  onclick={() => searchStore.setMode('fullText')}
                  class="flex items-center gap-1 px-2 py-0.5 text-xs rounded-md transition-colors {searchStore.searchMode === 'fullText' ? 'bg-primary-100 dark:bg-primary-900/70 text-primary-700 dark:text-primary-200' : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800'}"
                  aria-label="Buscar por contenido"
                >
                  <FileSearch class="w-3 h-3" />
                  Contenido
                </button>
              </div>
            {/if}
          </div>
          <div class="flex-1 overflow-hidden bg-[#FAFAFA] dark:bg-surface-900 rounded-tl-lg">
          {#if searchStore.isActive && (searchStore.hasSearched || searchStore.isSearching)}
            <SearchResults />
          {:else}
            <VirtualTreeView
              class="flex-1"
              onSelect={handleSelect}
              onExpand={handleExpand}
            />
          {/if}
          </div>

        {:else}
          <!-- Tab Favoritos -->
          {#if favoritesStore.items.length === 0}
            <div class="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <Star class="w-8 h-8 text-surface-400 dark:text-surface-500" />
              <p class="text-sm text-surface-600 dark:text-surface-400">Aún no tienes favoritos</p>
              <p class="text-xs text-surface-400 dark:text-surface-500">Marca documentos con ★ para acceder rápido</p>
            </div>
          {:else}
            <ul class="flex-1 overflow-y-auto px-2 pb-2">
              {#each favoritesStore.items as fav (fav.id)}
                {@const FavIcon = getFileIcon(fav.mimeType)}
                {@const favColor = getFileColor(fav.mimeType)}
                <li>
                  <button
                    onclick={() => handleSelectFavorite(fav)}
                    class="w-full flex items-center gap-2 px-2 py-1 text-sm rounded-md cursor-pointer select-none text-surface-900 dark:text-surface-100 hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors text-left min-h-9"
                    title="{fav.name}{fav.parentName ? ` · ${fav.parentName}` : ''}"
                  >
                    <FavIcon class="w-4 h-4 flex-shrink-0 {favColor}" />
                    <span class="flex flex-col min-w-0">
                      <span class="truncate leading-tight">{fav.name}</span>
                      {#if fav.parentName !== undefined}
                        <span class="truncate text-xs text-surface-400 dark:text-surface-500 leading-tight">
                          {fav.parentName ?? 'Raíz'}
                        </span>
                      {/if}
                    </span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
      </aside>

      <!-- Handle de resize -->
      <div
        class={cn(
          "relative flex-shrink-0 w-2 cursor-col-resize select-none group",
          "hidden md:block bg-white dark:bg-surface-900",
          isDragging && "z-10"
        )}
        onmousedown={startResize}
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        aria-label="Arrastrar para redimensionar panel lateral"
      >
        <!-- Línea visible (solo al hacer drag o hover) -->
        <div class={cn(
          "absolute inset-y-0 left-1/2 w-px -translate-x-px transition-colors duration-200",
          isDragging
            ? "bg-primary-500 dark:bg-primary-400"
            : "bg-transparent group-hover:bg-primary-400/50 dark:group-hover:bg-primary-500/50"
        )}></div>
        <!-- Icono grip -->
        <div class={cn(
          "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none",
          "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
          isDragging && "opacity-100"
        )}>
          <GripVertical class={cn(
            "w-3 h-5 transition-colors duration-150",
            "text-surface-400/60 dark:text-surface-500",
            "group-hover:text-primary-500 dark:group-hover:text-primary-400",
            isDragging && "text-primary-500"
          )} />
        </div>
      </div>

      <!-- Overlay para evitar que iframe capture eventos del mouse -->
      {#if isDragging}
        <div class="fixed inset-0 z-[9999] cursor-col-resize"></div>
      {/if}

      <!-- Preview area -->
      <main class="flex-1 overflow-hidden bg-white dark:bg-surface-900">
        {#if selectedFile}
          <DocumentPreview
            file={selectedFile}
            tabId={currentTabId}
            headingId={currentHeadingId}
            onPositionChange={(pos) => {
              currentTabId = pos.tabId;
              currentHeadingId = pos.headingId;
            }}
          />
        {:else}
          <div class="h-full flex items-center justify-center text-surface-500 dark:text-surface-400">
            Selecciona un archivo para ver la vista previa :)
          </div>
        {/if}
      </main>
    </div>
  </div>

  <!-- Toast de errores -->
  {#if toastMessage}
    <div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 bg-red-600 text-white rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 animate-fade-in">
      <span>{toastMessage}</span>
      <button
        onclick={() => toastMessage = null}
        class="ml-2 p-0.5 rounded hover:bg-red-700 transition-colors"
        aria-label="Cerrar"
      >
        <X class="w-4 h-4" />
      </button>
    </div>
  {/if}
{/if}

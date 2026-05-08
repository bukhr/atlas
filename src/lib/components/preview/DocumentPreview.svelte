<script lang="ts">
  import type { DriveFile } from '$lib/types';
  import { getPreviewUrl, getDocPreviewUrlWithTab, getFileType, getFileIcon, getFileColor, isGoogleDoc } from '$lib/utils/fileTypes';
  import FileBreadcrumb from './FileBreadcrumb.svelte';
  import DocOutline from './DocOutline.svelte';
  import AtlasButton from '$lib/components/AtlasButton.svelte';
  import { Link, Check, ExternalLink, Star, RefreshCw } from 'lucide-svelte';
  import { trackEvent } from '$lib/analytics';
  import { favoritesStore } from '$lib/stores/favorites.svelte';
  import { driveStore } from '$lib/stores/drive.svelte';
  import { driveService } from '$lib/services/driveService';
  import { onMount } from 'svelte';

  let { file, tabId, headingId, onPositionChange } = $props<{
    file: DriveFile;
    tabId?: string;
    headingId?: string;
    onPositionChange?: (pos: { tabId?: string; headingId?: string }) => void;
  }>();

  let copied = $state(false);
  let iframeLoading = $state(true);
  let iframeEl = $state<HTMLIFrameElement | undefined>(undefined);
  let loadingSlow = $state(false);
  let loadingStuck = $state(false);
  let isOffline = $state(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  let slowTimer: ReturnType<typeof setTimeout> | null = null;
  let stuckTimer: ReturnType<typeof setTimeout> | null = null;
  let loadStartedAt = 0;
  // No reactivo: evita que el $effect resetee el preview cuando el store
  // entrega una nueva referencia de `file` con el mismo id (ej. al terminar
  // de cargar el árbol en paralelo con el preview).
  let lastInitializedFileId: string | null = null;

  const SLOW_MS = 4000;
  const STUCK_MS = 12000;

  const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';
  // Para shortcuts, usar el tipo del archivo destino para el preview y el icono
  let effectiveMimeType = $derived(
    file.mimeType === SHORTCUT_MIME && file.shortcutDetails
      ? file.shortcutDetails.targetMimeType
      : file.mimeType
  );
  let effectiveId = $derived(
    file.mimeType === SHORTCUT_MIME && file.shortcutDetails
      ? file.shortcutDetails.targetId
      : file.id
  );
  let isDoc = $derived(isGoogleDoc(effectiveMimeType));

  // Outline
  const DEFAULT_OUTLINE_WIDTH = 320;
  let outlineWidth = $state(DEFAULT_OUTLINE_WIDTH);
  let outlineCollapsed = $state(true);
  let hasMultipleTabs = $state(false);

  function navigateToHeading(nextHeadingId: string, nextTabId?: string) {
    onPositionChange?.({
      tabId: nextTabId || undefined,
      headingId: nextHeadingId || undefined
    });
    // El padre actualiza tabId/headingId; el iframe.src se sincroniza vía
    // reactividad de previewUrl.
  }

  function clearLoadingTimers() {
    if (slowTimer) { clearTimeout(slowTimer); slowTimer = null; }
    if (stuckTimer) { clearTimeout(stuckTimer); stuckTimer = null; }
    loadingSlow = false;
    loadingStuck = false;
  }

  function startLoadingTimers() {
    loadStartedAt = Date.now();
    slowTimer = setTimeout(() => { loadingSlow = true; }, SLOW_MS);
    stuckTimer = setTimeout(() => {
      loadingStuck = true;
      trackEvent('preview_load_stuck', { file_type: fileType });
    }, STUCK_MS);
  }

  // Reset loading state when file changes.
  // El guard con lastInitializedFileId es crítico: sin él, el effect se
  // re-dispara cuando el store entrega una nueva referencia de `file` aunque
  // el id sea el mismo (pasa al terminar de cargar ancestros en red lenta),
  // y como el src del iframe no cambia, el navegador no recarga y el spinner
  // queda eterno sobre un iframe ya cargado.
  $effect(() => {
    const currentId = file.id;
    if (currentId === lastInitializedFileId) return;
    lastInitializedFileId = currentId;
    iframeLoading = true;
    clearLoadingTimers();
    startLoadingTimers();
  });

  function handleIframeLoad() {
    if (iframeEl?.src === 'about:blank') return;
    const duration = loadStartedAt ? Date.now() - loadStartedAt : 0;
    iframeLoading = false;
    clearLoadingTimers();
    trackEvent('preview_load_success', { file_type: fileType, duration_ms: duration });
  }

  function retryLoad(trigger: 'manual' | 'online' = 'manual') {
    if (!iframeEl) return;
    // about:blank fuerza un reset real del document; reasignar el mismo src
    // no garantiza una nueva request en todos los navegadores.
    const url = previewUrl;
    iframeEl.src = 'about:blank';
    iframeLoading = true;
    clearLoadingTimers();
    startLoadingTimers();
    trackEvent('preview_retry', { file_type: fileType, trigger });
    setTimeout(() => {
      if (iframeEl) iframeEl.src = url;
    }, 0);
  }

  function handleOnline() {
    isOffline = false;
    if (iframeLoading) retryLoad('online');
  }

  function handleOffline() {
    isOffline = true;
  }

  // Chrome extension handshake & navigation listener
  const ALLOWED_ORIGINS = new Set([
    'https://docs.google.com',
    'https://sheets.google.com',
    'https://slides.google.com',
    'https://drive.google.com',
    'https://drawings.google.com'
  ]);

  function handleExtensionMessage(event: MessageEvent) {
    if (!event.data || typeof event.data.type !== 'string') return;

    if (event.data.type === 'atlas-check' && event.source) {
      (event.source as Window).postMessage({ type: 'atlas-ack' }, event.origin);
      return;
    }

    if (event.data.type === 'atlas-navigate') {
      if (!ALLOWED_ORIGINS.has(event.origin)) return;
      const fileId = event.data.fileId;
      if (typeof fileId !== 'string' || !fileId) return;

      driveService.getFile(fileId).then((fileData) => {
        driveStore.selectFile(fileId, fileData);
        driveStore.expandToFileFromUrl(fileId, fileData);
      }).catch(() => {
        // File not accessible or doesn't exist — ignore silently
      });
    }
  }

  onMount(() => {
    window.addEventListener('message', handleExtensionMessage);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('message', handleExtensionMessage);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  });

  async function copyShareLink() {
    await navigator.clipboard.writeText(window.location.href);
    trackEvent('share_link', { file_name: file.name });
    copied = true;
    setTimeout(() => { copied = false; }, 2000);
  }

  let previewUrl = $derived.by(() => {
    const base = isDoc && tabId
      ? getDocPreviewUrlWithTab(effectiveId, tabId)
      : getPreviewUrl(file);
    return isDoc && headingId ? `${base}#heading=${headingId}` : base;
  });
  let fileType = $derived(getFileType(effectiveMimeType));
  let FileIcon = $derived(getFileIcon(effectiveMimeType));
  let iconColor = $derived(getFileColor(effectiveMimeType));
  let isFavorite = $derived(favoritesStore.isFavorite(file.id));
  let parentName = $derived.by(() => {
    const crumbs = driveStore.breadcrumbs;
    // breadcrumbs incluye el archivo actual como último ítem
    // el penúltimo es el padre; si solo hay 1 ítem, está en la raíz
    return crumbs.length >= 2 ? crumbs[crumbs.length - 2].name : null;
  });

  let isPreviewable = $derived(
    fileType !== 'folder' && fileType !== 'unknown'
    && (file.mimeType !== SHORTCUT_MIME || !!file.shortcutDetails)
  );
  let fileUser = $derived(file.lastModifyingUser ?? file.owners?.[0]);
</script>

<div class="h-full flex flex-col text-surface-900 dark:text-surface-100">
  <!-- Header -->
  <div class="flex flex-row items-center justify-between px-3 py-2 shadow-[0_1px_0_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.05)] gap-2">
    <div class="flex items-center gap-2 min-w-0 flex-1">
      <FileIcon class="w-4 h-4 flex-shrink-0 {iconColor}" />
      <FileBreadcrumb />
    </div>
    <div class="flex items-center gap-2 flex-shrink-0">
      <button
        onclick={() => favoritesStore.toggle(file, parentName)}
        class="inline-flex items-center justify-center p-[0.4rem] rounded-lg border transition-all duration-300 cursor-pointer
          {isFavorite
            ? 'border-yellow-400 text-yellow-400 shadow-[0px_2px_9px_0px_rgba(0,0,0,0.08)]'
            : 'border-surface-300 dark:border-surface-600 text-surface-400 dark:text-surface-500 hover:bg-tertiary-500 hover:border-tertiary-500 hover:text-white shadow-[0px_2px_9px_0px_rgba(0,0,0,0.08)]'}"
        aria-label={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
        title={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      >
        <Star class="w-4 h-4 {isFavorite ? 'fill-yellow-400' : ''}" />
      </button>
      <AtlasButton onclick={copyShareLink} class="!px-2 sm:!px-[1.1rem]" aria-label="Compartir enlace">
        {#if copied}
          <Check class="w-4 h-4" />
          <span class="hidden sm:inline">¡Copiado!</span>
        {:else}
          <Link class="w-4 h-4" />
          <span class="hidden sm:inline">Compartir</span>
        {/if}
      </AtlasButton>
      {#if file.webViewLink}
        <AtlasButton
          href={file.webViewLink}
          target="_blank"
          rel="noopener noreferrer"
          onclick={() => trackEvent('open_in_drive', { file_name: file.name })}
          class="!px-2 sm:!px-[1.1rem]"
          aria-label="Abrir en Drive"
        >
          <ExternalLink class="w-4 h-4" />
          <span class="hidden sm:inline">Abrir en Drive</span>
        </AtlasButton>
      {/if}
    </div>
  </div>

  <!-- Preview content -->
  <div class="flex-1 overflow-hidden relative">
    {#if isPreviewable}
      <div class="flex h-full relative">
        <div class="flex-1 relative overflow-hidden min-w-0">
        {#key file.id}
          <div class="relative w-full h-full overflow-auto {isDoc ? 'pt-[50px] sm:pt-0' : ''}">
            {#if iframeLoading}
              <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-50 dark:bg-surface-900 z-10">
                <img src="/loading.svg" alt="Cargando..." class="w-20 h-20" />
                {#if isOffline}
                  <p class="text-sm text-surface-500 dark:text-surface-400">
                    Sin conexión a internet. Se reintentará al recuperarla…
                  </p>
                {:else if loadingSlow}
                  <p class="text-sm text-surface-500 dark:text-surface-400">
                    Está tardando más de lo normal…
                  </p>
                {/if}
                {#if loadingStuck && !isOffline}
                  <button
                    class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/50 rounded-lg hover:bg-primary-200 dark:hover:bg-primary-900/70 transition-colors cursor-pointer"
                    onclick={() => retryLoad('manual')}
                  >
                    <RefreshCw class="w-4 h-4" />
                    Reintentar
                  </button>
                {/if}
              </div>
            {/if}
            <iframe
              bind:this={iframeEl}
              src={previewUrl}
              title={file.name}
              class="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              onload={handleIframeLoad}
            ></iframe>
            <div class="absolute inset-0 hidden dark:block pointer-events-none bg-[#1e1e1e]/20 mix-blend-multiply"></div>
          </div>
        {/key}
        </div>
        {#if isDoc}
          <DocOutline documentId={effectiveId} onNavigate={navigateToHeading} width={outlineWidth} onCollapsedChange={(c) => outlineCollapsed = c} onMultipleTabsChange={(v) => hasMultipleTabs = v} />
        {/if}
      </div>

    {:else if fileType === 'folder'}
      <div class="h-full flex items-center justify-center text-surface-500 dark:text-surface-400">
        <div class="text-center">
          <FileIcon class="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>Las carpetas no tienen vista previa</p>
          <p class="text-sm">Expande la carpeta para ver su contenido</p>
        </div>
      </div>
    {:else if file.mimeType === SHORTCUT_MIME && !file.shortcutDetails}
      <div class="h-full flex items-center justify-center text-surface-500 dark:text-surface-400">
        <div class="text-center">
          <FileIcon class="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No se pudo resolver el destino de este acceso directo</p>
          {#if file.webViewLink}
            <a
              href={file.webViewLink}
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary-600 dark:text-primary-400 hover:underline mt-2 inline-block"
            >
              Abrir en Google Drive
            </a>
          {/if}
        </div>
      </div>
    {:else}
      <div class="h-full flex items-center justify-center text-surface-500 dark:text-surface-400">
        <div class="text-center">
          <FileIcon class="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>Vista previa no disponible para este tipo de archivo</p>
          {#if file.webViewLink}
            <a
              href={file.webViewLink}
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary-600 dark:text-primary-400 hover:underline mt-2 inline-block"
            >
              Abrir en Google Drive
            </a>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <!-- File info footer -->
  {#if file.modifiedTime || fileUser}
    <div class="px-4 py-1.5 flex justify-between items-center gap-4 text-[11px] text-surface-400 dark:text-surface-600 select-none">
      {#if file.modifiedTime}
        <span>Modificado: {new Date(file.modifiedTime).toLocaleDateString()}</span>
      {/if}
      {#if fileUser}
        <span class="truncate hidden sm:block">{fileUser.displayName} ({fileUser.emailAddress})</span>
      {/if}
    </div>
  {/if}
</div>


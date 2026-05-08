<script lang="ts">
  import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
  import { driveStore } from '$lib/stores/drive.svelte';
  import { treeStore } from '$lib/stores/tree.svelte';
  import { dragDropStore } from '$lib/stores/dragdrop.svelte';
  import { config } from '$lib/config';
  import TreeNode from './TreeNode.svelte';
  import TreeSkeleton from './TreeSkeleton.svelte';
  import { cn } from '$lib/utils/cn';
  import { TriangleAlert } from 'lucide-svelte';

  // Props
  let {
    class: className = '',
    onSelect = (id: string) => {},
    onExpand = (id: string) => {}
  } = $props<{
    class?: string;
    onSelect?: (id: string) => void;
    onExpand?: (id: string) => void;
  }>();

  // Estado derivado
  let flatList = $derived(treeStore.filteredList);
  let isLoading = $derived(driveStore.isLoading);
  let isNavigating = $derived(driveStore.isNavigating);
  let selectedId = $derived(driveStore.selectedFileId);

  // Detectar si el archivo seleccionado está fuera de la unidad compartida
  // Usa fileIndex (todos los archivos cargados) en vez de flatList (solo visibles)
  let isOutsideSharedDrive = $derived(
    selectedId && !isNavigating && !isLoading && flatList.length > 0 && !driveStore.hasFile(selectedId)
  );

  // Referencias para scroll programático
  let containerRef = $state<HTMLElement | null>(null);
  let virtualListRef = $state<InstanceType<typeof SvelteVirtualList> | null>(null);

  // Scroll pendiente solicitado por el store (deep link)
  let pendingScrollToId = $derived(driveStore.pendingScrollToFileId);

  // Auto-scroll during drag
  let autoScrollInterval: ReturnType<typeof setInterval> | null = null;
  const SCROLL_ZONE = 40; // pixels from edge
  const SCROLL_SPEED = 8; // pixels per tick

  function handleContainerDragOver(e: DragEvent) {
    if (!dragDropStore.isDragging || !containerRef) return;

    const rect = containerRef.getBoundingClientRect();
    const y = e.clientY;

    if (autoScrollInterval) {
      clearInterval(autoScrollInterval);
      autoScrollInterval = null;
    }

    if (y - rect.top < SCROLL_ZONE) {
      // Scroll up
      autoScrollInterval = setInterval(() => {
        containerRef?.scrollBy(0, -SCROLL_SPEED);
      }, 16);
    } else if (rect.bottom - y < SCROLL_ZONE) {
      // Scroll down
      autoScrollInterval = setInterval(() => {
        containerRef?.scrollBy(0, SCROLL_SPEED);
      }, 16);
    }
  }

  function handleContainerDragLeave() {
    if (autoScrollInterval) {
      clearInterval(autoScrollInterval);
      autoScrollInterval = null;
    }
  }

  function handleContainerDrop() {
    if (autoScrollInterval) {
      clearInterval(autoScrollInterval);
      autoScrollInterval = null;
    }
  }

  // Drag & drop siempre habilitado — permisos se validan al guardar (Lambda retorna 403)
  function getCanReorder(_parentId: string | null): boolean {
    return true;
  }

  // Handlers
  async function handleNodeClick(nodeId: string, hasChildren: boolean) {
    if (hasChildren) {
      await driveStore.toggleExpand(nodeId);
      onExpand(nodeId);
    } else {
      driveStore.selectFile(nodeId);
      onSelect(nodeId);
    }
  }

  async function handleExpandToggle(nodeId: string, event: Event) {
    event.stopPropagation();
    await driveStore.toggleExpand(nodeId);
    onExpand(nodeId);
  }

  // Keyboard navigation
  function handleKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        treeStore.focusNext();
        break;
      case 'ArrowUp':
        event.preventDefault();
        treeStore.focusPrevious();
        break;
      case 'ArrowRight':
        // Expandir nodo actual
        if (treeStore.focusedNodeId) {
          driveStore.toggleExpand(treeStore.focusedNodeId);
        }
        break;
      case 'ArrowLeft':
        // Colapsar nodo actual
        if (treeStore.focusedNodeId) {
          const node = flatList.find(n => n.id === treeStore.focusedNodeId);
          if (node?.isExpanded) {
            driveStore.toggleExpand(treeStore.focusedNodeId);
          }
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (treeStore.focusedNodeId) {
          const node = flatList.find(n => n.id === treeStore.focusedNodeId);
          if (node) {
            handleNodeClick(node.id, node.hasChildren);
          }
        }
        break;
    }
  }

  // Ejecutar scroll cuando el store lo solicita y el virtual list está listo
  $effect(() => {
    if (pendingScrollToId && !isNavigating && virtualListRef && flatList.length > 0) {
      const index = flatList.findIndex(n => n.id === pendingScrollToId);
      if (index !== -1) {
        driveStore.pendingScrollToFileId = null;
        // Doble rAF: el virtual list necesita montar y medir items primero
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Si el item está entre los primeros 15, ya es visible sin scrollear
            if (index < 15) return;

            virtualListRef?.scroll({ index, smoothScroll: false, align: 'top' }).then(() => {
              // Retroceder medio viewport para centrar el elemento
              const halfViewport = (containerRef?.clientHeight ?? 0) / 2;
              if (halfViewport > 0) {
                containerRef?.scrollBy(0, -halfViewport);
              }
            }).catch(() => {});
          });
        });
      }
    }
  });
</script>

<div
  bind:this={containerRef}
  class={cn(
    "h-full overflow-auto",
    className
  )}
  role="tree"
  tabindex="0"
  onkeydown={handleKeydown}
  ondragover={handleContainerDragOver}
  ondragleave={handleContainerDragLeave}
  ondrop={handleContainerDrop}
  aria-label="Árbol de archivos"
>
  {#if isNavigating}
    <div class="flex items-center gap-2 p-4 text-surface-500 dark:text-surface-400">
      <div class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
      <span class="text-sm">Abriendo ubicación…</span>
    </div>
  {:else if isOutsideSharedDrive}
    <div class="flex flex-col items-center gap-3 p-6 text-center">
      <TriangleAlert class="w-8 h-8 text-warning-500" />
      <p class="text-sm text-surface-600 dark:text-surface-400">
        Este archivo no está dentro de la unidad compartida configurada.
      </p>
    </div>
  {:else if isLoading && flatList.length === 0}
    <TreeSkeleton count={10} />
  {:else if flatList.length === 0}
    <div class="p-4 text-center text-surface-500 dark:text-surface-400">
      No hay archivos para mostrar
    </div>
  {:else}
    <SvelteVirtualList bind:this={virtualListRef} items={flatList} defaultEstimatedItemHeight={36}>
      {#snippet renderItem(node, index)}
        <TreeNode
          {node}
          isSelected={node.id === selectedId}
          isFocused={node.id === treeStore.focusedNodeId}
          canReorder={getCanReorder(node.parentId)}
          onclick={() => handleNodeClick(node.id, node.hasChildren)}
          onExpandToggle={(e) => handleExpandToggle(node.id, e)}
        />
      {/snippet}
    </SvelteVirtualList>
  {/if}
</div>

<style>
  /* Habilitar scroll horizontal en la lista virtual */
  :global(.virtual-list-viewport) {
    overflow-x: auto;
  }

  /* Permitir que la capa de ítems se expanda más allá del ancho del viewport */
  :global(.virtual-list-items) {
    min-width: 100%;
    width: max-content;
  }

  /* Los wrappers de cada ítem heredan el ancho de la capa de ítems */
  :global(.virtual-list-items > div) {
    min-width: 100%;
  }

  /* Scrollbar moderna en el contenedor raíz */
  div::-webkit-scrollbar,
  :global(.virtual-list-viewport)::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  div::-webkit-scrollbar-track,
  :global(.virtual-list-viewport)::-webkit-scrollbar-track {
    background: transparent;
  }
  div::-webkit-scrollbar-thumb,
  :global(.virtual-list-viewport)::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.18);
    border-radius: 99px;
  }
  div::-webkit-scrollbar-thumb:hover,
  :global(.virtual-list-viewport)::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.32);
  }
  div::-webkit-scrollbar-button,
  :global(.virtual-list-viewport)::-webkit-scrollbar-button {
    display: none;
  }
</style>

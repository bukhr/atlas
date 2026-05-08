<script lang="ts">
  import { Loader2, GripVertical, ExternalLink } from 'lucide-svelte';
  import type { FlatNode } from '$lib/types';
  import { getFileIcon, getFileColor } from '$lib/utils/fileTypes';
  import { cn } from '$lib/utils/cn';
  import { dragDropStore } from '$lib/stores/dragdrop.svelte';
  import { touchDrag } from './touchDrag';

  let {
    node,
    isSelected = false,
    isFocused = false,
    canReorder = false,
    onclick = () => {},
    onExpandToggle = (e: Event) => {}
  } = $props<{
    node: FlatNode;
    isSelected?: boolean;
    isFocused?: boolean;
    canReorder?: boolean;
    onclick?: () => void;
    onExpandToggle?: (e: Event) => void;
  }>();

  // Obtener icono según tipo de archivo
  let FileIcon = $derived(getFileIcon(node.data.mimeType));
  let iconColor = $derived(getFileColor(node.data.mimeType));

  // Calcular indentación
  let paddingLeft = $derived(`${node.depth * 20 + 8}px`);
  let isFolder = $derived(node.data.mimeType === 'application/vnd.google-apps.folder');
  let driveUrl = $derived(node.data.webViewLink ?? `https://drive.google.com/drive/folders/${node.id}`);

  // Drag state for this node
  let isBeingDragged = $derived(dragDropStore.draggedNodeId === node.id);
  let isTouchDragged = $derived(dragDropStore.isTouchDragging && isBeingDragged);
  let isDropTarget = $derived(dragDropStore.dropTargetId === node.id);
  let dropPos = $derived(isDropTarget ? dragDropStore.dropPosition : null);


  // Handler de teclado para accesibilidad
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onclick();
    }
  }

  // Drag handlers
  function handleDragStart(e: DragEvent) {
    if (!canReorder || !e.dataTransfer) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', node.id);
    // Use parentId or '__root__' for root-level items
    dragDropStore.startDrag(node.id, node.parentId ?? '__root__');
  }

  function handleDragOver(e: DragEvent) {
    if (!dragDropStore.isDragging) return;
    // Only allow drop on siblings (same parent)
    const draggedParent = dragDropStore.draggedParentId;
    const myParent = node.parentId ?? '__root__';
    if (draggedParent !== myParent) return;
    // Don't drop on self
    if (dragDropStore.draggedNodeId === node.id) return;

    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

    // Calculate position based on mouse Y relative to element center
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'before' : 'after';
    dragDropStore.updateDropTarget(node.id, position);
  }

  function handleDragLeave(e: DragEvent) {
    if (dragDropStore.dropTargetId !== node.id) return;
    dragDropStore.scheduleClearDropTarget();
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragDropStore.executeDrop();
  }

  function handleDragEnd() {
    dragDropStore.reset();
  }
</script>

<div
  class={cn(
    "tree-node flex items-center h-9 px-2 mx-2 cursor-pointer select-none min-w-max text-surface-600 dark:text-surface-400 rounded-md relative group",
    "hover:bg-black/5 hover:text-surface-900 dark:hover:bg-white/8 dark:hover:text-surface-100 transition-colors",
    isSelected && "bg-primary-100 dark:bg-primary-500/35 text-primary-700 dark:text-primary-50",
    isFocused && "ring-2 ring-primary-500 ring-inset",
    isBeingDragged && !isTouchDragged && "opacity-30",
    isTouchDragged && "scale-[1.03] shadow-md z-10 bg-primary-50 dark:bg-primary-900/70"
  )}
  style="padding-left: {paddingLeft}"
  data-node-id={node.id}
  data-parent-id={node.parentId ?? '__root__'}
  role="treeitem"
  tabindex="0"
  aria-selected={isSelected}
  aria-expanded={node.hasChildren ? node.isExpanded : undefined}
  onclick={onclick}
  onkeydown={handleKeydown}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <!-- Drop indicator (centrado sobre el borde, misma posición visual para before/after) -->
  {#if dropPos === 'before'}
    <div class="absolute top-0 left-3 right-2 h-0.5 -translate-y-px bg-primary-500 dark:bg-primary-400 rounded-full pointer-events-none"></div>
    <div class="absolute top-0 left-1.5 w-2 h-2 rounded-full -translate-y-1/2 bg-primary-500 dark:bg-primary-400 pointer-events-none"></div>
  {/if}
  {#if dropPos === 'after'}
    <div class="absolute bottom-0 left-3 right-2 h-0.5 translate-y-px bg-primary-500 dark:bg-primary-400 rounded-full pointer-events-none"></div>
    <div class="absolute bottom-0 left-1.5 w-2 h-2 rounded-full translate-y-1/2 bg-primary-500 dark:bg-primary-400 pointer-events-none"></div>
  {/if}

  <!-- Drag handle (space always reserved to prevent layout shift) -->
  {#if canReorder}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="w-4 h-5 flex items-center justify-center mr-0.5 opacity-0 group-hover:opacity-60 max-md:opacity-40 hover:!opacity-100 cursor-grab active:cursor-grabbing shrink-0"
      draggable="true"
      ondragstart={handleDragStart}
      ondragend={handleDragEnd}
      use:touchDrag={{ nodeId: node.id, parentId: node.parentId ?? '__root__', enabled: canReorder }}
    >
      <GripVertical class="w-3.5 h-3.5" />
    </div>
  {:else}
    <div class="w-4 h-5 mr-0.5 shrink-0"></div>
  {/if}

  <!-- Loading indicator -->
  {#if node.isLoading}
    <div class="w-4 h-4 flex items-center justify-center mr-1 shrink-0">
      <Loader2 class="w-3.5 h-3.5 animate-spin text-primary-500" />
    </div>
  {/if}

  <!-- File icon - Svelte 5: components are dynamic by default -->
  <div class="w-5 h-5 flex items-center justify-center mr-2">
    <FileIcon class="w-4 h-4 {iconColor}" />
  </div>

  <!-- File name -->
  <span class="whitespace-nowrap text-sm">
    {node.name}
  </span>

  <!-- Open in Drive (folders only) -->
  {#if isFolder}
    <button
      class="ml-2 p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 text-surface-500 hover:text-primary-500 transition-opacity cursor-pointer shrink-0 max-md:hidden"
      title="Abrir en Drive"
      type="button"
      onclick={(e) => { e.stopPropagation(); window.open(driveUrl, '_blank'); }}
    >
      <ExternalLink class="w-4 h-4" />
    </button>
  {/if}
</div>

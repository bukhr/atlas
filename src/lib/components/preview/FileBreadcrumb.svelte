<script lang="ts">
  import { ChevronRight, Folder } from 'lucide-svelte';
  import { driveStore } from '$lib/stores/drive.svelte';
  import { onMount } from 'svelte';

  let breadcrumbs = $derived(driveStore.breadcrumbs);
  let showCollapsed = $state(false);
  let isMobile = $state(false);

  onMount(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    isMobile = mq.matches;
    const handler = (e: MediaQueryListEvent) => { isMobile = e.matches; };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  });

  // Mobile: colapsar todo excepto el último (nombre del archivo)
  // Desktop: colapsar solo cuando hay más de 3 niveles, mostrando los últimos 2
  let hasCollapsed = $derived(
    isMobile ? breadcrumbs.length > 1 : breadcrumbs.length > 3
  );
  let collapsedItems = $derived(
    hasCollapsed
      ? breadcrumbs.slice(0, isMobile ? breadcrumbs.length - 1 : breadcrumbs.length - 2)
      : []
  );
  let visibleItems = $derived(
    hasCollapsed
      ? breadcrumbs.slice(isMobile ? breadcrumbs.length - 1 : breadcrumbs.length - 2)
      : breadcrumbs
  );

  // Cerrar dropdown cuando cambian los breadcrumbs
  $effect(() => {
    breadcrumbs;
    showCollapsed = false;
  });

  function navigateTo(itemId: string, itemIndex: number) {
    const ancestorIds = breadcrumbs.slice(0, itemIndex).map((b) => b.id);
    driveStore.navigateToFolder(itemId, { ancestorIds });
  }

  function handleCollapsedClick(item: { id: string; name: string }, indexInCollapsed: number) {
    showCollapsed = false;
    const ancestorIds = breadcrumbs.slice(0, indexInCollapsed).map((b) => b.id);
    driveStore.navigateToFolder(item.id, { ancestorIds });
  }
</script>

<nav aria-label="Ruta del archivo" class="min-w-0 flex-1">
  <ol class="flex items-center gap-0.5 flex-wrap min-w-0">
    {#if hasCollapsed}
      <!-- Botón "..." con dropdown -->
      <li class="relative flex items-center">
        <button
          onclick={() => showCollapsed = !showCollapsed}
          class="bg-surface-200 dark:bg-surface-700 px-2 py-0.5 rounded-md text-sm cursor-pointer"
        >
          ...
        </button>

        {#if showCollapsed}
          <!-- Overlay para cerrar -->
          <button
            class="fixed inset-0 z-40"
            onclick={() => showCollapsed = false}
            aria-label="Cerrar menú"
          ></button>

          <!-- Dropdown -->
          <div class="absolute top-full mt-1 bg-white dark:bg-surface-800 rounded-lg shadow-lg border border-surface-200 dark:border-surface-700 py-1 z-50 min-w-[200px]">
            {#each collapsedItems as item, index (item.id)}
              <button
                onclick={() => handleCollapsedClick(item, index)}
                class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-primary-100 dark:hover:bg-primary-900/30 text-left cursor-pointer"
              >
                <Folder class="w-4 h-4 flex-shrink-0 text-surface-400" />
                <span class="truncate">{item.name}</span>
              </button>
            {/each}
          </div>
        {/if}
      </li>

      <li aria-hidden="true" class="flex items-center text-surface-400 dark:text-surface-600 flex-shrink-0">
        <ChevronRight class="w-3.5 h-3.5" />
      </li>
    {/if}

    {#each visibleItems as item, index (item.id)}
      {#if index > 0}
        <li aria-hidden="true" class="flex items-center text-surface-400 dark:text-surface-600 flex-shrink-0">
          <ChevronRight class="w-3.5 h-3.5" />
        </li>
      {/if}

      {@const globalIndex = hasCollapsed ? collapsedItems.length + index : index}
      {@const isLast = globalIndex === breadcrumbs.length - 1}

      <li class="min-w-0 flex items-center">
        {#if isLast}
          <span
            class="text-sm truncate max-w-[200px] sm:max-w-[250px] font-medium text-gray-700"
            title={item.name}
            aria-current="page"
          >
            {item.name}
          </span>
        {:else}
          <button
            onclick={() => navigateTo(item.id, globalIndex)}
            class="text-sm truncate max-w-[150px] sm:max-w-[200px] text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:underline cursor-pointer"
            title={item.name}
          >
            {item.name}
          </button>
        {/if}
      </li>
    {/each}
  </ol>
</nav>

<script lang="ts">
  import { LoaderCircle } from 'lucide-svelte';
  import { searchStore } from '$lib/stores/search.svelte';
  import { driveStore } from '$lib/stores/drive.svelte';
  import SearchResultItem from './SearchResultItem.svelte';

  let selectedId = $derived(driveStore.selectedFileId);
  let results = $derived(searchStore.results);
  let noResults = $derived(searchStore.hasSearched && !searchStore.isSearching && results.length === 0);

  let slowSearch = $state(false);
  let slowTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (searchStore.isSearching) {
      slowSearch = false;
      slowTimer = setTimeout(() => { slowSearch = true; }, 4000);
    } else {
      slowSearch = false;
      clearTimeout(slowTimer);
    }
    return () => clearTimeout(slowTimer);
  });
</script>

<div class="h-full overflow-auto">
  {#if searchStore.isSearching && results.length === 0}
    <div class="flex flex-col items-center justify-center gap-1 p-4 text-surface-400 text-sm">
      <div class="flex items-center gap-2">
        <LoaderCircle class="w-4 h-4 animate-spin" />
        Buscando...
      </div>
      {#if slowSearch}
        <p class="text-xs text-surface-400 dark:text-surface-500">
          Esto puede tardar un poco más...
        </p>
      {/if}
    </div>
  {:else if noResults}
    <div class="p-4 text-center text-surface-500 dark:text-surface-400 text-sm">
      <p>No se encontraron resultados</p>
      {#if searchStore.searchMode === 'fullText'}
        <p class="mt-2 text-xs text-surface-400 dark:text-surface-500">
          Tip: Usa palabras completas para mejores resultados.
          Ej: "beneficio" en vez de "bene".
        </p>
      {/if}
    </div>
  {:else}
    {#each results as file (file.id)}
      <SearchResultItem
        {file}
        isSelected={file.id === selectedId}
        onclick={() => searchStore.selectResult(file)}
      />
    {/each}

    {#if searchStore.isSearching}
      <div class="flex items-center justify-center gap-2 p-3 text-surface-400 text-sm">
        <LoaderCircle class="w-4 h-4 animate-spin" />
      </div>
    {/if}
  {/if}

  {#if searchStore.error}
    <div class="p-3 mx-2 mt-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md">
      {searchStore.error}
    </div>
  {/if}
</div>

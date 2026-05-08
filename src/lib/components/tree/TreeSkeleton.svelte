<script lang="ts">
  let { count = 5 } = $props<{ count?: number }>();

  // Generar depths aleatorios para simular jerarquía
  function getRandomDepth(index: number): number {
    if (index === 0) return 0;
    return Math.min(Math.floor(Math.random() * 3), 2);
  }
</script>

<div class="p-2 space-y-1">
  {#each Array(count) as _, i}
    {@const depth = getRandomDepth(i)}
    <div
      class="flex items-center h-9 gap-2"
      style="padding-left: {depth * 20 + 8}px"
    >
      <div class="animate-pulse bg-surface-200 dark:bg-surface-700 rounded w-4 h-4"></div>
      <div class="animate-pulse bg-surface-200 dark:bg-surface-700 rounded w-4 h-4"></div>
      <div class="animate-pulse bg-surface-200 dark:bg-surface-700 rounded h-4 flex-1 max-w-[200px]"></div>
    </div>
  {/each}
</div>
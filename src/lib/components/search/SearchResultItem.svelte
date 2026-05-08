<script lang="ts">
  import type { DriveFile } from '$lib/types';
  import { getFileIcon, getFileColor } from '$lib/utils/fileTypes';
  import { driveStore } from '$lib/stores/drive.svelte';
  import { cn } from '$lib/utils/cn';

  let {
    file,
    isSelected = false,
    onclick = () => {}
  } = $props<{
    file: DriveFile;
    isSelected?: boolean;
    onclick?: () => void;
  }>();

  let FileIcon = $derived(getFileIcon(file.mimeType));
  let iconColor = $derived(getFileColor(file.mimeType));

  let modifiedDate = $derived(
    file.modifiedTime
      ? new Date(file.modifiedTime).toLocaleDateString('es-CL', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        })
      : null
  );

  // Path reactivo: se actualiza cuando los ancestorNodes crecen
  let fullPath = $derived(driveStore.resolveFilePath(file));

  // Mostrar máximo 3 segmentos; si hay más, usar "…" + últimos 2
  let displayPath = $derived.by(() => {
    if (fullPath.length === 0) return null;
    if (fullPath.length <= 3) return fullPath.map(s => s.name).join(' › ');
    const last2 = fullPath.slice(-2).map(s => s.name);
    return `… › ${last2.join(' › ')}`;
  });
</script>

<button
  type="button"
  class={cn(
    "group w-full flex items-center gap-2 px-3 py-2.5 text-left cursor-pointer select-none",
    "hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors",
    isSelected && "bg-primary-100 dark:bg-primary-900/70 text-primary-700 dark:text-primary-200"
  )}
  {onclick}
>
  <div class="w-5 h-5 flex-shrink-0 flex items-center justify-center">
    <FileIcon class="w-4 h-4 {iconColor}" />
  </div>
  <div class="min-w-0 flex-1">
    <p class={cn(
      "text-sm font-medium truncate",
      isSelected ? "text-primary-700 dark:text-primary-200" : "text-surface-900 dark:text-surface-100"
    )}>{file.name}</p>
    {#if displayPath}
      <p class={cn(
        "text-xs truncate mt-0.5",
        isSelected ? "text-primary-500 dark:text-primary-400" : "text-surface-400 group-hover:text-surface-600 dark:text-surface-500 dark:group-hover:text-surface-400"
      )}>{displayPath}</p>
    {/if}
    {#if modifiedDate}
      <p class={cn(
        "text-xs truncate",
        displayPath ? "" : "mt-0.5",
        isSelected ? "text-primary-400 dark:text-primary-500" : "text-surface-400 group-hover:text-surface-600 dark:text-surface-600 dark:group-hover:text-surface-400"
      )}>{modifiedDate}</p>
    {/if}
  </div>
</button>

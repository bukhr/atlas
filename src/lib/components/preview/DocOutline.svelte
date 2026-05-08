<script lang="ts">
  import { docsService, type TabHeadings } from '$lib/services/docsService';
  import { List, ChevronRight, FileText } from 'lucide-svelte';

  let { documentId, onNavigate, width, onCollapsedChange, onMultipleTabsChange } = $props<{
    documentId: string;
    onNavigate: (headingId: string, tabId?: string) => void;
    width: number;
    onCollapsedChange: (collapsed: boolean) => void;
    onMultipleTabsChange?: (hasMultiple: boolean) => void;
  }>();

  let tabHeadings = $state<TabHeadings[]>([]);
  let loading = $state(true);
  let error = $state(false);
  let mobileCollapsed = $state(true);

  let hasMultipleTabs = $derived(tabHeadings.length > 1);
  let hasAnyHeadings = $derived(tabHeadings.some((t) => t.headings.length > 0));

  $effect(() => {
    loading = true;
    error = false;
    tabHeadings = [];

    docsService.getTabHeadings(documentId).then((result) => {
      tabHeadings = result;
      loading = false;
      onMultipleTabsChange?.(result.length > 1);
    }).catch(() => {
      error = true;
      loading = false;
    });
  });

  function toggleMobile() {
    mobileCollapsed = !mobileCollapsed;
    onCollapsedChange(mobileCollapsed);
  }

  function handleNavigate(headingId: string, tabId?: string) {
    onNavigate(headingId, tabId);
    mobileCollapsed = true;
    onCollapsedChange(true);
  }

  function handleTabNavigate(tabId: string) {
    onNavigate('', tabId);
    mobileCollapsed = true;
    onCollapsedChange(true);
  }

  function tabIndentStyle(depth: number): string {
    if (depth === 0) return '';
    return `margin-left: ${depth * 16}px`;
  }

  function headingIndentStyle(level: number, tabDepth: number): string {
    const base = 12 + tabDepth * 16;
    const indent = (level - 1) * 16;
    return `padding-left: ${base + indent}px`;
  }
</script>

{#snippet navContent()}
  {#if hasMultipleTabs}
    {#each tabHeadings as tab, i}
      {#if i > 0}
        <div class="mx-2 my-1.5 border-t border-surface-200 dark:border-surface-700"></div>
      {/if}
      <div style={tabIndentStyle(tab.depth)}>
        <button
          onclick={() => handleTabNavigate(tab.tabId)}
          class="w-full text-left flex items-center gap-2 px-2.5 h-9 text-sm font-semibold whitespace-nowrap
            text-gray-700 dark:text-gray-300
            hover:bg-black/5 dark:hover:bg-white/8
            rounded-md cursor-pointer transition-colors"
          title={tab.title}
        >
          <FileText class="w-3.5 h-3.5 flex-shrink-0 text-primary-500 dark:text-primary-400" />
          {tab.title}
        </button>
        {#each tab.headings as heading}
          <button
            onclick={() => handleNavigate(heading.id, tab.tabId)}
            class="w-full text-left pr-2 h-9 flex items-center text-sm whitespace-nowrap
              text-surface-600 dark:text-surface-400
              hover:text-surface-900 dark:hover:text-surface-100
              hover:bg-black/5 dark:hover:bg-white/8
              rounded-md cursor-pointer transition-colors"
            style={headingIndentStyle(heading.level, tab.depth)}
            title={heading.text}
          >
            {heading.text}
          </button>
        {/each}
      </div>
    {/each}
  {:else}
    {#each tabHeadings as tab}
      {#each tab.headings as heading}
        <button
          onclick={() => handleNavigate(heading.id, tab.tabId)}
          class="w-full text-left pr-2 py-1 text-sm whitespace-nowrap
            text-surface-600 dark:text-surface-400
            hover:text-surface-900 dark:hover:text-surface-100
            hover:bg-black/5 dark:hover:bg-white/8
            rounded-md cursor-pointer transition-colors"
          style={headingIndentStyle(heading.level, 0)}
          title={heading.text}
        >
          {#if heading.level > 1}
            <span class="inline-block w-1 h-1 rounded-full bg-surface-300 dark:bg-surface-600 mr-1.5 relative top-[-1px]"></span>
          {/if}
          {heading.text}
        </button>
      {/each}
    {/each}
  {/if}
{/snippet}

{#if !loading && !error && (hasAnyHeadings || hasMultipleTabs)}

  <!-- Mobile: botón flotante + drawer -->
  <div class="sm:hidden">
    {#if mobileCollapsed}
      <button
        onclick={toggleMobile}
        class="absolute top-2 right-2 z-20 inline-flex items-center justify-center p-2.5 rounded-full text-primary-500 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900/50 shadow-[0px_2px_9px_0px_rgba(0,0,0,0.08)] cursor-pointer transition-all duration-300"
        aria-label="Ver índice"
      >
        <List class="w-5 h-5" />
      </button>
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="fixed inset-0 bg-black/20 z-30"
        onclick={toggleMobile}
        onkeydown={(e) => e.key === 'Escape' && toggleMobile()}
      ></div>
      <div
        class="absolute top-0 right-0 h-full z-30 flex flex-col bg-white dark:bg-surface-900 shadow-xl border-l border-surface-200 dark:border-surface-700"
        style="width: {width}px"
      >
        <div class="flex items-center justify-between gap-2 px-3 py-3 border-b border-surface-100 dark:border-surface-800">
          <span class="text-xs font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider">En esta página</span>
          <button
            onclick={toggleMobile}
            class="inline-flex items-center justify-center p-1.5 rounded-md text-surface-400 hover:text-surface-700 hover:bg-black/5 dark:hover:bg-white/8 cursor-pointer transition-colors"
            aria-label="Cerrar índice"
          >
            <ChevronRight class="w-4 h-4" />
          </button>
        </div>
        <nav class="flex-1 overflow-y-auto py-2 px-1.5">
          {@render navContent()}
        </nav>
      </div>
    {/if}
  </div>

  <!-- Desktop: panel fijo siempre visible -->
  <aside
    class="hidden sm:flex flex-col shrink-0 border-l border-surface-100 dark:border-surface-800 bg-white dark:bg-surface-900 overflow-hidden"
    style="width: {width}px"
  >
    <div class="px-4 pt-4 pb-2">
      <span class="text-xs font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider">En esta página</span>
    </div>
    <nav class="flex-1 overflow-y-auto py-1 px-1.5">
      {@render navContent()}
    </nav>
  </aside>

{/if}

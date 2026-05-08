<script lang="ts">
  import { authStore } from '$lib/stores/auth.svelte';

  import { untrack } from 'svelte';

  let showMenu = $state(false);
  let retryCount = $state(0);
  let imgFailed = $state(false);

  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000;

  const initials = $derived(
    authStore.user?.name
      ?.split(' ')
      .map((n: string) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() ?? '?'
  );

  // Resetear estado cuando cambia la URL de la imagen
  $effect(() => {
    authStore.user?.picture;
    untrack(() => {
      retryCount = 0;
      imgFailed = false;
    });
  });

  function handleImgError() {
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      imgFailed = true;
      setTimeout(() => {
        imgFailed = false;
      }, RETRY_DELAY);
    } else {
      imgFailed = true;
    }
  }

  // Agregar cache-buster al reintentar
  const imgSrc = $derived.by(() => {
    const base = authStore.user?.picture;
    if (!base || retryCount === 0) return base;
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}_retry=${retryCount}`;
  });

  function handleSignOut() {
    authStore.signOut();
    showMenu = false;
  }
</script>

{#if authStore.user}
  <div class="relative">
    <button
      onclick={() => showMenu = !showMenu}
      class="flex items-center gap-2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
    >
      {#if imgSrc && !imgFailed}
        <img
          src={imgSrc}
          alt={authStore.user.name}
          class="w-8 h-8 rounded-full"
          referrerpolicy="no-referrer"
          onerror={handleImgError}
        />
      {:else}
        <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-medium">
          {initials}
        </div>
      {/if}
    </button>

    {#if showMenu}
      <div
        class="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50"
      >
        <div class="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <p class="text-sm font-medium text-gray-900 dark:text-white">
            {authStore.user.name}
          </p>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {authStore.user.email}
          </p>
        </div>

        <button
          onclick={handleSignOut}
          class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Cerrar sesión
        </button>
      </div>
    {/if}
  </div>

  <!-- Overlay para cerrar menú -->
  {#if showMenu}
    <button
      class="fixed inset-0 z-40"
      onclick={() => showMenu = false}
      aria-label="Cerrar menú"
    ></button>
  {/if}
{/if}
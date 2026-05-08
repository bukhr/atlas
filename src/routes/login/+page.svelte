<script lang="ts">
  import { authStore } from '$lib/stores/auth.svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { trackEvent } from '$lib/analytics';

  // Obtener URL de retorno desde query params
  let returnUrl = $derived(
    new URLSearchParams($page.url.search).get('returnUrl') || '/d'
  );

  // Redirigir si ya está autenticado
  onMount(async () => {
    await authStore.initialize();

    if (authStore.isAuthenticated) {
      goto(returnUrl);
    }
  });

  // Efecto para redirigir después del login (GIS callback actualiza el store)
  $effect(() => {
    if (authStore.isAuthenticated) {
      goto(returnUrl);
    }
  });

  function handleGoogleLogin() {
    trackEvent('login_intent');
    authStore.signIn();
  }
</script>

<div class="min-h-screen flex items-center justify-center px-4 sm:px-0 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
  <div class="w-full max-w-md p-6 sm:p-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
    <div class="text-center space-y-2 mb-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        Atlas
      </h1>
      <p class="text-gray-600 dark:text-gray-400">
        Google Drive viewer
      </p>
    </div>

    <div class="space-y-4">
      {#if authStore.error}
        <div class="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 p-3 rounded-md text-sm">
          {authStore.error}
        </div>
      {/if}

      <button
        onclick={handleGoogleLogin}
        disabled={authStore.isLoading}
        class="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {#if authStore.isLoading}
          <svg class="animate-spin h-5 w-5 text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span class="text-gray-700 dark:text-gray-200">Cargando...</span>
        {:else}
          <svg class="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span class="text-gray-700 dark:text-gray-200 font-medium">Iniciar sesión con Google</span>
        {/if}
      </button>

      <p class="text-xs text-gray-500 dark:text-gray-400 text-center">
        Solo se requiere acceso de lectura a Google Drive
      </p>
    </div>
  </div>
</div>

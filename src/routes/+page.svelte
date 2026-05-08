<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { authStore } from '$lib/stores/auth.svelte';

  onMount(async () => {
    await authStore.initialize();

    // Redirigir según estado de autenticación
    if (authStore.isAuthenticated) {
      goto('/d');
    } else {
      goto('/login');
    }
  });
</script>

<!-- Mostrar loading mientras se determina el estado -->
<div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
  <div class="flex flex-col items-center gap-4">
    <div class="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
    <p class="text-gray-600 dark:text-gray-400">Cargando...</p>
  </div>
</div>

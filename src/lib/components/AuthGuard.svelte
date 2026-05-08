<script lang="ts">
  import { authStore } from '$lib/stores/auth.svelte';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  interface Props {
    children: import('svelte').Snippet;
    fallback?: import('svelte').Snippet;
    redirectTo?: string;
  }

  let { children, fallback, redirectTo = '/login' }: Props = $props();

  onMount(async () => {
    await authStore.initialize();
  });

  $effect(() => {
    if (!authStore.isLoading && !authStore.isAuthenticated) {
      goto(redirectTo);
    }
  });
</script>

{#if authStore.isLoading}
  {#if fallback}
    {@render fallback()}
  {:else}
    <div class="min-h-screen flex items-center justify-center">
      <div class="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
    </div>
  {/if}
{:else if authStore.isAuthenticated}
  {@render children()}
{/if}
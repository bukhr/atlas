<script lang="ts">
  import { page } from '$app/stores';
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50 p-4">
  <div class="max-w-xl w-full bg-white rounded-lg shadow-lg p-6">
    <h1 class="text-2xl font-bold text-red-600 mb-4">
      Error {$page.status}
    </h1>

    <p class="text-gray-700 mb-4">
      {$page.error?.message || 'Ha ocurrido un error desconocido'}
    </p>

    {#if import.meta.env.DEV}
      <details class="mt-4">
        <summary class="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
          Detalles técnicos (solo en desarrollo)
        </summary>
        <pre class="mt-2 p-4 bg-gray-100 rounded text-xs overflow-auto max-h-64">
{JSON.stringify($page.error, null, 2)}
        </pre>
      </details>
    {/if}

    <div class="mt-6 flex gap-4">
      <a
        href="/"
        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Ir al inicio
      </a>
      <button
        onclick={() => window.location.reload()}
        class="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
      >
        Recargar página
      </button>
    </div>
  </div>
</div>

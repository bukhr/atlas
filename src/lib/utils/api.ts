import { authStore } from '$lib/stores/auth.svelte';

interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
}

export async function apiFetch(url: string, options: FetchOptions = {}) {
  const { requireAuth = true, ...fetchOptions } = options;

  if (requireAuth) {
    const token = await authStore.ensureValidToken();

    if (!token) {
      // Token inválido o expirado
      throw new Error('No valid authentication token');
    }

    fetchOptions.headers = {
      ...fetchOptions.headers,
      Authorization: `Bearer ${token}`
    };
  }

  const response = await fetch(url, fetchOptions);

  if (response.status === 401) {
    throw new Error('Authentication expired');
  }

  return response;
}
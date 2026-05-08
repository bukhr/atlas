import { cacheStore, cacheKeys } from '$lib/stores/cache.svelte';
import { config } from '$lib/config';
import { authStore } from '$lib/stores/auth.svelte';

class OrderService {
  async getOrder(folderId: string): Promise<string[] | null> {
    const cached = await cacheStore.get<string[] | null>(cacheKeys.folderOrder(folderId));
    if (cached !== undefined && cached !== null) return cached;

    try {
      // Lectura desde API Gateway → Lambda → S3 (sin caché de CloudFront)
      const res = await fetch(`/api/folder-order/${folderId}`);

      // 404 = no hay orden custom, no es error
      if (res.status === 404) return null;
      if (!res.ok) return null;

      const data = await res.json();
      const order = data.order as string[] | null;

      if (order) {
        await cacheStore.set(cacheKeys.folderOrder(folderId), order, config.cache.folderOrder);
      }

      return order;
    } catch (e) {
      console.error('Failed to get folder order:', e);
      return null;
    }
  }

  async saveOrder(folderId: string, orderedIds: string[]): Promise<void> {
    const jwt = authStore.jwt;
    if (!jwt) {
      throw new Error('No authenticated');
    }

    const res = await fetch(`/api/folder-order/${folderId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`
      },
      body: JSON.stringify({ order: orderedIds })
    });

    // 422: Lambda retorna este código para permisos denegados
    // (no usa 403 porque CloudFront lo intercepta y convierte en 200)
    if (res.status === 422) {
      throw new Error('NO_PERMISSION');
    }

    if (res.status === 401) {
      throw new Error('TOKEN_EXPIRED');
    }

    if (!res.ok) {
      const msg = await res.text();
      throw new Error(`Failed to save order: ${msg}`);
    }

    await cacheStore.set(cacheKeys.folderOrder(folderId), orderedIds, config.cache.folderOrder);
  }
}

export const orderService = new OrderService();

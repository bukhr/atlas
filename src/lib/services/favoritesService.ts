import type { FavoriteItem } from '$lib/types';
import { authStore } from '$lib/stores/auth.svelte';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_BASE = 'https://www.googleapis.com/upload/drive/v3';
const FILE_NAME = 'favorites.json';

class FavoritesService {
  #fileId: string | null = null;

  async #fetch(url: string, init?: RequestInit): Promise<Response> {
    const token = await authStore.ensureValidToken();
    if (!token) throw new Error('Authentication expired');

    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...init, headers });
  }

  async #findOrNull(): Promise<string | null> {
    if (this.#fileId) return this.#fileId;

    const params = new URLSearchParams({
      spaces: 'appDataFolder',
      q: `name='${FILE_NAME}' and trashed=false`,
      fields: 'files(id)',
      pageSize: '1'
    });

    const res = await this.#fetch(`${DRIVE_API_BASE}/files?${params}`);
    if (!res.ok) return null;

    const data = await res.json();
    this.#fileId = data.files?.[0]?.id ?? null;
    return this.#fileId;
  }

  async load(): Promise<FavoriteItem[]> {
    const fileId = await this.#findOrNull();
    if (!fileId) return [];

    const res = await this.#fetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`);
    if (!res.ok) return [];

    try {
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async save(items: FavoriteItem[]): Promise<void> {
    const body = JSON.stringify(items);
    const blob = new Blob([body], { type: 'application/json' });

    const fileId = await this.#findOrNull();

    if (fileId) {
      // Actualizar archivo existente
      const res = await this.#fetch(`${UPLOAD_API_BASE}/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: blob
      });
      if (!res.ok) throw new Error(`Failed to save favorites: ${res.status}`);
    } else {
      // Crear archivo nuevo en appDataFolder usando multipart
      const metadata = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] });
      const boundary = 'favorites_boundary';

      const multipart = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        metadata,
        `--${boundary}`,
        'Content-Type: application/json',
        '',
        body,
        `--${boundary}--`
      ].join('\r\n');

      const res = await this.#fetch(`${UPLOAD_API_BASE}/files?uploadType=multipart`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipart
      });

      if (!res.ok) throw new Error(`Failed to create favorites: ${res.status}`);

      const created = await res.json();
      this.#fileId = created.id;
    }
  }

  // Limpiar caché del fileId (para tests o re-auth)
  resetCache() {
    this.#fileId = null;
  }
}

export const favoritesService = new FavoritesService();

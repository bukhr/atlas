import { authStore } from '$lib/stores/auth.svelte';
import { config } from '$lib/config';
import { cacheStore, cacheKeys } from '$lib/stores/cache.svelte';
import { createLimiter } from '$lib/utils/concurrency';
import type { DriveFile } from '$lib/types';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const apiLimiter = createLimiter(config.api.maxConcurrent);

interface DriveListResponse {
    files: DriveFile[];
    nextPageToken?: string;
}

class DriveService {
    /**
     * Fetch centralizado con concurrency limiting, retry y manejo uniforme de errores.
     */
    async #apiFetch(url: string, init?: RequestInit): Promise<Response> {
      const token = await authStore.ensureValidToken();
      if (!token) {
        throw new Error('Authentication expired');
      }

      // Inyectar token en headers
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${token}`);
      const enrichedInit = { ...init, headers };

      const { maxRetries, baseDelay, maxDelay } = config.api;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (enrichedInit.signal?.aborted) throw new Error('Request aborted');

        const response = await apiLimiter(() => fetch(url, enrichedInit));

        if (response.ok) return response;

        // 401: token expirado
        if (response.status === 401) {
          throw new Error('Authentication expired');
        }

        // Solo reintentar 429 (rate limit) y 5xx (errores de servidor)
        const isRetryable = response.status === 429 || response.status >= 500;
        if (!isRetryable || attempt === maxRetries) {
          throw new Error(`Drive API error: ${response.status}`);
        }

        // Backoff exponencial con jitter
        const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
        await new Promise((r) => setTimeout(r, delay + delay * 0.5 * Math.random()));
      }

      throw new Error('Max retries exceeded');
    }

    /**
     * Lista archivos en una carpeta de Google Drive (con paginación completa)
     */
    async listFiles(folderId: string): Promise<DriveFile[]> {
      if (!folderId) {
        throw new Error('Folder ID is required. Use "root" for the root folder.');
      }

      const cached = await cacheStore.get<DriveFile[]>(cacheKeys.folderChildren(folderId));
      if (cached) return cached;

      const query = `'${folderId}' in parents and trashed = false`;
      const fields = 'files(id,name,mimeType,parents,createdTime,modifiedTime,webViewLink,iconLink,thumbnailLink,size,owners,lastModifyingUser,shortcutDetails)';

      const allFiles: DriveFile[] = [];
      let pageToken: string | undefined;

      do {
        const params = new URLSearchParams({
          q: query,
          fields: `nextPageToken,${fields}`,
          pageSize: '100',
          orderBy: 'folder,name',
          supportsAllDrives: 'true',
          includeItemsFromAllDrives: 'true'
        });
        if (pageToken) params.set('pageToken', pageToken);

        const response = await this.#apiFetch(`${DRIVE_API_BASE}/files?${params}`);

        const data: DriveListResponse = await response.json();
        allFiles.push(...(data.files || []));
        pageToken = data.nextPageToken;
      } while (pageToken);

      await cacheStore.set(cacheKeys.folderChildren(folderId), allFiles, config.cache.treeStructure);
      return allFiles;
    }

    /**
     * Obtiene metadata de un archivo específico
     */
    async getFile(fileId: string): Promise<DriveFile> {
      const cached = await cacheStore.get<DriveFile>(cacheKeys.fileMetadata(fileId));
      if (cached) return cached;

      const fields = 'id,name,mimeType,parents,createdTime,modifiedTime,webViewLink,iconLink,thumbnailLink,size,owners,lastModifyingUser,shortcutDetails';
      const params = new URLSearchParams({
        fields,
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true'
      });

      const response = await this.#apiFetch(`${DRIVE_API_BASE}/files/${fileId}?${params}`);

      const file: DriveFile = await response.json();
      await cacheStore.set(cacheKeys.fileMetadata(fileId), file, config.cache.fileMetadata);
      return file;
    }

    /**
     * Obtiene metadata de múltiples archivos en paralelo.
     * Devuelve un Map de id → DriveFile para los que se pudieron obtener.
     * El concurrency limiter se encarga de no saturar la API.
     */
    async getFileBatch(fileIds: string[]): Promise<Map<string, DriveFile>> {
      if (fileIds.length === 0) return new Map();

      const results = new Map<string, DriveFile>();

      await Promise.all(
        fileIds.map(async (id) => {
          try {
            const file = await this.getFile(id);
            results.set(id, file);
          } catch {
            // ignorar fallos individuales
          }
        })
      );

      return results;
    }

    /**
     * Busca archivos por nombre
     */
    async searchFiles(
      query: string,
      options: { mode?: 'name' | 'fullText'; driveId?: string; signal?: AbortSignal } = {}
    ): Promise<DriveFile[]> {
      const { mode = 'name', driveId, signal } = options;

      const escapedQuery = query.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const operator = mode === 'fullText' ? 'fullText' : 'name';
      const q = `${operator} contains '${escapedQuery}' and trashed = false`;

      const fields = 'files(id,name,mimeType,parents,webViewLink,iconLink,modifiedTime,thumbnailLink,lastModifyingUser,owners,shortcutDetails)';

      const params = new URLSearchParams({
        q,
        fields,
        pageSize: '50',
        orderBy: 'modifiedTime desc',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true'
      });

      // Restringir búsqueda al Shared Drive
      if (driveId) {
        params.set('corpora', 'drive');
        params.set('driveId', driveId);
      }

      const response = await this.#apiFetch(`${DRIVE_API_BASE}/files?${params}`, {
        signal
      });

      const data: DriveListResponse = await response.json();
      return data.files || [];
    }
}

// Exportar instancia singleton
export const driveService = new DriveService();

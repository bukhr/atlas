import type { DriveFile, FavoriteItem } from '$lib/types';
import { favoritesService } from '$lib/services/favoritesService';

class FavoritesStore {
  items = $state<FavoriteItem[]>([]);
  isLoading = $state(false);

  favoriteIds = $derived(new Set(this.items.map((f) => f.id)));

  isFavorite(id: string): boolean {
    return this.favoriteIds.has(id);
  }

  async load(): Promise<void> {
    this.isLoading = true;
    try {
      this.items = await favoritesService.load();
    } catch {
      // Falla silenciosa — puede ocurrir si el usuario no tiene el scope drive.appdata
      // (sesiones anteriores al login). Los favoritos quedan vacíos hasta re-autenticar.
      this.items = [];
    } finally {
      this.isLoading = false;
    }
  }

  async toggle(file: DriveFile, parentName: string | null = null): Promise<void> {
    const isFav = this.isFavorite(file.id);

    // Optimistic update
    if (isFav) {
      this.items = this.items.filter((f) => f.id !== file.id);
    } else {
      this.items = [
        ...this.items,
        {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          parentName,
          addedAt: new Date().toISOString()
        }
      ];
    }

    // Persistir en background
    try {
      await favoritesService.save(this.items);
    } catch {
      // Revertir si falla el guardado
      if (isFav) {
        this.items = [
          ...this.items,
          {
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            parentName,
            addedAt: new Date().toISOString()
          }
        ];
      } else {
        this.items = this.items.filter((f) => f.id !== file.id);
      }
    }
  }
}

export const favoritesStore = new FavoritesStore();

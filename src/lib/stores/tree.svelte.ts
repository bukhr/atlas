import { driveStore } from './drive.svelte';
import type { FlatNode } from '$lib/types';

class TreeStore {
  // Estado local del tree view
  focusedNodeId = $state<string | null>(null);
  searchQuery = $state('');
  isSearching = $state(false);

  // Lista filtrada por búsqueda
  filteredList = $derived.by(() => {
    if (!this.searchQuery.trim()) {
      return driveStore.flatList;
    }

    const query = this.searchQuery.toLowerCase();
    return driveStore.flatList.filter((node) =>
      node.name.toLowerCase().includes(query)
    );
  });

  // Nodo enfocado
  focusedNode = $derived.by(() => {
    if (!this.focusedNodeId) return null;
    return driveStore.flatList.find((n) => n.id === this.focusedNodeId) ?? null;
  });

  // Navegación por teclado
  focusNext() {
    const list = this.filteredList;
    if (list.length === 0) return;

    const currentIndex = list.findIndex((n) => n.id === this.focusedNodeId);
    const nextIndex = currentIndex < list.length - 1 ? currentIndex + 1 : 0;
    this.focusedNodeId = list[nextIndex].id;
  }

  focusPrevious() {
    const list = this.filteredList;
    if (list.length === 0) return;

    const currentIndex = list.findIndex((n) => n.id === this.focusedNodeId);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : list.length - 1;
    this.focusedNodeId = list[prevIndex].id;
  }

  setSearch(query: string) {
    this.searchQuery = query;
  }

  clearSearch() {
    this.searchQuery = '';
  }
}

export const treeStore = new TreeStore();
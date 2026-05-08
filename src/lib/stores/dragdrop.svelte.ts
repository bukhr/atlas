import { driveStore } from '$lib/stores/drive.svelte';

class DragDropStore {
  draggedNodeId = $state<string | null>(null);
  draggedParentId = $state<string | null>(null);
  dropTargetId = $state<string | null>(null);
  dropPosition = $state<'before' | 'after' | null>(null);
  isDragging = $derived(!!this.draggedNodeId);
  isTouchDragging = $state(false);
  private clearTimer: ReturnType<typeof setTimeout> | null = null;

  startDrag(nodeId: string, parentId: string | null) {
    this.draggedNodeId = nodeId;
    this.draggedParentId = parentId;
  }

  startTouchDrag(nodeId: string, parentId: string | null) {
    this.isTouchDragging = true;
    this.startDrag(nodeId, parentId);
  }

  updateDropTarget(targetId: string, position: 'before' | 'after') {
    if (this.clearTimer) { clearTimeout(this.clearTimer); this.clearTimer = null; }
    this.dropTargetId = targetId;
    this.dropPosition = position;
  }

  scheduleClearDropTarget() {
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.clearTimer = setTimeout(() => {
      this.dropTargetId = null;
      this.dropPosition = null;
      this.clearTimer = null;
    }, 60);
  }

  clearDropTarget() {
    if (this.clearTimer) { clearTimeout(this.clearTimer); this.clearTimer = null; }
    this.dropTargetId = null;
    this.dropPosition = null;
  }

  executeDrop() {
    if (!this.draggedNodeId || !this.dropTargetId || !this.dropPosition || !this.draggedParentId) {
      this.reset();
      return;
    }

    // Can only reorder within the same parent
    const parentId = this.draggedParentId;

    // Get current children for this parent
    const children = parentId === '__root__'
      ? driveStore.rootNodes
      : driveStore.loadedChildren.get(parentId);

    if (!children) {
      this.reset();
      return;
    }

    const currentIds = children.map(c => c.id);
    const draggedIdx = currentIds.indexOf(this.draggedNodeId);
    const targetIdx = currentIds.indexOf(this.dropTargetId);

    if (draggedIdx === -1 || targetIdx === -1 || draggedIdx === targetIdx) {
      this.reset();
      return;
    }

    // Build new order
    const newIds = currentIds.filter(id => id !== this.draggedNodeId);
    const insertIdx = this.dropPosition === 'before'
      ? newIds.indexOf(this.dropTargetId)
      : newIds.indexOf(this.dropTargetId) + 1;

    newIds.splice(insertIdx, 0, this.draggedNodeId);

    // Delegate to drive store for optimistic update + persistence
    driveStore.reorderChildren(parentId, newIds);

    this.reset();
  }

  reset() {
    this.draggedNodeId = null;
    this.draggedParentId = null;
    this.dropTargetId = null;
    this.dropPosition = null;
    this.isTouchDragging = false;
  }
}

export const dragDropStore = new DragDropStore();

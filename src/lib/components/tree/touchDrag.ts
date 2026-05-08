import { dragDropStore } from '$lib/stores/dragdrop.svelte';

interface TouchDragParams {
	nodeId: string;
	parentId: string;
	enabled: boolean;
}

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 10;
const SCROLL_EDGE_PX = 40;
const SCROLL_SPEED = 8;

export function touchDrag(node: HTMLElement, params: TouchDragParams) {
	let { nodeId, parentId, enabled } = params;

	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let startX = 0;
	let startY = 0;
	let isActive = false;
	let rafId: number | null = null;
	let scrollContainer: HTMLElement | null = null;
	let treeNodeEl: HTMLElement | null = null;

	function findTreeNode(): HTMLElement | null {
		return node.closest('.tree-node') as HTMLElement | null;
	}

	function findScrollContainer(): HTMLElement | null {
		let el: HTMLElement | null = node;
		while (el) {
			const style = getComputedStyle(el);
			if (style.overflowY === 'auto' || style.overflowY === 'scroll') return el;
			el = el.parentElement;
		}
		return null;
	}

	function handleTouchStart(e: TouchEvent) {
		if (!enabled) return;
		const touch = e.touches[0];
		startX = touch.clientX;
		startY = touch.clientY;

		treeNodeEl = findTreeNode();
		treeNodeEl?.classList.add('touch-drag-pending');

		// Prevent text selection during long-press
		if (treeNodeEl) treeNodeEl.style.userSelect = 'none';

		longPressTimer = setTimeout(() => {
			isActive = true;
			dragDropStore.startTouchDrag(nodeId, parentId);
			treeNodeEl?.classList.remove('touch-drag-pending');
			treeNodeEl?.classList.add('touch-dragging');
			scrollContainer = findScrollContainer();
			if (navigator.vibrate) navigator.vibrate(50);
		}, LONG_PRESS_MS);
	}

	function handleTouchMove(e: TouchEvent) {
		const touch = e.touches[0];

		if (!isActive) {
			// Cancel long-press if finger moved too much
			const dx = touch.clientX - startX;
			const dy = touch.clientY - startY;
			if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
				cancelPending();
			}
			return;
		}

		e.preventDefault();
		e.stopPropagation();

		// Find element under touch
		const elUnder = document.elementFromPoint(touch.clientX, touch.clientY);
		if (!elUnder) return;

		const targetTreeNode = (elUnder as HTMLElement).closest('.tree-node') as HTMLElement | null;
		if (targetTreeNode) {
			const targetId = targetTreeNode.dataset.nodeId;
			const targetParent = targetTreeNode.dataset.parentId;

			if (targetId && targetParent === parentId && targetId !== nodeId) {
				const rect = targetTreeNode.getBoundingClientRect();
				const midY = rect.top + rect.height / 2;
				const position = touch.clientY < midY ? 'before' : 'after';
				dragDropStore.updateDropTarget(targetId, position);
			}
		}

		// Auto-scroll near edges
		autoScroll(touch.clientY);
	}

	function autoScroll(touchY: number) {
		if (rafId) cancelAnimationFrame(rafId);
		if (!scrollContainer) return;

		const rect = scrollContainer.getBoundingClientRect();
		let scrollDelta = 0;

		if (touchY - rect.top < SCROLL_EDGE_PX) {
			scrollDelta = -SCROLL_SPEED;
		} else if (rect.bottom - touchY < SCROLL_EDGE_PX) {
			scrollDelta = SCROLL_SPEED;
		}

		if (scrollDelta !== 0) {
			const step = () => {
				if (!isActive || !scrollContainer) return;
				scrollContainer.scrollTop += scrollDelta;
				rafId = requestAnimationFrame(step);
			};
			rafId = requestAnimationFrame(step);
		}
	}

	function handleTouchEnd() {
		if (isActive) {
			dragDropStore.executeDrop();
		}
		cleanup();
	}

	function handleTouchCancel() {
		if (isActive) {
			dragDropStore.reset();
		}
		cleanup();
	}

	function handleContextMenu(e: Event) {
		if (isActive || longPressTimer) e.preventDefault();
	}

	function cancelPending() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		treeNodeEl?.classList.remove('touch-drag-pending');
	}

	function cleanup() {
		cancelPending();
		isActive = false;
		if (rafId) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
		if (treeNodeEl) {
			treeNodeEl.classList.remove('touch-dragging');
			treeNodeEl.style.userSelect = '';
		}
		scrollContainer = null;
	}

	node.addEventListener('touchstart', handleTouchStart, { passive: true });
	node.addEventListener('touchmove', handleTouchMove, { passive: false });
	node.addEventListener('touchend', handleTouchEnd);
	node.addEventListener('touchcancel', handleTouchCancel);
	node.addEventListener('contextmenu', handleContextMenu);

	return {
		update(newParams: TouchDragParams) {
			nodeId = newParams.nodeId;
			parentId = newParams.parentId;
			enabled = newParams.enabled;
			if (!enabled) cleanup();
		},
		destroy() {
			cleanup();
			node.removeEventListener('touchstart', handleTouchStart);
			node.removeEventListener('touchmove', handleTouchMove);
			node.removeEventListener('touchend', handleTouchEnd);
			node.removeEventListener('touchcancel', handleTouchCancel);
			node.removeEventListener('contextmenu', handleContextMenu);
		}
	};
}

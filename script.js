document.addEventListener('DOMContentLoaded', () => {
  const grid = document.querySelector('.viewport-grid');
  if (!grid) return;

  const STORAGE_KEY = 'tileOrder:v1';

  function getTiles() {
    return Array.from(grid.querySelectorAll('.tile'));
  }

  function applySavedOrder() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const order = JSON.parse(raw);
      const byId = new Map(getTiles().map(t => [t.dataset.id, t]));
      order.forEach(id => {
        const el = byId.get(id);
        if (el) grid.appendChild(el);
      });
    } catch {}
  }

  function saveOrder() {
    const order = getTiles().map(t => t.dataset.id);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(order)); } catch {}
  }

  applySavedOrder();

  // Drag & drop reorder with placeholder + FLIP animation
  let draggingEl = null;
  let placeholderEl = null;
  let originalNextSibling = null;
  let originalParent = null;
  let movedDuringDrag = false;

  function measureRects(exclude) {
    const map = new Map();
    getTiles().forEach(el => {
      if (exclude && exclude.has(el)) return;
      map.set(el, el.getBoundingClientRect());
    });
    return map;
  }

  function flipAnimate(beforeRects, exclude) {
    // Animate elements from old to new positions
    const toAnimate = getTiles().filter(el => !(exclude && exclude.has(el)));
    const afterRects = new Map(toAnimate.map(el => [el, el.getBoundingClientRect()]));
    toAnimate.forEach(el => {
      const before = beforeRects.get(el);
      const after = afterRects.get(el);
      if (!before || !after) return;
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (dx !== 0 || dy !== 0) {
        el.style.transition = 'transform 0s';
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        // Next frame: animate to natural position for subtle bounce
        requestAnimationFrame(() => {
          el.style.transition = 'transform 280ms cubic-bezier(.2, .8, .2, 1)';
          el.style.transform = 'translate(0, 0)';
        });
      }
    });
  }

  getTiles().forEach(tile => {
    tile.addEventListener('dragstart', (e) => {
      draggingEl = tile;
      movedDuringDrag = false;
      originalParent = tile.parentNode;
      originalNextSibling = tile.nextSibling;

      // Create placeholder to keep layout space
      placeholderEl = document.createElement('div');
      placeholderEl.className = 'tile placeholder';
      // Insert placeholder at tile position
      grid.insertBefore(placeholderEl, tile);

      // Hide original tile from flow while dragging
      tile.classList.add('dragging');
      tile.style.visibility = 'hidden';
      // For Firefox compatibility
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', tile.dataset.id || 'tile');
        e.dataTransfer.effectAllowed = 'move';
      }
    });

    tile.addEventListener('dragend', () => {
      // Finalize position or revert
      if (placeholderEl) {
        const beforeRects = measureRects(new Set([draggingEl]));
        if (movedDuringDrag) {
          grid.insertBefore(tile, placeholderEl);
        } else if (originalParent) {
          originalParent.insertBefore(tile, originalNextSibling);
        }
        // Clean up placeholder
        placeholderEl.remove();
        placeholderEl = null;
        // Animate reflow bounce for others
        requestAnimationFrame(() => flipAnimate(beforeRects, new Set([draggingEl])));
      }
      tile.classList.remove('dragging');
      tile.style.visibility = '';
      draggingEl = null;
      // Persist only if order actually changed
      if (movedDuringDrag) saveOrder();
    });
  });

  grid.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!draggingEl || !placeholderEl) return;
    const beforeRects = measureRects(new Set([draggingEl]));
    const after = getDragAfterElement(grid, e.clientX, e.clientY, placeholderEl);
    const currentNext = placeholderEl.nextSibling;
    if (after == null) {
      if (grid.lastChild !== placeholderEl) {
        grid.appendChild(placeholderEl);
        movedDuringDrag = true;
      }
    } else if (after !== placeholderEl && after !== currentNext) {
      grid.insertBefore(placeholderEl, after);
      movedDuringDrag = true;
    }
    // Animate other tiles responding to placeholder movement
    requestAnimationFrame(() => flipAnimate(beforeRects, new Set([draggingEl])));
  });

  grid.addEventListener('drop', (e) => {
    e.preventDefault();
    // drop is handled in dragend where we finalize/revert
  });

  // Prevent accidental navigation when dragging: if a drag occurs, block the click once.
  let dragHappened = false;
  grid.addEventListener('dragstart', () => { dragHappened = true; }, true);
  grid.addEventListener('click', (e) => {
    if (!dragHappened) return;
    dragHappened = false;
    if (e.target.closest('.tile')) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // Micro interactions: keyboard reordering (accessibility)
  grid.addEventListener('keydown', (e) => {
    const tile = e.target.closest && e.target.closest('.tile');
    if (!tile) return;
    const tiles = getTiles();
    const idx = tiles.indexOf(tile);
    if (idx === -1) return;
    const swap = (i, j) => {
      if (j < 0 || j >= tiles.length) return;
      const a = tiles[i];
      const b = tiles[j];
      if (a && b) grid.insertBefore(b, a);
      saveOrder();
      tiles[j].focus();
    };
    if ((e.metaKey || e.ctrlKey) && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) {
      e.preventDefault();
      swap(idx, idx - 1);
    } else if ((e.metaKey || e.ctrlKey) && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) {
      e.preventDefault();
      swap(idx, idx + 1);
    }
  });

  // Utility: find element whose center is closest to cursor
  function getDragAfterElement(container, x, y, ignoreEl) {
    const els = [...container.querySelectorAll('.tile')].filter(el => el !== ignoreEl);
    if (els.length === 0) return null;
    let closest = { el: null, d2: Infinity, before: true };
    for (const el of els) {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < closest.d2) {
        closest = { el, d2, before: (dy < 0) || (Math.abs(dy) < rect.height / 2 && dx < 0) };
      }
    }
    // Insert before if pointer is mostly above/left of center
    if (closest.el) {
      return closest.before ? closest.el : closest.el.nextSibling;
    }
    return null;
  }

  // Enhance focus usability
  getTiles().forEach(t => t.setAttribute('tabindex', '0'));
});



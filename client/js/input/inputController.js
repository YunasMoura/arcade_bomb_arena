export function createInputController({ onInputChange, onPlaceBomb, onQuit, onToggleMute }) {
  const keys = { up: false, down: false, left: false, right: false };
  let active = false;

  function emitIfChanged(next) {
    if (
      next.up !== keys.up ||
      next.down !== keys.down ||
      next.left !== keys.left ||
      next.right !== keys.right
    ) {
      Object.assign(keys, next);
      onInputChange({ ...keys });
    }
  }

  function handleKeyDown(e) {
    if (!active) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (e.code === 'Escape') {
      onQuit?.();
      return;
    }
    if (e.code === 'KeyM' && !e.repeat) {
      onToggleMute?.();
      return;
    }
    if (e.code === 'Space' && !e.repeat) {
      onPlaceBomb?.();
      return;
    }

    const next = { ...keys };
    if (e.code === 'KeyW' || e.code === 'ArrowUp') next.up = true;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') next.down = true;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') next.left = true;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') next.right = true;
    emitIfChanged(next);
  }

  function handleKeyUp(e) {
    if (!active) return;
    const next = { ...keys };
    if (e.code === 'KeyW' || e.code === 'ArrowUp') next.up = false;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') next.down = false;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') next.left = false;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') next.right = false;
    emitIfChanged(next);
  }

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', () => {
    if (active) emitIfChanged({ up: false, down: false, left: false, right: false });
  });

  // Touch bindings
  document.querySelectorAll('.dpad-btn').forEach((btn) => {
    const dir = btn.dataset.dir;
    const setDir = (val) => (ev) => {
      ev.preventDefault();
      if (!active) return;
      emitIfChanged({ ...keys, [dir]: val });
    };
    btn.addEventListener('touchstart', setDir(true), { passive: false });
    btn.addEventListener('touchend', setDir(false), { passive: false });
    btn.addEventListener('mousedown', setDir(true));
    btn.addEventListener('mouseup', setDir(false));
  });

  const touchBomb = document.getElementById('btn-touch-bomb');
  if (touchBomb) {
    touchBomb.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (active) onPlaceBomb?.();
    }, { passive: false });
    touchBomb.addEventListener('click', () => {
      if (active) onPlaceBomb?.();
    });
  }

  return {
    enable() {
      active = true;
      Object.assign(keys, { up: false, down: false, left: false, right: false });
    },
    disable() {
      active = false;
      Object.assign(keys, { up: false, down: false, left: false, right: false });
    },
  };
}

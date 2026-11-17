// Keyboard + mouse input: held keys, one-shot actions, and the aim point.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_RELOAD = 8;
export const ACTION_MUTE = 16;
export const ACTION_PUNCH = 32;

export function createInput(canvas) {
  const held = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false, rightDown: false };
  let actions = 0;

  function keyDown(e) {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    if (e.repeat) return;
    held.add(e.code);
    if (e.code === 'Enter' || e.code === 'Space') actions |= ACTION_CONFIRM;
    if (e.code === 'KeyP' || e.code === 'Escape') actions |= ACTION_PAUSE;
    if (e.code === 'KeyE') actions |= ACTION_INTERACT;
    if (e.code === 'KeyR') actions |= ACTION_RELOAD;
    if (e.code === 'KeyM') actions |= ACTION_MUTE;
  }
  function keyUp(e) {
    held.delete(e.code);
  }
  function mouseMove(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * canvas.width;
    mouse.y = ((e.clientY - r.top) / r.height) * canvas.height;
  }
  function mouseDown(e) {
    mouseMove(e);
    if (e.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
      actions |= ACTION_CONFIRM;
    }
    if (e.button === 2) mouse.rightDown = true;
  }
  function mouseUp(e) {
    if (e.button === 0) mouse.down = false;
    if (e.button === 2) mouse.rightDown = false;
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  canvas.addEventListener('mousemove', mouseMove);
  canvas.addEventListener('mousedown', mouseDown);
  window.addEventListener('mouseup', mouseUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    held,
    mouse,
    isDown(code) {
      return held.has(code);
    },
    // WASD / arrows as a normalised 2D direction.
    direction() {
      let x = 0;
      let y = 0;
      if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
      if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
      if (held.has('KeyW') || held.has('ArrowUp')) y -= 1;
      if (held.has('KeyS') || held.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) {
        const inv = 1 / Math.hypot(x, y);
        x *= inv;
        y *= inv;
      }
      return { x, y };
    },
    sprinting() {
      return held.has('ShiftLeft') || held.has('ShiftRight');
    },
    takeActions() {
      const a = actions;
      actions = 0;
      const clicked = mouse.clicked;
      mouse.clicked = false;
      return { bits: a, clicked };
    },
  };
}

// Keyboard + mouse input. Held keys are a live set; one-shot presses are
// queued and consumed once per fixed step so a tap is never missed.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 640, y: 360, down: false, clicked: false, wx: 0, wy: 0 };

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (!keys.has(e.code)) pressed.add(e.code);
    keys.add(e.code);
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onMouseMove(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 1280;
    mouse.y = ((e.clientY - r.top) / r.height) * 720;
  }
  function onMouseDown(e) {
    if (e.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
      onMouseMove(e);
    }
  }
  function onMouseUp(e) {
    if (e.button === 0) mouse.down = false;
  }
  function onBlur() {
    keys.clear();
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    keys,
    mouse,
    isDown(code) {
      return keys.has(code);
    },
    anyDown(codes) {
      return codes.some((c) => keys.has(c));
    },
    wasPressed(code) {
      return pressed.has(code);
    },
    anyPressed(codes) {
      return codes.some((c) => pressed.has(c));
    },
    // Call once per fixed step, after the step has read the queue.
    endStep() {
      pressed.clear();
      mouse.clicked = false;
    },
  };
}

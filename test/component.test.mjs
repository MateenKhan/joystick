/**
 * Integration tests: the real component, mounted in a real DOM, driven by real
 * pointer events.
 *
 *   node test/component.test.mjs      (run by `npm test`)
 *
 * jsdom is a devDependency only — nothing here ships.
 *
 * Covers J-02 (only `move` by default), J-03 (pointer/touch/pen, and the
 * gesture preventing default so the page cannot scroll), J-04 (accelerating
 * past the ring while the thumb clamps) and J-05 (`onEnd` on `pointercancel`
 * with the right `dominantAxis`).
 */

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// ── DOM ─────────────────────────────────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true, // gives us a 16ms requestAnimationFrame
  url: 'http://127.0.0.1/',
});

const { window } = dom;

// jsdom has no PointerEvent and no pointer capture; both are trivial to stand in for.
if (!window.PointerEvent) {
  window.PointerEvent = class PointerEvent extends window.MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
      this.isPrimary = init.isPrimary ?? true;
      this.width = init.width ?? 1;
      this.height = init.height ?? 1;
      this.pressure = init.pressure ?? 0.5;
    }
  };
}
const captured = new Set();
window.Element.prototype.setPointerCapture = function (id) {
  captured.add(`${id}`);
};
window.Element.prototype.releasePointerCapture = function (id) {
  captured.delete(`${id}`);
};
window.Element.prototype.hasPointerCapture = function (id) {
  return captured.has(`${id}`);
};

for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'MouseEvent',
  'PointerEvent',
  'KeyboardEvent',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
]) {
  // Node 22 defines `navigator` as a getter-only global; redefine rather than assign.
  Object.defineProperty(globalThis, key, {
    value: window[key],
    writable: true,
    configurable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { Joystick } = await import('../dist/index.js');

const SIZE = 140;
const RADIUS = SIZE * 0.29; // 40.6px
const CENTER = { x: 500, y: 400 };

// jsdom has no layout, so every element reports a zero-sized box. The stick
// only ever measures its own base, so one stub is enough.
window.Element.prototype.getBoundingClientRect = function () {
  if (this.classList?.contains('jy-base')) {
    return {
      left: CENTER.x - SIZE / 2,
      top: CENTER.y - SIZE / 2,
      right: CENTER.x + SIZE / 2,
      bottom: CENTER.y + SIZE / 2,
      width: SIZE,
      height: SIZE,
      x: CENTER.x - SIZE / 2,
      y: CENTER.y - SIZE / 2,
    };
  }
  return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
};

const tick = () => new Promise((r) => setTimeout(r, 0));
const frames = (n) => new Promise((r) => setTimeout(r, n * 17));

let passed = 0;
let failed = 0;
const only = process.argv[2];

const cases = [];
function test(name, fn) {
  cases.push({ name, fn });
}
function group(name) {
  cases.push({ group: name });
}

// ── harness ─────────────────────────────────────────────────────────────────
async function mount(props = {}) {
  const host = window.document.createElement('div');
  window.document.body.appendChild(host);
  const root = createRoot(host);
  const events = { start: [], change: [], end: [], hover: [], tap: [] };
  root.render(
    React.createElement(Joystick, {
      size: SIZE,
      onStart: (e) => events.start.push(e),
      onChange: (d, e) => events.change.push({ ...d, meta: e }),
      onEnd: (s, e) => events.end.push({ ...s, meta: e }),
      onHover: (h) => events.hover.push(h),
      ...props,
    }),
  );
  // React's first render is scheduled, not synchronous — wait for it to land.
  let base = null;
  for (let i = 0; i < 50 && !base; i += 1) {
    await tick();
    base = host.querySelector('.jy-base');
  }
  assert.ok(base, 'the component never mounted');
  return {
    host,
    base,
    events,
    thumb: () => host.querySelector('.jy-thumb'),
    root: () => host.querySelector('.jy-root'),
    unmount: () => root.unmount(),
  };
}

function pointer(type, dx, dy, init = {}) {
  return new window.PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: init.pointerId ?? 7,
    pointerType: init.pointerType ?? 'mouse',
    clientX: CENTER.x + dx,
    clientY: CENTER.y + dy,
    button: 0,
    buttons: 1,
    ...init,
  });
}

/** Thumb offset in px, read back out of the inline transform. */
function thumbOffset(el) {
  const m = /translate\(calc\(-50% \+ (-?[\d.]+)px\), calc\(-50% \+ (-?[\d.]+)px\)\)/.exec(
    el.getAttribute('style') ?? '',
  );
  if (!m) return null;
  return { x: Number(m[1]), y: Number(m[2]), dist: Math.hypot(Number(m[1]), Number(m[2])) };
}

// ── J-02 ────────────────────────────────────────────────────────────────────
group('J-02 default operations');

test('offers only `move` when `operations` is not given', async () => {
  const ui = await mount();
  assert.equal(ui.root().dataset.operation, 'move');
  // No switcher to press: the one operation is a static chip.
  assert.equal(ui.host.querySelector('button.jy-mode'), null);
  assert.equal(ui.host.querySelector('.jy-mode--static').textContent.includes('Move'), true);
  // No rotate/extrude/fillet chrome anywhere.
  assert.equal(/Extrude|Fillet|Rotate|Scale/.test(ui.host.textContent), false);
  ui.unmount();
});

test('renders a switcher only when more than one operation is offered', async () => {
  const ui = await mount({ operations: ['move', 'rotate'] });
  const button = ui.host.querySelector('button.jy-mode');
  assert.ok(button);
  button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick();
  assert.equal(ui.root().dataset.operation, 'rotate');
  ui.unmount();
});

// ── J-03 ────────────────────────────────────────────────────────────────────
group('J-03 pointer, touch and pen');

for (const pointerType of ['mouse', 'touch', 'pen']) {
  test(`drives from a ${pointerType} pointer`, async () => {
    const ui = await mount();
    ui.base.dispatchEvent(pointer('pointerdown', 0, 0, { pointerType }));
    ui.base.dispatchEvent(pointer('pointermove', 60, 0, { pointerType }));
    await frames(4);
    ui.base.dispatchEvent(pointer('pointerup', 60, 0, { pointerType }));
    await tick();
    assert.equal(ui.events.start.length, 1);
    assert.equal(ui.events.start[0].pointerType, pointerType);
    assert.ok(ui.events.change.length > 0, 'expected frames to be emitted');
    assert.ok(ui.events.change.every((d) => d.x > 0));
    assert.equal(ui.events.end.length, 1);
    ui.unmount();
  });
}

test('a touch drag cannot scroll the page: every move is preventDefault-ed', async () => {
  const ui = await mount();
  const down = pointer('pointerdown', 0, 0, { pointerType: 'touch' });
  ui.base.dispatchEvent(down);
  assert.equal(down.defaultPrevented, true, 'pointerdown must be prevented');

  const move = pointer('pointermove', 0, 80, { pointerType: 'touch' });
  ui.base.dispatchEvent(move);
  assert.equal(move.defaultPrevented, true, 'pointermove must be prevented');

  const touchMove = new window.Event('touchmove', { bubbles: true, cancelable: true });
  ui.base.dispatchEvent(touchMove);
  assert.equal(touchMove.defaultPrevented, true, 'touchmove must be prevented while dragging');

  ui.base.dispatchEvent(pointer('pointerup', 0, 80, { pointerType: 'touch' }));
  await tick();

  // ... and once the gesture is over, touchmove is left alone again.
  const after = new window.Event('touchmove', { bubbles: true, cancelable: true });
  ui.base.dispatchEvent(after);
  assert.equal(after.defaultPrevented, false);
  ui.unmount();
});

test('takes pointer capture so a drag that leaves the element keeps working', async () => {
  const ui = await mount();
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0));
  assert.equal(ui.base.hasPointerCapture(7), true);
  // 900px away — nowhere near the element.
  ui.base.dispatchEvent(pointer('pointermove', 900, -400));
  await frames(3);
  assert.ok(ui.events.change.length > 0);
  ui.base.dispatchEvent(pointer('pointerup', 900, -400));
  await tick();
  assert.equal(ui.base.hasPointerCapture(7), false);
  ui.unmount();
});

test('ignores a second pointer while one is already dragging', async () => {
  const ui = await mount();
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0, { pointerId: 1 }));
  ui.base.dispatchEvent(pointer('pointerdown', 30, 0, { pointerId: 2 }));
  ui.base.dispatchEvent(pointer('pointerup', 30, 0, { pointerId: 2 }));
  await tick();
  assert.equal(ui.events.start.length, 1, 'only one gesture');
  assert.equal(ui.events.end.length, 0, 'the stray pointer must not end it');
  ui.base.dispatchEvent(pointer('pointerup', 0, 0, { pointerId: 1 }));
  await tick();
  assert.equal(ui.events.end.length, 1);
  ui.unmount();
});

// ── J-04 ────────────────────────────────────────────────────────────────────
group('J-04 drag past the ring keeps accelerating');

test('the emitted speed grows past the ring while the thumb clamps to it', async () => {
  const ui = await mount();
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0));

  ui.base.dispatchEvent(pointer('pointermove', RADIUS, 0)); // exactly on the ring
  await frames(3);
  const onRing = ui.events.change.at(-1).x;
  const thumbOnRing = thumbOffset(ui.thumb());

  ui.base.dispatchEvent(pointer('pointermove', RADIUS * 2.2, 0)); // way past it
  await frames(3);
  const pastRing = ui.events.change.at(-1).x;
  const thumbPastRing = thumbOffset(ui.thumb());

  assert.ok(pastRing > onRing * 4, `expected ${pastRing} >> ${onRing}`);
  assert.ok(Math.abs(thumbOnRing.dist - RADIUS) < 0.6, `thumb ${thumbOnRing.dist} vs ${RADIUS}`);
  assert.ok(Math.abs(thumbPastRing.dist - RADIUS) < 0.6, 'thumb must not leave the ring');
  // The thumb is 38% of the base, so its far edge stays inside the base circle.
  assert.ok(thumbPastRing.dist + SIZE * 0.19 <= SIZE / 2, 'thumb must stay inside the base');

  ui.base.dispatchEvent(pointer('pointerup', RADIUS * 2.2, 0));
  await tick();
  ui.unmount();
});

test('the deadzone emits nothing at all', async () => {
  const ui = await mount({ deadzone: 0.3 });
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0));
  ui.base.dispatchEvent(pointer('pointermove', RADIUS * 0.2, 0));
  await frames(4);
  assert.equal(ui.events.change.length, 0);
  ui.base.dispatchEvent(pointer('pointermove', RADIUS * 0.9, 0));
  await frames(3);
  assert.ok(ui.events.change.length > 0);
  ui.base.dispatchEvent(pointer('pointerup', RADIUS * 0.9, 0));
  await tick();
  ui.unmount();
});

test('the directional glow follows the side being pushed', async () => {
  const ui = await mount();
  assert.equal(ui.host.querySelector('.jy-glow'), null, 'no glow at rest');
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0));
  ui.base.dispatchEvent(pointer('pointermove', RADIUS, 0));
  await tick();
  const glow = ui.host.querySelector('.jy-glow');
  assert.ok(glow, 'glow appears while dragging');
  assert.ok(/translate\(4[01]\.\d+px, /.test(glow.getAttribute('style')), glow.getAttribute('style'));
  ui.base.dispatchEvent(pointer('pointerup', RADIUS, 0));
  await tick();
  assert.equal(ui.host.querySelector('.jy-glow'), null, 'glow goes when the drag does');
  ui.unmount();
});

// ── J-05 ────────────────────────────────────────────────────────────────────
group('J-05 onEnd on pointercancel');

test('pointercancel ends the gesture and keeps the totals', async () => {
  const ui = await mount();
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0));
  ui.base.dispatchEvent(pointer('pointermove', RADIUS * 1.5, RADIUS * 0.2));
  await frames(5);
  ui.base.dispatchEvent(pointer('pointercancel', RADIUS * 1.5, RADIUS * 0.2));
  await tick();

  assert.equal(ui.events.end.length, 1, 'onEnd must fire on pointercancel');
  const summary = ui.events.end[0];
  assert.equal(summary.cancelled, false, 'a system cancel is not a user cancel');
  assert.equal(summary.dominantAxis, 'x');
  assert.ok(summary.total.x > 0);
  assert.ok(summary.durationMs >= 0);
  assert.equal(summary.operation, 'move');
  assert.equal(ui.root().className.includes('jy-root--dragging'), false, 'state must reset');
  ui.unmount();
});

test('dominantAxis picks the axis that actually moved most', async () => {
  const ui = await mount();
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0));
  ui.base.dispatchEvent(pointer('pointermove', RADIUS * 0.3, -RADIUS * 1.6));
  await frames(5);
  ui.base.dispatchEvent(pointer('pointercancel', RADIUS * 0.3, -RADIUS * 1.6));
  await tick();
  assert.equal(ui.events.end[0].dominantAxis, 'y');
  assert.ok(ui.events.end[0].total.y > 0, 'up is +y');
  ui.unmount();
});

test('lostpointercapture also closes the gesture out', async () => {
  const ui = await mount();
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0));
  ui.base.dispatchEvent(pointer('pointermove', RADIUS, 0));
  await frames(2);
  ui.base.dispatchEvent(pointer('lostpointercapture', RADIUS, 0));
  await tick();
  assert.equal(ui.events.end.length, 1);
  ui.unmount();
});

test('unmounting mid-drag still closes the gesture out', async () => {
  const ui = await mount();
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0));
  ui.base.dispatchEvent(pointer('pointermove', RADIUS, 0));
  await frames(2);
  ui.unmount();
  await tick();
  assert.equal(ui.events.end.length, 1);
  assert.equal(ui.events.end[0].cancelled, true);
});

// ── keyboard ────────────────────────────────────────────────────────────────
group('keyboard');

const key = (type, k, init = {}) =>
  new window.KeyboardEvent(type, { bubbles: true, cancelable: true, key: k, ...init });

test('arrows step, and one burst is one gesture', async () => {
  const ui = await mount();
  ui.base.dispatchEvent(key('keydown', 'ArrowUp'));
  ui.base.dispatchEvent(key('keydown', 'ArrowUp'));
  ui.base.dispatchEvent(key('keyup', 'ArrowUp'));
  await tick();
  assert.equal(ui.events.start.length, 1);
  assert.equal(ui.events.change.length, 2);
  assert.equal(ui.events.change[0].y, 1);
  assert.equal(ui.events.end.length, 1);
  assert.equal(ui.events.end[0].total.y, 2);
  assert.equal(ui.events.end[0].dominantAxis, 'y');
  assert.equal(ui.events.start[0].source, 'keyboard');
  ui.unmount();
});

test('shift takes a large step', async () => {
  const ui = await mount();
  ui.base.dispatchEvent(key('keydown', 'ArrowRight', { shiftKey: true }));
  ui.base.dispatchEvent(key('keyup', 'ArrowRight'));
  await tick();
  assert.equal(ui.events.change[0].x, 10);
  ui.unmount();
});

test('arrow keys never scroll the page', async () => {
  const ui = await mount();
  const e = key('keydown', 'ArrowDown');
  ui.base.dispatchEvent(e);
  assert.equal(e.defaultPrevented, true);
  ui.base.dispatchEvent(key('keyup', 'ArrowDown'));
  await tick();
  ui.unmount();
});

test('Escape cancels a pointer gesture and zeroes the total', async () => {
  const ui = await mount();
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0));
  ui.base.dispatchEvent(pointer('pointermove', RADIUS * 1.5, 0));
  await frames(5);
  assert.ok(ui.events.change.length > 0);
  window.dispatchEvent(key('keydown', 'Escape'));
  await tick();
  assert.equal(ui.events.end.length, 1);
  assert.equal(ui.events.end[0].cancelled, true);
  assert.deepEqual(ui.events.end[0].total, { x: 0, y: 0, z: 0 });
  assert.equal(ui.events.end[0].dominantAxis, null);
  ui.unmount();
});

test('Escape cancels a keyboard gesture too', async () => {
  const ui = await mount();
  ui.base.dispatchEvent(key('keydown', 'ArrowUp'));
  ui.base.dispatchEvent(key('keydown', 'Escape'));
  await tick();
  assert.equal(ui.events.end.length, 1);
  assert.equal(ui.events.end[0].cancelled, true);
  ui.unmount();
});

// ── taps, z-mode, disabled ──────────────────────────────────────────────────
group('taps, z-mode and disabled');

test('a quick tap reports an axis instead of a drag', async () => {
  const taps = [];
  const ui = await mount({ onAxisTap: (axis, dir) => taps.push([axis, dir]) });
  ui.base.dispatchEvent(pointer('pointerdown', RADIUS, 0));
  await frames(2);
  ui.base.dispatchEvent(pointer('pointerup', RADIUS, 0));
  await tick();
  assert.deepEqual(taps, [['x', 1]]);
  assert.equal(ui.events.change.length, 0, 'a tap must not emit movement');
  assert.deepEqual(ui.events.end[0].total, { x: 0, y: 0, z: 0 });
  ui.unmount();
});

test('a press that becomes a drag is not a tap', async () => {
  const taps = [];
  const ui = await mount({ onAxisTap: (axis, dir) => taps.push([axis, dir]) });
  ui.base.dispatchEvent(pointer('pointerdown', RADIUS, 0));
  ui.base.dispatchEvent(pointer('pointermove', RADIUS * 1.5, 0));
  await frames(3);
  ui.base.dispatchEvent(pointer('pointerup', RADIUS * 1.5, 0));
  await tick();
  assert.deepEqual(taps, []);
  assert.ok(ui.events.change.length > 0);
  ui.unmount();
});

test('the Z toggle routes the vertical drag to z', async () => {
  const ui = await mount();
  const toggle = ui.host.querySelector('.jy-ztoggle');
  assert.ok(toggle);
  toggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick();
  assert.ok(ui.root().className.includes('jy-root--zmode'));
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0));
  ui.base.dispatchEvent(pointer('pointermove', RADIUS, -RADIUS));
  await frames(4);
  const last = ui.events.change.at(-1);
  assert.equal(last.x, 0);
  assert.equal(last.y, 0);
  assert.ok(last.z > 0);
  ui.base.dispatchEvent(pointer('pointerup', RADIUS, -RADIUS));
  await tick();
  assert.equal(ui.events.end[0].dominantAxis, 'z');
  ui.unmount();
});

test('zToggle={false} hides the toggle', async () => {
  const ui = await mount({ zToggle: false });
  assert.equal(ui.host.querySelector('.jy-ztoggle'), null);
  ui.unmount();
});

test('rotate emits a snapped angle through the component', async () => {
  const ui = await mount({ operations: ['rotate'], rotateSnapDeg: 45 });
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0));
  ui.base.dispatchEvent(pointer('pointermove', RADIUS, -RADIUS * 0.6)); // ~31 degrees
  await frames(3);
  const deg = (ui.events.change.at(-1).angle * 180) / Math.PI;
  assert.ok(Math.abs(deg - 45) < 1e-9, `expected 45, got ${deg}`);
  ui.base.dispatchEvent(pointer('pointerup', RADIUS, -RADIUS * 0.6));
  await tick();
  ui.unmount();
});

test('disabled ignores every pointer', async () => {
  const ui = await mount({ disabled: true });
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0));
  ui.base.dispatchEvent(pointer('pointermove', RADIUS * 2, 0));
  await frames(4);
  assert.equal(ui.events.start.length, 0);
  assert.equal(ui.events.change.length, 0);
  ui.unmount();
});

test('collapse hides the panel and keeps the button', async () => {
  const ui = await mount();
  const button = ui.host.querySelector('.jy-collapse');
  button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick();
  assert.equal(ui.host.querySelector('.jy-panel').hasAttribute('hidden'), true);
  assert.ok(ui.root().className.includes('jy-root--collapsed'));
  ui.unmount();
});

test('the stick is focusable and labelled', async () => {
  const ui = await mount({ label: 'Shelf position' });
  assert.equal(ui.base.getAttribute('tabindex'), '0');
  assert.equal(ui.base.getAttribute('aria-label'), 'Shelf position');
  ui.unmount();
});

test('hover is reported', async () => {
  const ui = await mount();
  ui.base.dispatchEvent(new window.PointerEvent('pointerenter', { bubbles: false }));
  ui.base.dispatchEvent(new window.PointerEvent('pointerleave', { bubbles: false }));
  await tick();
  assert.deepEqual(ui.events.hover, [true, false]);
  ui.unmount();
});

// ── run ─────────────────────────────────────────────────────────────────────
for (const entry of cases) {
  if (entry.group) {
    console.log(`\n${entry.group}`);
    continue;
  }
  if (only && !entry.name.includes(only)) continue;
  try {
    await entry.fn();
    passed += 1;
    console.log(`  ok   ${entry.name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${entry.name}`);
    console.error(`       ${err.message}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
dom.window.close();
process.exit(failed === 0 ? 0 : 1);

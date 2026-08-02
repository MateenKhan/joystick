/**
 * REPRODUCTION — "the joystick does not drag", reported five times.
 *
 *   node test/repro-interior.test.mjs
 *
 * Interior Studio (`F:\code\ai\interior_small`) mounts this package and reports
 * that a drag does nothing. Measured in his running browser, with the probe in
 * `src/components/JoystickProbe.tsx`:
 *
 *     press lands on              div.jy-base [in dock]
 *     disabled                    no
 *     pointermove tracked on pad  59–72
 *     pointerup on pad            0        (three separate runs)
 *     onChange frames received    0
 *
 * So the press arrives, the movement is tracked, and the component never emits.
 * That is this package's behaviour, not the consumer's — everything downstream
 * of `onChange` has been proved correct headlessly there (555 assertions).
 *
 * This file mounts the component with the CONSUMER'S EXACT PROPS and drives a
 * real pointer gesture through jsdom, so the question is answered by running it
 * rather than by reading it. The props matter: this is not the configuration
 * `component.test.mjs` covers.
 *
 *   size          92      not the 140 default — the ring is 26.7px, not 40.6px
 *   operations    ['move']        one, so no switcher renders
 *   operation     'move'          CONTROLLED
 *   axes          ['z']           one axis, driven by the vertical
 *   zToggle       true
 *   onAxisTap     passed          ← this is what makes `armedRef` start FALSE
 *   collapsible   false
 */

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://127.0.0.1/',
});
const { window } = dom;

if (!window.PointerEvent) {
  window.PointerEvent = class PointerEvent extends window.MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
      this.isPrimary = init.isPrimary ?? true;
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
  Object.defineProperty(globalThis, key, { value: window[key], writable: true, configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { Joystick } = await import('../dist/index.js');

/** The consumer's size. Everything below is measured against THIS ring. */
const SIZE = 92;
const RADIUS = SIZE * 0.29; // 26.68px
const CENTER = { x: 500, y: 400 };

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

function pointer(type, dx, dy, init = {}) {
  return new window.PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: init.pointerId ?? 7,
    pointerType: 'mouse',
    clientX: CENTER.x + dx,
    clientY: CENTER.y + dy,
    button: 0,
    buttons: 1,
    ...init,
  });
}

let passed = 0;
let failed = 0;
const problems = [];
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed += 1;
    problems.push(`${name}\n        ${error.message.split('\n')[0]}`);
    console.log(`  FAIL  ${name}`);
    console.log(`        ${error.message.split('\n').slice(0, 4).join('\n        ')}`);
  }
}

/**
 * The consumer's mount, including the part that turns out to matter: a PARENT
 * THAT RE-RENDERS. `SelectionJoystick` subscribes to four zustand stores, and
 * every frame it applies changes the model, so the whole subtree re-renders
 * mid-gesture. A test that renders once cannot see anything that depends on it.
 */
async function mountLikeInterior({ rerenderEveryFrame = false, extra = {} } = {}) {
  const host = window.document.createElement('div');
  window.document.body.appendChild(host);
  const root = createRoot(host);

  const events = { start: 0, change: 0, end: 0, tap: 0, lastDelta: null };
  let bump = () => {};

  function Consumer() {
    const [n, setN] = React.useState(0);
    bump = () => setN((v) => v + 1);
    return React.createElement(
      'div',
      { 'data-testid': 'selection-joystick', 'data-n': n },
      React.createElement(Joystick, {
        operations: ['move'],
        operation: 'move',
        onOperationChange: () => {},
        disabled: false,
        axes: ['z'],
        zToggle: true,
        size: SIZE,
        collapsible: false,
        rotateSnapDeg: 0,
        label: 'Shelf 4',
        onStart: () => {
          events.start += 1;
        },
        onChange: (d) => {
          events.change += 1;
          events.lastDelta = d;
          if (rerenderEveryFrame) bump();
        },
        onAxisTap: () => {
          events.tap += 1;
        },
        onEnd: () => {
          events.end += 1;
        },
        ...extra,
      })
    );
  }

  root.render(React.createElement(Consumer));

  let base = null;
  for (let i = 0; i < 50 && !base; i += 1) {
    await tick();
    base = host.querySelector('.jy-base');
  }
  assert.ok(base, 'the component never mounted');
  return { host, base, events, bump: () => bump(), unmount: () => root.unmount() };
}

console.log('');
console.log('REPRO — Interior Studio props, real pointer events, real rAF');
console.log('='.repeat(70));

/* ------------------------------------------------------------------ */

await test('a held drag emits onChange frames', async () => {
  const ui = await mountLikeInterior();
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0));
  await tick();
  // Past TAP_SLOP_PX (4) immediately, which is what arms the gesture.
  for (let i = 1; i <= 6; i += 1) {
    ui.base.dispatchEvent(pointer('pointermove', 0, -i * 4));
    await tick();
  }
  await frames(6);
  assert.ok(
    ui.events.change > 0,
    `no onChange after 6 moves and 6 frames (start=${ui.events.start}, change=${ui.events.change})`
  );
  ui.unmount();
});

await test('pointerup ends the gesture and releases capture', async () => {
  const ui = await mountLikeInterior();
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0));
  await tick();
  ui.base.dispatchEvent(pointer('pointermove', 0, -20));
  await frames(3);
  ui.base.dispatchEvent(pointer('pointerup', 0, -20));
  await tick();
  assert.equal(ui.events.end, 1, 'onEnd did not fire');
  assert.equal(captured.size, 0, 'pointer capture was not released');
  ui.unmount();
});

await test('a SECOND drag works after the first — the gesture really ended', async () => {
  const ui = await mountLikeInterior();
  for (const round of [1, 2]) {
    ui.base.dispatchEvent(pointer('pointerdown', 0, 0));
    await tick();
    ui.base.dispatchEvent(pointer('pointermove', 0, -20));
    await frames(4);
    ui.base.dispatchEvent(pointer('pointerup', 0, -20));
    await tick();
    assert.ok(ui.events.change > 0, `round ${round}: no frames`);
    assert.equal(ui.events.end, round, `round ${round}: onEnd count is ${ui.events.end}`);
    ui.events.change = 0;
  }
  ui.unmount();
});

/*
 * THE CONSUMER'S REAL CONDITION. Every emitted frame changes the model, the
 * stores publish, and the subtree re-renders — dozens of times during one push.
 * `bind` is the package's ref callback; if a re-render ever hands React a new
 * one, React calls `bind(null)`, which runs
 * `if (draggingRef.current) endPointer(true, syntheticMeta())` — cancelling the
 * drag and removing every listener, mid-gesture.
 */
await test('the drag survives the parent re-rendering on every frame', async () => {
  const ui = await mountLikeInterior({ rerenderEveryFrame: true });
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0));
  await tick();
  for (let i = 1; i <= 8; i += 1) {
    ui.base.dispatchEvent(pointer('pointermove', 0, -i * 3));
    await tick();
  }
  await frames(12);
  assert.ok(
    ui.events.change > 4,
    `the gesture died under re-renders: only ${ui.events.change} frames, end=${ui.events.end}`
  );
  assert.equal(ui.events.end, 0, `the gesture ended by itself (end=${ui.events.end})`);
  ui.unmount();
});

/*
 * AND THE SAME AGAIN WITH A CHANGING PROP, which is what really happens: the
 * consumer recomputes `operations` and `axes` as fresh ARRAYS on every render,
 * and `label` changes as the selection is renamed.
 */
await test('the drag survives new array props on every render', async () => {
  const host = window.document.createElement('div');
  window.document.body.appendChild(host);
  const root = createRoot(host);
  const events = { change: 0, end: 0 };
  let bump = () => {};

  function Consumer() {
    const [n, setN] = React.useState(0);
    bump = () => setN((v) => v + 1);
    return React.createElement(Joystick, {
      // New arrays every render — exactly what `operationsFor()` / `padAxes()`
      // return in the consumer.
      operations: ['move'],
      operation: 'move',
      axes: ['z'],
      zToggle: true,
      size: SIZE,
      collapsible: false,
      rotateSnapDeg: 0,
      label: `Shelf ${n}`,
      onChange: () => {
        events.change += 1;
        bump();
      },
      onAxisTap: () => {},
      onEnd: () => {
        events.end += 1;
      },
    });
  }
  root.render(React.createElement(Consumer));
  let base = null;
  for (let i = 0; i < 50 && !base; i += 1) {
    await tick();
    base = host.querySelector('.jy-base');
  }
  base.dispatchEvent(pointer('pointerdown', 0, 0));
  await tick();
  for (let i = 1; i <= 8; i += 1) {
    base.dispatchEvent(pointer('pointermove', 0, -i * 3));
    await tick();
  }
  await frames(12);
  assert.ok(events.change > 4, `only ${events.change} frames under changing props`);
  assert.equal(events.end, 0, 'the gesture ended by itself');
  root.unmount();
});

/*
 * THE SMALL-PAD CASE. The consumer renders at 92px, so the ring is 26.7px and
 * the deadzone 1.6px. `component.test.mjs` only ever drives the 140px default.
 */
await test('a push well inside a 92px pad still emits', async () => {
  const ui = await mountLikeInterior();
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0));
  await tick();
  ui.base.dispatchEvent(pointer('pointermove', 0, -8));
  await frames(6);
  assert.ok(ui.events.change > 0, `an 8px push on a ${RADIUS.toFixed(1)}px ring emitted nothing`);
  ui.unmount();
});

/*
 * THE PRESS THAT NEVER ENDS. If a gesture is left open, `onPointerDown`'s
 * second line refuses every later press for the life of the page — the stick
 * works once and is dead for ever, which is what has been reported. This drives
 * the release OUTSIDE the pad, which is what a real push does: the ring is
 * 26.7px and people drag much further than that.
 */
await test('releasing OUTSIDE the pad still ends the gesture', async () => {
  const ui = await mountLikeInterior();
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0));
  await tick();
  ui.base.dispatchEvent(pointer('pointermove', 0, -120));
  await frames(4);
  // With capture held the browser retargets to the pad. Without it, the up
  // lands on whatever is under the cursor — modelled here as the document.
  window.document.body.dispatchEvent(pointer('pointerup', 0, -120));
  await tick();
  assert.equal(
    ui.events.end,
    1,
    'a release off the pad did not end the gesture — every later press is now refused'
  );
  ui.unmount();
});

console.log('');
console.log('='.repeat(70));
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('');
  for (const p of problems) console.log(`  · ${p}`);
  process.exit(1);
}

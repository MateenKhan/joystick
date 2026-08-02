/**
 * THE WORKAROUND, TESTED AGAINST THE BYTES THE OWNER IS ACTUALLY RUNNING.
 *
 *   node test/repro-consumer-relay.test.mjs
 *
 * `repro-interior.test.mjs` proves the bug and the fix in THIS repo's `dist`.
 * That does not help the owner today: Interior Studio installs
 * `@jugaaadi/joystick@0.0.1` from the npm registry, so his browser loads the
 * UNFIXED build until 0.0.2 is published and installed.
 *
 * So this file imports his `node_modules` copy directly and proves two things
 * about it:
 *
 *   1. it really is broken — a release off the pad leaves the gesture open, and
 *      every later press is then refused, so the stick dies for good;
 *   2. the relay in `SelectionJoystick.tsx` really does fix it — re-dispatching
 *      the stray event AT the pad ends the gesture and the next press works.
 *
 * If (1) ever starts passing, the published package has been fixed and the
 * relay can come out. That is the signal to delete it.
 */

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const CONSUMER_PATH = 'F:/code/ai/interior_small/node_modules/@jugaaadi/joystick/dist/index.js';

if (!existsSync(CONSUMER_PATH)) {
  console.log(`SKIP — the consumer is not installed at ${CONSUMER_PATH}`);
  process.exit(0);
}

/*
 * COPIED IN, rather than imported across the two trees.
 *
 * The consumer's build does `import 'react'`, and node resolves that from the
 * IMPORTING FILE's directory — so importing it in place loads Interior Studio's
 * React while this repo's react-dom loads its own, and the two copies produce
 * "Cannot read properties of null (reading 'useState')". Copying the same bytes
 * next to this test makes `react` resolve here, once.
 *
 * The bytes are the point: this is the published 0.0.1 the owner's browser
 * loads, not a rebuild of `src/`.
 */
const here = dirname(fileURLToPath(import.meta.url));
const COPY = join(here, '.installed-0.0.1.mjs');
copyFileSync(CONSUMER_PATH, COPY);
process.on('exit', () => {
  try {
    rmSync(COPY);
  } catch {
    /* leaving a temp file behind is not worth failing a run over */
  }
});
const CONSUMER_DIST = pathToFileURL(COPY).href;

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
      this.buttons = init.buttons ?? 0;
    }
  };
}

/*
 * NO POINTER CAPTURE, DELIBERATELY.
 *
 * This is the whole point of the file. The package treats capture as optional
 * and its own suite always has it, so the failure mode has never been exercised.
 * Here `setPointerCapture` is a no-op — which is exactly what the empty
 * `catch {}` in `useJoystick` produces when the browser refuses it — and events
 * are therefore NOT retargeted once the cursor leaves the pad.
 */
window.Element.prototype.setPointerCapture = function () {};
window.Element.prototype.releasePointerCapture = function () {};
window.Element.prototype.hasPointerCapture = function () {
  return false;
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
const { Joystick } = await import(CONSUMER_DIST);

const SIZE = 92;
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

function pointer(type, dx, dy, extra = {}) {
  return new window.PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 7,
    pointerType: 'mouse',
    clientX: CENTER.x + dx,
    clientY: CENTER.y + dy,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    ...extra,
  });
}

/**
 * The relay from `SelectionJoystick.tsx`, transcribed.
 *
 * Kept as a copy rather than imported because the app's copy lives inside a
 * `.tsx` that pulls in React, four stores and a stylesheet. If the two ever
 * diverge, this file stops proving anything about the app — so it is written to
 * be read side by side with the effect it mirrors, and the comment there names
 * this file.
 */
function installRelay(dock) {
  let relaying = false;
  const relay = (event) => {
    if (relaying) return;
    const root = dock.querySelector('.jy-root');
    const base = dock.querySelector('.jy-base');
    if (!root || !base) return;
    if (!root.classList.contains('jy-root--dragging')) return;
    if (event.target instanceof window.Node && base.contains(event.target)) return;
    relaying = true;
    try {
      base.dispatchEvent(
        new window.PointerEvent(event.type, {
          bubbles: false,
          cancelable: true,
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          clientX: event.clientX,
          clientY: event.clientY,
          button: event.button,
          buttons: event.buttons,
        })
      );
    } finally {
      relaying = false;
    }
  };
  window.addEventListener('pointermove', relay, true);
  window.addEventListener('pointerup', relay, true);
  window.addEventListener('pointercancel', relay, true);
  return () => {
    window.removeEventListener('pointermove', relay, true);
    window.removeEventListener('pointerup', relay, true);
    window.removeEventListener('pointercancel', relay, true);
  };
}

async function mount() {
  const host = window.document.createElement('div');
  window.document.body.appendChild(host);
  const root = createRoot(host);
  const events = { change: 0, end: 0 };
  root.render(
    React.createElement(
      'div',
      { 'data-testid': 'selection-joystick' },
      React.createElement(Joystick, {
        operations: ['move'],
        operation: 'move',
        axes: ['z'],
        zToggle: true,
        size: SIZE,
        collapsible: false,
        rotateSnapDeg: 0,
        label: 'Camera',
        onChange: () => {
          events.change += 1;
        },
        onAxisTap: () => {},
        onEnd: () => {
          events.end += 1;
        },
      })
    )
  );
  let base = null;
  for (let i = 0; i < 50 && !base; i += 1) {
    await tick();
    base = host.querySelector('.jy-base');
  }
  assert.ok(base, 'never mounted');
  return { host, base, events, dock: host.firstChild, unmount: () => root.unmount() };
}

/** One push: press on the pad, drag well past it, release out there. */
async function push(ui) {
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0));
  await tick();
  for (let i = 1; i <= 6; i += 1) {
    // No capture, so once the cursor leaves the pad these land on the body.
    const el = i <= 2 ? ui.base : window.document.body;
    el.dispatchEvent(pointer('pointermove', 0, -i * 20));
    await tick();
  }
  await frames(4);
  window.document.body.dispatchEvent(pointer('pointerup', 0, -120));
  await tick();
}

let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${error.message.split('\n')[0]}`);
  }
}

console.log('');
console.log('THE 0.0.1 DEFECT, NOW ASSERTED AS FIXED');
console.log('='.repeat(70));

/*
 * WAS "BUG CONFIRMED", AND INVERTING IT IS THE POINT.
 *
 * This case was written against 0.0.1 to PROVE the defect: it asserted that a
 * release off the pad left the gesture open. It did exactly its job — and the
 * moment the fix landed it started failing, with its own message asking *"has
 * 0.0.2 landed?"*. A suite that goes red because the bug was fixed is a suite
 * people learn to ignore, and the knowledge in it is worth more than that.
 *
 * So it now asserts the CURE rather than the disease. Same gesture, opposite
 * expectation: a release anywhere must end the gesture and clear the dragging
 * state, because that is the one thing whose absence bricked the stick for the
 * life of the page.
 */
await test('a release off the pad ends the gesture — the 0.0.1 defect, fixed', async () => {
  const ui = await mount();
  await push(ui);
  assert.ok(ui.events.end > 0, 'the release never ended the gesture — 0.0.1 behaviour is back');
  assert.ok(
    !ui.host.querySelector('.jy-root').classList.contains('jy-root--dragging'),
    'still flagged as dragging after the release, so the next press will be refused'
  );
  ui.unmount();
});

/*
 * THE OWNER'S ACTUAL GESTURE, and it is worth being precise about why it emits
 * NOTHING rather than something wrong.
 *
 * My first draft of this case asserted "the second press is refused, so the
 * stick is dead". It failed, and the failure was the useful part: with the SAME
 * pointerId (a mouse always reuses one) the stale `draggingRef` lets
 * `onPointerMove` through, and the rAF loop from the first gesture is still
 * running — so a stuck stick would EMIT, not go silent. Runaway movement, not
 * silence. That is not what was reported, so that was not the state.
 *
 * The state that produces silence is this one. Press at the centre, then flick:
 * the very first move is already off the 26.7px pad, so without capture NO move
 * ever reaches the package, `rawRef` stays at {0,0}, and the loop returns at
 * `if (raw.x === 0 && raw.y === 0) return`. Zero frames. The thumb never leaves
 * the centre, the gesture never ends, and every later press is refused.
 *
 * Nothing moves, nothing animates, nothing throws — *"it's like disabled"*.
 */
await test('a press then a flick straight off the pad emits, and ends cleanly', async () => {
  const ui = await mount();
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0));
  await tick();
  // Every move lands off the pad, which is what a real push does on a 26.7px
  // ring: the cursor is outside the element before the second frame.
  for (let i = 1; i <= 6; i += 1) {
    window.document.body.dispatchEvent(pointer('pointermove', 0, -i * 25));
    await tick();
  }
  await frames(8);
  /*
   * Inverted with the case above, and this is the owner's ACTUAL gesture: press
   * at the centre and flick. On a 26.7px ring the cursor is off the element
   * before the second frame, so under 0.0.1 no move ever reached the package,
   * `rawRef` stayed at {0,0}, and the loop returned at its own zero check —
   * zero frames, thumb never leaving the centre, gesture never ending.
   * *"It's like disabled."* With capture held, every one of those moves lands.
   */
  assert.ok(ui.events.change > 0, `a flick off the pad emitted ${ui.events.change} frames — expected some`);

  /*
   * AND WHAT THE STUCK GESTURE LEAVES BEHIND, which is worse than a dead stick.
   *
   * Under 0.0.1 `draggingRef` stayed true and the rAF pump kept running, so the
   * pad answered a BARE MOUSE MOVE — no button held — by driving the model. The
   * press had been released long ago; the widget did not know. A designer who
   * lets go, moves the mouse across the corner of the screen and watches a
   * shelf slide has no way at all to connect the two.
   *
   * That is the SECOND half of the defect, and it is the more dangerous half:
   * the first only made the stick dead, this one moved the model without a
   * gesture. In a costing tool an unnoticed movement is an unnoticed change to
   * a cut list. So it is asserted the other way round now — after the release,
   * a moving mouse over the pad must drive NOTHING.
   */
  window.document.body.dispatchEvent(pointer('pointerup', 0, -150));
  await tick();
  ui.events.change = 0;
  ui.base.dispatchEvent(pointer('pointermove', 0, -12, { buttons: 0 }));
  await frames(8);
  assert.equal(
    ui.events.change,
    0,
    `a button-less move drove the model ${ui.events.change} times — the gesture never ended`
  );
  ui.unmount();
});

await test('THE RELAY FIXES THAT EXACT GESTURE', async () => {
  const ui = await mount();
  const off = installRelay(ui.dock);
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0));
  await tick();
  for (let i = 1; i <= 6; i += 1) {
    window.document.body.dispatchEvent(pointer('pointermove', 0, -i * 25));
    await tick();
  }
  await frames(8);
  assert.ok(ui.events.change > 0, 'still no frames with the relay installed');
  window.document.body.dispatchEvent(pointer('pointerup', 0, -150));
  await tick();
  assert.equal(ui.events.end, 1, 'the gesture did not end');

  // And the stick is still alive afterwards.
  ui.events.change = 0;
  ui.base.dispatchEvent(pointer('pointerdown', 0, 0));
  await tick();
  window.document.body.dispatchEvent(pointer('pointermove', 0, -40));
  await frames(8);
  assert.ok(ui.events.change > 0, 'the second gesture was refused');
  off();
  ui.unmount();
});

console.log('');
console.log("THE SAME BUILD, WITH SelectionJoystick.tsx's RELAY INSTALLED");
console.log('='.repeat(70));

await test('the release is delivered and the gesture ends', async () => {
  const ui = await mount();
  const off = installRelay(ui.dock);
  await push(ui);
  assert.equal(ui.events.end, 1, 'onEnd did not fire');
  off();
  ui.unmount();
});

await test('the drag emits frames the whole way, including off the pad', async () => {
  const ui = await mount();
  const off = installRelay(ui.dock);
  await push(ui);
  assert.ok(ui.events.change > 0, 'no frames were emitted at all');
  off();
  ui.unmount();
});

await test('AND THE STICK STILL WORKS — a second push drives it again', async () => {
  const ui = await mount();
  const off = installRelay(ui.dock);
  await push(ui);
  const first = ui.events.change;
  ui.events.change = 0;
  await push(ui);
  assert.ok(first > 0 && ui.events.change > 0, `first ${first} frames, second ${ui.events.change}`);
  assert.equal(ui.events.end, 2, `onEnd fired ${ui.events.end} times, expected 2`);
  off();
  ui.unmount();
});

console.log('');
console.log('='.repeat(70));
if (failed > 0) {
  console.log(`${failed} failed`);
  process.exit(1);
}
console.log('The published 0.0.1 is broken without pointer capture; the relay fixes it.');

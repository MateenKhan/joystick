/**
 * FIELD ROWS — the declarative alternative to `fields` (0.0.4).
 *
 *   node test/field-rows.test.mjs      (run by `npm test`)
 *
 * `fieldRows` is a list of row DESCRIPTIONS — a value in mm, a unit, a step,
 * bounds, a name — that this package turns into rows itself using the peer
 * `@jugaaadi/advance-scroll-input`'s `DimensionInput`, so a consumer that
 * already has that data for each row does not have to hand-build the rows a
 * second time (`fields`, unchanged, is exactly that hand-built path).
 *
 * What matters here, in order:
 *
 *   · `fields` WINS when both are given — the type's own contract.
 *   · the descriptor path renders REAL rows, wired to the REAL peer input,
 *     not a stub — a value typed and committed must reach `onChangeMm`.
 *   · a refusal SAYS it was refused — `onClamp` fires with the bound it hit.
 *   · omitting `fieldRows` (or passing `[]`) changes nothing — same as
 *     omitting `fields` in 0.0.3.
 *
 * The "peer is missing" path is exercised in `test/field-rows-missing.test.mjs`
 * against a build that cannot resolve the peer at all, because that is the
 * only way to prove the catch fires for the RIGHT reason rather than assuming
 * a try/catch that has never actually caught anything.
 */

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://127.0.0.1/',
});
const { window } = dom;

for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'FocusEvent',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
]) {
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

const tick = () => new Promise((r) => window.setTimeout(r, 16));

async function mount(props = {}) {
  const host = window.document.createElement('div');
  window.document.body.appendChild(host);
  const root = createRoot(host);
  root.render(React.createElement(Joystick, { size: 92, ...props }));
  for (let i = 0; i < 50; i += 1) {
    await tick();
    if (host.querySelector('.jy-panel')) break;
  }
  assert.ok(host.querySelector('.jy-panel'), 'the component never mounted');
  return host;
}

/** Waits for the async peer import to resolve and the row to actually appear. */
async function waitForRow(host, id) {
  for (let i = 0; i < 100; i += 1) {
    const el = host.querySelector(`[data-testid="jy-row-${id}-input"]`);
    if (el) return el;
    await tick();
  }
  assert.fail(`row "${id}" never appeared — did the peer import resolve?`);
}

/** Simulates typing into a controlled React text input without a testing-library. */
function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
}

const ROWS = [
  { id: 'x', label: 'X', valueMm: 10, onChangeMm: () => {} },
  { id: 'y', label: 'Y', valueMm: 20, onChangeMm: () => {} },
];

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const group = (name) => cases.push({ group: name });

group('`fields` WINS WHEN BOTH ARE GIVEN');

test('fieldRows is ignored while `fields` is also given', async () => {
  const FIELDS = React.createElement('input', { key: 'only', 'data-testid': 'hand-built' });
  const host = await mount({ fields: FIELDS, fieldRows: ROWS, fieldsOpen: true });
  await tick();
  await tick();
  assert.ok(host.querySelector('[data-testid="hand-built"]'), 'the hand-built field is missing');
  assert.equal(host.querySelector('[data-testid="jy-row-x"]'), null, 'a descriptor row rendered even though `fields` was given');
});

group('OMITTING `fieldRows` CHANGES NOTHING — same as omitting `fields`');

test('no `fields` and no `fieldRows`: no switch is drawn', async () => {
  const host = await mount({});
  assert.equal(host.querySelector('[data-testid="jy-fields-switch"]'), null);
});

test('an empty `fieldRows` array behaves like omitting it entirely', async () => {
  const host = await mount({ fieldRows: [] });
  assert.equal(host.querySelector('[data-testid="jy-fields-switch"]'), null);
});

group('THE DESCRIPTOR PATH RENDERS REAL ROWS, WIRED TO THE REAL PEER INPUT');

test('one row per descriptor, each labelled and carrying its own test id', async () => {
  const host = await mount({ fieldRows: ROWS, fieldsOpen: true });
  const xInput = await waitForRow(host, 'x');
  const yInput = await waitForRow(host, 'y');
  assert.equal(host.querySelector('[data-testid="jy-row-x"] .jy-field-row-label').textContent, 'X');
  assert.equal(host.querySelector('[data-testid="jy-row-y"] .jy-field-row-label').textContent, 'Y');
  assert.equal(xInput.getAttribute('aria-label'), 'X');
  assert.equal(yInput.getAttribute('aria-label'), 'Y');
});

test('`ariaLabel` overrides the accessible name without touching the visible caption', async () => {
  const host = await mount({
    fieldRows: [{ id: 'x', label: 'X', ariaLabel: 'Width in millimetres', valueMm: 10, onChangeMm: () => {} }],
    fieldsOpen: true,
  });
  const input = await waitForRow(host, 'x');
  assert.equal(input.getAttribute('aria-label'), 'Width in millimetres');
  assert.equal(host.querySelector('[data-testid="jy-row-x"] .jy-field-row-label').textContent, 'X');
});

test('typing a value and blurring commits it through `onChangeMm`', async () => {
  const seen = [];
  const host = await mount({
    fieldRows: [{ id: 'x', label: 'X', valueMm: 10, onChangeMm: (mm) => seen.push(mm) }],
    fieldsOpen: true,
  });
  const input = await waitForRow(host, 'x');
  input.focus();
  setInputValue(input, '42');
  input.blur();
  await tick();
  assert.deepEqual(seen, [42], `onChangeMm saw ${JSON.stringify(seen)}`);
});

group('A REFUSAL SAYS IT WAS REFUSED — `onClamp` fires with the bound it hit');

test('a value past `max` is clamped, and `onClamp` names the bound', async () => {
  const changes = [];
  const clamps = [];
  const host = await mount({
    fieldRows: [
      {
        id: 'x',
        label: 'X',
        valueMm: 10,
        max: 50,
        onChangeMm: (mm) => changes.push(mm),
        onClamp: (clamped, requested, bound) => clamps.push({ clamped, requested, bound }),
      },
    ],
    fieldsOpen: true,
  });
  const input = await waitForRow(host, 'x');
  input.focus();
  setInputValue(input, '999');
  input.blur();
  await tick();
  assert.deepEqual(clamps, [{ clamped: 50, requested: 999, bound: 'max' }], JSON.stringify(clamps));
  assert.deepEqual(changes, [50]);
});

test('a value below zero is clamped at the default floor, `allowNegative` unset', async () => {
  const clamps = [];
  const host = await mount({
    fieldRows: [
      {
        id: 'x',
        label: 'X',
        valueMm: 10,
        onChangeMm: () => {},
        onClamp: (clamped, requested, bound) => clamps.push({ clamped, requested, bound }),
      },
    ],
    fieldsOpen: true,
  });
  const input = await waitForRow(host, 'x');
  input.focus();
  setInputValue(input, '-5');
  input.blur();
  await tick();
  assert.deepEqual(clamps, [{ clamped: 0, requested: -5, bound: 'min' }], JSON.stringify(clamps));
});

test('`allowNegative` lets the same value stick with no clamp', async () => {
  const clamps = [];
  const changes = [];
  const host = await mount({
    fieldRows: [
      {
        id: 'x',
        label: 'X',
        valueMm: 10,
        allowNegative: true,
        onChangeMm: (mm) => changes.push(mm),
        onClamp: (clamped, requested, bound) => clamps.push({ clamped, requested, bound }),
      },
    ],
    fieldsOpen: true,
  });
  const input = await waitForRow(host, 'x');
  input.focus();
  setInputValue(input, '-5');
  input.blur();
  await tick();
  assert.deepEqual(clamps, [], `expected no clamp, saw ${JSON.stringify(clamps)}`);
  assert.deepEqual(changes, [-5]);
});

let passed = 0;
let failed = 0;
console.log('\nFIELD ROWS — the declarative alternative to `fields`');
console.log('======================================================================');
for (const entry of cases) {
  if (entry.group) {
    console.log(`\n${entry.group}`);
    continue;
  }
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

/**
 * FIELDS MODE — the numbers take the wheel's place (0.0.3).
 *
 *   node test/fields-mode.test.mjs      (run by `npm test`)
 *
 * The consumer that asked for this is an interior configurator, and its owner
 * asked twice. First: *"i wanted the scrollable inputs of joystick inside the
 * joystick by replacing joystick ... not above the joystick div"*. Then, after
 * a first attempt kept the numbers packed side by side: *"keep the inputs one
 * below other instead of one aside to other"*, with the reason — *"i asked you
 * to do this because they were not easy to use now is also the same case"*.
 *
 * So the assertions here are about REPLACEMENT and REACHABILITY, which are the
 * two things that were actually wrong in the consumer's own attempt:
 *
 *   · the pad must be GONE, not merely covered — a consumer measuring the
 *     rectangle can be satisfied while the wheel is still in the DOM;
 *   · every operation must stay reachable. The consumer hid the whole package
 *     to get the numbers on screen, which took `button.jy-mode` with it and
 *     froze move/scale/rotate to whatever was live at the moment of the switch.
 *     That shipped. This is the regression that must not come back here.
 *
 * And one that is just as important and easy to forget: with no `fields` prop
 * the component must behave EXACTLY as 0.0.2 did. Every existing consumer is on
 * that path.
 */

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://127.0.0.1/',
});
const { window } = dom;

/* Node 22 defines `navigator` as a getter-only global, so these are REDEFINED
   rather than assigned — the same reason and the same fix `component.test.mjs`
   already carries. Copied deliberately rather than re-derived: two different
   answers to one environment quirk is how the two files start disagreeing about
   what a DOM is. */
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

const FIELDS = React.createElement(
  React.Fragment,
  null,
  React.createElement('input', { key: 'x', 'data-testid': 'f-x' }),
  React.createElement('input', { key: 'y', 'data-testid': 'f-y' }),
  React.createElement('input', { key: 'z', 'data-testid': 'f-z' })
);

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const group = (name) => cases.push({ group: name });

group('0.0.2 BEHAVIOUR IS UNCHANGED WHEN NOBODY ASKS FOR FIELDS');

test('no `fields` prop: the pad renders and no switch is drawn', async () => {
  const host = await mount({ operations: ['move', 'scale'] });
  assert.ok(host.querySelector('.jy-base'), 'the pad is missing on the default path');
  assert.equal(
    host.querySelector('[data-testid="jy-fields-switch"]'),
    null,
    'a switch was drawn for a consumer that passed no fields — it would reveal an empty box'
  );
});

group('THE NUMBERS REPLACE THE PAD — they do not sit above it');

test('fieldsOpen: the pad is GONE from the DOM, not merely hidden', async () => {
  const host = await mount({ fields: FIELDS, fieldsOpen: true });
  assert.equal(
    host.querySelector('.jy-base'),
    null,
    'the wheel is still in the DOM. A consumer measuring the rectangle can pass while this is ' +
      'true, which is exactly how the first attempt at this shipped looking correct.'
  );
  assert.ok(host.querySelector('[data-testid="jy-fields"]'), 'the fields container is missing');
  assert.equal(host.querySelectorAll('[data-testid^="f-"]').length, 3, 'not every field rendered');
});

test('fields folded: the pad is back and the fields are gone', async () => {
  const host = await mount({ fields: FIELDS, fieldsOpen: false });
  assert.ok(host.querySelector('.jy-base'), 'the pad did not come back');
  assert.equal(host.querySelector('[data-testid="jy-fields"]'), null, 'the fields are still drawn');
});

group('EVERY OPERATION STAYS REACHABLE — the regression that shipped');

test('every offered operation is a visible option, and only the offered ones', async () => {
  const host = await mount({
    fields: FIELDS,
    fieldsOpen: true,
    operations: ['scale', 'move'],
    operation: 'scale',
  });
  assert.ok(host.querySelector('[data-testid="jy-verb-scale"]'), 'scale is not offered');
  assert.ok(host.querySelector('[data-testid="jy-verb-move"]'), 'move is not offered');
  assert.equal(
    host.querySelector('[data-testid="jy-verb-rotate"]'),
    null,
    'rotate was drawn for a consumer that does not offer it — a control that does nothing'
  );
});

test('the live operation is marked, and it is not a colour-only signal', async () => {
  const host = await mount({
    fields: FIELDS,
    fieldsOpen: true,
    operations: ['scale', 'move'],
    operation: 'move',
  });
  const live = host.querySelector('[data-testid="jy-verb-move"]');
  const other = host.querySelector('[data-testid="jy-verb-scale"]');
  assert.equal(live.getAttribute('aria-checked'), 'true', 'the live verb is not marked');
  assert.equal(other.getAttribute('aria-checked'), 'false', 'a dormant verb reads as live');
  assert.ok(live.className.includes('jy-verb--on'), 'the live verb carries no state class');
});

test('picking an operation reports it — the vocabulary is not frozen', async () => {
  const seen = [];
  const host = await mount({
    fields: FIELDS,
    fieldsOpen: true,
    operations: ['scale', 'move', 'rotate'],
    operation: 'scale',
    onOperationChange: (op) => seen.push(op),
  });
  host.querySelector('[data-testid="jy-verb-rotate"]').click();
  await tick();
  assert.deepEqual(seen, ['rotate'], `picking rotate reported ${JSON.stringify(seen)}`);
});

group('THE SWITCH IS A SWITCH, AND IT IS REACHABLE FROM BOTH MODES');

test('it reports `switch` with a checked state, in both modes', async () => {
  for (const open of [true, false]) {
    const host = await mount({ fields: FIELDS, fieldsOpen: open });
    const sw = host.querySelector('[data-testid="jy-fields-switch"]');
    assert.ok(sw, `no switch while fieldsOpen=${open} — the mode would be one-way`);
    assert.equal(sw.getAttribute('role'), 'switch', 'it does not report as a switch');
    assert.equal(sw.getAttribute('aria-checked'), String(open), 'its state is wrong');
    assert.ok(sw.querySelector('.jy-fieldswitch-knob'), 'a switch with no knob is not a switch');
  }
});

test('pressing it asks the consumer to change mode', async () => {
  const seen = [];
  const host = await mount({
    fields: FIELDS,
    fieldsOpen: false,
    onFieldsOpenChange: (v) => seen.push(v),
  });
  host.querySelector('[data-testid="jy-fields-switch"]').click();
  await tick();
  assert.deepEqual(seen, [true], `pressing the switch reported ${JSON.stringify(seen)}`);
});

test('uncontrolled: it opens on its own when nobody owns the state', async () => {
  const host = await mount({ fields: FIELDS });
  assert.ok(host.querySelector('.jy-base'), 'it did not start on the pad');
  host.querySelector('[data-testid="jy-fields-switch"]').click();
  await tick();
  await tick();
  assert.equal(host.querySelector('.jy-base'), null, 'the pad survived an uncontrolled switch');
});

let passed = 0;
let failed = 0;
console.log('\nFIELDS MODE — the numbers take the wheel\'s place');
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

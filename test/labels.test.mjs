/**
 * LABELS — every user-facing string overridable, none of them renamed (0.0.4).
 *
 *   node test/labels.test.mjs      (run by `npm test`)
 *
 * The owner's request, verbatim: "keep everything customisable like the
 * labels, scrolling speed, switch label, x,y,z labels and shelf and also the
 * whole scrollable input should be customizble as per scoll input component".
 * The rate/feel half (`accelExponent`, `maxSpeedMultiplier`, `deadzone`,
 * `keyStep`, `keyStepMultiplier`, `rotateSnapDeg`, `tapMaxMs`, `size`) and the
 * field rows themselves were already consumer-owned before this change — this
 * file covers what was not: the operation words, the axis letters, the fields
 * switch's caption/name/title, and the two accessible-name fallbacks.
 *
 * ONE SHAPE for all of it — a single optional `labels` prop, every key
 * optional — so a consumer passing nothing (every existing consumer) sees no
 * change. That is the half every case here proves alongside the override:
 * each override case has a sibling proving the omitted form still reads
 * today's text.
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
  React.createElement('input', { key: 'x', 'data-testid': 'f-x' })
);

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const group = (name) => cases.push({ group: name });

group('OPERATION WORDS — the mode chip, its title, and the fields-mode verbs');

test('default: the mode chip still reads the built-in English word', async () => {
  const host = await mount({ operations: ['move', 'scale'] });
  const chip = host.querySelector('[data-testid="jy-mode"]');
  assert.equal(chip.querySelector('.jy-mode-name').textContent, 'Move');
  assert.ok(chip.getAttribute('title').includes('Move'), `title was "${chip.getAttribute('title')}"`);
});

test('labels.operations overrides the chip and its title, leaving other operations alone', async () => {
  const host = await mount({
    operations: ['move', 'scale'],
    labels: { operations: { move: 'Shift' } },
  });
  const chip = host.querySelector('[data-testid="jy-mode"]');
  assert.equal(chip.querySelector('.jy-mode-name').textContent, 'Shift');
  assert.ok(chip.getAttribute('title').includes('Shift'), `title was "${chip.getAttribute('title')}"`);
});

test('labels.operations overrides the fields-mode verb radios too', async () => {
  const host = await mount({
    fields: FIELDS,
    fieldsOpen: true,
    operations: ['move', 'scale'],
    labels: { operations: { scale: 'Resize' } },
  });
  assert.equal(host.querySelector('[data-testid="jy-verb-move"] .jy-verb-name').textContent, 'Move');
  assert.equal(host.querySelector('[data-testid="jy-verb-scale"] .jy-verb-name').textContent, 'Resize');
});

group('AXIS LETTERS drawn on the pad');

test('default: the pad shows the axis\'s own uppercase letter', async () => {
  const host = await mount({ axes: ['x', 'y'] });
  const labelsEl = host.querySelector('.jy-labels');
  assert.ok(labelsEl.textContent.includes('+X'), labelsEl.textContent);
  assert.ok(labelsEl.textContent.includes('+Y'), labelsEl.textContent);
});

test('labels.axes overrides one axis, leaving the other at its default letter', async () => {
  const host = await mount({ axes: ['x', 'y'], labels: { axes: { x: 'Width' } } });
  const labelsEl = host.querySelector('.jy-labels');
  assert.ok(labelsEl.textContent.includes('+Width'), labelsEl.textContent);
  assert.ok(labelsEl.textContent.includes('-Width'), labelsEl.textContent);
  assert.ok(labelsEl.textContent.includes('+Y'), labelsEl.textContent);
});

group('THE JOYSTICK\'S OWN ACCESSIBLE NAME, when `label` is not given');

test('default: falls back to "Joystick"', async () => {
  const host = await mount({});
  assert.equal(host.querySelector('.jy-base').getAttribute('aria-label'), 'Joystick');
});

test('labels.joystick overrides the fallback', async () => {
  const host = await mount({ labels: { joystick: 'Position stick' } });
  assert.equal(host.querySelector('.jy-base').getAttribute('aria-label'), 'Position stick');
});

test('an explicit `label` still wins over `labels.joystick`', async () => {
  const host = await mount({ label: 'Shelf', labels: { joystick: 'Position stick' } });
  assert.equal(host.querySelector('.jy-base').getAttribute('aria-label'), 'Shelf');
});

group('THE OPERATION RADIOGROUP\'S ACCESSIBLE NAME, in fields mode');

test('default: falls back to "Operation"', async () => {
  const host = await mount({ fields: FIELDS, fieldsOpen: true, operations: ['move', 'scale'] });
  assert.equal(host.querySelector('.jy-verbs').getAttribute('aria-label'), 'Operation');
});

test('labels.operationGroup overrides the fallback', async () => {
  const host = await mount({
    fields: FIELDS,
    fieldsOpen: true,
    operations: ['move', 'scale'],
    labels: { operationGroup: 'Tool' },
  });
  assert.equal(host.querySelector('.jy-verbs').getAttribute('aria-label'), 'Tool');
});

group('THE FIELDS SWITCH — its visible name, its accessible name, and its title');

test('default: caption "123", no aria-label, title names what pressing it does', async () => {
  const host = await mount({ fields: FIELDS, fieldsOpen: false });
  const sw = host.querySelector('[data-testid="jy-fields-switch"]');
  assert.equal(sw.querySelector('.jy-fieldswitch-name').textContent, '123');
  assert.equal(sw.getAttribute('aria-label'), null, 'a default consumer should see no aria-label attribute at all');
  assert.equal(sw.getAttribute('title'), 'Show the numbers');
});

test('default while open: title names showing the pad', async () => {
  const host = await mount({ fields: FIELDS, fieldsOpen: true });
  const sw = host.querySelector('[data-testid="jy-fields-switch"]');
  assert.equal(sw.getAttribute('title'), 'Show the pad');
});

test('labels.fieldsSwitchName overrides the visible caption', async () => {
  const host = await mount({ fields: FIELDS, fieldsOpen: false, labels: { fieldsSwitchName: '#' } });
  const sw = host.querySelector('[data-testid="jy-fields-switch"]');
  assert.equal(sw.querySelector('.jy-fieldswitch-name').textContent, '#');
});

test('labels.fieldsSwitchAriaLabel sets an explicit accessible name', async () => {
  const host = await mount({
    fields: FIELDS,
    fieldsOpen: false,
    labels: { fieldsSwitchAriaLabel: 'Toggle number entry' },
  });
  const sw = host.querySelector('[data-testid="jy-fields-switch"]');
  assert.equal(sw.getAttribute('aria-label'), 'Toggle number entry');
});

test('labels.fieldsSwitchTitleOpen / fieldsSwitchTitleClosed override the title in each state', async () => {
  const closed = await mount({
    fields: FIELDS,
    fieldsOpen: false,
    labels: { fieldsSwitchTitleOpen: 'Numbers on', fieldsSwitchTitleClosed: 'Numbers off' },
  });
  assert.equal(
    closed.querySelector('[data-testid="jy-fields-switch"]').getAttribute('title'),
    'Numbers off'
  );
  const open = await mount({
    fields: FIELDS,
    fieldsOpen: true,
    labels: { fieldsSwitchTitleOpen: 'Numbers on', fieldsSwitchTitleClosed: 'Numbers off' },
  });
  assert.equal(
    open.querySelector('[data-testid="jy-fields-switch"]').getAttribute('title'),
    'Numbers on'
  );
});

group('NOBODY PASSING `labels` AT ALL SEES NO CHANGE — the load-bearing case');

test('omitting `labels` entirely renders every default exactly as 0.0.3 did', async () => {
  const host = await mount({ operations: ['move', 'rotate'], axes: ['x', 'z'], fields: FIELDS });
  assert.equal(host.querySelector('[data-testid="jy-mode"] .jy-mode-name').textContent, 'Move');
  assert.ok(host.querySelector('.jy-labels').textContent.includes('+X'));
  assert.equal(host.querySelector('.jy-base').getAttribute('aria-label'), 'Joystick');
  assert.equal(host.querySelector('[data-testid="jy-fields-switch"] .jy-fieldswitch-name').textContent, '123');
});

let passed = 0;
let failed = 0;
console.log('\nLABELS — every user-facing string overridable, nothing renamed');
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

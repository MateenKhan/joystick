/**
 * Runs UNDER `--experimental-loader test/support/deny-peer-loader.mjs`, which
 * makes `@jugaaadi/advance-scroll-input` unresolvable in THIS process only.
 * Mounts a real `Joystick` with `fieldRows`, and prints one line:
 *
 *   RESULT:PASS
 *   RESULT:FAIL:<reason>
 *
 * `test/field-rows-missing.test.mjs` spawns this file and reads that line.
 * Kept separate from the main jsdom bootstrap in the other test files only
 * because it needs the loader flag on the node invocation itself.
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

const tick = () => new Promise((r) => window.setTimeout(r, 16));

try {
  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');
  const { Joystick } = await import('../../dist/index.js');

  const host = window.document.createElement('div');
  window.document.body.appendChild(host);
  const root = createRoot(host);
  root.render(
    React.createElement(Joystick, {
      size: 92,
      fieldsOpen: true,
      fieldRows: [{ id: 'x', label: 'X', valueMm: 10, onChangeMm: () => {} }],
    })
  );

  let errorEl = null;
  for (let i = 0; i < 100; i += 1) {
    await tick();
    errorEl = host.querySelector('[data-testid="jy-field-rows-error"]');
    if (errorEl) break;
  }

  assert.ok(errorEl, 'no error message ever appeared — the missing peer did not fail kindly');
  assert.equal(
    host.querySelector('[data-testid="jy-row-x-input"]'),
    null,
    'a row rendered despite the peer being unresolvable'
  );
  const text = errorEl.textContent;
  assert.ok(text.includes('@jugaaadi/advance-scroll-input'), `message does not name the package: "${text}"`);
  assert.ok(text.toLowerCase().includes('install'), `message does not say what to install: "${text}"`);

  console.log('RESULT:PASS');
  dom.window.close();
  process.exit(0);
} catch (err) {
  console.log(`RESULT:FAIL:${err.message}`);
  process.exit(1);
}

/**
 * THE PEER MISSING — `fieldRows` must fail KINDLY (0.0.4).
 *
 *   node test/field-rows-missing.test.mjs      (run by `npm test`)
 *
 * `@jugaaadi/advance-scroll-input` is installed in THIS repo — it is a
 * devDependency, for the demo and for `test/field-rows.test.mjs` — so there
 * is no honest way to prove "the peer is missing" behaves correctly by
 * mounting `Joystick` directly in this process; the import would just
 * succeed. Instead this spawns a CHILD process running
 * `test/support/field-rows-missing-runner.mjs` under a custom ESM loader
 * (`test/support/deny-peer-loader.mjs`) that makes exactly ONE specifier,
 * `@jugaaadi/advance-scroll-input`, unresolvable — in that process only.
 * Nothing on disk changes; the live demo on port 4159 and the rest of this
 * repo's `node_modules` are untouched.
 *
 * This is the REAL shipped bundle (`dist/index.js`) hitting a REAL failed
 * dynamic import, not a re-implementation of `loadScrollInput` standing in
 * for one — the distinction this repo's own harness rules insist on: a
 * mutation (or, here, a denial) that never actually fires proves nothing.
 */

import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
/*
 * `--experimental-loader` and a positional script path both go through the
 * ESM loader on Windows, which rejects a bare `F:\...` path with
 * ERR_UNSUPPORTED_ESM_URL_SCHEME — only file/data/node URLs are accepted
 * there. `pathToFileURL` is the portable fix; it is a no-op shape-wise on
 * POSIX, where a plain path already resolves.
 */
const loader = pathToFileURL(path.join(here, 'support', 'deny-peer-loader.mjs')).href;
// The positional script argument is resolved as the entry module against cwd,
// not through the loader's URL resolution — a plain OS path, unlike `loader`.
const runner = path.join(here, 'support', 'field-rows-missing-runner.mjs');

console.log("\nTHE PEER MISSING — `fieldRows` must fail kindly");
console.log('======================================================================');

const result = spawnSync(process.execPath, ['--experimental-loader', loader, runner], {
  encoding: 'utf8',
  cwd: path.join(here, '..'),
});

const stdout = result.stdout ?? '';
const line = stdout
  .split('\n')
  .map((l) => l.trim())
  .find((l) => l.startsWith('RESULT:'));

let passed = 0;
let failed = 0;

try {
  assert.ok(line, `no RESULT line from the child process.\nstdout:\n${stdout}\nstderr:\n${result.stderr ?? ''}`);
  assert.ok(
    line.startsWith('RESULT:PASS'),
    `child process reported: ${line}\nstderr:\n${result.stderr ?? ''}`
  );
  passed += 1;
  console.log('  ok   a missing peer prints the install command instead of throwing, and draws no row');
} catch (err) {
  failed += 1;
  console.error('  FAIL a missing peer prints the install command instead of throwing, and draws no row');
  console.error(`       ${err.message}`);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

/**
 * Pure-maths tests for the joystick engine. No DOM, no React.
 *
 *   npm test
 *
 * These cover the acceptance criteria that can be proved with numbers:
 * J-02 (default operations), J-04 (accelerate past the ring), J-05
 * (dominant axis), J-06 (rotation snapping).
 */

import assert from 'node:assert/strict';
import {
  clampToRing,
  computeDelta,
  computeStep,
  deflection,
  dominantAxisOf,
  mapVector,
  normalizeAngle,
  resolveTap,
  snapRadians,
  speedFor,
  travelRadius,
  DEFAULT_ACCEL_EXPONENT,
  DEFAULT_DEADZONE,
  DEFAULT_MAX_SPEED_MULTIPLIER,
  TRAVEL_RATIO,
} from '../dist/index.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
  }
}

function group(name) {
  console.log(`\n${name}`);
}

const RADIUS = travelRadius(140); // 40.6px
const BASE = {
  radius: RADIUS,
  operation: 'move',
  axes: ['x', 'y'],
  zMode: false,
  rotateSnapDeg: 15,
};

// ── deadzone ────────────────────────────────────────────────────────────────
group('deadzone');

test('emits nothing inside the deadzone', () => {
  assert.equal(deflection(0, 0.06), 0);
  assert.equal(deflection(0.06, 0.06), 0);
  assert.equal(speedFor(0.03), 0);
  assert.equal(
    computeDelta({ ...BASE, rawX: RADIUS * 0.03, rawY: 0 }),
    null,
  );
});

test('remaps the deadzone edge to 0 and the ring to 1', () => {
  assert.ok(Math.abs(deflection(1, 0.06) - 1) < 1e-12);
  assert.ok(deflection(0.53, 0.06) > 0.49 && deflection(0.53, 0.06) < 0.51);
});

test('a deadzone of 0 passes distance straight through', () => {
  assert.equal(deflection(0.4, 0), 0.4);
});

// ── J-04: farther = faster ──────────────────────────────────────────────────
group('J-04 farther = faster');

test('speed is monotonically increasing with distance', () => {
  let previous = -1;
  for (let d = 0.1; d <= 2.2; d += 0.05) {
    const s = speedFor(d);
    assert.ok(s >= previous, `speed dropped at d=${d}`);
    previous = s;
  }
});

test('keeps accelerating well past the ring', () => {
  const atRing = speedFor(1);
  const past = speedFor(1.8);
  assert.ok(past > atRing * 2, `expected ${past} >> ${atRing}`);
});

test('speed is capped at maxSpeedMultiplier', () => {
  assert.equal(speedFor(50), DEFAULT_MAX_SPEED_MULTIPLIER);
  assert.equal(speedFor(50, { maxSpeedMultiplier: 3 }), 3);
});

test('the exponent gives a precise centre and a sharp edge', () => {
  // At half deflection a 2.2 exponent should emit well under half speed.
  const half = speedFor(0.5 * (1 - DEFAULT_DEADZONE) + DEFAULT_DEADZONE);
  assert.ok(half < 0.3, `expected < 0.3, got ${half}`);
  assert.ok(Math.abs(half - Math.pow(0.5, DEFAULT_ACCEL_EXPONENT)) < 1e-12);
});

test('the visual thumb clamps to the ring however far the pointer goes', () => {
  const near = clampToRing(10, 0, RADIUS);
  assert.deepEqual(near, { x: 10, y: 0 });
  const far = clampToRing(4000, 3000, RADIUS);
  assert.ok(Math.abs(Math.hypot(far.x, far.y) - RADIUS) < 1e-9);
  // ... and the clamped thumb still fits inside the base circle.
  const thumbEdge = RADIUS + 140 * 0.19;
  assert.ok(thumbEdge <= 70, `thumb edge ${thumbEdge} must stay inside r=70`);
  assert.ok(Math.abs(TRAVEL_RATIO - 0.29) < 1e-12);
});

test('a drag past the ring emits more than a drag on it', () => {
  const onRing = computeDelta({ ...BASE, rawX: 0, rawY: -RADIUS });
  const past = computeDelta({ ...BASE, rawX: 0, rawY: -RADIUS * 2 });
  assert.ok(past.y > onRing.y * 3, `${past.y} vs ${onRing.y}`);
});

// ── direction & basis ───────────────────────────────────────────────────────
group('direction');

test('screen-up is +y, screen-right is +x', () => {
  const up = computeDelta({ ...BASE, rawX: 0, rawY: -RADIUS });
  assert.ok(up.y > 0 && Math.abs(up.x) < 1e-9);
  const right = computeDelta({ ...BASE, rawX: RADIUS, rawY: 0 });
  assert.ok(right.x > 0 && Math.abs(right.y) < 1e-9);
});

test('direction is preserved through the speed curve', () => {
  const d = computeDelta({ ...BASE, rawX: RADIUS * 3, rawY: -RADIUS * 3 });
  assert.ok(Math.abs(d.x - d.y) < 1e-9, 'a 45-degree drag stays at 45 degrees');
});

test('magnitude is the pre-curve deflection, clamped to 1', () => {
  const half = computeDelta({ ...BASE, rawX: RADIUS * 0.5, rawY: 0 });
  assert.ok(Math.abs(half.magnitude - 0.5) < 1e-9);
  const past = computeDelta({ ...BASE, rawX: RADIUS * 9, rawY: 0 });
  assert.equal(past.magnitude, 1);
});

// ── axis mapping ────────────────────────────────────────────────────────────
group('axis mapping');

test('axes[0] takes horizontal, axes[1] takes vertical', () => {
  assert.deepEqual(mapVector(2, 3, ['x', 'y'], false), { x: 2, y: 3, z: 0 });
  assert.deepEqual(mapVector(2, 3, ['z', 'x'], false), { x: 3, y: 0, z: 2 });
});

test('a single axis is driven by the vertical drag', () => {
  assert.deepEqual(mapVector(2, 3, ['z'], false), { x: 0, y: 0, z: 3 });
});

test('zMode routes vertical to z and drops horizontal', () => {
  assert.deepEqual(mapVector(2, 3, ['x', 'y'], true), { x: 0, y: 0, z: 3 });
  const d = computeDelta({ ...BASE, zMode: true, rawX: RADIUS, rawY: -RADIUS });
  assert.equal(d.x, 0);
  assert.equal(d.y, 0);
  assert.ok(d.z > 0);
});

// ── J-06: rotation snapping ─────────────────────────────────────────────────
group('J-06 rotate snapping');

test('snapRadians lands on multiples of the step', () => {
  const deg = (r) => (r * 180) / Math.PI;
  assert.ok(Math.abs(deg(snapRadians((17 * Math.PI) / 180, 15)) - 15) < 1e-9);
  assert.ok(Math.abs(deg(snapRadians((23 * Math.PI) / 180, 15)) - 30) < 1e-9);
  assert.ok(Math.abs(deg(snapRadians((-7 * Math.PI) / 180, 15)) - 0) < 1e-9);
  assert.ok(Math.abs(deg(snapRadians((-8 * Math.PI) / 180, 15)) + 15) < 1e-9);
});

test('snapDeg of 0 snaps to nothing', () => {
  const raw = 0.1234;
  assert.equal(snapRadians(raw, 0), raw);
});

test('rotate emits a snapped angle; other operations emit none', () => {
  // 20 degrees above the horizontal → snaps to 15.
  const rad20 = (20 * Math.PI) / 180;
  const rawX = Math.cos(rad20) * RADIUS;
  const rawY = -Math.sin(rad20) * RADIUS;

  const rotated = computeDelta({ ...BASE, operation: 'rotate', rawX, rawY });
  assert.ok(Math.abs((rotated.angle * 180) / Math.PI - 15) < 1e-9);

  const free = computeDelta({ ...BASE, operation: 'rotate', rotateSnapDeg: 0, rawX, rawY });
  assert.ok(Math.abs((free.angle * 180) / Math.PI - 20) < 1e-9);

  const moved = computeDelta({ ...BASE, operation: 'move', rawX, rawY });
  assert.equal(moved.angle, undefined);
});

test('a snapped rotate emits along the snapped direction', () => {
  const rad20 = (20 * Math.PI) / 180;
  const d = computeDelta({
    ...BASE,
    operation: 'rotate',
    rawX: Math.cos(rad20) * RADIUS,
    rawY: -Math.sin(rad20) * RADIUS,
  });
  const emitted = (Math.atan2(d.y, d.x) * 180) / Math.PI;
  assert.ok(Math.abs(emitted - 15) < 1e-9, `emitted ${emitted}`);
});

test('normalizeAngle wraps into (-PI, PI]', () => {
  assert.ok(Math.abs(normalizeAngle(Math.PI * 3) - Math.PI) < 1e-9);
  assert.ok(Math.abs(normalizeAngle(-Math.PI * 3) - Math.PI) < 1e-9);
});

// ── J-05: dominant axis ─────────────────────────────────────────────────────
group('J-05 dominant axis');

test('picks the axis that moved most, sign-blind', () => {
  assert.equal(dominantAxisOf({ x: 40, y: -20, z: 0 }), 'x');
  assert.equal(dominantAxisOf({ x: 4, y: -200, z: 0 }), 'y');
  assert.equal(dominantAxisOf({ x: 0, y: 0, z: -3 }), 'z');
});

test('is null when nothing moved', () => {
  assert.equal(dominantAxisOf({ x: 0, y: 0, z: 0 }), null);
  assert.equal(dominantAxisOf({ x: 1e-12, y: 0, z: 0 }), null);
});

// ── taps ────────────────────────────────────────────────────────────────────
group('axis taps');

test('resolves the axis and direction of a tap', () => {
  const args = { radius: RADIUS, axes: ['x', 'y'], zMode: false };
  assert.deepEqual(resolveTap({ ...args, rawX: RADIUS, rawY: 0 }), { axis: 'x', direction: 1 });
  assert.deepEqual(resolveTap({ ...args, rawX: -RADIUS, rawY: 0 }), { axis: 'x', direction: -1 });
  assert.deepEqual(resolveTap({ ...args, rawX: 0, rawY: -RADIUS }), { axis: 'y', direction: 1 });
  assert.deepEqual(resolveTap({ ...args, rawX: 0, rawY: RADIUS }), { axis: 'y', direction: -1 });
});

test('a tap in the middle resolves to nothing', () => {
  assert.equal(
    resolveTap({ radius: RADIUS, axes: ['x', 'y'], zMode: false, rawX: 1, rawY: 1 }),
    null,
  );
});

test('a horizontal tap in zMode resolves to nothing', () => {
  assert.equal(
    resolveTap({ radius: RADIUS, axes: ['x', 'y'], zMode: true, rawX: RADIUS, rawY: 0 }),
    null,
  );
  assert.deepEqual(
    resolveTap({ radius: RADIUS, axes: ['x', 'y'], zMode: true, rawX: 0, rawY: -RADIUS }),
    { axis: 'z', direction: 1 },
  );
});

// ── keyboard ────────────────────────────────────────────────────────────────
group('keyboard steps');

test('an arrow step ignores the acceleration curve', () => {
  const d = computeStep({
    dirX: 0,
    dirY: 1,
    step: 1,
    operation: 'move',
    axes: ['x', 'y'],
    zMode: false,
    rotateSnapDeg: 15,
  });
  assert.deepEqual({ x: d.x, y: d.y, z: d.z }, { x: 0, y: 1, z: 0 });
  assert.equal(d.magnitude, 1);
});

test('shift multiplies the step', () => {
  const d = computeStep({
    dirX: -1,
    dirY: 0,
    step: 10,
    operation: 'move',
    axes: ['x', 'y'],
    zMode: false,
    rotateSnapDeg: 0,
  });
  assert.equal(d.x, -10);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

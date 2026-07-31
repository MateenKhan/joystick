/**
 * The maths. No React, no DOM — every function here is pure and unit-tested
 * in `test/engine.test.mjs`.
 *
 * See FORMULAS.md for the derivation and the reasoning behind the defaults.
 */

import type { Axis, JoystickDelta, JoystickOperation } from './events';

export const DEFAULT_SIZE = 140;
export const DEFAULT_DEADZONE = 0.06;
export const DEFAULT_ACCEL_EXPONENT = 2.2;
export const DEFAULT_MAX_SPEED_MULTIPLIER = 6;
export const DEFAULT_ROTATE_SNAP_DEG = 15;

/**
 * Thumb travel radius as a fraction of the base diameter.
 *
 * `0.29` is not arbitrary: the thumb is 38% of the base, so its own radius is
 * `0.19`. `0.5 - 0.19 - 0.02` leaves a 2%-of-base gap at full deflection, which
 * is why the thumb never pokes out of the ring however far you drag (J-04).
 */
export const TRAVEL_RATIO = 0.29;

/** Ring radius in px for a given base size. */
export function travelRadius(size: number): number {
  return size * TRAVEL_RATIO;
}

export type AccelConfig = {
  /** 0–1. Fraction of the ring radius that emits nothing. */
  deadzone: number;
  /** Power applied to the deadzone-remapped deflection. */
  accelExponent: number;
  /** Hard ceiling on the emitted speed, so a full-screen drag can't run away. */
  maxSpeedMultiplier: number;
};

export const DEFAULT_ACCEL: AccelConfig = {
  deadzone: DEFAULT_DEADZONE,
  accelExponent: DEFAULT_ACCEL_EXPONENT,
  maxSpeedMultiplier: DEFAULT_MAX_SPEED_MULTIPLIER,
};

/**
 * Deadzone-remapped deflection.
 *
 * `dist` is in ring units: `1.0` means the pointer is exactly on the ring.
 * The result is deliberately **not clamped above 1** — that is the whole
 * "drag past the ring keeps accelerating" behaviour. Only the visual thumb
 * clamps.
 */
export function deflection(dist: number, deadzone = DEFAULT_DEADZONE): number {
  const dz = Math.min(Math.max(deadzone, 0), 0.999);
  const t = (dist - dz) / (1 - dz);
  return t > 0 ? t : 0;
}

/**
 * The speed curve: `t^accelExponent`, capped at `maxSpeedMultiplier`.
 *
 * Precise and slow near the centre, and it keeps climbing well past the ring
 * so the same control does a 2mm nudge and a 300mm shove.
 */
export function speedFor(dist: number, cfg: Partial<AccelConfig> = {}): number {
  const { deadzone, accelExponent, maxSpeedMultiplier } = { ...DEFAULT_ACCEL, ...cfg };
  const t = deflection(dist, deadzone);
  if (t <= 0) return 0;
  return Math.min(maxSpeedMultiplier, Math.pow(t, accelExponent));
}

/** Wrap an angle into `(-PI, PI]`. */
export function normalizeAngle(rad: number): number {
  const twoPi = Math.PI * 2;
  let a = rad % twoPi;
  if (a > Math.PI) a -= twoPi;
  if (a <= -Math.PI) a += twoPi;
  return a;
}

/** Snap an angle (radians) to the nearest multiple of `snapDeg`. `0` = free. */
export function snapRadians(rad: number, snapDeg: number): number {
  if (!snapDeg || snapDeg <= 0) return rad;
  const step = (snapDeg * Math.PI) / 180;
  return normalizeAngle(Math.round(rad / step) * step);
}

export type AxisVector = { x: number; y: number; z: number };

export const ZERO: AxisVector = Object.freeze({ x: 0, y: 0, z: 0 }) as AxisVector;

/**
 * Route a screen-space vector onto the named axes.
 *
 * `axes[0]` takes the **horizontal** drag, `axes[1]` the **vertical**. When a
 * single axis is given it is driven by the vertical drag, because a one-axis
 * stick is almost always a magnitude (depth, radius, elevation) and up/down
 * reads as more/less.
 *
 * `zMode` overrides everything: vertical drives `z`, horizontal is ignored.
 */
export function mapVector(vx: number, vy: number, axes: readonly Axis[], zMode: boolean): AxisVector {
  const out: AxisVector = { x: 0, y: 0, z: 0 };
  if (zMode) {
    out.z = vy;
    return out;
  }
  const horizontal = axes.length > 1 ? axes[0] : undefined;
  const vertical = axes.length > 1 ? axes[1] : axes[0];
  if (horizontal) out[horizontal] += vx;
  if (vertical) out[vertical] += vy;
  return out;
}

export type DeltaInput = {
  /** Raw, unclamped pointer offset from the centre, in px. Screen basis (y down). */
  rawX: number;
  rawY: number;
  /** Ring radius in px. */
  radius: number;
  operation: JoystickOperation;
  axes: readonly Axis[];
  zMode: boolean;
  rotateSnapDeg: number;
  accel?: Partial<AccelConfig>;
};

/**
 * Turn a raw pointer offset into one frame of delta.
 *
 * Returns `null` inside the deadzone — nothing to emit, so nothing is emitted.
 */
export function computeDelta(input: DeltaInput): JoystickDelta | null {
  const { rawX, rawY, radius, operation, axes, zMode, rotateSnapDeg, accel } = input;
  if (!radius) return null;

  // Ring units. UNCLAMPED — drag past the ring and this keeps growing.
  const ux = rawX / radius;
  const uy = -(rawY / radius); // screen y is down; up should read as +y
  const dist = Math.hypot(ux, uy);
  if (dist === 0) return null;

  const speed = speedFor(dist, accel);
  if (speed === 0) return null;

  let angle = Math.atan2(uy, ux);
  let dirX: number;
  let dirY: number;

  if (operation === 'rotate' && rotateSnapDeg > 0) {
    // Snapping the *direction of travel* means a 15° stick reads as a clean
    // 15° rotation instead of 14.7°.
    angle = snapRadians(angle, rotateSnapDeg);
    dirX = Math.cos(angle);
    dirY = Math.sin(angle);
  } else {
    const inv = 1 / dist;
    dirX = ux * inv;
    dirY = uy * inv;
  }

  const mapped = mapVector(dirX * speed, dirY * speed, axes, zMode);

  return {
    ...mapped,
    operation,
    magnitude: Math.min(1, dist),
    ...(operation === 'rotate' ? { angle } : null),
  };
}

/** One discrete keyboard step, routed through the same axis mapping. */
export function computeStep(input: {
  dirX: number;
  dirY: number;
  step: number;
  operation: JoystickOperation;
  axes: readonly Axis[];
  zMode: boolean;
  rotateSnapDeg: number;
}): JoystickDelta {
  const { dirX, dirY, step, operation, axes, zMode, rotateSnapDeg } = input;
  let angle = Math.atan2(dirY, dirX);
  if (operation === 'rotate' && rotateSnapDeg > 0) angle = snapRadians(angle, rotateSnapDeg);
  const mapped = mapVector(dirX * step, dirY * step, axes, zMode);
  return {
    ...mapped,
    operation,
    magnitude: Math.min(1, Math.abs(step)),
    ...(operation === 'rotate' ? { angle } : null),
  };
}

/** The axis that moved most over a gesture. `null` when nothing moved. */
export function dominantAxisOf(total: AxisVector, epsilon = 1e-6): Axis | null {
  const entries: Array<[Axis, number]> = [
    ['x', Math.abs(total.x)],
    ['y', Math.abs(total.y)],
    ['z', Math.abs(total.z)],
  ];
  let best: Axis | null = null;
  let bestValue = epsilon;
  for (const [axis, value] of entries) {
    if (value > bestValue) {
      best = axis;
      bestValue = value;
    }
  }
  return best;
}

/**
 * Which axis a quick tap landed on, and in which direction.
 *
 * Returns `null` for a tap inside the deadzone — a tap in the middle is a tap
 * on nothing.
 */
export function resolveTap(input: {
  rawX: number;
  rawY: number;
  radius: number;
  axes: readonly Axis[];
  zMode: boolean;
  deadzone?: number;
}): { axis: Axis; direction: 1 | -1 } | null {
  const { rawX, rawY, radius, axes, zMode, deadzone = DEFAULT_DEADZONE } = input;
  if (!radius) return null;
  const ux = rawX / radius;
  const uy = -(rawY / radius);
  if (Math.hypot(ux, uy) <= deadzone) return null;

  const horizontal = Math.abs(ux) >= Math.abs(uy);
  if (zMode) {
    if (horizontal) return null; // z-mode has no horizontal axis
    return { axis: 'z', direction: uy >= 0 ? 1 : -1 };
  }
  const hAxis = axes.length > 1 ? axes[0] : undefined;
  const vAxis = axes.length > 1 ? axes[1] : axes[0];
  if (horizontal) {
    if (!hAxis) return null;
    return { axis: hAxis, direction: ux >= 0 ? 1 : -1 };
  }
  if (!vAxis) return null;
  return { axis: vAxis, direction: uy >= 0 ? 1 : -1 };
}

/** Clamp a raw offset to the ring — the visual thumb position. */
export function clampToRing(rawX: number, rawY: number, radius: number): { x: number; y: number } {
  const dist = Math.hypot(rawX, rawY);
  if (dist <= radius || dist === 0) return { x: rawX, y: rawY };
  return { x: (rawX / dist) * radius, y: (rawY / dist) * radius };
}

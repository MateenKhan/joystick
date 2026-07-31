/**
 * @jugaaadi/joystick
 *
 *   import { Joystick } from '@jugaaadi/joystick';
 *   import '@jugaaadi/joystick/styles.css';
 *
 * A dark, touch-first analogue stick. Drag past the ring and it keeps
 * accelerating; the thumb stays inside. Zero runtime dependencies.
 */

export { Joystick } from './Joystick';
export type { JoystickProps } from './Joystick';

/** Headless engine, for building your own visual shell. */
export { useJoystick } from './useJoystick';
export type { UseJoystickOptions, JoystickState, UseJoystickResult } from './useJoystick';

export type {
  Axis,
  JoystickOperation,
  JoystickDelta,
  JoystickEventMeta,
  JoystickGestureSummary,
  JoystickEvents,
} from './events';

/** The maths — pure, no React. Useful for tests and for driving other widgets. */
export {
  deflection,
  speedFor,
  snapRadians,
  normalizeAngle,
  mapVector,
  computeDelta,
  computeStep,
  dominantAxisOf,
  resolveTap,
  clampToRing,
  travelRadius,
  TRAVEL_RATIO,
  DEFAULT_SIZE,
  DEFAULT_DEADZONE,
  DEFAULT_ACCEL_EXPONENT,
  DEFAULT_MAX_SPEED_MULTIPLIER,
  DEFAULT_ROTATE_SNAP_DEG,
  DEFAULT_ACCEL,
} from './engine';
export type { AccelConfig, AxisVector, DeltaInput } from './engine';

/** Inline SVG icons, exported so a custom shell can match the built-in chrome. */
export {
  MoveIcon,
  RotateIcon,
  ScaleIcon,
  ExtrudeIcon,
  FilletIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  OperationIcon,
} from './icons';
export type { IconProps } from './icons';

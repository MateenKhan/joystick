/**
 * Public event vocabulary for @jugaaadi/joystick.
 *
 * Nothing in here knows about shapes, canvases, CAD or furniture — the
 * component emits direction and speed, the consumer decides what that means.
 */

export type Axis = 'x' | 'y' | 'z';

export type JoystickOperation = 'move' | 'rotate' | 'scale' | 'extrude' | 'fillet';

/** A per-frame slice of a gesture. Units are consumer-defined. */
export type JoystickDelta = {
  /**
   * Continuous, per-frame. `1.0` on an axis means "one ring-radius worth of
   * deflection, per frame" — multiply by whatever your app calls a unit.
   * Screen-up is `+y`; screen-right is `+x`.
   */
  x: number;
  y: number;
  z: number;
  /** The operation that was active when this frame was emitted. */
  operation: JoystickOperation;
  /** 0–1 deflection, before the acceleration curve. Clamped at the ring. */
  magnitude: number;
  /**
   * Direction of travel in radians, CCW from screen-right. Only present for
   * `rotate`, where it is snapped to `rotateSnapDeg`.
   */
  angle?: number;
};

/** Input context for the event that produced a callback. */
export type JoystickEventMeta = {
  pointerType: 'mouse' | 'touch' | 'pen';
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  timeStamp: number;
  /**
   * Which input device drove the gesture. Keyboard gestures report
   * `pointerType: 'mouse'` because `PointerEvent` has no keyboard value.
   */
  source?: 'pointer' | 'keyboard';
};

/** What the whole gesture added up to — for a single undo entry. */
export type JoystickGestureSummary = {
  total: { x: number; y: number; z: number };
  operation: JoystickOperation;
  durationMs: number;
  /** The axis that moved most. `null` when the gesture moved nothing. */
  dominantAxis: Axis | null;
  /** `true` when the gesture was cancelled with `Escape` (`total` is zeroed). */
  cancelled: boolean;
};

/** Every emitter, in one bag — handy for prop spreading. */
export type JoystickEvents = {
  onStart?: (e: JoystickEventMeta) => void;
  onChange?: (delta: JoystickDelta, e: JoystickEventMeta) => void;
  onEnd?: (summary: JoystickGestureSummary, e: JoystickEventMeta) => void;
  onHover?: (hovering: boolean) => void;
  onAxisTap?: (axis: Axis, direction: 1 | -1) => void;
};

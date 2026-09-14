/**
 * The presentational joystick — a dark analogue stick with a directional glow,
 * an optional operation switcher and an optional Z toggle.
 *
 *   import { Joystick } from '@jugaaadi/joystick';
 *   import '@jugaaadi/joystick/styles.css';
 *
 * All of the behaviour lives in `useJoystick`; this file is pixels and chrome.
 */

import { useCallback, useMemo, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import type {
  Axis,
  JoystickDelta,
  JoystickEventMeta,
  JoystickGestureSummary,
  JoystickOperation,
} from './events';
import {
  DEFAULT_ACCEL_EXPONENT,
  DEFAULT_DEADZONE,
  DEFAULT_MAX_SPEED_MULTIPLIER,
  DEFAULT_ROTATE_SNAP_DEG,
  DEFAULT_SIZE,
  travelRadius,
} from './engine';
import { ChevronLeftIcon, ChevronRightIcon, OperationIcon } from './icons';
import { useJoystick } from './useJoystick';

/**
 * Module-level so the default keeps a stable identity across renders — a fresh
 * `['move']` on every render would churn every downstream memo.
 */
const DEFAULT_OPERATIONS: JoystickOperation[] = ['move'];
const DEFAULT_AXES: Axis[] = ['x', 'y'];

const OPERATION_LABELS: Record<JoystickOperation, string> = {
  move: 'Move',
  rotate: 'Rotate',
  scale: 'Scale',
  extrude: 'Extrude',
  fillet: 'Fillet',
};

/**
 * ONE PROP FOR EVERY OVERRIDABLE STRING, rather than eight loose ones.
 *
 * Every key here is optional and every key has today's text as its fallback,
 * so a consumer that omits `labels` entirely — every existing consumer — sees
 * no change at all. A single object was chosen over separate `operationLabels`
 * / `axisLabels` / `joystickLabel` / … props because the set of overridable
 * strings has already grown once (this change) and will again; a bag with one
 * optional key per string absorbs that growth without widening the props list
 * every time, and it reads at a call site as "the words", one concern, rather
 * than a scatter of same-shaped props a consumer has to hunt for individually.
 */
export type JoystickLabels = {
  /**
   * Per-operation text for the mode chip, its title, and the fields-mode verb
   * radios. Keys are optional; an operation not named here keeps its built-in
   * English word (Move / Rotate / Scale / Extrude / Fillet).
   */
  operations?: Partial<Record<JoystickOperation, string>>;
  /**
   * Per-axis letter drawn on the pad (the `+X` / `-X` style labels). An axis
   * not named here keeps its own letter, uppercased, as today.
   */
  axes?: Partial<Record<Axis, string>>;
  /** The stick's own `aria-label` when the `label` prop is not given. Default `'Joystick'`. */
  joystick?: string;
  /** The fields-mode operation radiogroup's `aria-label`. Default `'Operation'`. */
  operationGroup?: string;
  /** The fields-mode switch's visible caption (its knob's text). Default `'123'`. */
  fieldsSwitchName?: string;
  /**
   * The fields-mode switch's `aria-label`. Omitted by default, the same as
   * today — its accessible name then comes from `fieldsSwitchName`'s text, as
   * it always has.
   */
  fieldsSwitchAriaLabel?: string;
  /** The fields-mode switch's `title` while the fields are open (pressing it shows the pad). Default `'Show the pad'`. */
  fieldsSwitchTitleOpen?: string;
  /** The fields-mode switch's `title` while the fields are closed (pressing it shows the numbers). Default `'Show the numbers'`. */
  fieldsSwitchTitleClosed?: string;
};

export type JoystickProps = {
  /**
   * Which operations are offered. DEFAULT: `['move']` only.
   *
   * Everything else stays off until a consumer asks for it — a furniture app
   * has no use for extrude or fillet, and showing dead modes is worse than
   * hiding them. With one operation the switcher is not rendered at all.
   */
  operations?: JoystickOperation[];
  /** Controlled operation. Omit to let the component own it. */
  operation?: JoystickOperation;
  onOperationChange?: (op: JoystickOperation) => void;

  /** Which axes the stick drives in the current operation. Default `['x','y']`. */
  axes?: Axis[];
  /** Z as a toggle rather than a third axis — the original's `zMode`. Default true. */
  zToggle?: boolean;
  /** Controlled z-mode. Omit to let the component own it. */
  zMode?: boolean;
  onZModeChange?: (zMode: boolean) => void;

  size?: number; // px, default 140
  accelExponent?: number; // default 2.2
  maxSpeedMultiplier?: number; // default 6
  deadzone?: number; // 0–1, default 0.06
  /** Snap rotation to this many degrees. 0 = free. Default 15. */
  rotateSnapDeg?: number;

  /**
   * FIELDS MODE - the numbers take the wheel's place, they do not sit above it.
   *
   * Rendered INSTEAD of the pad while `fieldsOpen`, one element per row. The
   * package owns the surface, the stacking, the operation options and the
   * switch; the consumer owns the inputs, because a number control is the
   * consumer's business and this component has no opinion about which one.
   *
   * Added in 0.0.3 for the interior configurator, whose owner asked for it in
   * these words: "i wanted the scrollable inputs of joystick inside the
   * joystick by replacing joystick ... not above the joystick div", and then,
   * when a first attempt kept them side by side: "keep the inputs one below
   * other instead of one aside to other".
   *
   * Omit it and nothing changes - no switch is drawn and the pad behaves
   * exactly as it did in 0.0.2.
   */
  fields?: ReactNode;
  /** Controlled fields mode. Omit to let the component own it. */
  fieldsOpen?: boolean;
  onFieldsOpenChange?: (open: boolean) => void;

  disabled?: boolean;
  collapsible?: boolean; // default true
  /** Start collapsed. Default false. */
  defaultCollapsed?: boolean;
  label?: string;
  /** Overrides for every other user-facing string — operation names, axis letters, the fields switch. Every key optional; omit the whole prop and nothing changes. */
  labels?: JoystickLabels;

  /** Units emitted by one arrow-key press. Default 1. */
  keyStep?: number;
  /** Multiplier while `Shift` is held. Default 10. */
  keyStepMultiplier?: number;
  /** Longest motionless press still treated as a tap, in ms. Default 250. */
  tapMaxMs?: number;

  className?: string;
  style?: CSSProperties;
  id?: string;

  onStart?: (e: JoystickEventMeta) => void;
  onChange?: (delta: JoystickDelta, e: JoystickEventMeta) => void;
  onEnd?: (summary: JoystickGestureSummary, e: JoystickEventMeta) => void;
  onHover?: (hovering: boolean) => void;
  onAxisTap?: (axis: Axis, direction: 1 | -1) => void;
};

function axisClass(axis: Axis | undefined): string {
  return axis ? `jy-axis--${axis}` : 'jy-axis--none';
}

/** `OPERATION_LABELS[op]`, overridable per key, falling back to the built-in word. */
function operationLabel(labels: JoystickLabels | undefined, op: JoystickOperation): string {
  return labels?.operations?.[op] ?? OPERATION_LABELS[op];
}

/** The letter drawn on the pad for an axis, overridable per key, falling back to its own uppercase letter. */
function axisLabel(labels: JoystickLabels | undefined, axis: Axis): string {
  return labels?.axes?.[axis] ?? axis.toUpperCase();
}

export function Joystick(props: JoystickProps): ReactElement {
  const {
    operations = DEFAULT_OPERATIONS,
    operation: operationProp,
    onOperationChange,
    axes = DEFAULT_AXES,
    zToggle = true,
    zMode: zModeProp,
    onZModeChange,
    size = DEFAULT_SIZE,
    accelExponent = DEFAULT_ACCEL_EXPONENT,
    maxSpeedMultiplier = DEFAULT_MAX_SPEED_MULTIPLIER,
    deadzone = DEFAULT_DEADZONE,
    rotateSnapDeg = DEFAULT_ROTATE_SNAP_DEG,
    fields,
    fieldsOpen: fieldsOpenProp,
    onFieldsOpenChange,
    disabled = false,
    collapsible = true,
    defaultCollapsed = false,
    label,
    labels,
    keyStep,
    keyStepMultiplier,
    tapMaxMs,
    className,
    style,
    id,
    onStart,
    onChange,
    onEnd,
    onHover,
    onAxisTap,
  } = props;

  const [internalOp, setInternalOp] = useState<JoystickOperation>(() => operations[0] ?? 'move');
  const [internalZ, setInternalZ] = useState(false);
  const [internalFields, setInternalFields] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const operation = operationProp ?? (operations.includes(internalOp) ? internalOp : operations[0] ?? 'move');
  const zModeActive = (zModeProp ?? internalZ) && zToggle;

  const radius = travelRadius(size);

  const { bind, state } = useJoystick({
    size,
    operation,
    axes,
    zMode: zModeActive,
    deadzone,
    accelExponent,
    maxSpeedMultiplier,
    rotateSnapDeg,
    disabled,
    keyStep,
    keyStepMultiplier,
    tapMaxMs,
    onStart,
    onChange,
    onEnd,
    onHover,
    onAxisTap,
  });

  /*
   * PICK AN OPERATION DIRECTLY - what the fields-mode options do, against the
   * switcher's "next one along".
   *
   * It shares `cycleOperation`'s two rules rather than restating them: refuse
   * while disabled, and write internal state ONLY when the consumer has not
   * taken control of `operation`. A second copy of that pair is how a
   * controlled component starts disagreeing with its owner about who holds the
   * value.
   */
  const setOperation = useCallback(
    (next: JoystickOperation) => {
      if (disabled || next === operation || !operations.includes(next)) return;
      if (operationProp === undefined) setInternalOp(next);
      onOperationChange?.(next);
    },
    [disabled, onOperationChange, operation, operationProp, operations]
  );

  const cycleOperation = useCallback(() => {
    if (disabled || operations.length < 2) return;
    const index = operations.indexOf(operation);
    const next = operations[(index + 1) % operations.length];
    if (operationProp === undefined) setInternalOp(next);
    onOperationChange?.(next);
  }, [disabled, onOperationChange, operation, operationProp, operations]);

  const toggleZ = useCallback(() => {
    if (disabled) return;
    const next = !zModeActive;
    if (zModeProp === undefined) setInternalZ(next);
    onZModeChange?.(next);
  }, [disabled, onZModeChange, zModeActive, zModeProp]);

  // The glow rides the ring at the drag angle, in the same screen basis as the
  // thumb, so it always sits under the finger.
  const glow = useMemo(() => {
    const dist = Math.hypot(state.x, state.y);
    if (!state.dragging || dist < radius * 0.05) return null;
    const angle = Math.atan2(state.y, state.x);
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      intensity: Math.min(1, dist / radius),
    };
  }, [radius, state.dragging, state.x, state.y]);

  const horizontalAxis = zModeActive ? undefined : axes.length > 1 ? axes[0] : undefined;
  const verticalAxis = zModeActive ? 'z' : axes.length > 1 ? axes[1] : axes[0];

  const rootStyle = {
    '--jy-size': `${size}px`,
    '--jy-travel': `${radius}px`,
    ...style,
  } as CSSProperties;

  const rootClass = [
    'jy-root',
    state.dragging && 'jy-root--dragging',
    disabled && 'jy-root--disabled',
    collapsed && 'jy-root--collapsed',
    zModeActive && 'jy-root--zmode',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const showSwitcher = operations.length > 1;
  const showSidebar = showSwitcher || zToggle || !!label;

  /*
   * FIELDS MODE. Controlled when the consumer passes `fieldsOpen`, otherwise
   * owned here - the same pattern `operation` and `zMode` already follow, so a
   * consumer can adopt it at either level without learning a third convention.
   *
   * `hasFields` gates the whole feature on the consumer having supplied
   * something to show. Drawing a switch that reveals an empty box would be a
   * dead control, and a dead control is worse than an absent one.
   */
  const hasFields = fields !== undefined && fields !== null;
  const fieldsOpen = hasFields && (fieldsOpenProp ?? internalFields);
  const toggleFields = useCallback(() => {
    const next = !fieldsOpen;
    if (fieldsOpenProp === undefined) setInternalFields(next);
    onFieldsOpenChange?.(next);
  }, [fieldsOpen, fieldsOpenProp, onFieldsOpenChange]);

  /*
   * THE SWITCH, DRAWN THE WAY `.jy-ztoggle` IS DRAWN - a track with a knob.
   *
   * The consumer's first attempt at this used an icon button and he rejected
   * it: "the toggle switch is not a switch it looks like a dimension switch
   * make it toggle switch". The Z toggle in this very component was already
   * the right shape, so this reuses its markup rather than inventing a second
   * switch that would drift from it.
   */
  const fieldsSwitch = hasFields ? (
    <button
      type="button"
      className={`jy-fieldswitch${fieldsOpen ? ' jy-fieldswitch--on' : ''}`}
      onClick={toggleFields}
      disabled={disabled}
      role="switch"
      aria-checked={fieldsOpen}
      aria-label={labels?.fieldsSwitchAriaLabel}
      data-testid="jy-fields-switch"
      title={
        fieldsOpen
          ? labels?.fieldsSwitchTitleOpen ?? 'Show the pad'
          : labels?.fieldsSwitchTitleClosed ?? 'Show the numbers'
      }
    >
      <span className="jy-fieldswitch-track">
        <span className="jy-fieldswitch-knob" />
      </span>
      <span className="jy-fieldswitch-name">{labels?.fieldsSwitchName ?? '123'}</span>
    </button>
  ) : null;

  return (
    <div className={rootClass} style={rootStyle} id={id} data-operation={operation}>
      {collapsible && (
        <button
          type="button"
          className="jy-collapse"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand joystick' : 'Collapse joystick'}
        >
          {collapsed ? <ChevronLeftIcon /> : <ChevronRightIcon />}
          <span className="jy-sr-only">{collapsed ? 'Expand joystick' : 'Collapse joystick'}</span>
        </button>
      )}

      <div
        className={`jy-panel${fieldsOpen ? ' jy-panel--fields' : ''}`}
        hidden={collapsed}
      >
        {/*
          =====================================================================
          FIELDS MODE - the numbers REPLACE the wheel, 0.0.3
          =====================================================================

          Not beside it and not above it. Two things taking one position by
          turns cost the larger of them; two things stacked cost the sum, and
          this panel floats over a 3D scene in a corner of a phone.

          WHAT IS HERE AND WHY EACH PIECE:

            .jy-title    the same label the pad shows under itself. The pad is
                         not rendered in this mode, so without this the numbers
                         name nothing - and an unlabelled bank of inputs over a
                         drawing is a worse control than no inputs.

            .jy-verbs    every operation the consumer OFFERS, all visible, the
                         live one filled rather than tinted. It replaces the
                         cycling `.jy-mode` button for this mode only, on the
                         consumer's report: "dont forget to show the options
                         like move, scale, rotate". A cycling button makes a
                         person press it to discover what exists.

            .jy-fields   the consumer's own inputs, stacked one per row by the
                         stylesheet rather than by anything here.

            .jy-fieldswitch  below the rows, which is where he asked for it:
                         "make it below z axis as a normal look".

          THE OPERATION OPTIONS ARE NOT A FIXED THREE. They come from
          `operations`, the same list the switcher walks, so a consumer that
          offers only scale and move gets two - showing a verb the selection
          cannot take is the dead control this package already avoids by not
          rendering the switcher at all when there is one operation.
        */}
        {fieldsOpen ? (
          <>
            {label && <div className="jy-title jy-title--fields">{label}</div>}
            {showSwitcher && (
              <div className="jy-verbs" role="radiogroup" aria-label={labels?.operationGroup ?? 'Operation'}>
                {operations.map((op) => (
                  <button
                    key={op}
                    type="button"
                    role="radio"
                    aria-checked={op === operation}
                    className={`jy-verb${op === operation ? ' jy-verb--on' : ''}`}
                    data-testid={`jy-verb-${op}`}
                    disabled={disabled}
                    onClick={() => setOperation(op)}
                  >
                    <OperationIcon operation={op} size={14} />
                    <span className="jy-verb-name">{operationLabel(labels, op)}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="jy-fields" data-testid="jy-fields">
              {fields}
            </div>
            {fieldsSwitch}
          </>
        ) : (
        <>
        <div
          ref={bind}
          className="jy-base"
          role="application"
          aria-label={label ?? labels?.joystick ?? 'Joystick'}
          aria-disabled={disabled || undefined}
          tabIndex={disabled ? -1 : 0}
        >
          <div className="jy-ring" aria-hidden="true" />

          {glow && (
            <div
              className="jy-glow"
              aria-hidden="true"
              style={
                {
                  transform: `translate(-50%, -50%) translate(${glow.x}px, ${glow.y}px)`,
                  '--jy-glow-intensity': glow.intensity,
                } as CSSProperties
              }
            />
          )}

          <div className="jy-ticks" aria-hidden="true">
            <i /> <i /> <i /> <i />
          </div>

          <div className="jy-labels" aria-hidden="true">
            {verticalAxis && (
              <>
                <span className={`jy-label jy-label--top ${axisClass(verticalAxis)}`}>
                  +{axisLabel(labels, verticalAxis)}
                </span>
                <span className={`jy-label jy-label--bottom ${axisClass(verticalAxis)}`}>
                  -{axisLabel(labels, verticalAxis)}
                </span>
              </>
            )}
            {horizontalAxis && (
              <>
                <span className={`jy-label jy-label--right ${axisClass(horizontalAxis)}`}>
                  +{axisLabel(labels, horizontalAxis)}
                </span>
                <span className={`jy-label jy-label--left ${axisClass(horizontalAxis)}`}>
                  -{axisLabel(labels, horizontalAxis)}
                </span>
              </>
            )}
          </div>

          <div
            className="jy-thumb"
            aria-hidden="true"
            style={{
              transform: `translate(calc(-50% + ${state.x}px), calc(-50% + ${state.y}px))`,
            }}
          >
            <i className="jy-thumb-mark jy-thumb-mark--up" />
            <i className="jy-thumb-mark jy-thumb-mark--down" />
            {horizontalAxis && (
              <>
                <i className="jy-thumb-mark jy-thumb-mark--right" />
                <i className="jy-thumb-mark jy-thumb-mark--left" />
              </>
            )}
            <i className="jy-thumb-dimple" />
          </div>
        </div>

        {showSidebar && (
          <div className="jy-side">
            {label && <div className="jy-title">{label}</div>}

            {showSwitcher ? (
              <button
                type="button"
                className="jy-mode"
                data-testid="jy-mode"
                onClick={cycleOperation}
                disabled={disabled}
                title={`Switch operation (current: ${operationLabel(labels, operation)})`}
              >
                <OperationIcon operation={operation} size={18} />
                <span className="jy-mode-name">{operationLabel(labels, operation)}</span>
              </button>
            ) : (
              <div className="jy-mode jy-mode--static">
                <OperationIcon operation={operation} size={18} />
                <span className="jy-mode-name">{operationLabel(labels, operation)}</span>
              </div>
            )}

            {zToggle && (
              <button
                type="button"
                data-testid="jy-ztoggle"
                className={`jy-ztoggle${zModeActive ? ' jy-ztoggle--on' : ''}`}
                onClick={toggleZ}
                disabled={disabled}
                aria-pressed={zModeActive}
                title={zModeActive ? 'Z-mode on — drag up/down for Z' : 'Z-mode off'}
              >
                <span className="jy-ztoggle-track">
                  <span className="jy-ztoggle-knob" />
                </span>
                <span className="jy-ztoggle-name">Z</span>
              </button>
            )}
            {/* The way INTO fields mode. It has to live in the pad's own column
                because there are no rows to sit under while the pad is up. */}
            {fieldsSwitch}
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}

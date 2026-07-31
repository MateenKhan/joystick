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
import type { CSSProperties, ReactElement } from 'react';
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

  disabled?: boolean;
  collapsible?: boolean; // default true
  /** Start collapsed. Default false. */
  defaultCollapsed?: boolean;
  label?: string;

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
    disabled = false,
    collapsible = true,
    defaultCollapsed = false,
    label,
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

      <div className="jy-panel" hidden={collapsed}>
        <div
          ref={bind}
          className="jy-base"
          role="application"
          aria-label={label ?? 'Joystick'}
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
                  +{verticalAxis.toUpperCase()}
                </span>
                <span className={`jy-label jy-label--bottom ${axisClass(verticalAxis)}`}>
                  -{verticalAxis.toUpperCase()}
                </span>
              </>
            )}
            {horizontalAxis && (
              <>
                <span className={`jy-label jy-label--right ${axisClass(horizontalAxis)}`}>
                  +{horizontalAxis.toUpperCase()}
                </span>
                <span className={`jy-label jy-label--left ${axisClass(horizontalAxis)}`}>
                  -{horizontalAxis.toUpperCase()}
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
                onClick={cycleOperation}
                disabled={disabled}
                title={`Switch operation (current: ${OPERATION_LABELS[operation]})`}
              >
                <OperationIcon operation={operation} size={18} />
                <span className="jy-mode-name">{OPERATION_LABELS[operation]}</span>
              </button>
            ) : (
              <div className="jy-mode jy-mode--static">
                <OperationIcon operation={operation} size={18} />
                <span className="jy-mode-name">{OPERATION_LABELS[operation]}</span>
              </div>
            )}

            {zToggle && (
              <button
                type="button"
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
          </div>
        )}
      </div>
    </div>
  );
}

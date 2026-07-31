/**
 * The headless joystick: all of the gesture behaviour, none of the pixels.
 *
 *   const { bind, state } = useJoystick({ onChange: (d) => nudge(d) });
 *   return <div ref={bind} style={{ touchAction: 'none' }} />;
 *
 * `bind` is a stable ref callback — hand it straight to `ref`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  clampToRing,
  computeDelta,
  computeStep,
  dominantAxisOf,
  resolveTap,
  travelRadius,
} from './engine';

const DEFAULT_AXES: Axis[] = ['x', 'y'];

/** Movement (px) that turns a press into a drag rather than a tap. */
const TAP_SLOP_PX = 4;

export type UseJoystickOptions = {
  /** Base diameter in px. Only used to derive the ring radius. Default 140. */
  size?: number;
  /** Ring radius in px. Overrides the value derived from `size`. */
  radius?: number;

  operation?: JoystickOperation;
  axes?: readonly Axis[];
  /** Vertical drag drives `z`, horizontal is ignored. */
  zMode?: boolean;

  deadzone?: number;
  accelExponent?: number;
  maxSpeedMultiplier?: number;
  rotateSnapDeg?: number;

  disabled?: boolean;

  /** Units emitted by one arrow-key press. Default 1 (one ring radius). */
  keyStep?: number;
  /** Multiplier applied while `Shift` is held. Default 10. */
  keyStepMultiplier?: number;
  /** Longest press still treated as a tap, in ms. Default 250. */
  tapMaxMs?: number;

  onStart?: (e: JoystickEventMeta) => void;
  onChange?: (delta: JoystickDelta, e: JoystickEventMeta) => void;
  onEnd?: (summary: JoystickGestureSummary, e: JoystickEventMeta) => void;
  onHover?: (hovering: boolean) => void;
  onAxisTap?: (axis: Axis, direction: 1 | -1) => void;
};

export type JoystickState = {
  dragging: boolean;
  /** Thumb offset from the centre, in px, **clamped to the ring**. Screen basis. */
  x: number;
  y: number;
  /** 0–1 deflection, before the acceleration curve. */
  magnitude: number;
};

export type UseJoystickResult = {
  /** Stable ref callback. Attach to the element you want to be the stick. */
  bind: (el: HTMLElement | null) => void;
  state: JoystickState;
};

const ARROW_VECTORS: Record<string, { x: number; y: number }> = {
  ArrowRight: { x: 1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowUp: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 },
};

const IDLE_STATE: JoystickState = { dragging: false, x: 0, y: 0, magnitude: 0 };

function metaOf(e: PointerEvent): JoystickEventMeta {
  const type = e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse';
  return {
    pointerType: type,
    shiftKey: e.shiftKey,
    ctrlKey: e.ctrlKey,
    altKey: e.altKey,
    timeStamp: e.timeStamp,
    source: 'pointer',
  };
}

function metaOfKey(e: KeyboardEvent): JoystickEventMeta {
  return {
    pointerType: 'mouse',
    shiftKey: e.shiftKey,
    ctrlKey: e.ctrlKey,
    altKey: e.altKey,
    timeStamp: e.timeStamp,
    source: 'keyboard',
  };
}

function syntheticMeta(): JoystickEventMeta {
  return {
    pointerType: 'mouse',
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    timeStamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    source: 'pointer',
  };
}

export function useJoystick(options: UseJoystickOptions = {}): UseJoystickResult {
  // A single live ref, so the native listeners installed once always read the
  // current props without being torn down and rebuilt every render.
  const optsRef = useRef(options);
  optsRef.current = options;

  const [state, setState] = useState<JoystickState>(IDLE_STATE);

  const elRef = useRef<HTMLElement | null>(null);
  const rawRef = useRef({ x: 0, y: 0 });
  const centerRef = useRef({ x: 0, y: 0 });
  const pointerIdRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const armedRef = useRef(false);
  const armTimerRef = useRef<number | null>(null);
  const downPointRef = useRef({ x: 0, y: 0 });
  const totalRef = useRef({ x: 0, y: 0, z: 0 });
  const startedAtRef = useRef(0);
  const gestureOpRef = useRef<JoystickOperation>('move');
  const frameRef = useRef<number | null>(null);
  const metaRef = useRef<JoystickEventMeta>(syntheticMeta());
  const keysRef = useRef<Set<string>>(new Set());
  const keyGestureRef = useRef(false);

  const cleanup = useMemo(() => ({ fns: [] as Array<() => void> }), []);

  // ── derived config ────────────────────────────────────────────────────────
  const radiusOf = useCallback(() => {
    const o = optsRef.current;
    return o.radius ?? travelRadius(o.size ?? DEFAULT_SIZE);
  }, []);

  const accelOf = useCallback(
    () => ({
      deadzone: optsRef.current.deadzone ?? DEFAULT_DEADZONE,
      accelExponent: optsRef.current.accelExponent ?? DEFAULT_ACCEL_EXPONENT,
      maxSpeedMultiplier: optsRef.current.maxSpeedMultiplier ?? DEFAULT_MAX_SPEED_MULTIPLIER,
    }),
    [],
  );

  const shapeOf = useCallback(
    () => ({
      operation: optsRef.current.operation ?? ('move' as JoystickOperation),
      axes: optsRef.current.axes ?? DEFAULT_AXES,
      zMode: optsRef.current.zMode ?? false,
      rotateSnapDeg: optsRef.current.rotateSnapDeg ?? DEFAULT_ROTATE_SNAP_DEG,
    }),
    [],
  );

  // ── gesture lifecycle ─────────────────────────────────────────────────────
  const beginGesture = useCallback((meta: JoystickEventMeta) => {
    totalRef.current = { x: 0, y: 0, z: 0 };
    startedAtRef.current = meta.timeStamp;
    gestureOpRef.current = optsRef.current.operation ?? 'move';
    metaRef.current = meta;
    optsRef.current.onStart?.(meta);
  }, []);

  const finishGesture = useCallback((cancelled: boolean, meta: JoystickEventMeta) => {
    const total = cancelled ? { x: 0, y: 0, z: 0 } : { ...totalRef.current };
    const summary: JoystickGestureSummary = {
      total,
      operation: gestureOpRef.current,
      durationMs: Math.max(0, meta.timeStamp - startedAtRef.current),
      dominantAxis: dominantAxisOf(total),
      cancelled,
    };
    totalRef.current = { x: 0, y: 0, z: 0 };
    optsRef.current.onEnd?.(summary, meta);
  }, []);

  const emit = useCallback((delta: JoystickDelta, meta: JoystickEventMeta) => {
    totalRef.current.x += delta.x;
    totalRef.current.y += delta.y;
    totalRef.current.z += delta.z;
    optsRef.current.onChange?.(delta, meta);
  }, []);

  // ── the rAF pump ──────────────────────────────────────────────────────────
  const stopLoop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const startLoop = useCallback(() => {
    if (frameRef.current !== null) return;
    const tick = () => {
      frameRef.current = requestAnimationFrame(tick);
      if (!draggingRef.current || !armedRef.current) return;
      const raw = rawRef.current;
      if (raw.x === 0 && raw.y === 0) return;
      const delta = computeDelta({
        rawX: raw.x,
        rawY: raw.y,
        radius: radiusOf(),
        accel: accelOf(),
        ...shapeOf(),
      });
      if (delta) emit(delta, metaRef.current);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [accelOf, emit, radiusOf, shapeOf]);

  // ── pointer ───────────────────────────────────────────────────────────────
  const clearArmTimer = useCallback(() => {
    if (armTimerRef.current !== null) {
      clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
  }, []);

  const setThumb = useCallback(
    (raw: { x: number; y: number }) => {
      const radius = radiusOf();
      const clamped = clampToRing(raw.x, raw.y, radius);
      setState({
        dragging: true,
        x: clamped.x,
        y: clamped.y,
        magnitude: Math.min(1, Math.hypot(raw.x, raw.y) / radius),
      });
    },
    [radiusOf],
  );

  const endPointer = useCallback(
    (cancelled: boolean, meta: JoystickEventMeta) => {
      if (!draggingRef.current) return;
      const wasTap = !armedRef.current;
      const raw = rawRef.current;

      draggingRef.current = false;
      armedRef.current = false;
      clearArmTimer();
      stopLoop();

      const el = elRef.current;
      const id = pointerIdRef.current;
      if (el && id !== null && el.hasPointerCapture?.(id)) {
        try {
          el.releasePointerCapture(id);
        } catch {
          /* the browser already dropped it */
        }
      }
      pointerIdRef.current = null;
      rawRef.current = { x: 0, y: 0 };
      setState(IDLE_STATE);

      if (wasTap && !cancelled && optsRef.current.onAxisTap) {
        const shape = shapeOf();
        const hit = resolveTap({
          rawX: raw.x,
          rawY: raw.y,
          radius: radiusOf(),
          axes: shape.axes,
          zMode: shape.zMode,
          deadzone: accelOf().deadzone,
        });
        if (hit) optsRef.current.onAxisTap(hit.axis, hit.direction);
      }

      finishGesture(cancelled, meta);
    },
    [accelOf, clearArmTimer, finishGesture, radiusOf, shapeOf, stopLoop],
  );

  // ── keyboard ──────────────────────────────────────────────────────────────
  const endKeyGesture = useCallback(
    (cancelled: boolean, meta: JoystickEventMeta) => {
      if (!keyGestureRef.current) return;
      keyGestureRef.current = false;
      keysRef.current.clear();
      finishGesture(cancelled, meta);
    },
    [finishGesture],
  );

  // ── wiring ────────────────────────────────────────────────────────────────
  const bind = useCallback(
    (el: HTMLElement | null) => {
      if (elRef.current === el) return;

      // Tear down whatever was attached to the previous element.
      cleanup.fns.forEach((fn) => fn());
      cleanup.fns = [];
      if (draggingRef.current) endPointer(true, syntheticMeta());
      elRef.current = el;
      if (!el) return;

      const on = <K extends keyof HTMLElementEventMap>(
        target: HTMLElement | Window,
        type: K | string,
        handler: (e: never) => void,
        opts?: AddEventListenerOptions,
      ) => {
        target.addEventListener(type as string, handler as EventListener, opts);
        cleanup.fns.push(() => target.removeEventListener(type as string, handler as EventListener, opts));
      };

      const onPointerDown = (e: PointerEvent) => {
        if (optsRef.current.disabled) return;
        if (draggingRef.current) return;
        if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;

        // Stops text selection, page scroll, and the iOS long-press callout.
        e.preventDefault();

        const rect = el.getBoundingClientRect();
        centerRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        rawRef.current = { x: e.clientX - centerRef.current.x, y: e.clientY - centerRef.current.y };
        downPointRef.current = { x: e.clientX, y: e.clientY };
        pointerIdRef.current = e.pointerId;
        draggingRef.current = true;

        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* capture is a nicety, the drag still works without it */
        }
        // So Escape reaches us even if the consumer never focused the stick.
        if (typeof el.focus === 'function' && el.tabIndex >= 0) el.focus({ preventScroll: true });

        // A stationary press is a tap until proven otherwise — but only when
        // someone is actually listening for taps.
        const wantsTaps = !!optsRef.current.onAxisTap;
        armedRef.current = !wantsTaps;
        clearArmTimer();
        if (wantsTaps) {
          armTimerRef.current = window.setTimeout(() => {
            armedRef.current = true;
            armTimerRef.current = null;
          }, optsRef.current.tapMaxMs ?? 250);
        }

        setThumb(rawRef.current);
        beginGesture(metaOf(e));
        startLoop();
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!draggingRef.current || e.pointerId !== pointerIdRef.current) return;
        e.preventDefault();
        rawRef.current = { x: e.clientX - centerRef.current.x, y: e.clientY - centerRef.current.y };
        metaRef.current = metaOf(e);
        if (!armedRef.current) {
          const moved = Math.hypot(e.clientX - downPointRef.current.x, e.clientY - downPointRef.current.y);
          if (moved > TAP_SLOP_PX) {
            armedRef.current = true;
            clearArmTimer();
          }
        }
        setThumb(rawRef.current);
      };

      const onPointerUp = (e: PointerEvent) => {
        if (e.pointerId !== pointerIdRef.current) return;
        e.preventDefault();
        endPointer(false, metaOf(e));
      };

      // A gesture stolen by system UI must still close out, or the consumer
      // sits mid-drag forever.
      const onPointerCancel = (e: PointerEvent) => {
        if (e.pointerId !== pointerIdRef.current) return;
        endPointer(false, metaOf(e));
      };

      const onLostCapture = (e: PointerEvent) => {
        if (e.pointerId !== pointerIdRef.current) return;
        if (draggingRef.current) endPointer(false, metaOf(e));
      };

      const onEnter = () => {
        if (optsRef.current.disabled) return;
        optsRef.current.onHover?.(true);
      };
      const onLeave = () => optsRef.current.onHover?.(false);

      // Belt and braces for browsers that are lazy about `touch-action: none`.
      const onTouchMove = (e: TouchEvent) => {
        if (draggingRef.current) e.preventDefault();
      };
      const onContextMenu = (e: Event) => {
        if (draggingRef.current) e.preventDefault();
      };

      const onKeyDown = (e: KeyboardEvent) => {
        if (optsRef.current.disabled) return;

        if (e.key === 'Escape') {
          if (draggingRef.current) {
            e.preventDefault();
            endPointer(true, metaOfKey(e));
          } else if (keyGestureRef.current) {
            e.preventDefault();
            endKeyGesture(true, metaOfKey(e));
          }
          return;
        }

        const vec = ARROW_VECTORS[e.key];
        if (!vec) return;
        e.preventDefault();
        if (draggingRef.current) return; // a pointer drag owns the stick

        const meta = metaOfKey(e);
        if (!keyGestureRef.current) {
          keyGestureRef.current = true;
          beginGesture(meta);
        }
        keysRef.current.add(e.key);

        const o = optsRef.current;
        const step = (o.keyStep ?? 1) * (e.shiftKey ? (o.keyStepMultiplier ?? 10) : 1);
        emit(computeStep({ dirX: vec.x, dirY: vec.y, step, ...shapeOf() }), meta);
      };

      const onKeyUp = (e: KeyboardEvent) => {
        if (!keysRef.current.delete(e.key)) return;
        if (keysRef.current.size === 0) endKeyGesture(false, metaOfKey(e));
      };

      const onBlur = () => {
        if (keyGestureRef.current) endKeyGesture(false, syntheticMeta());
      };

      on(el, 'pointerdown', onPointerDown, { passive: false });
      on(el, 'pointermove', onPointerMove, { passive: false });
      on(el, 'pointerup', onPointerUp, { passive: false });
      on(el, 'pointercancel', onPointerCancel);
      on(el, 'lostpointercapture', onLostCapture);
      on(el, 'pointerenter', onEnter);
      on(el, 'pointerleave', onLeave);
      on(el, 'touchmove', onTouchMove, { passive: false });
      on(el, 'contextmenu', onContextMenu);
      on(el, 'keydown', onKeyDown);
      on(el, 'keyup', onKeyUp);
      on(el, 'blur', onBlur);
    },
    [beginGesture, clearArmTimer, cleanup, emit, endKeyGesture, endPointer, setThumb, shapeOf, startLoop],
  );

  // Escape has to work even when focus is elsewhere — a drag can begin without
  // the element ever taking focus.
  useEffect(() => {
    if (!state.dragging) return;
    const onWindowKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && draggingRef.current) {
        e.preventDefault();
        endPointer(true, metaOfKey(e));
      }
    };
    window.addEventListener('keydown', onWindowKey);
    return () => window.removeEventListener('keydown', onWindowKey);
  }, [state.dragging, endPointer]);

  // Unmounting mid-drag still closes the gesture out.
  useEffect(
    () => () => {
      stopLoop();
      clearArmTimer();
      cleanup.fns.forEach((fn) => fn());
      cleanup.fns = [];
      if (draggingRef.current) {
        draggingRef.current = false;
        finishGesture(true, syntheticMeta());
      }
    },
    [cleanup, clearArmTimer, finishGesture, stopLoop],
  );

  // A stick that goes disabled mid-drag must not leave the gesture open.
  const disabled = options.disabled ?? false;
  useEffect(() => {
    if (disabled && draggingRef.current) endPointer(true, syntheticMeta());
  }, [disabled, endPointer]);

  return { bind, state };
}

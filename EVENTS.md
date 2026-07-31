# Event reference

Every emitter the package has, in one place. All of them are optional, and all
of them are available on both `<Joystick>` and the `useJoystick` hook.

There are five: `onStart`, `onChange`, `onEnd`, `onHover`, `onAxisTap` —
plus two UI callbacks on the component, `onOperationChange` and `onZModeChange`.

---

## The gesture contract

Every gesture — pointer or keyboard, completed or cancelled — is exactly:

```
onStart  ×1
onChange ×0..n
onEnd    ×1
```

`onEnd` **always** fires if `onStart` did. Release, `pointercancel`,
`lostpointercapture`, `Escape`, the component going `disabled`, or unmounting
mid-drag — every one of them closes the gesture out. There is no path that
leaves a consumer mid-drag.

There is never more than one gesture at a time. A second finger landing while
the first is dragging is ignored, and its `pointerup` does not end the first
one's gesture.

---

## 1. `onStart`

```ts
onStart?: (e: JoystickEventMeta) => void;
```

A gesture began: the pointer went down on the stick, or an arrow key was
pressed. It fires **before** any movement — including for a tap that turns out
to emit no movement at all.

Use it to snapshot state for undo, or to suppress an expensive render while the
user is dragging.

---

## 2. `onChange`

```ts
onChange?: (delta: JoystickDelta, e: JoystickEventMeta) => void;
```

One frame of movement. Driven by `requestAnimationFrame` while the pointer is
held down, so it fires at display rate (typically 60/s, 120/s on a fast screen)
**for as long as the stick is deflected — even if the pointer is not moving.**
That is the point: a held stick keeps producing movement, like a real one.

```ts
type JoystickDelta = {
  x: number;          // continuous, per-frame; units are yours
  y: number;
  z: number;
  operation: JoystickOperation;
  magnitude: number;  // 0–1 deflection, BEFORE the acceleration curve
  angle?: number;     // radians; `rotate` only, already snapped
};
```

- **`x` / `y` / `z`** are the emitted vector. `1.0` on an axis means one
  ring-radius of deflection per frame; multiply by whatever your app calls a
  unit. Screen-up is `+y`, screen-right is `+x`.
- **`magnitude`** is not the length of that vector. It is the raw deflection
  before the curve, clamped to `0–1` — for meters, haptics and opacity.
- **`angle`** is present only for `rotate`.
- It is **not** called inside the deadzone, and it is **not** called with a
  zeroed delta when the gesture ends. `onEnd` is the end signal.

```tsx
<Joystick
  onChange={(d) => {
    setShelf((s) => ({ x: s.x + d.x * mmPerFrame, y: s.y + d.y * mmPerFrame, z: s.z + d.z * mmPerFrame }));
  }}
/>
```

> **Do not `setState` per axis.** At 120fps a three-setter handler is three
> renders a frame. Accumulate into one object, or into a ref, and let `onEnd`
> do the expensive work.

---

## 3. `onEnd`

```ts
onEnd?: (summary: JoystickGestureSummary, e: JoystickEventMeta) => void;
```

The gesture is over. This is the natural place to push **one** undo entry.

```ts
type JoystickGestureSummary = {
  total: { x: number; y: number; z: number }; // sum of every delta
  operation: JoystickOperation;
  durationMs: number;
  dominantAxis: Axis | null;                  // the axis that moved most
  cancelled: boolean;                         // true only for Escape
};
```

`dominantAxis` is sign-blind: 40 right then 38 left still reports `x`. It is
`null` when the gesture moved nothing — a tap, a cancel, or a press inside the
deadzone. The original used it to decide which properties field to focus once a
drag finished.

### What fires it, and with what

| Cause | `total` | `cancelled` |
| --- | --- | --- |
| `pointerup` | the accumulated movement | `false` |
| **`pointercancel`** | the accumulated movement | `false` |
| `lostpointercapture` | the accumulated movement | `false` |
| `Escape` | zeroed | `true` |
| `disabled` flipped on mid-drag | zeroed | `true` |
| unmounted mid-drag | zeroed | `true` |
| last arrow key released | the accumulated steps | `false` |
| blur during a key gesture | the accumulated steps | `false` |

> **`pointercancel` is a real end, not a cancel.** The system took the pointer
> away — a notification, an incoming call, an edge swipe, a palm rejection —
> but the movement up to that instant genuinely happened and is already on
> screen. Rolling it back would be a surprise. `Escape` is the user asking for
> a rollback, and that is the only thing that sets `cancelled`.

```tsx
<Joystick
  onEnd={(s) => {
    if (s.cancelled) return revertPreview();
    if (s.dominantAxis) undoStack.push({ label: `Move ${s.dominantAxis}`, delta: s.total });
  }}
/>
```

---

## 4. `onHover`

```ts
onHover?: (hovering: boolean) => void;
```

`true` on `pointerenter`, `false` on `pointerleave`. Not fired while disabled
(entering a disabled stick reports nothing; leaving still reports `false`).

Touch fires it too, immediately before the drag begins — pointer events do not
distinguish hover from contact on a touchscreen. If you use it to show a hint
panel, hide the panel on `onStart`.

---

## 5. `onAxisTap`

```ts
onAxisTap?: (axis: Axis, direction: 1 | -1) => void;
```

A **tap**: pointer down and up within 4px and `tapMaxMs` (250 by default). The
axis and direction come from where on the dish you tapped — tap the right side
for `('x', 1)`, the top for `('y', 1)`.

A tap still produces `onStart` and `onEnd`, with a zeroed total and a `null`
dominant axis, in that order:

```
onStart → onAxisTap → onEnd
```

No `onChange` fires. Providing this handler arms a 250ms window during which a
motionless press emits nothing, so a tap can never leak a frame or two of drift
first. Move more than 4px and the window closes immediately and it becomes a
normal drag.

**Not providing this handler removes that delay entirely** — a press-and-hold
starts emitting on the first frame. So only pass `onAxisTap` if you want taps.

A tap inside the deadzone reports nothing. In Z-mode a horizontal tap reports
nothing either, because Z-mode has no horizontal axis.

---

## 6. `onOperationChange` and `onZModeChange`

```ts
onOperationChange?: (op: JoystickOperation) => void;
onZModeChange?: (zMode: boolean) => void;
```

Fired when the user presses the mode chip or the **Z** button. Both controls
are uncontrolled by default — pass `operation` or `zMode` to take control, and
the component will stop updating its own state and defer to your prop.

`onOperationChange` cannot fire when only one operation is offered, because
there is no switcher to press.

---

## `JoystickEventMeta`

Every callback except `onHover` and `onAxisTap` receives the input context:

```ts
type JoystickEventMeta = {
  pointerType: 'mouse' | 'touch' | 'pen';
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  timeStamp: number;
  source?: 'pointer' | 'keyboard';
};
```

- **`source`** tells you which device drove the gesture. Keyboard gestures
  report `pointerType: 'mouse'` because `PointerEvent` has no keyboard value —
  read `source`, not `pointerType`, to tell them apart.
- **Modifiers** are read from the most recent input event. During a pointer
  drag that is the last `pointermove`, so pressing `Shift` mid-drag without
  moving will not be seen until the next move. Use them for "hold Shift to
  constrain", not for anything safety-critical.
- **`timeStamp`** is the event's own timestamp, on the same clock
  `performance.now()` uses. `onEnd`'s `durationMs` is derived from it.

```tsx
<Joystick
  onChange={(d, e) => {
    const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    nudge(d.x * step, d.y * step);
  }}
/>
```

---

## Keyboard gestures

The stick is focusable, and a burst of arrow presses is **one** gesture, so it
produces one undo entry rather than one per keypress:

| Key | Effect |
| --- | --- |
| `ArrowUp` / `Down` / `Left` / `Right` | `onChange` with a `keyStep` (default 1) |
| `Shift` + arrow | `keyStep × keyStepMultiplier` (default ×10) |
| release the last arrow | `onEnd`, total = the accumulated steps |
| blur mid-burst | `onEnd`, total = the accumulated steps |
| `Escape` | `onEnd`, total zeroed, `cancelled: true` |

Arrow keys call `preventDefault`, so a focused stick never scrolls the page
instead of stepping. Keyboard steps skip the acceleration curve — a discrete
control is discrete.

`Escape` is listened for on `window` while a pointer drag is live, so it works
even if the stick never took focus.

---

## Ordering guarantees

1. `onStart` precedes every `onChange` and the `onEnd` of the same gesture.
2. `onAxisTap` fires after the last `onChange` (of which there are none) and
   before `onEnd`.
3. `onEnd` is the last callback of a gesture. Nothing follows it until the next
   `onStart`.
4. Pointer capture is released before `onEnd` fires, so a handler is free to
   move focus or unmount the stick.
5. A gesture in progress when the component unmounts gets its `onEnd` during
   cleanup — your handler must tolerate running against an unmounted tree
   (write to a ref or a store, do not `setState` blindly).

# Formulas

Everything the joystick computes, and why it computes it that way. All of it is
exported and unit-tested — `import { speedFor } from '@jugaaadi/joystick'` and
check the numbers yourself.

---

## 1. Geometry

The stick is one circle with three radii derived from `size`:

| Quantity | Formula | At `size = 140` |
| --- | --- | --- |
| Base radius | `size / 2` | 70px |
| **Travel radius** (the ring) | `size × 0.29` | 40.6px |
| Thumb radius | `size × 0.19` | 26.6px |

`0.29` falls out of a constraint rather than taste: the thumb must never poke
out of the dish however far you drag, so

```
travel + thumbRadius ≤ baseRadius
0.29  + 0.19         ≤ 0.5           ✓ with 2% of base to spare
```

The CSS derives the ring's inset from `--jy-travel`, which the component writes
from `size`. That is why you should change `size` and not the two custom
properties — override them independently and the thumb and the ring stop
agreeing about where the edge is.

`travelRadius(size)` and `TRAVEL_RATIO` are exported if you need the same
number outside the component.

---

## 2. Distance, in ring units

A gesture's raw state is one vector: the pointer's offset from the centre of
the base, in px, in screen basis (`y` grows downward).

```
ux   =   rawX / travelRadius
uy   = -(rawY / travelRadius)      // flip, so screen-up reads as +y
dist = hypot(ux, uy)
```

`dist = 1.0` means the pointer sits exactly on the ring. **`dist` is never
clamped.** Drag three ring-radii out and `dist` is `3.0`. This single decision
is the whole feel of the control.

---

## 3. Deadzone

```
t = max(0, (dist - deadzone) / (1 - deadzone))
```

A plain threshold (`if (dist > deadzone)`) would work, but it makes the control
jump: the first frame outside the deadzone emits `deadzone^exponent` rather
than zero. Remapping makes the deadzone edge exactly zero, so movement starts
from nothing and grows.

Note the remap is applied to the numerator only — `t` is **not** clamped above
`1`, so `dist = 3` still gives `t ≈ 3.13`.

`deflection(dist, deadzone)` is exported.

---

## 4. The speed curve

```
speed = min(maxSpeedMultiplier, t ^ accelExponent)
```

Three properties, all of them load-bearing:

**It is a power curve, not a line.** A linear stick is either too coarse for a
2mm nudge or too slow for a 300mm move; you end up adding a "precision" modifier
key. `t^2.2` gives you both at once, because the derivative near zero is near
zero — the middle of the stick is fine control, and you only get speed by
reaching for the rim.

**It is fed by the unclamped distance.** Past the ring, `t > 1`, and the curve
is still climbing. Nothing snaps, nothing changes mode: you keep pulling and it
keeps getting faster.

**It is capped.** `maxSpeedMultiplier` stops a full-screen drag on a 4K monitor
from teleporting the thing you are moving. The cap bites at

```
dist = maxSpeed^(1/exponent) × (1 - deadzone) + deadzone
```

which for the defaults is `dist ≈ 2.18` — about 89px from centre at `size=140`,
comfortably inside a thumb's reach.

### The defaults, tabulated

| `dist` | `t` | `speed` |
| --- | --- | --- |
| 0.06 | 0.000 | 0.00 |
| 0.25 | 0.202 | 0.03 |
| 0.50 | 0.468 | 0.19 |
| 0.75 | 0.734 | 0.51 |
| 1.00 | 1.000 | 1.00 |
| 1.50 | 1.532 | 2.56 |
| 2.00 | 2.064 | 4.92 |
| 2.18 | 2.255 | 5.98 |
| 5.00 | 5.255 | 6.00 (capped) |

### Tuning

| Want | Change |
| --- | --- |
| Finer control near the centre | Raise `accelExponent` (3.0) |
| More linear, more predictable | Lower `accelExponent` (1.4) |
| A faster ceiling | Raise `maxSpeedMultiplier` |
| Less jitter from a shaky hand or a stylus | Raise `deadzone` (0.12) |
| No deadzone at all | `deadzone={0}` — `t` becomes `dist` |

`speedFor(dist, { deadzone, accelExponent, maxSpeedMultiplier })` is exported.

---

## 5. The emitted vector

Direction and speed are computed separately and multiplied back together, so
the curve never bends the direction:

```
dirX = ux / dist
dirY = uy / dist
vx   = dirX × speed
vy   = dirY × speed
```

A 45° drag stays a 45° drag at every distance.

`magnitude` on the delta is a **different** number on purpose: it is the raw
deflection *before* the curve, clamped to `0–1`. Use `x`/`y`/`z` to move
something and `magnitude` to drive a meter, a haptic, or an opacity.

---

## 6. Axis mapping

```
zMode        → { z: vy }                 // horizontal ignored
axes.length>1 → { [axes[0]]: vx, [axes[1]]: vy }
axes.length=1 → { [axes[0]]: vy }        // vertical drives it
```

The one-axis rule is a judgement call: a single-axis stick is nearly always a
magnitude (depth, elevation, radius) and up/down reads as more/less, so the
vertical drag is the useful one.

`mapVector(vx, vy, axes, zMode)` is exported.

---

## 7. Rotation snapping

For `operation: 'rotate'` with `rotateSnapDeg > 0`, the **direction of travel**
is snapped before the vector is built:

```
step  = rotateSnapDeg × π / 180
angle = round(atan2(uy, ux) / step) × step
vx    = cos(angle) × speed
vy    = sin(angle) × speed
```

So the emitted vector points along a clean 15° increment even though your hand
is at 14.7°, and `delta.angle` reports that snapped angle in radians. With
`rotateSnapDeg={0}` nothing is snapped and `delta.angle` is the raw direction.

The thumb is deliberately **not** snapped — it keeps following your finger, so
the control never feels like it is fighting you. The number that leaves the
component is the snapped one.

`delta.angle` is present only for `rotate`; every other operation omits it.

`snapRadians(rad, snapDeg)` and `normalizeAngle(rad)` are exported. Angles come
back normalised to `(-π, π]`.

---

## 8. The thumb clamp

```
if (dist > travelRadius) thumb = (raw / dist) × travelRadius
else                     thumb = raw
```

Pure presentation. The clamped value is what `useJoystick().state.x/y` reports,
because that is what you want for rendering; the *unclamped* value never leaves
the hook, it only feeds the curve.

`clampToRing(rawX, rawY, radius)` is exported.

---

## 9. Keyboard steps

Arrow keys skip the curve entirely — a discrete control should be discrete:

```
step  = keyStep × (shiftKey ? keyStepMultiplier : 1)     // default 1, ×10
delta = mapVector(dirX × step, dirY × step, axes, zMode)
```

Rotation snapping still applies, so `Shift+ArrowRight` in rotate mode reports a
snapped `angle`.

`computeStep({...})` is exported.

---

## 10. Gesture summary

Every frame's delta is accumulated into a running total; on release the total is
reported with the axis that moved most:

```
dominantAxis = argmax(|total.x|, |total.y|, |total.z|)   // null if all ≈ 0
durationMs   = endEvent.timeStamp - startEvent.timeStamp
```

The comparison is sign-blind, so dragging 40 right then 38 left still reports
`x` — it is "which axis was this gesture about", not "which way did it end up".
The original used exactly this to decide which properties field to focus after
a drag.

An `Escape` cancel zeroes the total before the summary is built, so
`dominantAxis` comes back `null` and a consumer can tell a cancel from a
no-op by reading `cancelled`.

`dominantAxisOf(total)` is exported.

---

## 11. Tap resolution

A press that never moves more than 4px and is released within `tapMaxMs`
(default 250) is a tap, not a drag. No frames are emitted during that window —
the rAF pump stays disarmed until movement or the timeout arms it, so a tap can
never leak a few frames of movement first.

```
axis      = |ux| ≥ |uy| ? axes[0] : axes[1]
direction = (that component) ≥ 0 ? +1 : -1
```

A tap inside the deadzone resolves to nothing — a tap in the middle is a tap on
nothing. In Z-mode a horizontal tap also resolves to nothing, because Z-mode
has no horizontal axis.

The whole tap-detection path is skipped when no `onAxisTap` handler is
provided, so a press-and-hold starts emitting immediately for everyone else.

`resolveTap({...})` is exported.

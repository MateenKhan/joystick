import React, { useRef, useState } from 'react';
import { Joystick, useJoystick, speedFor, deflection } from '@jugaaadi/joystick';
import type { Axis, JoystickDelta, JoystickOperation } from '@jugaaadi/joystick';

/** Drag it and watch the accumulated position — the core pitch. */
export function BasicDemo() {
  const [pos, setPos] = useState({ x: 0, y: 0, z: 0 });
  const [dragging, setDragging] = useState(false);

  return (
    <div className="demo-split">
      <Joystick
        onStart={() => setDragging(true)}
        onEnd={() => setDragging(false)}
        onChange={(d: JoystickDelta) =>
          setPos((p) => ({
            x: p.x + (d.x ?? 0),
            y: p.y + (d.y ?? 0),
            z: p.z + (d.z ?? 0),
          }))
        }
      />
      <div className="demo-readout">
        x {pos.x.toFixed(1)}
        <br />
        y {pos.y.toFixed(1)}
        <br />
        z {pos.z.toFixed(1)}
        <br />
        <span style={{ opacity: 0.6 }}>{dragging ? 'dragging' : 'idle'}</span>
        <br />
        <button className="demo-reset" onClick={() => setPos({ x: 0, y: 0, z: 0 })}>
          reset
        </button>
      </div>
    </div>
  );
}

/** The operation switcher and Z toggle only appear when you ask for them. */
export function OperationsDemo() {
  const [op, setOp] = useState<JoystickOperation>('move');
  const [last, setLast] = useState<string>('—');

  return (
    <div className="demo-split">
      <Joystick
        operations={['move', 'rotate', 'scale', 'extrude', 'fillet']}
        operation={op}
        onOperationChange={setOp}
        onChange={(d) => setLast(`${d.operation}  x:${(d.x ?? 0).toFixed(2)} y:${(d.y ?? 0).toFixed(2)}`)}
        onAxisTap={(axis: Axis, dir) => setLast(`tap ${axis}${dir > 0 ? '+' : '-'}`)}
      />
      <div className="demo-readout">
        operation <b>{op}</b>
        <br />
        <span style={{ opacity: 0.75 }}>{last}</span>
      </div>
    </div>
  );
}

/** A single axis, no chrome — what a minimal embed looks like. */
export function MinimalDemo() {
  const [x, setX] = useState(0);

  return (
    <div className="demo-split">
      <Joystick
        axes={['x']}
        zToggle={false}
        collapsible={false}
        size={120}
        onChange={(d) => setX((v) => v + (d.x ?? 0))}
      />
      <div className="demo-readout">
        x {x.toFixed(1)}
        <br />
        <span style={{ opacity: 0.6 }}>one axis, no switcher, no Z</span>
      </div>
    </div>
  );
}

/** The headless hook driving a shell of your own. */
export function HeadlessDemo() {
  const [count, setCount] = useState(0);
  const { bind, state } = useJoystick({
    radius: 46,
    onChange: () => setCount((c) => c + 1),
  });

  return (
    <div className="demo-split">
      <div
        ref={bind}
        tabIndex={0}
        className="headless-pad"
        style={{ touchAction: 'none' }}
        aria-label="Custom joystick shell"
      >
        <div
          className="headless-thumb"
          style={{ transform: `translate(${state.x}px, ${state.y}px)` }}
        />
      </div>
      <div className="demo-readout">
        x {state.x.toFixed(0)} y {state.y.toFixed(0)}
        <br />
        magnitude {state.magnitude.toFixed(2)}
        <br />
        {state.dragging ? 'dragging' : 'idle'} · {count} frames
      </div>
    </div>
  );
}

/** The acceleration curve, plotted from the exported maths. */
export function CurveDemo() {
  const [exp, setExp] = useState(2.2);
  const [max, setMax] = useState(6);

  const pts = Array.from({ length: 61 }, (_, i) => {
    const t = i / 60;
    const s = speedFor(t, { exponent: exp, maxMultiplier: max, deadzone: 0.06 });
    return { t, s };
  });
  const top = Math.max(...pts.map((p) => p.s)) || 1;
  const d = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.t * 260).toFixed(1)},${(110 - (p.s / top) * 100).toFixed(1)}`)
    .join(' ');

  return (
    <div>
      <svg viewBox="0 0 270 120" width="100%" height="150" style={{ maxWidth: 420 }}>
        <line x1="0" y1="110" x2="265" y2="110" stroke="#334155" />
        <line x1="0" y1="10" x2="0" y2="110" stroke="#334155" />
        <path d={d} fill="none" stroke="#22d3ee" strokeWidth="2" />
      </svg>
      <div className="demo-sliders">
        <label>
          accelExponent <b>{exp.toFixed(1)}</b>
          <input type="range" min="1" max="4" step="0.1" value={exp}
            onChange={(e) => setExp(parseFloat(e.target.value))} />
        </label>
        <label>
          maxSpeedMultiplier <b>{max}</b>
          <input type="range" min="1" max="12" step="1" value={max}
            onChange={(e) => setMax(parseInt(e.target.value, 10))} />
        </label>
      </div>
      <div className="demo-hint">
        Deflection along the bottom, speed multiplier up the side. Plotted live from the exported{' '}
        <code>speedFor()</code> — the same function the stick uses.
      </div>
    </div>
  );
}

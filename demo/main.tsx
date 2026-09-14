/**
 * Demo page — the first consumer's job, in miniature: position a shelf inside
 * a cupboard by dragging while watching the result.
 *
 *   npm run dev   →  http://127.0.0.1:4195
 */

import { StrictMode, useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DimensionInput, Unit } from '@jugaaadi/advance-scroll-input';
import '@jugaaadi/advance-scroll-input/styles.css';
import { Joystick, useJoystick } from '../src/index';
import type { Axis, JoystickDelta, JoystickGestureSummary } from '../src/index';
import '../src/joystick.css';
import './demo.css';

type LogLine = { id: number; label: string; detail: string };

let logId = 0;

function App() {
  const [pos, setPos] = useState({ x: 0, y: 0, z: 0 });
  const [lines, setLines] = useState<LogLine[]>([]);
  const [accelExponent, setAccelExponent] = useState(2.2);
  const [maxSpeed, setMaxSpeed] = useState(6);
  const [deadzone, setDeadzone] = useState(0.06);
  const [snap, setSnap] = useState(15);
  const [showAll, setShowAll] = useState(false);
  /*
   * FIELDS MODE, added to the demo 2026-09-15. The demo rendered the wheel and
   * nothing else, so the switch had nothing to reveal and the feature read as
   * absent to anyone opening this page.
   *
   * The package owns the SLOT and the SWITCH, never the rows. A consumer hands
   * in one element per row as `fields`; the joystick puts them where the wheel
   * was, at the same size, and the switch throws between the two.
   *
   * The rows here are the REAL `@jugaaadi/advance-scroll-input` controls the
   * configurator hands in, not plain inputs, and that is the point: a scroll
   * input works by DRAGGING and so does the joystick's wheel. Two drag handlers
   * in one box is the only place this pairing can go wrong, and a demo built
   * from plain inputs would never show it.
   */
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const frames = useRef(0);

  const log = useCallback((label: string, detail: string) => {
    setLines((prev) => [{ id: logId++, label, detail }, ...prev].slice(0, 120));
  }, []);

  const onChange = useCallback((d: JoystickDelta) => {
    frames.current += 1;
    setPos((p) => ({
      x: Math.max(-140, Math.min(140, p.x + d.x * 4)),
      y: Math.max(-140, Math.min(140, p.y + d.y * 4)),
      z: p.z + d.z * 4,
    }));
  }, []);

  const onEnd = useCallback(
    (s: JoystickGestureSummary) => {
      log(
        s.cancelled ? 'onEnd (cancelled)' : 'onEnd',
        `dominant=${s.dominantAxis ?? 'null'} total=(${s.total.x.toFixed(1)}, ${s.total.y.toFixed(
          1,
        )}, ${s.total.z.toFixed(1)}) ${Math.round(s.durationMs)}ms · ${frames.current} frames`,
      );
      frames.current = 0;
    },
    [log],
  );

  // A second, headless stick to prove the hook stands on its own.
  const headless = useJoystick({
    size: 90,
    onChange: (d) => onChange(d),
    onStart: () => log('headless onStart', ''),
  });

  return (
    <div className="wrap">
      <h1>@jugaaadi/joystick</h1>
      <p className="sub">
        Drag past the ring — it keeps accelerating while the thumb stays inside. Arrow keys step,
        Shift for ×10, Escape cancels. The page below is deliberately tall: a touch drag on the
        stick must not scroll it.
      </p>

      <div className="cols">
        <div>
          <div className="card">
            <h2>Cupboard</h2>
            <div className="cupboard">
              <div
                className="shelf"
                style={{ transform: `translate(calc(-50% + ${pos.x}px), calc(-50% - ${pos.y}px)) scaleX(${1 + pos.z / 300})` }}
              />
            </div>
            <div className="readout">
              <div>
                <span>x</span> {pos.x.toFixed(1)}
              </div>
              <div>
                <span>y</span> {pos.y.toFixed(1)}
              </div>
              <div>
                <span>z</span> {pos.z.toFixed(1)}
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Headless (useJoystick, no chrome)</h2>
            <div
              ref={headless.bind}
              tabIndex={0}
              style={{
                width: 90,
                height: 90,
                borderRadius: '50%',
                border: '2px dashed #334155',
                touchAction: 'none',
                position: 'relative',
                cursor: 'grab',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: headless.state.dragging ? '#22d3ee' : '#475569',
                  transform: `translate(calc(-50% + ${headless.state.x}px), calc(-50% + ${headless.state.y}px))`,
                }}
              />
            </div>
            <p className="note">
              magnitude {headless.state.magnitude.toFixed(2)} · dragging{' '}
              {String(headless.state.dragging)}
            </p>
          </div>

          <div className="card tall">
            <h2>Scroll ballast</h2>
            <p className="note">
              This block exists so the page scrolls. Drag the joystick with a finger — the page must
              stay put.
            </p>
          </div>
        </div>

        <div>
          <div className="card">
            <h2>Knobs</h2>
            <div className="knobs">
              <label>
                accelExponent
                <input
                  type="range"
                  min="1"
                  max="4"
                  step="0.1"
                  value={accelExponent}
                  onChange={(e) => setAccelExponent(Number(e.target.value))}
                />
                <output>{accelExponent.toFixed(1)}</output>
              </label>
              <label>
                maxSpeedMultiplier
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={maxSpeed}
                  onChange={(e) => setMaxSpeed(Number(e.target.value))}
                />
                <output>{maxSpeed}</output>
              </label>
              <label>
                deadzone
                <input
                  type="range"
                  min="0"
                  max="0.5"
                  step="0.01"
                  value={deadzone}
                  onChange={(e) => setDeadzone(Number(e.target.value))}
                />
                <output>{deadzone.toFixed(2)}</output>
              </label>
              <label>
                rotateSnapDeg
                <input
                  type="range"
                  min="0"
                  max="90"
                  step="5"
                  value={snap}
                  onChange={(e) => setSnap(Number(e.target.value))}
                />
                <output>{snap}</output>
              </label>
              <label>
                all operations
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(e) => setShowAll(e.target.checked)}
                />
              </label>
            </div>
          </div>

          <div className="card">
            <h2>Events</h2>
            <div className="log">
              {lines.map((l) => (
                <div key={l.id}>
                  <b>{l.label}</b> <i>{l.detail}</i>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="dock">
        <Joystick
          label="Shelf"
          fieldsOpen={fieldsOpen}
          onFieldsOpenChange={setFieldsOpen}
          fields={(['x', 'y', 'z'] as const).map((axis) => (
            <label key={axis} className="jyDemoField">
              <span>{axis.toUpperCase()}</span>
              <DimensionInput
                data-testid={`demo-field-${axis}`}
                aria-label={`${axis.toUpperCase()} in millimetres`}
                valueMm={pos[axis]}
                unit={Unit.MM}
                step={1}
                allowNegative
                displayDecimals={0}
                onChangeMm={(next: number) => {
                  setPos((p) => ({ ...p, [axis]: next }));
                  log('field', `${axis} = ${Math.round(next)}`);
                }}
              />
            </label>
          ))}
          operations={showAll ? ['move', 'rotate', 'scale', 'extrude', 'fillet'] : undefined}
          accelExponent={accelExponent}
          maxSpeedMultiplier={maxSpeed}
          deadzone={deadzone}
          rotateSnapDeg={snap}
          onStart={(e) => log('onStart', `${e.pointerType} · ${e.source}`)}
          onChange={onChange}
          onEnd={onEnd}
          onAxisTap={(axis: Axis, dir) => log('onAxisTap', `${axis} ${dir > 0 ? '+' : '-'}`)}
          onOperationChange={(op) => log('onOperationChange', op)}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

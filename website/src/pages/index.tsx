import React from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { BasicDemo } from '@site/src/components/Demo/examples';

const NPM = 'https://www.npmjs.com/package/@jugaaadi/joystick';
const GITHUB = 'https://github.com/MateenKhan/joystick';

const FEATURES: Array<[string, string]> = [
  ['One control, every scale', 'Drag past the ring and it keeps accelerating. A 2 mm nudge and a 300 mm shove, no modifier key and no mode switch.'],
  ['The maths is exported', 'speedFor, deflection, computeDelta and the rest are pure, unit-tested and importable. Check the numbers yourself, or drive a dial with them.'],
  ['Touch-first', 'Pointer capture, touch-action none, pointercancel handled. A drag survives your finger leaving the stick; a system gesture releases it cleanly.'],
  ['Nothing renders until asked', 'Default is one operation and no switcher. A furniture app has no use for extrude, and a dead mode is worse than a hidden one.'],
  ['Headless option', 'useJoystick gives every behaviour with none of the pixels — pointer capture, tap-vs-drag, keyboard, the ring clamp.'],
  ['Zero dependencies', 'No runtime deps. React 17+. One CSS file you can override or ignore.'],
];

export default function Home() {
  return (
    <Layout
      title="A joystick that does fine and fast"
      description="A dark, touch-first analogue joystick for React. Drag past the ring and it keeps accelerating — precise near the centre, fast at the edge."
    >
      <header className="hero-banner">
        <h1 style={{ fontSize: 'clamp(1.9rem, 5vw, 3rem)', marginBottom: '0.5rem' }}>joystick</h1>
        <p style={{ fontSize: '1.05rem', color: '#94a3b8', maxWidth: 620, margin: '0 auto' }}>
          A dark, touch-first analogue joystick for React. Precise near the centre, fast at the
          edge — without a modifier key.
        </p>

        {/* The real component, not a screenshot. Drag it. */}
        <div className="hero-demo demo-card">
          <div className="demo-stage">
            <BrowserOnly fallback={<div style={{ height: 200 }} />}>
              {() => <BasicDemo />}
            </BrowserOnly>
            <div className="demo-hint">
              Nudge it gently, then push past the ring and hold.
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'center',
            marginTop: '2rem',
            flexWrap: 'wrap',
          }}
        >
          <Link className="button button--primary button--lg" to="/docs/intro">
            Get started
          </Link>
          <Link className="button button--secondary button--lg" href={GITHUB}>
            GitHub
          </Link>
          <Link className="button button--secondary button--lg" href={NPM}>
            npm
          </Link>
        </div>

        <p style={{ marginTop: '1.5rem', color: '#64748b', fontSize: '0.85rem' }}>
          <code>npm install @jugaaadi/joystick</code>
        </p>
      </header>

      <main className="container margin-vert--xl">
        <div className="row">
          {FEATURES.map(([title, body]) => (
            <div className="col col--4 margin-bottom--lg" key={title}>
              <h3>{title}</h3>
              <p style={{ color: 'var(--ifm-color-emphasis-700)' }}>{body}</p>
            </div>
          ))}
        </div>

        <hr />

        <div className="margin-top--lg">
          <h2>If it drives real hardware, put limits between</h2>
          <p style={{ maxWidth: 720 }}>
            This emits a direction and a speed. It has no idea whether that becomes a preview on a
            canvas or a machine axis moving. If something physical is on the other end — a spindle,
            a robot, a camera rig — the limits, interlocks and validation are yours to add.
          </p>
          <p style={{ color: 'var(--ifm-color-emphasis-700)', fontSize: '0.9rem' }}>
            Provided as is, without warranty. It is a UI input, not a safety system.
          </p>
        </div>
      </main>
    </Layout>
  );
}

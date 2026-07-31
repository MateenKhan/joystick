import React, { useState } from 'react';
import CodeBlock from '@theme/CodeBlock';
import BrowserOnly from '@docusaurus/BrowserOnly';

export interface DemoProps {
  children: React.ReactNode;
  /** Snippet shown under "Code". */
  code: string;
  /** Optional complete file, shown under "Full code". */
  fullCode?: string;
  hint?: React.ReactNode;
}

type Tab = 'preview' | 'code' | 'full';

/**
 * Preview / Code / Full code tabs.
 *
 * The demo renders the *real* component inline rather than in an iframe or a
 * sandbox: pointer capture, `touch-action` and the drag physics all degrade
 * inside one, and those are the whole point of a joystick.
 */
export default function Demo({ children, code, fullCode, hint }: DemoProps) {
  const [tab, setTab] = useState<Tab>('preview');

  const tabs: Array<[Tab, string]> = [
    ['preview', 'Preview'],
    ['code', 'Code'],
    ...(fullCode ? ([['full', 'Full code']] as Array<[Tab, string]>) : []),
  ];

  return (
    <div className="demo-card">
      <div className="demo-toolbar">
        <div className="demo-tabs" role="tablist">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              className="demo-tab"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'preview' && (
        <div className="demo-stage">
          {/* Touches window/pointer APIs, so keep it off the server render. */}
          <BrowserOnly fallback={<div style={{ height: 200 }} />}>
            {() => <>{children}</>}
          </BrowserOnly>
          {hint && <div className="demo-hint">{hint}</div>}
        </div>
      )}

      {tab === 'code' && <CodeBlock language="tsx">{code.trim()}</CodeBlock>}
      {tab === 'full' && fullCode && <CodeBlock language="tsx">{fullCode.trim()}</CodeBlock>}
    </div>
  );
}

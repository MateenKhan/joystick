/**
 * DECLARATIVE ROWS — the package builds them, instead of the consumer.
 *
 * `fields` (in `Joystick.tsx`) already lets a consumer hand in its own
 * ReactNode, one element per row, and that stays exactly as it was. This adds
 * a SECOND, optional way in: a list of row DESCRIPTIONS — a value in mm, a
 * unit, a step, bounds, a name — that this package turns into rows itself,
 * using `@jugaaadi/advance-scroll-input`'s `DimensionInput`.
 *
 * Why this exists at all: the interior configurator already has a full
 * hand-built copy of "one `DimensionInput` per row, stacked, inside the
 * fields slot" — see `demo/main.tsx`'s own copy of the same shape — and its
 * owner does not want to keep maintaining that copy just to keep it in step
 * with the joystick every time either changes. His words: "i dont want to
 * update interior project to change scrollable input, so as per requirements
 * in interior project change component here." So the ROWS move into the
 * package that already owns the SLOT and the SWITCH; the configurator can
 * describe what it wants instead of building it.
 *
 * `@jugaaadi/advance-scroll-input` is a PEER dependency, not bundled (see
 * `tsup.config.ts`'s `external`) — deliberately, on the owner's own
 * reasoning: the configurator already renders that input for every number in
 * its side menu, and bundling a second copy into the joystick would put two
 * copies of the same library on one page, with the two never guaranteed to
 * agree. A peer guarantees ONE copy, chosen by the app, and it also means a
 * consumer that wants only the wheel never pays to load an input library it
 * never renders — this module reaches for it with a runtime `import()`, and
 * ONLY when `fieldRows` is actually used.
 *
 * A missing peer must fail KINDLY: no build ever throws mid-render over a
 * package a consumer chose not to install. `loadScrollInput` never rejects
 * past this module's own boundary; it resolves to `{ ok: false, message }`
 * that `FieldRows` renders as plain text naming the package and the install
 * command, in place of the rows.
 */

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
/*
 * TYPE-ONLY. Erased by the compiler, so this line costs nothing at runtime —
 * the peer is still loaded exclusively through the `import()` below, and only
 * when a consumer actually passes `fieldRows`. See the file header.
 */
import type { Unit as ScrollInputUnit } from '@jugaaadi/advance-scroll-input';

/** The two exports this file actually needs from the peer. */
type ScrollInputModule = Pick<typeof import('@jugaaadi/advance-scroll-input'), 'DimensionInput' | 'Unit'>;

const INSTALL_HINT =
  '`fieldRows` needs "@jugaaadi/advance-scroll-input" as a peer dependency. ' +
  'Install it — `npm install @jugaaadi/advance-scroll-input` — and import its ' +
  'stylesheet once: `import \'@jugaaadi/advance-scroll-input/styles.css\'`.';

type LoadResult = { ok: true; mod: ScrollInputModule } | { ok: false; message: string };

/*
 * Cached at module scope, the same reason `DEFAULT_OPERATIONS` in
 * `Joystick.tsx` is module scope: every `FieldRows` instance shares one
 * attempt rather than one import per mount, and a resolved module is never
 * fetched twice.
 */
let cached: LoadResult | null = null;
let pending: Promise<LoadResult> | null = null;

function loadScrollInput(): Promise<LoadResult> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = import('@jugaaadi/advance-scroll-input')
      .then((mod): LoadResult => {
        const result: LoadResult = { ok: true, mod };
        cached = result;
        return result;
      })
      .catch((): LoadResult => {
        const result: LoadResult = { ok: false, message: INSTALL_HINT };
        cached = result;
        return result;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/**
 * One row of the declarative form. Every field the peer's `DimensionInput`
 * needs to behave like a real dimension control, and nothing it does not:
 * a value in millimetres, a unit, a step per detent, optional bounds, an
 * accessible name, and a test id.
 */
export type JoystickFieldRow = {
  /** Row identity: the React key, and the suffix of `data-testid="jy-row-<id>"` / `"jy-row-<id>-input"`. */
  id: string;
  /** Visible row caption, and its `aria-label` unless `ariaLabel` overrides it. */
  label: string;
  /** Overrides the row's accessible name. The visible `label` is unaffected. */
  ariaLabel?: string;
  /** Current value, in millimetres. */
  valueMm: number;
  /** Fires with the new value, in millimetres, when a scrub, step or typed entry commits. */
  onChangeMm: (mm: number) => void;
  /** Display/parse unit. Default `Unit.MM`, imported from `@jugaaadi/advance-scroll-input` itself — the peer, not this package. */
  unit?: ScrollInputUnit;
  /** One detent / one arrow tap / one arrow key, in mm. Default `1`. */
  step?: number;
  /** Lower bound, in mm. A negative `min` is ignored unless `allowNegative` — the underlying input's own rule. */
  min?: number;
  /** Upper bound, in mm. */
  max?: number;
  /** Permit values below zero. Default `false`, same as the underlying input. */
  allowNegative?: boolean;
  /**
   * Fires with `(clamped, requested, bound)` when a typed, scrubbed or
   * stepped value is refused. A clamp must SAY it was refused rather than
   * silently stopping — this is that voice, forwarded as-is from the
   * underlying input's own `onClamp`.
   */
  onClamp?: (clamped: number, requested: number, bound: 'min' | 'max') => void;
  disabled?: boolean;
};

type FieldRowsProps = {
  rows: JoystickFieldRow[];
  disabled?: boolean;
};

/**
 * Renders `rows` into the SAME `.jy-fields` column the `fields` ReactNode
 * already renders into (see `Joystick.tsx`) — one full row per entry, on the
 * pad's own dark plate, which is `.jy-fields`'s existing CSS and is not
 * repeated here.
 */
export function FieldRows({ rows, disabled }: FieldRowsProps): ReactElement {
  const [result, setResult] = useState<LoadResult | null>(cached);

  useEffect(() => {
    if (result) return;
    let cancelled = false;
    loadScrollInput().then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [result]);

  if (result && !result.ok) {
    return (
      <div className="jy-field-rows-error" role="alert" data-testid="jy-field-rows-error">
        {result.message}
      </div>
    );
  }

  if (!result) {
    // Still loading the peer — nothing to show yet, rather than a half-built
    // row. `hasFields` already gated the switch on there being something to
    // reveal; this is the brief window between "asked for" and "arrived".
    return <div className="jy-field-rows-loading" aria-hidden="true" />;
  }

  const { DimensionInput, Unit } = result.mod;

  return (
    <>
      {rows.map((row) => (
        <label key={row.id} className="jy-field-row" data-testid={`jy-row-${row.id}`}>
          <span className="jy-field-row-label">{row.label}</span>
          <DimensionInput
            data-testid={`jy-row-${row.id}-input`}
            aria-label={row.ariaLabel ?? row.label}
            valueMm={row.valueMm}
            onChangeMm={row.onChangeMm}
            unit={row.unit ?? Unit.MM}
            step={row.step ?? 1}
            min={row.min}
            max={row.max}
            allowNegative={row.allowNegative ?? false}
            onClamp={row.onClamp}
            disabled={disabled || row.disabled}
          />
        </label>
      ))}
    </>
  );
}

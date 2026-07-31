/**
 * Inline SVG icons.
 *
 * The original pulled these from `lucide-react`. A UI package that drags a
 * whole icon library in behind it is a bad neighbour, so these are hand-drawn
 * on the same 24×24 grid with the same 2px stroke — familiar shapes, zero
 * dependencies.
 */

import type { ReactElement } from 'react';
import type { JoystickOperation } from './events';

export type IconProps = {
  size?: number;
  className?: string;
};

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
});

/** Four-way arrows — `move`. */
export function MoveIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3v18M3 12h18" />
      <path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </svg>
  );
}

/** Clockwise arc — `rotate`. */
export function RotateIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v4h-4" />
    </svg>
  );
}

/** Corner-to-corner arrow — `scale`. */
export function ScaleIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 4h6M4 4v6M4 4l7 7" />
      <path d="M20 20h-6M20 20v-6M20 20l-7-7" />
    </svg>
  );
}

/** Isometric box — `extrude`. */
export function ExtrudeIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 2.5l8 4.5v10l-8 4.5-8-4.5V7z" />
      <path d="M4 7l8 4.5L20 7M12 11.5V21.5" />
    </svg>
  );
}

/** Curve between two nodes — `fillet`. */
export function FilletIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 19V9a4 4 0 0 1 4-4h10" />
      <rect x="2" y="18" width="4" height="4" rx="1" />
      <rect x="18" y="3" width="4" height="4" rx="1" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

const OPERATION_ICONS: Record<JoystickOperation, (p: IconProps) => ReactElement> = {
  move: MoveIcon,
  rotate: RotateIcon,
  scale: ScaleIcon,
  extrude: ExtrudeIcon,
  fillet: FilletIcon,
};

export function OperationIcon({ operation, ...rest }: IconProps & { operation: JoystickOperation }) {
  const Icon = OPERATION_ICONS[operation] ?? MoveIcon;
  return <Icon {...rest} />;
}

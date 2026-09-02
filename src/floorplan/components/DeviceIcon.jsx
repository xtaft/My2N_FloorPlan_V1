import { DEVICE_ICONS } from '../deviceIcons.js';

// Renders a device's 2N icon (see deviceIcons.js) as a standalone <svg>, for
// normal DOM use — the drawer's device rows. `fill: currentColor` on the
// paths means it inherits colour from `color`/sx like any MUI icon would,
// so it drops into the existing rows without special-casing.
//
// preserveAspectRatio letterboxes the non-square viewBoxes into whatever
// square box the caller asks for, rather than stretching them.
export default function DeviceIcon({ type, size = 20, color = 'currentColor', ...props }) {
  const icon = DEVICE_ICONS[type];
  if (!icon) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${icon.width} ${icon.height}`}
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0, color }}
      {...props}
    >
      {icon.paths.map((path, index) => (
        <path
          key={index}
          d={path.d}
          fill="currentColor"
          fillRule={path.evenOdd ? 'evenodd' : undefined}
          clipRule={path.evenOdd ? 'evenodd' : undefined}
        />
      ))}
    </svg>
  );
}

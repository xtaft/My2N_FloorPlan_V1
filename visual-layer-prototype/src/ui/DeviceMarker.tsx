/**
 * A device on the map.
 *
 * Figma: `<Avatar> deviceFloorPlan` (82:137613) — a 40px grey circle holding
 * the device's icon, with a status badge clipped to its top-right corner. The
 * three variants in that node are the three statuses; the icon inside is what
 * varies by device type.
 *
 * Everything here is authored in **screen pixels**, not plan units. The caller
 * passes `unitScale` — how many plan units one screen pixel currently covers —
 * and the group counter-scales by it, so a marker is 40px across whether the
 * plan is zoomed out to the whole floor or in on one door. Only the anchor
 * point moves with the plan, which is the point: the marker says "a device is
 * *here*", and that claim is about a place, not a size.
 */
import { memo } from "react";

/** Figma: grey/500 — the avatar ground. */
const CIRCLE = "#9e9e9e";

/** The avatar's drawn size in screen pixels, which the caller's scale undoes. */
export const DEVICE_PX = 40;
const AVATAR_R = DEVICE_PX / 2;

/**
 * Figma places the badge with MUI's circular overlap, which puts its centre on
 * the avatar's rim at 45° — (r/√2, −r/√2) from the middle.
 */
const BADGE_AT = AVATAR_R / Math.SQRT2;
const BADGE_R = 10; // min-width 20px
const BADGE_RING = 2; // 2px white border

interface StatusLook {
  /** Figma: error/success/warning `main`. */
  color: string;
  /** Only Error carries a glyph; the others are bare dots. */
  mark: string | null;
  label: string;
}

/**
 * The fixture's `status` strings, mapped to the Figma variants. An unknown
 * status falls through to the error look rather than vanishing — a device
 * whose state we cannot read is not a device that is fine.
 */
const STATUS: Record<string, StatusLook> = {
  ok: { color: "#2e7d32", mark: null, label: "All good" },
  not_verified: { color: "#ef6c00", mark: null, label: "Not verified" },
  offline: { color: "#d32f2f", mark: "!", label: "Offline" },
};

const UNKNOWN: StatusLook = { color: "#d32f2f", mark: "!", label: "Unknown" };

/**
 * The device icons, each drawn on a 16×32 grid — the 2N panel proportion. They
 * are the vectors from the Figma avatar's icon layers, which come as even-odd
 * filled outlines rather than strokes, so they stay crisp at one size.
 *
 * `intercom` is IP Style: two stacked modules, a button plate above a camera.
 * `answering_unit` is IndoorView: one panel, a lens in the header over a
 * screen. `access_unit` is Access Unit 2.0, drawn to match the pair — the same
 * panel outline, with the contactless arcs it reads cards by.
 */
function DeviceIcon({ deviceType }: { deviceType: string }) {
  if (deviceType === "answering_unit") {
    // Figma icon layer, already on the 16×32 grid.
    return (
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M16 32H0V0H16V32ZM1 31H15V7H1V31ZM14 27H2V8H14V27ZM3 26H13V9H3V26ZM1 6H15V1H1V6ZM3.6 2.01C3.74 2.04 3.87 2.11 3.96 2.2C4.06 2.3 4.12 2.43 4.15 2.57C4.18 2.71 4.17 2.86 4.1 2.98C4.03 3.11 3.92 3.21 3.78 3.26C3.64 3.32 3.49 3.32 3.35 3.28C3.21 3.23 3.09 3.14 3.01 3.02C2.93 2.9 2.89 2.75 2.91 2.61C2.93 2.46 3 2.33 3.11 2.23C3.21 2.14 3.34 2.08 3.48 2.07C3.52 2.06 3.56 2.06 3.6 2.01Z"
      />
    );
  }
  if (deviceType === "intercom") {
    // Figma icon layer on a 10×20 grid; ×1.6 lands it on the same 16×32 box.
    return (
      <g transform="scale(1.6)">
        <path d="M4.35 13C4.39 13 4.42 13.01 4.45 13.04C4.48 13.07 4.5 13.1 4.51 13.13L4.62 13.72C4.62 13.76 4.62 13.8 4.61 13.83C4.6 13.86 4.59 13.89 4.57 13.91L4.16 14.32C4.22 14.42 4.28 14.52 4.36 14.61C4.44 14.71 4.52 14.8 4.61 14.89C4.7 14.98 4.79 15.06 4.88 15.13C4.98 15.21 5.08 15.27 5.18 15.33L5.58 14.94C5.6 14.92 5.63 14.9 5.67 14.89C5.71 14.87 5.75 14.87 5.79 14.88L6.37 14.99C6.41 15 6.44 15.02 6.46 15.05C6.49 15.08 6.5 15.11 6.5 15.15V15.83C6.5 15.88 6.48 15.92 6.45 15.95C6.42 15.98 6.38 16 6.33 16C5.98 16 5.63 15.92 5.3 15.77C4.96 15.62 4.65 15.41 4.37 15.13C4.09 14.85 3.88 14.54 3.73 14.2C3.58 13.87 3.5 13.52 3.5 13.17C3.5 13.12 3.52 13.08 3.55 13.05C3.58 13.02 3.62 13 3.67 13H4.35Z" />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M8 18H2V11H8V18ZM3 17H7V12H3V17Z"
        />
        <path d="M6 6H4V5H6V6Z" />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M8 10H2V2H8V10ZM3 9H7V8H3V9ZM3 4H4V5H3V7H7V5H6V4H7V3H3V4Z"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M10 20H0V0H10V20ZM1 19H9V1H1V19Z"
        />
      </g>
    );
  }
  // Access Unit 2.0 — a reader, so the face carries contactless arcs rather
  // than a screen. Shorter than the intercoms, centred on the same box.
  return (
    <>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M16 28H0V4H16V28ZM1.2 26.8H14.8V5.2H1.2V26.8Z"
      />
      <circle cx={5.5} cy={16} r={1.3} />
      <g fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round">
        <path d="M7.11 14.09A2.5 2.5 0 0 1 7.11 17.91" />
        <path d="M8.39 12.55A4.5 4.5 0 0 1 8.39 19.45" />
        <path d="M9.68 11.02A6.5 6.5 0 0 1 9.68 20.98" />
      </g>
    </>
  );
}

export interface DeviceMarkerProps {
  name: string;
  deviceType: string;
  status: string;
  /** The anchor, in plan units. */
  x: number;
  y: number;
  /** Plan units per screen pixel at the current zoom. */
  unitScale: number;
  /** Off while editing the plan, where a device's health is not the subject. */
  showStatus?: boolean;
  hovered: boolean;
}

export const DeviceMarker = memo(function DeviceMarker({
  name,
  deviceType,
  status,
  x,
  y,
  unitScale,
  showStatus = true,
  hovered,
}: DeviceMarkerProps) {
  const look = STATUS[status] ?? UNKNOWN;
  const text = showStatus ? `${name} — ${look.label}` : name;
  // No text metrics inside an SVG without measuring, and measuring every
  // marker to draw a tooltip is not worth a layout pass: Roboto 11px runs
  // about 5.9px to the character, which is close enough for a chip.
  const tipW = Math.round(text.length * 5.9) + 16;

  return (
    <g transform={`translate(${x} ${y}) scale(${unitScale})`}>
      {/* Nothing here takes pointer events. A reader sits beside its door,
          and a 40px hit target over a door is a door that cannot be clicked
          — so the canvas works out which marker the pointer is near rather
          than the marker claiming the area. */}
      <g pointerEvents="none">
        <circle r={AVATAR_R} fill={CIRCLE} />
        {/* inset 10% of the 40px circle leaves a 32px icon box. */}
        <g transform="translate(-8 -16)" fill="#ffffff" color="#ffffff">
          <DeviceIcon deviceType={deviceType} />
        </g>

        {showStatus && (
          <>
            <circle
              cx={BADGE_AT}
              cy={-BADGE_AT}
              r={BADGE_R + BADGE_RING}
              fill="#ffffff"
            />
            <circle cx={BADGE_AT} cy={-BADGE_AT} r={BADGE_R} fill={look.color} />
          </>
        )}
        {showStatus && look.mark && (
          <text
            x={BADGE_AT}
            y={-BADGE_AT}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Roboto, sans-serif"
            fontSize={12}
            fontWeight={500}
            letterSpacing={0.14}
            fill="#ffffff"
          >
            {look.mark}
          </text>
        )}

        {hovered && (
          <g transform={`translate(0 ${-AVATAR_R - BADGE_RING - 10})`}>
            <rect
              x={-tipW / 2}
              y={-22}
              width={tipW}
              height={22}
              rx={4}
              fill="rgba(97,97,97,0.92)"
            />
            <text
              x={0}
              y={-11}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="Roboto, sans-serif"
              fontSize={11}
              fontWeight={500}
              fill="#ffffff"
            >
              {text}
            </text>
          </g>
        )}
      </g>
    </g>
  );
});

import { DEVICE_ICONS } from '../deviceIcons.js';

// Figma's "deviceItem" (Floor Plan Feature file, node 91:101868) draws the
// chip at 47px. On the floor plan that reads far too big, so the whole
// component is rendered at a 24px circle instead and every part that sits
// inside or around the circle is scaled by the same ratio — otherwise the
// 35px icon would overflow the smaller circle and get clipped.
const FIGMA_CIRCLE_DIAMETER = 47;
const CIRCLE_DIAMETER = 24;
const PART_SCALE = CIRCLE_DIAMETER / FIGMA_CIRCLE_DIAMETER;

const ICON_BOX = 35 * PART_SCALE;
const LABEL_GAP = 4 * PART_SCALE;
const SELECTED_RING_WIDTH = 3 * PART_SCALE;
const SHADOW_OFFSET_Y = 4 * PART_SCALE;
// CSS blur radius is twice the Gaussian standard deviation, so Figma's 4px
// blur is stdDeviation 2 — scaled down with everything else.
const SHADOW_STD_DEVIATION = (4 * PART_SCALE) / 2;

// The one part deliberately NOT scaled: at the ratio above the label would
// land near 5px and be unreadable. It stays at the size the design gives it,
// which is also about its rendered pixel size at the plan's default fit.
const LABEL_FONT_SIZE = 10;
const LABEL_COLOR = 'rgba(0,0,0,0.87)'; // text/primary
const SELECTED_RING_COLOR = '#2196f3';

// The status badge (Figma node 109:114755, "<DeviceItem> view") — a small
// dot in the same bottom-right badge position Material's own <Badge>
// anchorOrigin uses, scaled down by the same PART_SCALE as everything else.
// Only ever rendered in FloorPlanCreatedContent.jsx's read-only preview
// (via showStatusBadge) — the real editable canvas has no notion of device
// "status" to show, and every device in this prototype's demo roster is
// treated as connected/OK (success green) since there's no real
// connectivity backing it either way.
const STATUS_DOT_DIAMETER = 8 * PART_SCALE;
const STATUS_DOT_COLOR = '#2e7d32'; // success/main

export const DEVICE_ITEM_SHADOW_FILTER_ID = 'deviceItemShadow';

// Rendered once into the plan's <defs> — see FloorPlanCanvas.
export function DeviceItemShadowFilter() {
  return (
    <filter id={DEVICE_ITEM_SHADOW_FILTER_ID} x="-75%" y="-75%" width="250%" height="250%">
      <feDropShadow
        dx="0"
        dy={SHADOW_OFFSET_Y}
        stdDeviation={SHADOW_STD_DEVIATION}
        floodColor="#000000"
        floodOpacity="0.25"
      />
    </filter>
  );
}

/**
 * One placed device on the floor plan, drawn as bare SVG inside the plan's
 * own <svg> — deliberately not as a nested <svg>, which is what previously
 * blew a white glyph across the whole canvas (see deviceIcons.js).
 *
 * `scale` exists because the plan's user-unit space isn't 1:1 with screen
 * pixels: the 2000-unit-wide plan is drawn into roughly 1200 CSS px at the
 * default fit. Scaling the marker as one unit keeps every internal
 * proportion intact while letting it land at its intended on-screen size.
 *
 * `selected` renders Figma's Selected variant (a blue ring), set by clicking
 * the marker — which also opens the device's menu (see DeviceMenu).
 *
 * `showStatusBadge` renders the small status dot from Figma's view-mode
 * variant (node 109:114755) instead — see STATUS_DOT_DIAMETER above.
 */
export default function DeviceItemMarker({ device, x, y, scale = 1, selected = false, onSelect, showStatusBadge = false }) {
  const icon = DEVICE_ICONS[device.type];
  if (!icon) return null;

  const radius = CIRCLE_DIAMETER / 2;
  // The library's viewBoxes aren't square and differ per device, so the icon
  // is letterboxed into the icon box rather than stretched to fill it.
  const iconScale = Math.min(ICON_BOX / icon.width, ICON_BOX / icon.height);
  const iconWidth = icon.width * iconScale;
  const iconHeight = icon.height * iconScale;

  return (
    <g
      transform={`translate(${x} ${y}) scale(${scale})`}
      data-device-id={device.id}
      style={{ cursor: 'pointer' }}
      onClick={(event) => {
        // Without this the click continues to the zone underneath, which in
        // Merge mode would select that zone at the same time.
        event.stopPropagation();
        onSelect?.(device.id, event.currentTarget);
      }}
    >
      <circle
        cx={0}
        cy={0}
        r={radius}
        fill="#ffffff"
        filter={`url(#${DEVICE_ITEM_SHADOW_FILTER_ID})`}
        {...(selected ? { stroke: SELECTED_RING_COLOR, strokeWidth: SELECTED_RING_WIDTH } : {})}
      />
      <g transform={`translate(${-iconWidth / 2} ${-iconHeight / 2}) scale(${iconScale})`}>
        {icon.paths.map((path, index) => (
          <path
            key={index}
            d={path.d}
            fill="#000000"
            fillRule={path.evenOdd ? 'evenodd' : undefined}
            clipRule={path.evenOdd ? 'evenodd' : undefined}
          />
        ))}
      </g>
      {showStatusBadge && (
        <circle
          cx={radius * Math.SQRT1_2}
          cy={radius * Math.SQRT1_2}
          r={STATUS_DOT_DIAMETER / 2}
          fill={STATUS_DOT_COLOR}
          stroke="#ffffff"
          strokeWidth={STATUS_DOT_DIAMETER * 0.25}
        />
      )}
      <text
        x={0}
        y={radius + LABEL_GAP + LABEL_FONT_SIZE}
        textAnchor="middle"
        fontFamily="Roboto, Helvetica, Arial, sans-serif"
        fontSize={LABEL_FONT_SIZE}
        fontWeight={500}
        fill={LABEL_COLOR}
      >
        {device.name}
      </text>
    </g>
  );
}

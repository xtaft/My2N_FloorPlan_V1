import { useRef, useState, useMemo, forwardRef } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import { getZoneStyle, getDoorStyle } from './zoneStyles.js';
import { getZoneDisplayName, formatDoorTooltip } from './formatNames.js';
import { projectPointOntoSegment, pointToSegmentDistance, pathBoundingBoxCenter } from './geometry.js';
import { getDevicePinPosition, canPinToZone, getZoneLabelPosition } from './devices.js';
import DeviceItemMarker, { DeviceItemShadowFilter } from './components/DeviceItemMarker.jsx';
import './FloorPlanCanvas.css';

// Renders Figma's deviceItem at roughly its designed on-screen size given
// the plan's default fit (2000 user units across ~1200 CSS px) — see
// DeviceItemMarker for why the whole marker is scaled as one unit.
const DEVICE_ITEM_SCALE = 1.6;

// Drop targets shown while a device is being dragged in from the drawer.
const DOOR_DROP_RADIUS = 44;
const DROP_TARGET_COLOR = '#2196f3';

// "Show labels" zone-name text (see getZoneLabelPosition, devices.js).
const ZONE_LABEL_FONT_SIZE = 20;
const ZONE_LABEL_COLOR = 'rgba(0,0,0,0.87)';

const ARROW_KEY_PAN_STEP = 80; // px per key press, at the current zoom level

const ARROW_KEY_DELTAS = {
  ArrowUp: [0, ARROW_KEY_PAN_STEP],
  ArrowDown: [0, -ARROW_KEY_PAN_STEP],
  ArrowLeft: [ARROW_KEY_PAN_STEP, 0],
  ArrowRight: [-ARROW_KEY_PAN_STEP, 0],
};

// Divide tool edge overlay styling.
const EDGE_HIT_WIDTH = 16; // generous invisible hit target, independent of the visible highlight width
const EDGE_HOVER_WIDTH = 5;
const EDGE_SELECTED_WIDTH = 6;
const EDGE_HOVER_COLOR = '#2196f3';
const EDGE_SELECTED_COLOR = '#0D47A1';
const PREVIEW_LINE_WIDTH = 2;

// The cursor-following preview line always runs exactly perpendicular to
// the first-clicked wall — Divide itself is constrained the same way (see
// useFloorPlanEditor.js's handleWallClick: the second click only picks
// WHICH wall to cut to, not where on it; the actual cut point is wherever
// that perpendicular ray meets the chosen wall). This projects the raw
// cursor position onto that same perpendicular line, so the preview always
// shows what will actually happen on the next click, regardless of where
// the cursor is relative to the wall.
function computeDividePreviewEndpoint(firstPoint, wallEdge, cursorPoint) {
  const wx = wallEdge.x2 - wallEdge.x1;
  const wy = wallEdge.y2 - wallEdge.y1;
  const wallLen = Math.hypot(wx, wy);
  if (wallLen === 0) return cursorPoint;
  const uwx = wx / wallLen;
  const uwy = wy / wallLen;
  const upx = -uwy; // unit vector perpendicular to the wall
  const upy = uwx;

  const dx = cursorPoint[0] - firstPoint[0];
  const dy = cursorPoint[1] - firstPoint[1];
  const perp = dx * upx + dy * upy;
  return [firstPoint[0] + perp * upx, firstPoint[1] + perp * upy];
}

function ringToPathD(ring) {
  return 'M' + ring.map((p) => p.join(',')).join(' L') + ' Z';
}

function zoneToPathD(zone) {
  return zone.rings.map(ringToPathD).join(' ');
}

// Converts a screen-space point (e.g. MouseEvent clientX/clientY) into the
// SVG's own user-coordinate space (our 2000x1400 floor-plan space),
// accounting for the viewBox scaling AND any ancestor CSS transform (the
// pan/zoom translate+scale react-zoom-pan-pinch applies) — getScreenCTM
// walks the whole chain, so this stays correct at any zoom/pan position.
function screenPointToSvgPoint(svgEl, clientX, clientY) {
  const pt = svgEl.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svgEl.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const transformed = pt.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}

// A zone's own categoryId should always resolve (seedZoneCategoryIds/
// merge/divide all set it), but falling back to the Unknown category's
// color if it somehow doesn't is cheap insurance against a blank/invalid fill.
const FALLBACK_ZONE_COLOR = '#999999';

function resolveZoneColor(zone, categories) {
  return categories.find((c) => c.id === zone.categoryId)?.color ?? FALLBACK_ZONE_COLOR;
}

function FloorPlanSvg({
  zones,
  doors,
  categories,
  devices,
  showLabels,
  showDevices,
  showDeviceStatusBadges,
  draggingDevice,
  onDropDeviceOnZone,
  onDropDeviceOnDoor,
  selectedDeviceId,
  onSelectDevice,
  firstMergeZoneId,
  eligibleZoneIds,
  onZoneClick,
  activeTool,
  firstDivideEdge,
  wallSegments,
  onWallClick,
  width,
  height,
}) {
  // Access Units are door-only (see canPinToZone), so while one is in flight
  // the zone fills aren't drop targets at all — only the door rings are.
  const zonesAcceptDrop = !!draggingDevice && canPinToZone(draggingDevice);
  const [hoveredWallKey, setHoveredWallKey] = useState(null);
  const [cursorPoint, setCursorPoint] = useState(null);
  // Divide and Add Door both operate on the same clickable wall overlay —
  // every wall on the floor, rendered exactly once (see buildFloorWallSegments,
  // geometry.js, for why that matters), split at existing doors so a door's
  // own span is never rendered as a clickable "add a door / cut here" target.
  const isWallToolActive = activeTool === 'divide' || activeTool === 'addDoor';
  const clickableWalls = useMemo(
    () => (isWallToolActive ? wallSegments.filter((seg) => seg.type === 'wall') : []),
    [isWallToolActive, wallSegments],
  );

  // Only tracked while it'd actually be drawn (Divide, first click already
  // made) — no need to pay for a mousemove listener/re-render on every
  // pointer move otherwise.
  const showDividePreview = activeTool === 'divide' && !!firstDivideEdge;
  const dividePreviewEnd =
    showDividePreview && cursorPoint
      ? computeDividePreviewEndpoint(firstDivideEdge.point, firstDivideEdge.wallEdge, cursorPoint)
      : null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%', display: 'block', background: '#fff' }}
      onMouseMove={
        showDividePreview
          ? (e) => {
              const point = screenPointToSvgPoint(e.currentTarget, e.clientX, e.clientY);
              setCursorPoint([point.x, point.y]);
            }
          : undefined
      }
    >
      <defs>
        <DeviceItemShadowFilter />
      </defs>
      {zones.map((zone) => {
        const isFirstSelected = zone.id === firstMergeZoneId;
        const isEligible = !isFirstSelected && eligibleZoneIds.includes(zone.id);
        // Once a first zone is pending, every other zone is either eligible
        // (shares an edge with it) or dimmed — there's no neutral "default"
        // in between at that point.
        const isDimmed = !!firstMergeZoneId && !isFirstSelected && !isEligible;
        const zoneState = isFirstSelected ? 'selected' : isEligible ? 'eligible' : isDimmed ? 'dimmed' : 'default';
        const zoneColor = resolveZoneColor(zone, categories);
        const style = getZoneStyle(zoneColor, zoneState);
        return (
          // While "Show labels" is on, the zone's name is already shown
          // persistently (see the label pass below) — the hover tooltip
          // would be a redundant, cursor-following echo of the same text, so
          // it's suppressed (empty title) rather than shown on top of it.
          <Tooltip key={zone.id} title={showLabels ? '' : getZoneDisplayName(zone)} followCursor>
            <path
              data-zone-id={zone.id}
              d={zoneToPathD(zone)}
              fillRule="evenodd"
              fill={style.fill}
              fillOpacity={style.fillOpacity}
              stroke={style.stroke}
              strokeWidth={style.strokeWidth}
              strokeDasharray={style.strokeDasharray}
              style={{ cursor: 'pointer' }}
              onClick={(e) => onZoneClick(zone.id, { left: e.clientX, top: e.clientY })}
              // preventDefault on dragOver is what marks an element as a
              // valid HTML5 drop target; without it the drop never fires.
              onDragOver={zonesAcceptDrop ? (e) => e.preventDefault() : undefined}
              onDrop={
                zonesAcceptDrop
                  ? (e) => {
                      e.preventDefault();
                      onDropDeviceOnZone(e.dataTransfer.getData('text/plain'), zone.id);
                    }
                  : undefined
              }
              onMouseEnter={(e) => {
                // Once a first zone is pending, eligible/dimmed/selected are
                // static — no hover bump on top of them.
                if (firstMergeZoneId) return;
                const hoverStyle = getZoneStyle(zoneColor, 'hover');
                e.currentTarget.setAttribute('fill-opacity', hoverStyle.fillOpacity);
                e.currentTarget.setAttribute('stroke-width', hoverStyle.strokeWidth);
              }}
              onMouseLeave={(e) => {
                if (firstMergeZoneId) return;
                e.currentTarget.setAttribute('fill-opacity', style.fillOpacity);
                e.currentTarget.setAttribute('stroke-width', style.strokeWidth);
              }}
            />
          </Tooltip>
        );
      })}
      {/* Persistent zone-name labels, upper third of each zone — only while
          "Show labels" is on (see the Tooltip suppression above). A separate
          pass rather than folded into the zones.map above so it paints over
          every zone fill, not just its own (a merged/overlapping zone
          shouldn't have its label hidden under a later zone's fill), and so
          it can be pointer-events:none without touching the click/hover
          handlers on the zone path itself. */}
      {showLabels &&
        zones.map((zone) => {
          const [lx, ly] = getZoneLabelPosition(zone);
          return (
            <text
              key={`label-${zone.id}`}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="Roboto, Helvetica, Arial, sans-serif"
              fontSize={ZONE_LABEL_FONT_SIZE}
              fontWeight={500}
              fill={ZONE_LABEL_COLOR}
              pointerEvents="none"
            >
              {getZoneDisplayName(zone)}
            </text>
          );
        })}
      {doors.map((door) => {
        const style = getDoorStyle('default');
        return (
          <Tooltip key={door.id} title={formatDoorTooltip(door, zones)} followCursor>
            <path
              data-door-id={door.id}
              d={door.d}
              // A transparent (not "none") fill gives the whole door shape a
              // hit area for hover/tooltip — a stroke-only path would only be
              // hoverable right on the thin outline itself. But while an edit
              // tool is active, that same hit area (a full swing-arc sector,
              // much bigger than the wall line it sits on) would otherwise
              // shadow the edge-click target beneath it for any click that
              // lands inside the swing rather than exactly on the thin wall
              // line — so it's switched off for the duration of any tool.
              fill="transparent"
              stroke={style.stroke}
              strokeWidth={style.strokeWidth}
              style={{ cursor: 'pointer', pointerEvents: activeTool ? 'none' : 'auto' }}
            />
          </Tooltip>
        );
      })}
      {/* Pinned devices for this floor. Rendered above the doors so a pin
          beside a door isn't hidden under the swing glyph, and — like the
          doors above — made click-through while any edit tool is active so
          a pin can never shadow the wall/zone click target beneath it.
          Gated on "Show devices" regardless of editMode — that switch means
          "no devices visible at all", not just "in Devices mode". */}
      {showDevices && (
        <g style={{ pointerEvents: activeTool ? 'none' : 'auto' }}>
          {devices.map((device) => {
            const position = getDevicePinPosition(device, zones, doors);
            if (!position) return null; // unplaceable (zone/door edited away) — skip silently
            return (
              <DeviceItemMarker
                key={device.id}
                device={device}
                x={position[0]}
                y={position[1]}
                scale={DEVICE_ITEM_SCALE}
                selected={device.id === selectedDeviceId}
                onSelect={onSelectDevice}
                showStatusBadge={showDeviceStatusBadges}
              />
            );
          })}
        </g>
      )}
      {/* Door drop targets, only while a device is being dragged in from the
          drawer. Doors are drawn as thin glyphs, far too fiddly to hit
          directly, so each one gets a generous ring centered on it — which
          doubles as the affordance showing where a device can actually go. */}
      {draggingDevice &&
        doors.map((door) => {
          const [cx, cy] = pathBoundingBoxCenter(door.d);
          return (
            <circle
              key={`drop-${door.id}`}
              data-door-drop-id={door.id}
              cx={cx}
              cy={cy}
              r={DOOR_DROP_RADIUS}
              fill={DROP_TARGET_COLOR}
              fillOpacity={0.15}
              stroke={DROP_TARGET_COLOR}
              strokeWidth={2}
              strokeDasharray="6 4"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onDropDeviceOnDoor(e.dataTransfer.getData('text/plain'), door.id);
              }}
            />
          );
        })}
      {/* Divide and Add Door: every wall on the floor, rendered once (see
          buildFloorWallSegments), on top of the zone fills above so a click
          never falls through to a zone's own onClick. Only rendered while
          one of those tools is active. firstDivideEdge is always null while
          Add Door is active (cleared by the effect in useFloorPlanEditor),
          so the "isFirst" selected-wall highlight naturally only applies to
          Divide's two-step gesture. */}
      {clickableWalls.map((seg, index) => {
        const key = `${seg.zoneAId}__${seg.zoneBId ?? 'ext'}__${index}`;
        const isFirst =
          firstDivideEdge &&
          firstDivideEdge.zoneAId === seg.zoneAId &&
          firstDivideEdge.zoneBId === seg.zoneBId &&
          pointToSegmentDistance(firstDivideEdge.point[0], firstDivideEdge.point[1], seg.x1, seg.y1, seg.x2, seg.y2) <
            1;
        const isHovered = hoveredWallKey === key;
        return (
          <g key={key}>
            <line
              x1={seg.x1}
              y1={seg.y1}
              x2={seg.x2}
              y2={seg.y2}
              stroke="transparent"
              strokeWidth={EDGE_HIT_WIDTH}
              style={{ cursor: 'crosshair' }}
              onMouseEnter={() => setHoveredWallKey(key)}
              onMouseLeave={() => setHoveredWallKey((current) => (current === key ? null : current))}
              onClick={(e) => {
                const svgEl = e.currentTarget.ownerSVGElement;
                const clicked = screenPointToSvgPoint(svgEl, e.clientX, e.clientY);
                const point = projectPointOntoSegment(clicked.x, clicked.y, seg.x1, seg.y1, seg.x2, seg.y2);
                onWallClick(seg.zoneAId, seg.zoneBId, point, { x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2 });
              }}
            />
            {(isFirst || isHovered) && (
              <line
                x1={seg.x1}
                y1={seg.y1}
                x2={seg.x2}
                y2={seg.y2}
                stroke={isFirst ? EDGE_SELECTED_COLOR : EDGE_HOVER_COLOR}
                strokeWidth={isFirst ? EDGE_SELECTED_WIDTH : EDGE_HOVER_WIDTH}
                strokeLinecap="round"
                pointerEvents="none"
              />
            )}
          </g>
        );
      })}
      {/* Divide's cursor-following preview: shows where the cut will run
          before the second click commits it. Snaps to exactly perpendicular
          to the first-clicked wall (computeDividePreviewEndpoint) when the
          cursor is already close to that alignment, so an intended straight
          cut doesn't need pixel-perfect aim. Purely a visual guide — the
          actual cut still comes from whatever wall the second click lands
          on, same as always. */}
      {dividePreviewEnd && (
        <line
          x1={firstDivideEdge.point[0]}
          y1={firstDivideEdge.point[1]}
          x2={dividePreviewEnd[0]}
          y2={dividePreviewEnd[1]}
          stroke={EDGE_SELECTED_COLOR}
          strokeWidth={PREVIEW_LINE_WIDTH}
          strokeDasharray="8 6"
          pointerEvents="none"
        />
      )}
    </svg>
  );
}

/**
 * The native-SVG editable floor plan layer, wrapped in react-zoom-pan-pinch
 * for gesture-only navigation (wheel/pinch to zoom centered on the cursor,
 * click-drag to pan — no on-screen zoom/pan buttons). This replaces the
 * "floor_01_placeholder 1" raster image inside <Container> editorCanvas.
 * Every zone/door is a real vector object built from Figma's own geometry —
 * no background image involved.
 *
 * Default view = the SVG's own viewBox/preserveAspectRatio scaling (both the
 * TransformComponent and the <svg> itself are sized 100%/100%), so
 * react-zoom-pan-pinch's initialScale={1} IS "the whole floor fit to the
 * canvas" — extra zoom is a multiplier on top of that fit, not a replacement
 * for it.
 *
 * `key={floorId}` on TransformWrapper fully remounts the pan/zoom instance
 * when the active floor changes, so each floor starts at its own default fit
 * instead of inheriting the previous floor's zoom/pan position. The Merge/
 * Divide tools' pending state lives in useFloorPlanEditor, entirely separate
 * from react-zoom-pan-pinch's internal transform state, so panning/zooming
 * never touches or resets an in-progress gesture.
 *
 * Arrow-key panning (WCAG 2.1.1 Keyboard): drag-to-pan alone leaves keyboard
 * users with no way to move the view, so the focusable wrapper below also
 * pans via setTransform on ArrowUp/Down/Left/Right, at the current zoom
 * level and position (read from the ref's live state, not stale closure
 * values) so it composes correctly with prior mouse/wheel navigation.
 * The focus-visible outline is a plain CSS class (FloorPlanCanvas.css)
 * rather than sx, purely for consistency with the rest of the app's styling
 * approach.
 *
 * Known cosmetic issue: passing `ref` to TransformWrapper — its own
 * documented API for programmatic control, required here for keyboard
 * panning — triggers a spurious "ref is not a prop" console warning from
 * inside react-zoom-pan-pinch v4.0.3 itself (isolated by testing: happens
 * regardless of what wraps it, including no wrapper at all). Dev-only,
 * stripped from production builds, and confirmed not to affect click
 * selection, hover, zoom, pan, or floor-switching — all verified working.
 *
 * Forwards its react-zoom-pan-pinch instance via ref so ActionBarFloorPlan's
 * Zoom In/Out/Focus buttons can drive the same pan/zoom state that arrow
 * keys and mouse gestures do — merged with the internal ref used for
 * keyboard panning so both consumers share one instance.
 */
const FloorPlanCanvas = forwardRef(function FloorPlanCanvas(
  {
    zones,
    doors,
    categories,
    devices,
    showLabels,
    showDevices,
    showDeviceStatusBadges,
    draggingDevice,
    onDropDeviceOnZone,
    onDropDeviceOnDoor,
    selectedDeviceId,
    onSelectDevice,
    firstMergeZoneId,
    eligibleZoneIds,
    onZoneClick,
    activeTool,
    firstDivideEdge,
    wallSegments,
    onWallClick,
    floorId,
    width = 2000,
    height = 1400,
  },
  forwardedRef,
) {
  const internalRef = useRef(null);

  // The roster is building-wide (see devices.js), so narrow it here to the
  // ones that actually render: pinned, and on the floor being shown.
  const floorDevices = useMemo(
    () => devices.filter((device) => device.pinned && device.floorId === floorId),
    [devices, floorId],
  );

  const setTransformRefs = (node) => {
    internalRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  const handleKeyDown = (event) => {
    const delta = ARROW_KEY_DELTAS[event.key];
    if (!delta) return;
    event.preventDefault();
    const instance = internalRef.current;
    if (!instance) return;
    const { positionX, positionY, scale } = instance.state;
    const [dx, dy] = delta;
    instance.setTransform(positionX + dx, positionY + dy, scale, 0);
  };

  return (
    <Box
      className="floorplan-canvas"
      tabIndex={0}
      role="application"
      aria-label="Floor plan canvas. Use arrow keys to pan the view."
      onKeyDown={handleKeyDown}
      // react-zoom-pan-pinch calls preventDefault() on mousedown (for its own
      // drag-panning), which suppresses the browser's default "focus the
      // clicked element" behavior — so a real click would never focus this
      // and arrow keys would never work. Focusing explicitly here, before
      // that preventDefault runs, fixes it.
      onMouseDown={(event) => event.currentTarget.focus()}
      style={{ width: '100%', height: '100%', outline: 'none' }}
    >
      <TransformWrapper
        key={floorId}
        ref={setTransformRefs}
        initialScale={1}
        minScale={0.5}
        maxScale={8}
        wheel={{ step: 0.001 }}
        doubleClick={{ disabled: true }}
        limitToBounds={false}
      >
        <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%', height: '100%' }}>
          <FloorPlanSvg
            zones={zones}
            doors={doors}
            categories={categories}
            devices={floorDevices}
            showLabels={showLabels}
            showDevices={showDevices}
            showDeviceStatusBadges={showDeviceStatusBadges}
            draggingDevice={draggingDevice}
            onDropDeviceOnZone={onDropDeviceOnZone}
            onDropDeviceOnDoor={onDropDeviceOnDoor}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={onSelectDevice}
            firstMergeZoneId={firstMergeZoneId}
            eligibleZoneIds={eligibleZoneIds}
            onZoneClick={onZoneClick}
            activeTool={activeTool}
            firstDivideEdge={firstDivideEdge}
            wallSegments={wallSegments}
            onWallClick={onWallClick}
            width={width}
            height={height}
          />
        </TransformComponent>
      </TransformWrapper>
    </Box>
  );
});

export default FloorPlanCanvas;

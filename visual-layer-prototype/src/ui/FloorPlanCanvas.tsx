/**
 * The map. Everything drawn here is derived at render time from the stored
 * records — room shapes from wall sets, door openings from `t` and `width`,
 * reader positions from `guards`. Nothing is read out of the fixture that the
 * fixture does not store.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchContentRef,
} from "react-zoom-pan-pinch";
import {
  RingCache,
  accessType,
  add,
  deviceAnchor,
  doorGeometry,
  groupOuterWalls,
  highlightTargets,
  isRoomListed,
  insideRings,
  isWallVisible,
  labelPoint,
  lerp,
  nearestWall,
  nearestWallInRoom,
  ringsToPath,
  roomColor,
  roomsOf,
  signedArea,
  wallEnds,
  wallSolidSpans,
  type Device,
  type DivideRoomRequest,
  type Door,
  type Point,
  type Reachability,
  type VisualLayer,
  type Wall,
  type WallHit,
} from "../model";
import { roomAccessState } from "../model";
import { DEVICE_PX, DeviceMarker } from "./DeviceMarker";

/** However far out the plan goes, a marker stays readable. */
const MIN_DEVICE_PX = 20;

const WALL_COLOR = "#2E3338";
const DOOR_COLOR = "#5A646E";
const GHOST_OK = "#2196f3";
const GHOST_BAD = "#C62828";
const PAD = 40;

export interface FloorPlanCanvasProps {
  layer: VisualLayer;
  floorId: string;
  showAllRooms: boolean;
  /** null means no profile is selected, so nothing is tinted. */
  reach: Reachability | null;
  selectedRoomId: string | null;
  selectedGroupId: string | null;
  onSelectRoom: (roomId: string | null) => void;
  /**
   * Called instead of onSelectRoom when the pointer is over a room the lists
   * do not name: a hidden room cannot be clicked or acted on, so the envelope
   * is what the map offers.
   */
  onSelectGroup?: (groupId: string | null) => void;
  /**
   * The armed tool. "door" places doors on walls; "show" reveals the rooms
   * folded inside their envelopes and offers them for showing; "hide" folds
   * a shown room back. "select" leaves the map to selection.
   */
  tool?: "select" | "door" | "show" | "hide" | "wall" | "remove_wall";
  /** Called with the wall and side under the pointer when it is clicked. */
  onPlaceDoor?: (hit: WallHit) => void;
  /** Both ends of a finished cut, each already snapped to a wall. */
  onDivideRoom?: (req: DivideRoomRequest) => void;
  /** Why the cut being drawn would be refused, for the ghost's colour. */
  divideError?: (req: DivideRoomRequest) => string | null;
  /** The wall clicked with the remove tool armed. */
  onDeleteWall?: (wallId: string) => void;
  /** Why removing the wall under the pointer would be refused. */
  deleteWallError?: (wallId: string) => string | null;
  /**
   * Device status badges. Off while editing: the editor is for changing the
   * plan, and whether a reader is reachable today is not part of that.
   */
  showDeviceStatus?: boolean;
  /** Clicked a folded room with the show tool armed. */
  onShowRoom?: (roomId: string) => void;
  /** Clicked a shown room with the hide tool armed. */
  onHideRoom?: (roomId: string) => void;
  /** Why a door could not go where the pointer is, for the ghost's colour. */
  placementError?: (hit: WallHit) => string | null;
  /**
   * Hands the zoom controls out so a toolbar outside the canvas can drive
   * them. TransformWrapper is not a forwardRef component in this version —
   * passing it a `ref` warns and yields nothing — so the controls come from
   * its render prop instead.
   */
  onControls?: (controls: CanvasControls) => void;
}

export interface CanvasControls {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

/** Publishes the controls once they exist, without rendering anything. */
function ControlsBridge({
  utils,
  onControls,
}: {
  utils: ReactZoomPanPinchContentRef;
  onControls?: (controls: CanvasControls) => void;
}) {
  useEffect(() => {
    onControls?.({
      zoomIn: () => utils.zoomIn(),
      zoomOut: () => utils.zoomOut(),
      reset: () => utils.resetTransform(),
    });
  }, [utils, onControls]);
  return null;
}

interface DeviceGlyph {
  device: Device;
  x: number;
  y: number;
}

export function FloorPlanCanvas({
  layer,
  floorId,
  showAllRooms,
  reach,
  selectedRoomId,
  selectedGroupId,
  onSelectRoom,
  onSelectGroup,
  tool = "select",
  onPlaceDoor,
  onDivideRoom,
  divideError,
  onDeleteWall,
  deleteWallError,
  showDeviceStatus = true,
  onShowRoom,
  onHideRoom,
  placementError,
  onControls,
}: FloorPlanCanvasProps) {
  const revealing = tool === "show";
  const hiding = tool === "hide";
  // The show tool is what makes a folded room visible at all, and the door
  // tool needs every wall on screen to aim at.
  const revealAll = showAllRooms || revealing || tool === "door";
  const rings = useMemo(() => new RingCache(layer), [layer]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<WallHit | null>(null);
  const [hoverRoom, setHoverRoom] = useState<string | null>(null);
  const [hoverDevice, setHoverDevice] = useState<string | null>(null);
  /** The first end of a wall being drawn, already on one of the room's walls. */
  const [cutFrom, setCutFrom] = useState<{ roomId: string; at: Point } | null>(
    null,
  );
  /** Where the pointer is now, snapped to the same room's boundary. */
  const [cutTo, setCutTo] = useState<Point | null>(null);
  /**
   * Plan units per CSS pixel with the plan unzoomed — the viewBox against the
   * element's layout box. A CSS transform does not touch the layout box, so
   * this moves only on a resize or a change of floor.
   */
  const [fitScale, setFitScale] = useState(1);
  /** The pan/zoom scale on top of that, straight from the wrapper. */
  const [zoom, setZoom] = useState(1);
  /**
   * What the two above actually came out as on screen, measured. Only ever
   * used as a floor — see unitScale.
   */
  const [measuredPxScale, setMeasuredPxScale] = useState(0);

  /**
   * What the pointer is lighting up. A flat whose rooms are folded away
   * highlights whole; a surfaced room highlights alone.
   */
  const highlight = useMemo(() => {
    if (!hoverRoom) return null;
    const room = layer.rooms.get(hoverRoom);
    if (!room) return null;
    // While the view toggle reveals every room, each is its own target.
    const rooms = new Set(
      revealAll ? [hoverRoom] : highlightTargets(layer, hoverRoom),
    );
    // Outline the envelope when the whole flat is lit, the room's own ring
    // when it is not. groupOuterWalls gives the envelope's outline directly:
    // the walls whose two rooms are in different envelopes.
    const outline =
      rooms.size > 1 && room.group_id
        ? groupOuterWalls(layer, room.group_id)
        : [];
    return { rooms, outline, single: rooms.size === 1 };
  }, [layer, hoverRoom, revealAll]);

  const scene = useMemo(() => {
    const rooms = layer.roomsByFloor.get(floorId) ?? [];
    const roomIds = new Set(rooms.map((r) => r.id));

    const walls = layer.file.walls.filter(
      (w) => roomIds.has(w.room_a) || roomIds.has(w.room_b),
    );

    // viewBox from this floor's own geometry: floors have independent
    // coordinate systems, so a shared box would mis-frame all but one.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const w of walls) {
      for (const v of wallEnds(layer, w)) {
        minX = Math.min(minX, v.x);
        minY = Math.min(minY, v.y);
        maxX = Math.max(maxX, v.x);
        maxY = Math.max(maxY, v.y);
      }
    }

    const doors = layer.file.doors.filter(
      (d) => d.wall_id !== null && walls.some((w) => w.id === d.wall_id),
    );

    const glyphs: DeviceGlyph[] = [];
    for (const device of layer.file.devices) {
      if (device.floor_id !== floorId) continue;
      // deviceAnchor puts a reader on the side access is verified from,
      // derived from `guards` against the wall's room pair. A virtual door
      // returns null: it has no wall, so there is nowhere to draw it.
      const at = deviceAnchor(layer, device);
      if (!at) continue;
      glyphs.push({ device, x: at.x, y: at.y });
    }

    return {
      rooms,
      walls,
      doors,
      glyphs,
      viewBox: `${minX - PAD} ${minY - PAD} ${maxX - minX + PAD * 2} ${
        maxY - minY + PAD * 2
      }`,
    };
  }, [layer, floorId]);

  /**
   * Reading the CTM is the obvious way to learn the plan's scale and the
   * wrong one: the wrapper calls back before the browser has applied the
   * transform, so every zoom step measures the step before it. Markers then
   * shrank as the plan grew. The two factors are known exactly without
   * touching the DOM — the viewBox fit, which only layout changes, and the
   * wrapper's own scale — so compose them instead.
   */
  const measure = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const [, , vbW, vbH] = scene.viewBox.split(" ").map(Number);
    const w = svg.clientWidth;
    const h = svg.clientHeight;
    if (!w || !h || !vbW || !vbH) return;
    // `meet` fits the whole viewBox in, so the binding side is the one that
    // has to shrink most.
    const fit = Math.max(vbW / w, vbH / h);
    setFitScale((prev) => (Math.abs(prev - fit) < 1e-6 ? prev : fit));

    const ctm = svg.getScreenCTM();
    if (ctm?.a) {
      setMeasuredPxScale((prev) =>
        Math.abs(prev - ctm.a) < 1e-4 ? prev : ctm.a,
      );
    }
  }, [scene.viewBox]);

  // A frame late on purpose: a resize callback that measures straight away
  // reads the layout as it was before the resize.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const tick = () => requestAnimationFrame(measure);
    const frame = tick();
    const observer = new ResizeObserver(tick);
    observer.observe(svg);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [measure]);

  /**
   * Plan units per CSS pixel, now. The composed value is exact and never a
   * step behind; the measured one is slower but truthful, and serves as a
   * floor so that a layout measurement which has not caught up can shrink a
   * marker no further than MIN_DEVICE_PX.
   */
  const unitScale = Math.max(
    fitScale / zoom,
    measuredPxScale
      ? MIN_DEVICE_PX / (DEVICE_PX * measuredPxScale)
      : 0,
  );

  /** Screen pixels to the SVG's own user units, whatever the zoom and pan. */
  const toSvgPoint = useCallback((clientX: number, clientY: number): Point | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  }, []);

  const placing = tool === "door";
  const drawing = tool === "wall";
  const erasing = tool === "remove_wall";
  /** Each of these aims at the plan, so none may let a drag pan it. */
  const aiming = placing || drawing || erasing;

  /**
   * The point on a room's boundary that the pointer is offering. Unbounded
   * on purpose: a click in the middle of a room should still land somewhere,
   * and the operation snaps to the same place, so the line the user sees is
   * the line they get.
   */
  /**
   * Which room the pointer is in, hit-tested rather than taken from the
   * hover state. Hovering sets state, and a move handler reading that state
   * sees the value from before the pointer entered the room — so the first
   * move inside a room would snap to nothing.
   */
  const roomAt = useCallback(
    (pt: Point) => {
      for (const room of scene.rooms) {
        if (insideRings(pt, rings.get(room))) return room.id;
      }
      return null;
    },
    [scene.rooms, rings],
  );

  const snapTo = useCallback(
    (roomId: string, pt: Point) => {
      const room = layer.rooms.get(roomId);
      if (!room) return null;
      return nearestWallInRoom(layer, room, pt, Infinity)?.at ?? null;
    },
    [layer],
  );

  const cutRequest: DivideRoomRequest | null =
    cutFrom && cutTo
      ? { roomId: cutFrom.roomId, from: cutFrom.at, to: cutTo }
      : null;
  const cutError = cutRequest && divideError ? divideError(cutRequest) : null;

  const handleMove = useCallback(
    (e: React.MouseEvent) => {
      if (!aiming) return;
      const pt = toSvgPoint(e.clientX, e.clientY);
      if (!pt) return;
      if (drawing) {
        // Once a cut has started it stays in its own room: the second end
        // has to be a wall of the room being divided.
        const roomId = cutFrom?.roomId ?? roomAt(pt);
        setCutTo(roomId ? snapTo(roomId, pt) : null);
        return;
      }
      setHover(nearestWall(layer, floorId, pt, 45));
    },
    [aiming, drawing, cutFrom, roomAt, snapTo, toSvgPoint, layer, floorId],
  );

  /**
   * The hovered wall, but only while it still exists.
   *
   * Removing a wall deletes the very wall the pointer is resting on, and the
   * hit kept in state outlives it by a render. Anything that looks the wall
   * up then fails on a wall that is gone — and these lookups are meant to be
   * strict, so it is a thrown error and a blank screen, not a quiet null.
   */
  const liveHover = hover && layer.walls.has(hover.wallId) ? hover : null;

  // Only the door ghost wants this, and asking outside that tool means
  // running an add-door preview on every render for no reason.
  const hoverError =
    placing && liveHover && placementError ? placementError(liveHover) : null;

  const eraseError =
    erasing && liveHover && deleteWallError
      ? deleteWallError(liveHover.wallId)
      : null;

  return (
    <TransformWrapper
      minScale={0.4}
      maxScale={8}
      limitToBounds={false}
      doubleClick={{ mode: "reset" }}
      wheel={{ step: 0.08 }}
      // While the door tool is armed a drag must not pan the map, or every
      // attempt to place a door slides the plan instead.
      panning={{ disabled: aiming }}
      // Panning leaves the scale alone, so the equality guards keep a drag
      // from re-rendering the markers frame by frame.
      onTransform={(_ref, state) => {
        setZoom((prev) =>
          Math.abs(prev - state.scale) < 1e-6 ? prev : state.scale,
        );
        requestAnimationFrame(measure);
      }}
    >
      {(utils) => (
      <>
      <ControlsBridge utils={utils} onControls={onControls} />
      <TransformComponent
        wrapperStyle={{ width: "100%", height: "100%" }}
        contentStyle={{ width: "100%", height: "100%" }}
      >
        <svg
          ref={svgRef}
          viewBox={scene.viewBox}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            cursor: aiming ? "crosshair" : "default",
          }}
          onClick={() => {
            if (placing) {
              if (liveHover && onPlaceDoor) onPlaceDoor(liveHover);
              return;
            }
            if (erasing) {
              // Sent even when the preview is red, so the refusal can name
              // the reason rather than the click doing nothing.
              if (liveHover && onDeleteWall) onDeleteWall(liveHover.wallId);
              return;
            }
            // Clicking off the plan abandons a half-drawn wall rather than
            // leaving it armed and invisible.
            if (drawing) {
              setCutFrom(null);
              setCutTo(null);
              return;
            }
            onSelectRoom(null);
          }}
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* Room fills. Adjacent rooms in one envelope share a colour, so an
              apartment reads as one shape without its interior being drawn. */}
          {scene.rooms.map((room) => {
            const interior = rings.get(room);
            if (interior.length === 0) return null;

            const state = reach ? roomAccessState(reach, room.id) : "reachable";
            const selected =
              room.id === selectedRoomId || room.group_id === selectedGroupId;

            let fill = roomColor(layer, room);
            let fillOpacity = 0.85;
            if (state === "blocked") {
              fillOpacity = 0.3;
            } else if (state === "unexamined") {
              fill = "#B9BEC4";
              fillOpacity = 0.25;
            }

            return (
              <g key={room.id}>
                <path
                  d={ringsToPath(interior)}
                  fill={fill}
                  fillOpacity={selected ? 1 : fillOpacity}
                  fillRule="evenodd"
                  stroke={selected ? "#17406B" : "none"}
                  strokeWidth={selected ? 6 : 0}
                  style={{ cursor: aiming ? "crosshair" : "pointer" }}
                  onMouseEnter={() => !placing && setHoverRoom(room.id)}
                  onMouseLeave={() =>
                    setHoverRoom((cur) => (cur === room.id ? null : cur))
                  }
                  onClick={(e) => {
                    // The svg handler owns both of these: they act on a
                    // wall, which is not this room's to claim.
                    if (placing || erasing) return;
                    e.stopPropagation();

                    if (drawing) {
                      // Snapped from this click's own position rather than
                      // from what the last move left behind: a click that
                      // arrives before any move in this room would otherwise
                      // land nowhere.
                      const pt = toSvgPoint(e.clientX, e.clientY);
                      const at = pt && snapTo(room.id, pt);
                      if (!at) return;

                      // A click in another room starts again there, which is
                      // friendlier than refusing and explaining why.
                      if (!cutFrom || cutFrom.roomId !== room.id) {
                        setCutFrom({ roomId: room.id, at });
                        setCutTo(at);
                        return;
                      }
                      // Sent even when the preview is already red, the way
                      // the door tool does: the refusal names the reason,
                      // and a click that silently does nothing leaves the
                      // user guessing which rule they hit.
                      onDivideRoom?.({
                        roomId: room.id,
                        from: cutFrom.at,
                        to: at,
                      });
                      setCutFrom(null);
                      setCutTo(null);
                      return;
                    }

                    // The show tool is the only thing that puts a folded
                    // room on the map, and clicking one there shows it.
                    if (revealing) {
                      if (!isRoomListed(layer, room)) onShowRoom?.(room.id);
                      return;
                    }
                    if (hiding) {
                      if (isRoomListed(layer, room)) onHideRoom?.(room.id);
                      return;
                    }

                    // Otherwise a hidden room cannot be clicked: while its
                    // flat is folded the envelope is what the map offers.
                    if (!isRoomListed(layer, room)) {
                      onSelectGroup?.(room.group_id);
                      return;
                    }
                    onSelectRoom(room.id);
                  }}
                />
                {revealing && !isRoomListed(layer, room) && (
                  /* A folded room, drawn only because the show tool is
                     armed: dashed, to say it is not on the map yet. */
                  <path
                    d={ringsToPath(interior)}
                    fill="none"
                    fillRule="evenodd"
                    stroke="#2196f3"
                    strokeWidth={4}
                    strokeDasharray="10 8"
                    pointerEvents="none"
                  />
                )}
                {highlight?.rooms.has(room.id) && (
                  /* The lit area. Rooms in one flat share undrawn walls, so
                     filling each of them reads as a single shape. */
                  <path
                    d={ringsToPath(interior)}
                    fill="#2196f3"
                    fillOpacity={0.18}
                    fillRule="evenodd"
                    pointerEvents="none"
                  />
                )}
                {state === "blocked" && (
                  /* Blocked at a named door is actionable; never examined is
                     not. Rendering them the same grey hides which to fix. */
                  <path
                    d={ringsToPath(interior)}
                    fill="none"
                    fillRule="evenodd"
                    stroke="#C77700"
                    strokeWidth={5}
                    strokeDasharray="14 10"
                    pointerEvents="none"
                  />
                )}
              </g>
            );
          })}

          {/* Walls, with every door's opening removed. One derived rule decides
              which are drawn: the two rooms are in different envelopes, or
              either room is surfaced. */}
          {scene.walls.map((wall) => {
            if (!isWallVisible(layer, wall, revealAll)) return null;
            const [a, b] = wallEnds(layer, wall);
            return (
              <g key={wall.id}>
                {wallSolidSpans(layer, wall).map(([t0, t1], i) => {
                  const p = lerp(a, b, t0);
                  const q = lerp(a, b, t1);
                  return (
                    <line
                      key={i}
                      x1={p.x}
                      y1={p.y}
                      x2={q.x}
                      y2={q.y}
                      stroke={WALL_COLOR}
                      strokeWidth={6}
                      strokeLinecap="square"
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Swing arcs, drawn from t, width, hinge and swing alone. */}
          {scene.doors.map((door) => (
            <DoorSymbol
              key={door.id}
              layer={layer}
              door={door}
              showAllRooms={revealAll}
            />
          ))}

          {/* The lit outline, over the walls so it reads as one shape: the
              envelope's outer walls for a whole flat, the room's own ring
              for a surfaced room. */}
          {highlight && (
            <g pointerEvents="none">
              {highlight.single && hoverRoom
                ? (() => {
                    const room = layer.rooms.get(hoverRoom);
                    if (!room) return null;
                    return (
                      <path
                        d={ringsToPath(rings.get(room))}
                        fill="none"
                        fillRule="evenodd"
                        stroke="#2196f3"
                        strokeWidth={7}
                        strokeLinejoin="round"
                      />
                    );
                  })()
                : highlight.outline.map((wall) => {
                    const [a, b] = wallEnds(layer, wall);
                    return (
                      <line
                        key={wall.id}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke="#2196f3"
                        strokeWidth={7}
                        strokeLinecap="round"
                      />
                    );
                  })}
            </g>
          )}

          {/* Devices. A reader sits on the side access is verified from.
              The hovered one is drawn last so its name is not buried under a
              neighbour. */}
          {[...scene.glyphs]
            .sort((a, b) =>
              Number(a.device.id === hoverDevice) -
              Number(b.device.id === hoverDevice),
            )
            .map((glyph) => (
              <DeviceMarker
                key={glyph.device.id}
                id={glyph.device.id}
                name={glyph.device.name}
                deviceType={glyph.device.device_type}
                status={glyph.device.status}
                x={glyph.x}
                y={glyph.y}
                unitScale={unitScale}
                showStatus={showDeviceStatus}
                hovered={glyph.device.id === hoverDevice}
                onHover={setHoverDevice}
              />
            ))}

          {/* Labels: the room when it is visible, otherwise its envelope. */}
          <Labels
            layer={layer}
            floorId={floorId}
            rings={rings}
            showAllRooms={revealAll}
            unitScale={unitScale}
          />

          {/* The door the pointer would place, and whether it would be let. */}
          {placing && liveHover && (
            <DoorGhost layer={layer} hit={liveHover} error={hoverError} />
          )}

          {/* Just this wall. Where the two rooms share others, those stay
              standing inside the merged room, so highlighting them would
              promise a removal that does not happen. */}
          {erasing && liveHover && (
            <EraseGhost
              layer={layer}
              wallId={liveHover.wallId}
              error={eraseError}
            />
          )}

          {/* The wall being drawn. Both ends sit on the boundary already, so
              what is shown is what the operation would build. */}
          {drawing && (
            <g pointerEvents="none">
              {cutTo && !cutFrom && (
                <circle
                  cx={cutTo.x}
                  cy={cutTo.y}
                  r={7}
                  fill="#ffffff"
                  stroke={GHOST_OK}
                  strokeWidth={3}
                />
              )}
              {cutFrom && cutTo && (
                <>
                  <line
                    x1={cutFrom.at.x}
                    y1={cutFrom.at.y}
                    x2={cutTo.x}
                    y2={cutTo.y}
                    stroke={cutError ? GHOST_BAD : GHOST_OK}
                    strokeWidth={8}
                    strokeLinecap="round"
                    strokeDasharray="14 10"
                  />
                  {[cutFrom.at, cutTo].map((pt, i) => (
                    <circle
                      key={i}
                      cx={pt.x}
                      cy={pt.y}
                      r={7}
                      fill="#ffffff"
                      stroke={cutError ? GHOST_BAD : GHOST_OK}
                      strokeWidth={3}
                    />
                  ))}
                </>
              )}
            </g>
          )}
        </svg>
      </TransformComponent>
      </>
      )}
    </TransformWrapper>
  );
}

function DoorGhost({
  layer,
  hit,
  error,
}: {
  layer: VisualLayer;
  hit: WallHit;
  error: string | null;
}) {
  const wall = layer.walls.get(hit.wallId);
  if (!wall) return null;
  const [a, b] = wallEnds(layer, wall);
  const colour = error ? GHOST_BAD : GHOST_OK;

  // Half the standard width as a fraction, so the ghost is the real size.
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const half = 43.5 / (2 * length);
  const p1 = lerp(a, b, Math.max(0, hit.t - half));
  const p2 = lerp(a, b, Math.min(1, hit.t + half));

  return (
    <g pointerEvents="none">
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={colour}
        strokeOpacity={0.35}
        strokeWidth={10}
        strokeLinecap="round"
      />
      <line
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke={colour}
        strokeWidth={10}
        strokeLinecap="butt"
      />
    </g>
  );
}

function DoorSymbol({
  layer,
  door,
  showAllRooms,
}: {
  layer: VisualLayer;
  door: Door;
  showAllRooms: boolean;
}) {
  const wall = door.wall_id ? layer.walls.get(door.wall_id) : undefined;
  if (!wall || !isWallVisible(layer, wall, showAllRooms)) return null;

  const g = doorGeometry(layer, door);
  if (!g) return null;

  // An opening has no leaf: a wall, a position and a width, nothing more.
  if (door.kind === "opening") {
    return (
      <line
        x1={g.p1.x}
        y1={g.p1.y}
        x2={g.p2.x}
        y2={g.p2.y}
        stroke={DOOR_COLOR}
        strokeWidth={2}
        strokeDasharray="6 6"
      />
    );
  }

  const closed = add(g.hingePoint, g.alongWall, g.width);
  const open = add(g.hingePoint, g.openSide, g.width);
  const cross =
    (closed.x - g.hingePoint.x) * (open.y - g.hingePoint.y) -
    (closed.y - g.hingePoint.y) * (open.x - g.hingePoint.x);
  const sweep = cross > 0 ? 1 : 0;

  return (
    <g pointerEvents="none">
      <path
        d={`M ${closed.x} ${closed.y} A ${g.width} ${g.width} 0 0 ${sweep} ${open.x} ${open.y}`}
        fill="none"
        stroke={DOOR_COLOR}
        strokeWidth={2}
      />
      <line
        x1={g.hingePoint.x}
        y1={g.hingePoint.y}
        x2={open.x}
        y2={open.y}
        stroke={DOOR_COLOR}
        strokeWidth={3}
      />
    </g>
  );
}

/** The wall a click would take out, and whether it would be let. */
function EraseGhost({
  layer,
  wallId,
  error,
}: {
  layer: VisualLayer;
  wallId: string;
  error: string | null;
}) {
  const wall = layer.walls.get(wallId);
  if (!wall) return null;
  const [a, b] = wallEnds(layer, wall);
  return (
    <line
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      stroke={error ? GHOST_BAD : GHOST_OK}
      strokeWidth={12}
      strokeLinecap="round"
      strokeOpacity={0.75}
      pointerEvents="none"
    />
  );
}

function Labels({
  layer,
  floorId,
  rings,
  showAllRooms,
  unitScale,
}: {
  layer: VisualLayer;
  floorId: string;
  rings: RingCache;
  showAllRooms: boolean;
  /** Plan units per screen pixel, for clearing the constant-size markers. */
  unitScale: number;
}) {
  const labels = useMemo(() => {
    const rooms = layer.roomsByFloor.get(floorId) ?? [];
    const out: Array<{
      key: string;
      x: number;
      y: number;
      text: string;
      bold: boolean;
      /** Sits under a device marker, so it has to drop below it. */
      shifted: boolean;
    }> = [];

    // An envelope's name and its room-hosted device are placed by the same
    // rule, so they land on the same spot and the marker wins. The flats all
    // have an answering unit, which is to say every flat on the floor would
    // go unnamed.
    const occupied = new Set(
      layer.file.devices
        .filter((d) => d.floor_id === floorId && d.host_kind === "room")
        .map((d) => layer.rooms.get(d.host_id ?? "")?.group_id)
        .filter((g): g is string => Boolean(g)),
    );

    const grouped = new Map<string, typeof rooms>();
    for (const room of rooms) {
      const visible = showAllRooms || room.surfaced;
      if (visible) {
        const pt = labelPoint(rings.get(room));
        if (pt) {
          out.push({
            key: room.id,
            x: pt.x,
            y: pt.y,
            text: room.name,
            bold: false,
            shifted: false,
          });
        }
        continue;
      }
      // Hidden rooms are labelled by their envelope instead.
      const gid = room.group_id;
      if (!gid) continue;
      const list = grouped.get(gid);
      if (list) list.push(room);
      else grouped.set(gid, [room]);
    }

    for (const [groupId, members] of grouped) {
      const group = layer.groups.get(groupId);
      if (!group) continue;
      // Put it in the largest room of the envelope — the one with room to spare.
      let best = members[0];
      let bestArea = -1;
      for (const room of members) {
        const area = rings
          .get(room)
          .reduce((acc, ring) => acc + Math.abs(signedArea(ring)), 0);
        if (area > bestArea) {
          bestArea = area;
          best = room;
        }
      }
      const pt = labelPoint(rings.get(best));
      if (pt) {
        out.push({
          key: groupId,
          x: pt.x,
          y: pt.y,
          text: group.name,
          bold: true,
          shifted: occupied.has(groupId),
        });
      }
    }

    return out;
  }, [layer, floorId, rings, showAllRooms]);

  return (
    <g pointerEvents="none">
      {labels.map((l) => (
        <text
          key={l.key}
          x={l.x}
          // The marker holds its size in pixels while the text scales with
          // the plan, so the clearance has to be converted, not guessed.
          y={
            l.shifted
              ? l.y + (DEVICE_PX / 2) * unitScale + (l.bold ? 18 : 14)
              : l.y
          }
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={l.bold ? 24 : 18}
          fontWeight={l.bold ? 700 : 400}
          fill="#1C2024"
        >
          {l.text}
        </text>
      ))}
    </g>
  );
}

/** Exported for the legend: the types actually present on this floor. */
export function typesOnFloor(layer: VisualLayer, floorId: string): string[] {
  const rooms = layer.roomsByFloor.get(floorId) ?? [];
  const seen = new Set<string>();
  for (const room of rooms) {
    const t = accessType(layer, room);
    if (t) seen.add(t);
  }
  return [...seen];
}

/** Exported for the inspector: which rooms a door connects. */
export function doorRoomNames(layer: VisualLayer, door: Door): string[] {
  return roomsOf(layer, door).map((id) => layer.rooms.get(id)?.name ?? id);
}

/** Exported so the inspector can report a wall without re-deriving it. */
export function wallDescription(layer: VisualLayer, wall: Wall): string {
  const a = layer.rooms.get(wall.room_a)?.name ?? wall.room_a;
  const b = layer.rooms.get(wall.room_b)?.name ?? wall.room_b;
  return `${a} / ${b}`;
}

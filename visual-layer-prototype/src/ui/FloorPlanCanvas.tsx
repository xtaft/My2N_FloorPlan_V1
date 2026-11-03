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
  isWallVisible,
  labelPoint,
  lerp,
  nearestWall,
  ringsToPath,
  roomColor,
  roomsOf,
  signedArea,
  wallEnds,
  wallSolidSpans,
  type Device,
  type Door,
  type Point,
  type Reachability,
  type VisualLayer,
  type Wall,
  type WallHit,
} from "../model";
import { roomAccessState } from "../model";
import { DeviceMarker } from "./DeviceMarker";

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
  tool?: "select" | "door" | "show" | "hide";
  /** Called with the wall and side under the pointer when it is clicked. */
  onPlaceDoor?: (hit: WallHit) => void;
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
  /**
   * Plan units per CSS pixel, right now. Devices hold a constant size on
   * screen, so they need this to undo the plan's scale.
   */
  const [unitScale, setUnitScale] = useState(1);

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
   * The screen CTM already folds in everything that scales the plan — how the
   * viewBox fits the element, and the pan/zoom transform on top of it — so one
   * number off it beats tracking the two separately. Deriving it from the
   * layout box instead reads a size the browser has not settled yet.
   */
  const measureScale = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm || !ctm.a) return;
    const next = 1 / ctm.a;
    // Guarded so a measurement that lands on the same value does not spin.
    setUnitScale((prev) => (Math.abs(prev - next) < 1e-4 ? prev : next));
  }, []);

  // A frame late on purpose: a resize callback that reads the CTM straight
  // away gets the layout as it was before the resize.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const tick = () => requestAnimationFrame(measureScale);
    const frame = tick();
    const observer = new ResizeObserver(tick);
    observer.observe(svg);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [measureScale, scene.viewBox]);

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

  const handleMove = useCallback(
    (e: React.MouseEvent) => {
      if (!placing) return;
      const pt = toSvgPoint(e.clientX, e.clientY);
      if (!pt) return;
      setHover(nearestWall(layer, floorId, pt, 45));
    },
    [placing, toSvgPoint, layer, floorId],
  );

  const hoverError = hover && placementError ? placementError(hover) : null;

  return (
    <TransformWrapper
      minScale={0.4}
      maxScale={8}
      limitToBounds={false}
      doubleClick={{ mode: "reset" }}
      wheel={{ step: 0.08 }}
      // While the door tool is armed a drag must not pan the map, or every
      // attempt to place a door slides the plan instead.
      panning={{ disabled: placing }}
      // Panning leaves the scale alone, so the guard in measureScale keeps
      // a drag from re-rendering the markers frame by frame.
      onTransform={measureScale}
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
            cursor: placing ? "crosshair" : "default",
          }}
          onClick={() => {
            if (placing) {
              if (hover && onPlaceDoor) onPlaceDoor(hover);
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
                  style={{ cursor: placing ? "crosshair" : "pointer" }}
                  onMouseEnter={() => !placing && setHoverRoom(room.id)}
                  onMouseLeave={() =>
                    setHoverRoom((cur) => (cur === room.id ? null : cur))
                  }
                  onClick={(e) => {
                    if (placing) return; // the svg handler places the door
                    e.stopPropagation();

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
          />

          {/* The door the pointer would place, and whether it would be let. */}
          {placing && hover && (
            <DoorGhost layer={layer} hit={hover} error={hoverError} />
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

function Labels({
  layer,
  floorId,
  rings,
  showAllRooms,
}: {
  layer: VisualLayer;
  floorId: string;
  rings: RingCache;
  showAllRooms: boolean;
}) {
  const labels = useMemo(() => {
    const rooms = layer.roomsByFloor.get(floorId) ?? [];
    const out: Array<{ key: string; x: number; y: number; text: string; bold: boolean }> =
      [];

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
          y={l.y}
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

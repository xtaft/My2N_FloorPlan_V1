/**
 * The map. Everything drawn here is derived at render time from the stored
 * records — room shapes from wall sets, door openings from `t` and `width`,
 * reader positions from `guards`. Nothing is read out of the fixture that the
 * fixture does not store.
 */
import { useMemo } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import {
  RingCache,
  accessType,
  add,
  deviceAnchor,
  doorGeometry,
  isWallVisible,
  labelPoint,
  lerp,
  ringsToPath,
  roomColor,
  roomsOf,
  signedArea,
  wallEnds,
  wallSolidSpans,
  type Device,
  type Door,
  type Reachability,
  type VisualLayer,
  type Wall,
} from "../model";
import { roomAccessState } from "../model";

const WALL_COLOR = "#2E3338";
const DOOR_COLOR = "#5A646E";
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
}

interface DeviceGlyph {
  device: Device;
  x: number;
  y: number;
  label: string;
}

const DEVICE_LABEL: Record<string, string> = {
  access_unit: "AC",
  intercom: "IC",
  answering_unit: "AN",
};

export function FloorPlanCanvas({
  layer,
  floorId,
  showAllRooms,
  reach,
  selectedRoomId,
  selectedGroupId,
  onSelectRoom,
}: FloorPlanCanvasProps) {
  const rings = useMemo(() => new RingCache(layer), [layer]);

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
      // deviceAnchor puts a reader on the side it guards, derived from
      // `guards` against the wall's room pair. A virtual door returns null:
      // it has no wall, so there is nowhere on the map to draw it.
      const at = deviceAnchor(layer, device);
      if (!at) continue;
      glyphs.push({
        device,
        x: at.x,
        y: at.y,
        label: DEVICE_LABEL[device.device_type] ?? "?",
      });
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

  return (
    <TransformWrapper
      minScale={0.4}
      maxScale={8}
      limitToBounds={false}
      doubleClick={{ mode: "reset" }}
      wheel={{ step: 0.08 }}
    >
      <TransformComponent
        wrapperStyle={{ width: "100%", height: "100%" }}
        contentStyle={{ width: "100%", height: "100%" }}
      >
        <svg
          viewBox={scene.viewBox}
          style={{ width: "100%", height: "100%", display: "block" }}
          onClick={() => onSelectRoom(null)}
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
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectRoom(room.id);
                  }}
                />
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
            if (!isWallVisible(layer, wall, showAllRooms)) return null;
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
              showAllRooms={showAllRooms}
            />
          ))}

          {/* Devices. A reader sits on the side it guards. */}
          {scene.glyphs.map((glyph) => (
            <g key={glyph.device.id} pointerEvents="none">
              <circle
                cx={glyph.x}
                cy={glyph.y}
                r={13}
                fill="#FFFFFF"
                stroke="#17406B"
                strokeWidth={3}
              />
              <text
                x={glyph.x}
                y={glyph.y + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill="#17406B"
              >
                {glyph.label}
              </text>
            </g>
          ))}

          {/* Labels: the room when it is visible, otherwise its envelope. */}
          <Labels
            layer={layer}
            floorId={floorId}
            rings={rings}
            showAllRooms={showAllRooms}
          />
        </svg>
      </TransformComponent>
    </TransformWrapper>
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
  return roomsOf(layer, door).map(
    (id) => layer.rooms.get(id)?.name ?? id,
  );
}

/** Exported so the inspector can report a wall without re-deriving it. */
export function wallDescription(layer: VisualLayer, wall: Wall): string {
  const a = layer.rooms.get(wall.room_a)?.name ?? wall.room_a;
  const b = layer.rooms.get(wall.room_b)?.name ?? wall.room_b;
  return `${a} / ${b}`;
}

/**
 * The map. Everything drawn here is derived at render time from the stored
 * records — room shapes from wall sets, door openings from `t` and `width`,
 * reader positions from `guards`. Nothing is read out of the fixture that the
 * fixture does not store.
 */
import type { ReactNode } from "react";
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
  freeDoorSides,
  goesOnDoors,
  normal,
  negate,
  unit,
  DEVICE_OFFSET,
  roomsOf,
  signedArea,
  wallEnds,
  wallSolidSpans,
  type Device,
  type DivideRoomRequest,
  type Door,
  type Point,
  type Reachability,
  type Room,
  type Vertex,
  type VisualLayer,
  type Wall,
  type WallHit,
} from "../model";
import { roomAccessState } from "../model";
import { DEVICE_PX, DeviceMarker } from "./DeviceMarker";
import { SPACE_MIME } from "./edit/spaceDrag";

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
   * Clicking a space or a door opens its menu where the pointer is. The
   * plan is the other place these things are reached from, and reaching
   * them only through the tree would hide half of them — circulation is
   * not listed there at all.
   */
  onSpaceMenu?: (
    target: { kind: "room" | "group"; id: string },
    at: { top: number; left: number },
  ) => void;
  onDoorMenu?: (doorId: string, at: { top: number; left: number }) => void;
  /**
   * The door whose menu is open, drawn lit. Doors are only selectable
   * where `onDoorMenu` is given, which is structure mode — in devices
   * mode a click on a doorway is after the device on it, not the doorway.
   */
  selectedDoorId?: string | null;
  /** The device whose menu is open, drawn lit. */
  selectedDeviceId?: string | null;
  /** Clicking a device opens its menu where the pointer is. */
  onDeviceMenu?: (deviceId: string, at: { top: number; left: number }) => void;
  /**
   * The device being dragged from the devices panel, while it is in the
   * air. Its kind decides what the plan offers to catch it: a reader or
   * an intercom gets the free sides of every doorway, an answering unit
   * gets the spaces.
   */
  dragging?: { id: string; deviceType: string } | null;
  /** Dropped on one side of a doorway. */
  onDropOnDoor?: (deviceId: string, doorId: string, side: "a" | "b") => void;
  /** Dropped inside a space. */
  onDropInSpace?: (deviceId: string, roomId: string) => void;
  /**
   * A space from the import list is waiting for a shape, so the next click
   * on a room gives it one instead of opening that room's menu.
   */
  placingSpace?: boolean;
  onPlaceSpace?: (roomId: string) => void;
  /**
   * A space from the list dropped onto a room. Rooms only: an envelope is
   * a set of spaces rather than one, and a door is not a space at all, so
   * neither has a shape to give.
   */
  onDropSpace?: (spaceId: string, roomId: string) => void;
  /**
   * Device status badges. Off while editing: the editor is for changing the
   * plan, and whether a reader is reachable today is not part of that.
   */
  showDeviceStatus?: boolean;
  /**
   * Whether to draw the devices at all. Off while the plan is being
   * checked: nothing is placed yet at that point, and the question on
   * screen is about spaces.
   */
  showDevices?: boolean;
  /**
   * What colour to fill a room with, overriding its category's own.
   * Returning null leaves it bare — still clickable, but drawn as walls
   * alone. The check screen uses this so that the only colour on the plan
   * is the colour of the thing it is asking about.
   */
  paint?: (room: Room) => string | null;
  /**
   * Drawn over the plan in the plan's own coordinates — a guide rather
   * than part of the building. The check screen puts the floor below's
   * shafts here so the misalignment is visible without opening a tool.
   */
  overlay?: ReactNode;
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
  onSpaceMenu,
  onDoorMenu,
  selectedDoorId = null,
  selectedDeviceId = null,
  onDeviceMenu,
  dragging = null,
  onDropOnDoor,
  onDropInSpace,
  placingSpace = false,
  onPlaceSpace,
  onDropSpace,
  showDeviceStatus = true,
  showDevices = true,
  paint,
  overlay,
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
  const [hoverDoor, setHoverDoor] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    doorId: string;
    side: "a" | "b";
  } | null>(null);
  // Switching out of structure mode is not a pointer move, so the lit
  // door would otherwise stay lit until the pointer happened to move.
  useEffect(() => {
    if (!onDoorMenu) setHoverDoor(null);
  }, [onDoorMenu]);
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
  const aiming = placing || drawing || erasing || placingSpace;

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

  /** Distance from a point to a segment, for finding the door clicked. */
  const doorAt = useCallback(
    (pt: Point) => {
      let best: { door: Door; d: number } | null = null;
      for (const door of scene.doors) {
        const g = doorGeometry(layer, door);
        if (!g) continue;
        const dx = g.p2.x - g.p1.x;
        const dy = g.p2.y - g.p1.y;
        const lenSq = dx * dx || dy * dy ? dx * dx + dy * dy : 0;
        if (lenSq === 0) continue;
        let t = ((pt.x - g.p1.x) * dx + (pt.y - g.p1.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(
          pt.x - (g.p1.x + dx * t),
          pt.y - (g.p1.y + dy * t),
        );
        if (d <= 20 && (!best || d < best.d)) best = { door, d };
      }
      return best?.door ?? null;
    },
    [scene.doors, layer],
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
      const pt = toSvgPoint(e.clientX, e.clientY);
      if (!pt) return;

      // A door is a thin thing on a room's edge, so what the pointer is
      // over is decided by distance rather than by hit area — the same
      // way the click does it, or the two would disagree. Set either way
      // rather than read-then-set: this runs from a memoised callback,
      // and a stale read would leave a door lit after the mode changed.
      const overDoor = onDoorMenu && !aiming ? (doorAt(pt)?.id ?? null) : null;
      setHoverDoor((cur) => (cur === overDoor ? cur : overDoor));

      // Which marker the pointer is over, worked out here because the
      // markers themselves take no pointer events — see DeviceMarker.
      if (!aiming) {
        const reach = (DEVICE_PX / 2) * unitScale;
        let near: string | null = null;
        let best = reach;
        for (const glyph of scene.glyphs) {
          const d = Math.hypot(pt.x - glyph.x, pt.y - glyph.y);
          if (d <= best) {
            best = d;
            near = glyph.device.id;
          }
        }
        setHoverDevice((cur) => (cur === near ? cur : near));
        return;
      }
      if (drawing) {
        // Once a cut has started it stays in its own room: the second end
        // has to be a wall of the room being divided.
        const roomId = cutFrom?.roomId ?? roomAt(pt);
        setCutTo(roomId ? snapTo(roomId, pt) : null);
        return;
      }
      setHover(nearestWall(layer, floorId, pt, 45));
    },
    [
      aiming,
      drawing,
      cutFrom,
      doorAt,
      onDoorMenu,
      roomAt,
      snapTo,
      toSvgPoint,
      layer,
      floorId,
      scene.glyphs,
      unitScale,
    ],
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

            // "transparent" rather than "none": a bare room still has to
            // take a click, and fill="none" has no interior to hit.
            const painted = paint ? paint(room) : roomColor(layer, room);
            let fill = painted ?? "transparent";
            let fillOpacity = painted === null ? 1 : 0.85;
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
                  // Rooms are the only drop target. The highlight that
                  // follows the pointer is the whole of the feedback: it
                  // says which space would take the name.
                  onDragOver={(e) => {
                    // A room catches a space from the list, and an
                    // answering unit, which belongs in a space rather
                    // than at a doorway.
                    const unit =
                      dragging && !goesOnDoors(dragging.deviceType);
                    if (!onDropSpace && !unit) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setHoverRoom(room.id);
                  }}
                  onDrop={(e) => {
                    if (dragging && !goesOnDoors(dragging.deviceType)) {
                      e.preventDefault();
                      setHoverRoom(null);
                      onDropInSpace?.(dragging.id, room.id);
                      return;
                    }
                    if (!onDropSpace) return;
                    e.preventDefault();
                    const spaceId =
                      e.dataTransfer.getData(SPACE_MIME) ||
                      e.dataTransfer.getData("text/plain");
                    if (spaceId) onDropSpace(spaceId, room.id);
                    setHoverRoom(null);
                  }}
                  onMouseEnter={() => !placing && setHoverRoom(room.id)}
                  onMouseLeave={() =>
                    setHoverRoom((cur) => (cur === room.id ? null : cur))
                  }
                  onClick={(e) => {
                    // The svg handler owns both of these: they act on a
                    // wall, which is not this room's to claim.
                    if (placing || erasing) return;
                    e.stopPropagation();

                    // A space waiting for a shape takes the next room
                    // clicked, rather than that room opening its menu.
                    if (placingSpace) {
                      onPlaceSpace?.(room.id);
                      return;
                    }

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

                    // A door sits on a room's edge, so the click lands on
                    // the room's shape; it has to be asked about first or a
                    // door could never be clicked at all.
                    const pt = toSvgPoint(e.clientX, e.clientY);
                    const door = pt && doorAt(pt);
                    if (door) {
                      onDoorMenu?.(door.id, {
                        top: e.clientY,
                        left: e.clientX,
                      });
                      return;
                    }

                    // Otherwise a hidden room cannot be clicked: while its
                    // flat is folded the envelope is what the map offers.
                    if (!isRoomListed(layer, room)) {
                      onSelectGroup?.(room.group_id);
                      if (room.group_id) {
                        onSpaceMenu?.(
                          { kind: "group", id: room.group_id },
                          { top: e.clientY, left: e.clientX },
                        );
                      }
                      return;
                    }
                    onSelectRoom(room.id);
                    onSpaceMenu?.(
                      { kind: "room", id: room.id },
                      { top: e.clientY, left: e.clientX },
                    );
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
              lit={
                door.id === selectedDoorId
                  ? "selected"
                  : door.id === hoverDoor
                    ? "hover"
                    : null
              }
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

          {/* Where a dragged device can land.

              A reader is offered the free sides of every doorway on the
              floor: two halves where nothing reads yet, one where
              something already does, none where both are taken. Which
              half you drop on is the whole of the choice — it is the
              side the device reads from, and it fixes the room it
              checks as the one on the other side.

              An answering unit is offered the spaces instead, because a
              unit is not something you badge at. */}
          {dragging && goesOnDoors(dragging.deviceType) &&
            scene.doors.map((door) =>
              freeDoorSides(layer, door.id).map((free) => {
                const half = doorHalf(layer, door, free.side);
                if (!half) return null;
                return (
                  <path
                    key={`drop:${door.id}:${free.side}`}
                    d={half}
                    fill="#2196f3"
                    fillOpacity={
                      dropTarget?.doorId === door.id &&
                      dropTarget.side === free.side
                        ? 0.55
                        : 0.2
                    }
                    stroke="#2196f3"
                    strokeWidth={2}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDropTarget({ doorId: door.id, side: free.side });
                    }}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDropTarget(null);
                      onDropOnDoor?.(dragging.id, door.id, free.side);
                    }}
                  />
                );
              }),
            )}

          {/* Hit targets for the devices, above everything.
              Markers themselves take no pointer events, so that a reader
              sitting on a doorway cannot swallow the click meant for the
              door. Devices mode has no door selection to protect, and a
              marker on an exterior door sits outside every room — so
              there is nothing else under it to carry the click. */}
          {onDeviceMenu &&
            scene.glyphs.map((glyph) => (
              <circle
                key={`hit:${glyph.device.id}`}
                cx={glyph.x}
                cy={glyph.y}
                r={(DEVICE_PX / 2) * unitScale}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHoverDevice(glyph.device.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeviceMenu(glyph.device.id, {
                    top: e.clientY,
                    left: e.clientX,
                  });
                }}
              />
            ))}

          {overlay}

          {/* Devices. A reader sits on the side access is verified from.
              The hovered one is drawn last so its name is not buried under a
              neighbour. */}
          {/* Which way each reader checks.

              A device reads from the side it is on and admits you to the
              other, and nothing else on the plan says so — the marker is
              symmetrical and the room beyond looks the same as the room
              behind. A short arrow across the doorway does say it, and it
              is drawn from the model rather than from the drawing: the
              direction is the device's own anchor offset, reversed. */}
          {showDevices &&
            scene.glyphs.map((glyph) => {
              const arrow = checkArrow(layer, glyph.device, glyph, unitScale);
              return arrow ? (
                <path
                  key={`dir:${glyph.device.id}`}
                  d={arrow}
                  fill="none"
                  stroke="#17406B"
                  strokeWidth={2 * unitScale}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              ) : null;
            })}

          {(showDevices ? [...scene.glyphs] : [])
            .sort((a, b) =>
              Number(a.device.id === hoverDevice) -
              Number(b.device.id === hoverDevice),
            )
            .map((glyph) => (
              <DeviceMarker
                key={glyph.device.id}
                name={glyph.device.name}
                deviceType={glyph.device.device_type}
                status={glyph.device.status}
                x={glyph.x}
                y={glyph.y}
                unitScale={unitScale}
                showStatus={showDeviceStatus}
                hovered={
                  glyph.device.id === hoverDevice ||
                  glyph.device.id === selectedDeviceId
                }
              />
            ))}

          {/* Stairs and lifts carry their own mark, from their category. */}
          {scene.rooms.map((room) => {
            const type = accessType(layer, room);
            if (type !== "stairs" && type !== "elevator") return null;
            return (
              <ShaftMark
                key={`shaft-${room.id}`}
                room={room}
                kind={type}
                rings={rings.get(room)}
              />
            );
          })}

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

/**
 * The arrow saying which way a device checks.
 *
 * It starts just past the marker and crosses the opening, pointing at
 * the room the device admits you to. The direction comes out of the
 * anchor: a door device is drawn one `DEVICE_OFFSET` to its own side of
 * the wall midpoint, so the vector from the opening to the marker,
 * reversed, is the way in.
 *
 * Nothing is drawn for a device in a space. An answering unit does not
 * check a way through, so an arrow would be claiming something.
 */
function checkArrow(
  layer: VisualLayer,
  device: Device,
  at: { x: number; y: number },
  unitScale: number,
): string | null {
  if (device.host_kind !== "door" || device.host_id === null) return null;
  const door = layer.doors.get(device.host_id);
  if (!door || door.wall_id === null) return null;
  const g = doorGeometry(layer, door);
  if (!g) return null;

  const mid = { x: (g.p1.x + g.p2.x) / 2, y: (g.p1.y + g.p2.y) / 2 };
  const away = unit({ x: mid.x - at.x, y: mid.y - at.y });
  if (!Number.isFinite(away.x) || !Number.isFinite(away.y)) return null;

  // Held off the marker, and sized against the marker rather than the
  // plan, so it stays legible at every zoom.
  const px = unitScale;
  const from = add(at, away, 16 * px);
  const to = add(from, away, 14 * px);
  const side = { x: -away.y, y: away.x };
  const barbA = add(add(to, away, -5 * px), side, 4 * px);
  const barbB = add(add(to, away, -5 * px), side, -4 * px);

  return [
    `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
    `M ${barbA.x} ${barbA.y} L ${to.x} ${to.y} L ${barbB.x} ${barbB.y}`,
  ].join(" ");
}

/**
 * A half-disc on one side of a doorway: where a reader would go.
 *
 * Centred on the opening and bulging toward the side it stands for, so
 * the shape sits exactly where the device will be drawn if it is dropped
 * there. The sweep is worked out rather than guessed: walking the wall
 * from one end of the opening to the other, the clockwise half is the
 * one on the `perp` side, and the arc bulges the other way when the side
 * is the other way.
 */
function doorHalf(
  layer: VisualLayer,
  door: Door,
  side: "a" | "b",
): string | null {
  if (door.wall_id === null) return null;
  const wall = layer.walls.get(door.wall_id);
  const g = doorGeometry(layer, door);
  if (!wall || !g) return null;

  const mid = { x: (g.p1.x + g.p2.x) / 2, y: (g.p1.y + g.p2.y) / 2 };
  const n = unit(normal(layer, wall)); // toward room_a
  const dir = side === "a" ? n : negate(n);
  const along = unit({ x: g.p2.x - g.p1.x, y: g.p2.y - g.p1.y });

  // Wide enough to read as a target beside a 40px marker, and never
  // narrower than the opening it belongs to.
  const r = Math.max(g.width * 0.75, DEVICE_OFFSET * 1.6);
  const start = add(mid, along, r);
  const end = add(mid, along, -r);

  // In screen coordinates a clockwise sweep from start passes through
  // mid + perp*r, so the flag follows which side perp is on.
  const perp = { x: -along.y, y: along.x };
  const sweep = perp.x * dir.x + perp.y * dir.y > 0 ? 1 : 0;

  return `M ${start.x} ${start.y} A ${r} ${r} 0 0 ${sweep} ${end.x} ${end.y} Z`;
}

function DoorSymbol({
  layer,
  door,
  showAllRooms,
  lit = null,
}: {
  layer: VisualLayer;
  door: Door;
  showAllRooms: boolean;
  /** Under the pointer, or the one whose menu is open. */
  lit?: "hover" | "selected" | null;
}) {
  const wall = door.wall_id ? layer.walls.get(door.wall_id) : undefined;
  if (!wall || !isWallVisible(layer, wall, showAllRooms)) return null;

  const g = doorGeometry(layer, door);
  if (!g) return null;

  // The lit band runs along the opening itself rather than round the
  // leaf: the opening is the part of a door that is in the wall, and it
  // is the same shape whichever way the leaf has been flipped.
  const band = lit ? (
    <line
      x1={g.p1.x}
      y1={g.p1.y}
      x2={g.p2.x}
      y2={g.p2.y}
      stroke="#2196f3"
      strokeOpacity={lit === "selected" ? 0.9 : 0.4}
      strokeWidth={14}
      strokeLinecap="round"
    />
  ) : null;

  // An opening has no leaf: a wall, a position and a width, nothing more.
  if (door.kind === "opening") {
    return (
      <g pointerEvents="none">
        {band}
        <line
          x1={g.p1.x}
          y1={g.p1.y}
          x2={g.p2.x}
          y2={g.p2.y}
          stroke={DOOR_COLOR}
          strokeWidth={2}
          strokeDasharray="6 6"
        />
      </g>
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
      {band}
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

/**
 * The mark that says a space is vertical circulation: treads for a stair, a
 * cross for a lift shaft — the two symbols a floor plan already uses, so
 * nobody has to be told what they mean.
 *
 * Drawn from the category rather than from any flag of its own. A room is
 * stairs because it is in the stairs category, and the plan should not be
 * able to disagree with the drawer about that.
 *
 * Both are clipped to the room, so an L-shaped stairwell gets treads that
 * stop at its walls instead of a rectangle of lines laid over the top.
 */
function ShaftMark({
  room,
  kind,
  rings,
}: {
  room: Room;
  kind: "stairs" | "elevator";
  rings: Vertex[][];
}) {
  if (rings.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const v of ring) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
    }
  }
  const w = maxX - minX;
  const h = maxY - minY;
  if (w <= 0 || h <= 0) return null;

  const clipId = `shaft-${room.id}`;
  const stroke = WALL_COLOR;

  let marks: React.ReactNode;
  if (kind === "elevator") {
    // The surveyor's cross, corner to corner of the shaft.
    marks = (
      <>
        <line x1={minX} y1={minY} x2={maxX} y2={maxY} />
        <line x1={minX} y1={maxY} x2={maxX} y2={minY} />
      </>
    );
  } else {
    // Treads run across the flight, so they divide the long axis.
    const along = w >= h;
    const span = along ? w : h;
    const count = Math.max(2, Math.min(14, Math.round(span / 26)));
    const step = span / count;
    const lines = [];
    for (let i = 1; i < count; i += 1) {
      const at = (along ? minX : minY) + step * i;
      lines.push(
        along ? (
          <line key={i} x1={at} y1={minY} x2={at} y2={maxY} />
        ) : (
          <line key={i} x1={minX} y1={at} x2={maxX} y2={at} />
        ),
      );
    }
    marks = <>{lines}</>;
  }

  return (
    <g pointerEvents="none">
      <clipPath id={clipId}>
        <path d={ringsToPath(rings)} clipRule="evenodd" />
      </clipPath>
      <g
        clipPath={`url(#${clipId})`}
        stroke={stroke}
        strokeWidth={3}
        strokeOpacity={0.55}
        fill="none"
      >
        {marks}
      </g>
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

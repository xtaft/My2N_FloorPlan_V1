/**
 * Align mode: fitting a floor onto the one below it.
 *
 * Its own view rather than a mode inside the map, because almost nothing the
 * map does applies here. Rooms are not selectable, tools are not armed, and
 * two floors are on screen at once in different coordinate systems — the one
 * below in the building's, this one in its own until the transform says
 * otherwise.
 *
 * The floor below is drawn twice: all its walls at 20% so the fit can be
 * judged as a whole, and its shafts dashed at full strength because those are
 * the targets. A stair core can land perfectly while the floor plate is two
 * metres out, and only the faint walls show that.
 *
 * The bar sets position and scale. Rotation stays in the transform, is drawn
 * and committed like the rest of it, and keeps whatever value the floor
 * already had — there is just no control for it, since plans drawn at an
 * angle are rare enough not to earn permanent space here.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  TransformComponent,
  TransformWrapper,
} from "react-zoom-pan-pinch";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Slider from "@mui/material/Slider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  applyTransform,
  floorShaftRings,
  floorTransform,
  interiorRings,
  landingsFor,
  referenceFloor,
  ringsOf,
  ringsToPath,
  roomColor,
  shaftSpaces,
  wallEnds,
  type Point,
  type Transform,
  type VisualLayer,
} from "../../model";

const UNDER = "#8A93A0";
const TARGET = "#2196f3";
const LANDED = "#2e7d32";
const WALL = "#2E3338";
const PAD = 80;

export interface AlignFloorViewProps {
  layer: VisualLayer;
  floorId: string;
  transform: Transform;
  onTransformChange: (t: Transform) => void;
  onApply: () => void;
  onCancel: () => void;
}

/** SVG applies these right to left, which is scale, then turn, then slide. */
function svgTransform(t: Transform): string {
  const deg = (t.rotation * 180) / Math.PI;
  return `translate(${t.dx} ${t.dy}) rotate(${deg}) scale(${t.scale})`;
}

export function AlignFloorView({
  layer,
  floorId,
  transform,
  onTransformChange,
  onApply,
  onCancel,
}: AlignFloorViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ from: Point; at: Transform } | null>(null);
  const [dragging, setDragging] = useState(false);

  const below = referenceFloor(layer, floorId);

  const scene = useMemo(() => {
    const belowT = below ? floorTransform(below) : null;

    const underWalls = below
      ? layer.file.walls
          .filter((w) => {
            const room =
              layer.rooms.get(w.room_a) ?? layer.rooms.get(w.room_b);
            return room?.floor_id === below.id;
          })
          .map((w) => {
            const [a, b] = wallEnds(layer, w);
            return {
              id: w.id,
              a: applyTransform(belowT!, a),
              b: applyTransform(belowT!, b),
            };
          })
      : [];

    const targets = below
      ? floorShaftRings(layer, below.id).map((s) => ({
          ...s,
          rings: s.rings.map((ring) =>
            ring.map((v) => ({ ...applyTransform(belowT!, v), id: v.id })),
          ),
        }))
      : [];

    const mine = (layer.roomsByFloor.get(floorId) ?? []).map((room) => ({
      room,
      rings: interiorRings(ringsOf(layer, room)),
    }));

    const myShafts = new Set(shaftSpaces(layer, floorId).map((s) => s.groupId));

    // The box has to hold both floors, this one where the transform puts it.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const see = (p: Point) => {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    };
    for (const w of underWalls) {
      see(w.a);
      see(w.b);
    }
    for (const r of mine) {
      for (const ring of r.rings) {
        for (const v of ring) see(applyTransform(transform, v));
      }
    }
    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 1000;
      maxY = 1000;
    }

    return {
      underWalls,
      targets,
      mine,
      myShafts,
      viewBox: `${minX - PAD} ${minY - PAD} ${maxX - minX + PAD * 2} ${
        maxY - minY + PAD * 2
      }`,
    };
  }, [layer, floorId, below, transform]);

  const landings = useMemo(
    () => landingsFor(layer, floorId, transform),
    [layer, floorId, transform],
  );
  /** Pointer position in the building's coordinates. */
  const toPlan = useCallback((clientX: number, clientY: number): Point | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const onDown = (e: React.MouseEvent) => {
    const from = toPlan(e.clientX, e.clientY);
    if (!from) return;
    drag.current = { from, at: transform };
    setDragging(true);
  };

  const onMove = (e: React.MouseEvent) => {
    const d = drag.current;
    if (!d) return;
    const now = toPlan(e.clientX, e.clientY);
    if (!now) return;
    onTransformChange({
      ...d.at,
      dx: d.at.dx + (now.x - d.from.x),
      dy: d.at.dy + (now.y - d.from.y),
    });
  };

  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  const paired = [...landings.values()].filter(Boolean).length;
  const total = landings.size;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          px: 3,
          py: 1.5,
          display: "flex",
          alignItems: "center",
          gap: 3,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Typography variant="subtitle2" sx={{ flexShrink: 0 }}>
          Fitting onto {below?.name ?? "nothing"}
        </Typography>

        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 220 }}>
          <Typography variant="caption" color="text.secondary">
            Scale
          </Typography>
          <Slider
            size="small"
            min={0.4}
            max={2.5}
            step={0.005}
            value={transform.scale}
            onChange={(_e, v) =>
              onTransformChange({ ...transform, scale: v as number })
            }
            sx={{ width: 120 }}
          />
          <Typography variant="caption" sx={{ width: 44 }}>
            {Math.round(transform.scale * 100)}%
          </Typography>
        </Stack>

        <Box sx={{ flex: 1 }} />

        <Chip
          size="small"
          color={paired > 0 ? "success" : "default"}
          variant={paired > 0 ? "filled" : "outlined"}
          label={
            total === 0
              ? "no shafts on this floor"
              : `${paired} of ${total} shafts paired`
          }
        />
        <Divider orientation="vertical" flexItem />
        <Button color="inherit" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="contained" onClick={onApply}>
          Apply
        </Button>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0 }}>
        <TransformWrapper
          minScale={0.3}
          maxScale={8}
          limitToBounds={false}
          doubleClick={{ mode: "reset" }}
          wheel={{ step: 0.08 }}
          // Dragging moves the floor, not the view; the wheel still zooms.
          panning={{ disabled: true }}
        >
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
                cursor: dragging ? "grabbing" : "grab",
              }}
              onMouseDown={onDown}
              onMouseMove={onMove}
              onMouseUp={endDrag}
              onMouseLeave={endDrag}
            >
              {/* The floor below, faint: context for whether the whole plate
                  sits right, not just the cores. */}
              <g opacity={0.2}>
                {scene.underWalls.map((w) => (
                  <line
                    key={w.id}
                    x1={w.a.x}
                    y1={w.a.y}
                    x2={w.b.x}
                    y2={w.b.y}
                    stroke={UNDER}
                    strokeWidth={7}
                    strokeLinecap="round"
                  />
                ))}
              </g>

              {/* Its shafts: the things to land on. */}
              {scene.targets.map((t) => (
                <path
                  key={t.groupId}
                  d={ringsToPath(t.rings)}
                  fill="none"
                  fillRule="evenodd"
                  stroke={TARGET}
                  strokeWidth={6}
                  strokeDasharray="16 12"
                />
              ))}

              {/* This floor, where the transform currently puts it. */}
              <g transform={svgTransform(transform)}>
                {scene.mine.map(({ room, rings }) => {
                  if (rings.length === 0) return null;
                  const isShaft =
                    room.group_id !== null && scene.myShafts.has(room.group_id);
                  return (
                    <path
                      key={room.id}
                      d={ringsToPath(rings)}
                      fill={isShaft ? LANDED : roomColor(layer, room)}
                      fillOpacity={isShaft ? 0.75 : 0.5}
                      fillRule="evenodd"
                      stroke={isShaft ? LANDED : WALL}
                      strokeWidth={isShaft ? 6 : 2}
                    />
                  );
                })}
              </g>
            </svg>
          </TransformComponent>
        </TransformWrapper>
      </Box>
    </Box>
  );
}

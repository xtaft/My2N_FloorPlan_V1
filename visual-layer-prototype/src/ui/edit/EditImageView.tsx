/**
 * Edit image: putting a floor's background where it belongs.
 *
 * The same shape as align mode, because it is the same act on a
 * different thing — something is slid and sized against the plan until
 * the two agree, and nothing is stored until Apply. Here it is the
 * image that moves and the plan that stays: a scan of a floor plan has
 * margins and a title block, so it is never the right size as it lands,
 * and the walls on it have to be brought under the walls drawn.
 *
 * Drag moves the image. The slider sizes it about its own middle, as a
 * percentage of the size it had when this opened, so 100% is always
 * "as it was". The plan is drawn over the image with its rooms thinned,
 * so both can be seen at once.
 *
 * The frame is fixed for as long as this is open — the plan and the
 * image as they were — or the plan would slide under the pointer as
 * the image grew.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  TransformComponent,
  TransformWrapper,
} from "react-zoom-pan-pinch";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Slider from "@mui/material/Slider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  floorExtent,
  interiorRings,
  ringsOf,
  ringsToPath,
  roomColor,
  scaleRect,
  type PlanRect,
  type Point,
  type VisualLayer,
} from "../../model";
import { WheelZoom } from "../wheelZoom";
import { PlanGrid } from "../planGrid";

const WALL = "#2E3338";
const OUTLINE = "#2196f3";
const PAD = 80;
const MIN_SCALE = 0.3;
const MAX_SCALE = 8;
/** How small and how large the slider goes, against the size it opened at. */
const SMALLEST = 0.1;
const LARGEST = 4;

export interface EditImageViewProps {
  layer: VisualLayer;
  floorId: string;
  /** The image itself. */
  src: string;
  /** Where the image is being tried, in the floor's coordinates. */
  rect: PlanRect;
  onRectChange: (rect: PlanRect) => void;
  onApply: () => void;
  onCancel: () => void;
}

export function EditImageView({
  layer,
  floorId,
  src,
  rect,
  onRectChange,
  onApply,
  onCancel,
}: EditImageViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ from: Point; at: PlanRect } | null>(null);
  const [dragging, setDragging] = useState(false);
  /** The image as it was when this opened: what 100% means, and the frame. */
  const base = useRef(rect).current;

  const scene = useMemo(() => {
    const rooms = (layer.roomsByFloor.get(floorId) ?? []).map((room) => ({
      room,
      rings: interiorRings(ringsOf(layer, room)),
    }));
    const plan = floorExtent(layer.file, floorId);
    const minX = Math.min(plan.x, base.x);
    const minY = Math.min(plan.y, base.y);
    const maxX = Math.max(plan.x + plan.width, base.x + base.width);
    const maxY = Math.max(plan.y + plan.height, base.y + base.height);
    return {
      rooms,
      viewBox: `${minX - PAD} ${minY - PAD} ${maxX - minX + PAD * 2} ${
        maxY - minY + PAD * 2
      }`,
    };
  }, [layer, floorId, base]);

  /** Pointer position in the floor's coordinates. */
  const toPlan = useCallback((clientX: number, clientY: number): Point | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const onDown = (e: React.MouseEvent) => {
    const from = toPlan(e.clientX, e.clientY);
    if (!from) return;
    drag.current = { from, at: rect };
    setDragging(true);
  };
  const onMove = (e: React.MouseEvent) => {
    const d = drag.current;
    if (!d) return;
    const now = toPlan(e.clientX, e.clientY);
    if (!now) return;
    onRectChange({
      ...d.at,
      x: d.at.x + (now.x - d.from.x),
      y: d.at.y + (now.y - d.from.y),
    });
  };
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  const size = rect.width / base.width;

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
          Background image
        </Typography>

        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 220 }}>
          <Typography variant="caption" color="text.secondary">
            Scale
          </Typography>
          <Slider
            size="small"
            min={SMALLEST}
            max={LARGEST}
            step={0.005}
            value={Math.max(SMALLEST, Math.min(LARGEST, size))}
            aria-label="Image scale"
            // About the image's own middle, and from the size it has
            // now, so sizing does not undo a move.
            onChange={(_e, v) => onRectChange(scaleRect(rect, (v as number) / size))}
            sx={{ width: 160 }}
          />
          <Typography variant="caption" sx={{ width: 44 }}>
            {Math.round(size * 100)}%
          </Typography>
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0 }} noWrap>
          Drag the image to move it
        </Typography>

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
          minScale={MIN_SCALE}
          maxScale={MAX_SCALE}
          limitToBounds={false}
          doubleClick={{ mode: "reset" }}
          // WheelZoom, below, zooms; the library's wheel is too coarse.
          wheel={{ disabled: true }}
          // Dragging moves the image, not the view; the wheel still zooms.
          panning={{ disabled: true }}
        >
          {(utils) => (
            <>
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
                    // The image may be dragged past the frame it opened in.
                    overflow: "visible",
                    cursor: dragging ? "grabbing" : "grab",
                  }}
                  onMouseDown={onDown}
                  onMouseMove={onMove}
                  onMouseUp={endDrag}
                  onMouseLeave={endDrag}
                >
                  <image
                    href={src}
                    x={rect.x}
                    y={rect.y}
                    width={rect.width}
                    height={rect.height}
                    preserveAspectRatio="none"
                  />
                  {/* Its edge, so an image that is mostly white paper can
                      still be seen to be somewhere. */}
                  <rect
                    x={rect.x}
                    y={rect.y}
                    width={rect.width}
                    height={rect.height}
                    fill="none"
                    stroke={OUTLINE}
                    strokeWidth={3}
                    strokeDasharray="12 8"
                    vectorEffect="non-scaling-stroke"
                  />

                  {/* The plan, over it: what the image is being fitted to. */}
                  <g pointerEvents="none">
                    {scene.rooms.map(({ room, rings }) =>
                      rings.length === 0 ? null : (
                        <path
                          key={room.id}
                          d={ringsToPath(rings)}
                          fill={roomColor(layer, room)}
                          fillOpacity={0.35}
                          fillRule="evenodd"
                          stroke={WALL}
                          strokeWidth={3}
                        />
                      ),
                    )}
                  </g>
                </svg>
              </TransformComponent>
              <WheelZoom utils={utils} minScale={MIN_SCALE} maxScale={MAX_SCALE} />
              <PlanGrid utils={utils} />
            </>
          )}
        </TransformWrapper>
      </Box>
    </Box>
  );
}

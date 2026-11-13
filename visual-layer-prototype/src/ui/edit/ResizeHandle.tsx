/**
 * The grab strip on a side panel's inner edge.
 *
 * The drag is anchored to where it started rather than accumulating deltas:
 * once a width hits its limit, a pointer that keeps moving would otherwise
 * bank up movement the panel never made, and the edge would stop following
 * the pointer on the way back.
 */
import { useRef } from "react";
import Box from "@mui/material/Box";

export interface ResizeHandleProps {
  /** Which side of the panel this sits on — the one that moves. */
  edge: "left" | "right";
  width: number;
  min: number;
  max: number;
  onChange: (width: number) => void;
}

export function ResizeHandle({
  edge,
  width,
  min,
  max,
  onChange,
}: ResizeHandleProps) {
  const from = useRef<{ x: number; width: number } | null>(null);

  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      onPointerDown={(e) => {
        from.current = { x: e.clientX, width };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const start = from.current;
        if (!start) return;
        const moved = e.clientX - start.x;
        const next = edge === "right" ? start.width + moved : start.width - moved;
        onChange(Math.max(min, Math.min(max, next)));
      }}
      onPointerUp={(e) => {
        from.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onDoubleClick={() => onChange(min)}
      sx={{
        position: "absolute",
        top: 0,
        bottom: 0,
        [edge]: -3,
        width: 6,
        cursor: "col-resize",
        zIndex: 2,
        // Invisible until it is wanted: a permanent line between the panel
        // and the plan would read as a border and compete with the divider
        // already there.
        "&:hover": { bgcolor: "primary.main", opacity: 0.4 },
        "&:active": { bgcolor: "primary.main", opacity: 0.6 },
        touchAction: "none",
      }}
    />
  );
}

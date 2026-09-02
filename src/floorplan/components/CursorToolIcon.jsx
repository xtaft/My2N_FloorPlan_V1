import { useRef, useEffect } from 'react';
import Box from '@mui/material/Box';
import CallMergeIcon from '@mui/icons-material/CallMerge';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import SensorDoorIcon from '@mui/icons-material/SensorDoor';
import PinDropIcon from '@mui/icons-material/PinDrop';

// Same icon assets as the toolbar buttons (ActionBarFloorPlan.jsx), per
// instructions — including reusing the scissors glyph for Divide rather
// than a minus sign, since a minus reads as "remove" not "split".
const TOOL_ICONS = {
  merge: <CallMergeIcon fontSize="small" />,
  divide: <ContentCutIcon fontSize="small" />,
  addDoor: <SensorDoorIcon fontSize="small" />,
  addPin: <PinDropIcon fontSize="small" />,
};

// Offset above-and-right of the pointer tip — never centered on it, so the
// tip itself stays unobscured for precise clicks (edges in Divide, walls in
// Add Door).
const OFFSET_X = 14;
const OFFSET_Y = 28;

/**
 * The small icon that follows the cursor while an edit-mode tool is active
 * (see ActionBarFloorPlan.jsx for the full spec). Renders nothing, and the
 * system pointer is left alone, when no tool is active.
 *
 * Position is applied by mutating the element's own style directly in a
 * mousemove listener rather than via React state, so tracking the cursor
 * doesn't re-render the rest of the tree (in particular, the floor plan
 * SVG) on every pixel of mouse movement.
 */
export default function CursorToolIcon({ activeTool }) {
  const elRef = useRef(null);
  const lastPos = useRef({ x: -9999, y: -9999 });

  // Always tracks the latest cursor position, regardless of whether a tool
  // is active, so the icon can appear at the correct spot immediately on
  // activation instead of waiting for the next mousemove.
  useEffect(() => {
    function handleMouseMove(event) {
      lastPos.current = { x: event.clientX, y: event.clientY };
      if (elRef.current) {
        elRef.current.style.transform = `translate(${event.clientX + OFFSET_X}px, ${event.clientY - OFFSET_Y}px)`;
      }
    }
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Snap to the last known cursor position as soon as the icon (re)appears,
  // rather than sitting at (0,0) until the next mousemove fires.
  useEffect(() => {
    if (activeTool && elRef.current) {
      const { x, y } = lastPos.current;
      elRef.current.style.transform = `translate(${x + OFFSET_X}px, ${y - OFFSET_Y}px)`;
    }
  }, [activeTool]);

  if (!activeTool) return null;

  return (
    <Box
      ref={elRef}
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 2000,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: '50%',
        bgcolor: 'background.paper',
        color: 'primary.main',
        boxShadow: 2,
      }}
    >
      {TOOL_ICONS[activeTool]}
    </Box>
  );
}

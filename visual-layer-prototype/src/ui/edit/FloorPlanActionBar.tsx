/**
 * The editor's action bar, over the plan. Figma 42:75117.
 *
 * Everything here is a tool: arm one, then click the map. They come in
 * the groups the design joins them in — what is shown, what is built,
 * then aligning and the image on their own. Undo and redo lead the bar,
 * the way they lead the segmentation review's: the design's frame does
 * not draw them here, but they left the app bar with nowhere else to
 * go, and an editor without undo is not one.
 *
 * The mode switch is not here any more. It is at the top of the drawer.
 */
import DoorFrontOutlined from "@mui/icons-material/DoorFrontOutlined";
import ImageOutlined from "@mui/icons-material/ImageOutlined";
import LayersClearOutlined from "@mui/icons-material/LayersClearOutlined";
import OpenWith from "@mui/icons-material/OpenWith";
import Redo from "@mui/icons-material/Redo";
import Undo from "@mui/icons-material/Undo";
import VerticalSplitOutlined from "@mui/icons-material/VerticalSplitOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import { ActionBar, BarButton, BarGroup, type EditorMode } from "./EditorChrome";

export type EditTool =
  | "select"
  | "show"
  | "hide"
  | "wall"
  | "remove_wall"
  | "door"
  | "align";
export type EditModeName = EditorMode;

export interface FloorPlanActionBarProps {
  tool: EditTool;
  onToolChange: (tool: EditTool) => void;
  /** False on the lowest storey, which is what everything else fits onto. */
  canAlign: boolean;
  /** Every tool edits the structure, so they grey out in the other modes. */
  mode: EditModeName;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  onUndo: () => void;
  onRedo: () => void;
}

const icon = { fontSize: 16 } as const;

export function FloorPlanActionBar({
  tool,
  onToolChange,
  canAlign,
  mode,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
}: FloorPlanActionBarProps) {
  const structure = mode === "structure";
  const arm = (id: EditTool) => ({
    pressed: tool === id,
    // Pressing the armed tool again puts the pointer back to selecting.
    onClick: () => onToolChange(tool === id ? "select" : id),
  });

  return (
    <ActionBar>
      <BarGroup>
        <BarButton
          icon={<Undo sx={icon} />}
          ariaLabel="Undo"
          hint={undoLabel ? `Undo ${undoLabel.toLowerCase()}` : "Nothing to undo"}
          disabled={!canUndo}
          onClick={onUndo}
        />
        <BarButton
          icon={<Redo sx={icon} />}
          ariaLabel="Redo"
          hint={redoLabel ? `Redo ${redoLabel.toLowerCase()}` : "Nothing to redo"}
          disabled={!canRedo}
          onClick={onRedo}
        />
      </BarGroup>

      <BarGroup>
        <BarButton
          label="Show room"
          icon={<VisibilityOutlined sx={icon} />}
          hint="Reveals the rooms folded inside their envelopes. Click one to draw it on the map in its own right."
          disabled={!structure}
          {...arm("show")}
        />
        <BarButton
          label="Hide room"
          icon={<VisibilityOffOutlined sx={icon} />}
          hint="Click a room to fold it back into its envelope. A room carrying a device cannot be hidden."
          disabled={!structure}
          {...arm("hide")}
        />
      </BarGroup>

      <BarGroup>
        <BarButton
          label="Wall"
          icon={<VerticalSplitOutlined sx={icon} />}
          hint="Click where a wall starts and where it stops — on a wall, at a corner, or on open floor. Close a shape and it becomes a room"
          disabled={!structure}
          {...arm("wall")}
        />
        <BarButton
          label="Remove wall"
          icon={<LayersClearOutlined sx={icon} />}
          hint="Click a wall to take it out. The rooms on either side become one; any other wall they share stays standing."
          disabled={!structure}
          {...arm("remove_wall")}
        />
        <BarButton
          label="Door"
          icon={<DoorFrontOutlined sx={icon} />}
          hint="Click a wall to put a door in it"
          disabled={!structure}
          {...arm("door")}
        />
      </BarGroup>

      <BarGroup>
        <BarButton
          label="Align floor"
          icon={<OpenWith sx={icon} />}
          hint={
            canAlign
              ? "Fit this floor onto the one below, and say which shaft is which"
              : "The lowest storey is the reference every other floor is fitted to"
          }
          disabled={!structure || !canAlign}
          {...arm("align")}
        />
      </BarGroup>

      <BarGroup>
        <BarButton
          label="Edit image"
          icon={<ImageOutlined sx={icon} />}
          hint="Not built: the plan here is a fixture, not an uploaded PDF"
          disabled
        />
      </BarGroup>
    </ActionBar>
  );
}

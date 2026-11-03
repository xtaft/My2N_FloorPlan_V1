/**
 * The floor-plan action bar. Figma: ActionBar Floor Plan (42:68934).
 *
 * Everything here is a tool: arm one, then click the map. Show room reveals
 * the rooms folded inside their envelopes so one can be clicked; Hide room
 * folds a shown room back. Wall, Stairs and Elevator are drawn but not built.
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DoorFrontOutlined from "@mui/icons-material/DoorFrontOutlined";
import ImageOutlined from "@mui/icons-material/ImageOutlined";
import LayersOutlined from "@mui/icons-material/LayersOutlined";
import LayersClearOutlined from "@mui/icons-material/LayersClearOutlined";
import VerticalSplitOutlined from "@mui/icons-material/VerticalSplitOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";

export type EditTool =
  | "select"
  | "show"
  | "hide"
  | "wall"
  | "remove_wall"
  | "door"
  | "align";
export type EditModeName = "structure" | "devices";

export interface FloorPlanActionBarProps {
  tool: EditTool;
  onToolChange: (tool: EditTool) => void;
  /** False on the lowest storey, which is what everything else fits onto. */
  canAlign: boolean;
  mode: EditModeName;
  onModeChange: (mode: EditModeName) => void;
}

const toolSx = { height: 30 } as const;

export function FloorPlanActionBar({
  tool,
  onToolChange,
  canAlign,
  mode,
  onModeChange,
}: FloorPlanActionBarProps) {
  const toolButton = (
    id: EditTool,
    label: string,
    icon: React.ReactNode,
    hint: string,
    enabled = true,
  ) => (
    <Tooltip key={id} title={hint}>
      <span>
        <Button
          variant={tool === id ? "contained" : "outlined"}
          color={tool === id ? "primary" : "inherit"}
          size="small"
          startIcon={icon}
          sx={toolSx}
          // Every one of these edits the structure, so none of them is
          // available in the mode that is about devices.
          disabled={!enabled || mode !== "structure"}
          // Pressing the armed tool again puts the pointer back to selecting.
          onClick={() => onToolChange(tool === id ? "select" : id)}
        >
          {label}
        </Button>
      </span>
    </Tooltip>
  );

  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        borderBottom: 1,
        borderColor: "divider",
        display: "flex",
        alignItems: "center",
        minHeight: 65,
        px: 4,
        gap: 3,
      }}
    >
      <Stack direction="row" spacing={2} alignItems="center">
        {toolButton(
          "show",
          "Show room",
          <VisibilityOutlined sx={{ fontSize: 16 }} />,
          "Reveals the rooms folded inside their envelopes. Click one to draw it on the map in its own right.",
        )}
        {toolButton(
          "hide",
          "Hide room",
          <VisibilityOffOutlined sx={{ fontSize: 16 }} />,
          "Click a room to fold it back into its envelope. A room carrying a device cannot be hidden.",
        )}
      </Stack>

      <Divider orientation="vertical" flexItem />

      <Stack direction="row" spacing={2} alignItems="center">
        {toolButton(
          "wall",
          "Wall",
          <VerticalSplitOutlined sx={{ fontSize: 16 }} />,
          "Click one wall of a room, then another, to divide it in two",
        )}
        {toolButton(
          "remove_wall",
          "Remove wall",
          <LayersClearOutlined sx={{ fontSize: 16 }} />,
          "Click a wall to take it out. The rooms on either side become one; any other wall they share stays standing.",
        )}
        {toolButton(
          "door",
          "Door",
          <DoorFrontOutlined sx={{ fontSize: 16 }} />,
          "Click a wall to put a door in it",
        )}
        {toolButton(
          "align",
          "Align floor",
          <LayersOutlined sx={{ fontSize: 16 }} />,
          canAlign
            ? "Fit this floor onto the one below, and say which shaft is which"
            : "The lowest storey is the reference every other floor is fitted to",
          canAlign,
        )}
      </Stack>

      <Divider orientation="vertical" flexItem />

      <Stack direction="row" spacing={2} alignItems="center">
        <Tooltip title="Not built: the plan here is a fixture, not an uploaded PDF">
          <span>
            <Button
              variant="outlined"
              size="small"
              color="inherit"
              startIcon={<ImageOutlined sx={{ fontSize: 16 }} />}
              sx={{ ...toolSx, color: "text.secondary" }}
              disabled
            >
              Edit image
            </Button>
          </span>
        </Tooltip>
        <FormControlLabel
          control={<Switch size="small" disabled />}
          label={
            <Typography variant="body2" color="text.disabled">
              Background image
            </Typography>
          }
          sx={{ ml: 0 }}
        />
      </Stack>

      <Box sx={{ flex: 1 }} />

      <TextField
        select
        size="small"
        value={mode}
        onChange={(e) => onModeChange(e.target.value as EditModeName)}
        sx={{ width: 320 }}
      >
        <MenuItem value="structure">Structure</MenuItem>
        <MenuItem value="devices">Devices</MenuItem>
      </TextField>
    </Box>
  );
}

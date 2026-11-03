/**
 * The floor-plan action bar. Figma: ActionBar Floor Plan (42:68934).
 *
 * Two groups of tools, then the background-image controls, then the mode
 * select. Show room / Hide room are the doc's two manual surfacing overrides;
 * Wall / Door / Stairs / Elevator are the geometry tools, of which only Door
 * is implemented.
 */
import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import ListSubheader from "@mui/material/ListSubheader";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArrowDropDown from "@mui/icons-material/ArrowDropDown";
import DoorFrontOutlined from "@mui/icons-material/DoorFrontOutlined";
import ElevatorOutlined from "@mui/icons-material/ElevatorOutlined";
import ImageOutlined from "@mui/icons-material/ImageOutlined";
import StairsOutlined from "@mui/icons-material/StairsOutlined";
import UnfoldMoreOutlined from "@mui/icons-material/UnfoldMoreOutlined";
import VerticalSplitOutlined from "@mui/icons-material/VerticalSplitOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import type { Room } from "../../model";

export type EditTool = "select" | "wall" | "door" | "stairs" | "elevator";
export type EditModeName = "structure" | "devices";

export interface FloorPlanActionBarProps {
  tool: EditTool;
  onToolChange: (tool: EditTool) => void;
  mode: EditModeName;
  onModeChange: (mode: EditModeName) => void;
  /** Null when the selection cannot be shown or hidden. */
  canShowRoom: boolean;
  canHideRoom: boolean;
  onShowRoom: () => void;
  onHideRoom: () => void;
  selectionLabel: string | null;
  /**
   * The doc's view toggle: reveals the rooms folded inside their envelopes
   * so one can be picked and shown. It is a view, not an edit — it stores
   * nothing and Esc reverts it.
   */
  showAllRooms: boolean;
  onToggleShowAllRooms: () => void;
  /**
   * The rooms folded inside the selected envelope. Clicking a flat on the
   * map selects the envelope, because a hidden room cannot be clicked — so
   * Show room becomes a menu of what is inside it.
   */
  hiddenInSelection: Room[];
  onShowRoomById: (roomId: string) => void;
  selectedGroupName: string | null;
}

const toolSx = { height: 30 } as const;

export function FloorPlanActionBar({
  tool,
  onToolChange,
  mode,
  onModeChange,
  canShowRoom,
  canHideRoom,
  onShowRoom,
  onHideRoom,
  selectionLabel,
  showAllRooms,
  onToggleShowAllRooms,
  hiddenInSelection,
  onShowRoomById,
  selectedGroupName,
}: FloorPlanActionBarProps) {
  const [showMenu, setShowMenu] = useState<HTMLElement | null>(null);
  // With an envelope selected, Show room has to ask which of its folded
  // rooms is meant; with a room selected it just acts.
  const offersMenu = !canShowRoom && hiddenInSelection.length > 0;
  const toolButton = (
    id: EditTool,
    label: string,
    icon: React.ReactNode,
    hint: string,
    enabled: boolean,
  ) => (
    <Tooltip title={hint}>
      <span>
        <Button
          variant={tool === id ? "contained" : "outlined"}
          color={tool === id ? "primary" : "inherit"}
          size="small"
          startIcon={icon}
          sx={toolSx}
          disabled={!enabled}
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
        <Tooltip
          title={
            canShowRoom
              ? `Draw ${selectionLabel} on the map separately`
              : offersMenu
                ? `Pick a room folded inside ${selectedGroupName}`
                : "Select a room, or an envelope with rooms folded inside it"
          }
        >
          <span>
            <Button
              variant="outlined"
              size="small"
              color="inherit"
              startIcon={<VisibilityOutlined sx={{ fontSize: 16 }} />}
              endIcon={
                offersMenu ? <ArrowDropDown sx={{ fontSize: 16 }} /> : undefined
              }
              sx={toolSx}
              disabled={!canShowRoom && !offersMenu}
              onClick={(e) =>
                offersMenu ? setShowMenu(e.currentTarget) : onShowRoom()
              }
            >
              Show room
            </Button>
          </span>
        </Tooltip>
        <Menu
          anchorEl={showMenu}
          open={showMenu !== null}
          onClose={() => setShowMenu(null)}
        >
          <ListSubheader sx={{ lineHeight: "32px" }}>
            Show room in {selectedGroupName}
          </ListSubheader>
          {hiddenInSelection.map((room) => (
            <MenuItem
              key={room.id}
              onClick={() => {
                onShowRoomById(room.id);
                setShowMenu(null);
              }}
            >
              {room.name}
            </MenuItem>
          ))}
        </Menu>
        <Tooltip
          title={
            selectionLabel
              ? `Fold ${selectionLabel} back into its envelope`
              : "Select a surfaced room first"
          }
        >
          <span>
            <Button
              variant="outlined"
              size="small"
              color="inherit"
              startIcon={<VisibilityOffOutlined sx={{ fontSize: 16 }} />}
              sx={toolSx}
              disabled={!canHideRoom}
              onClick={onHideRoom}
            >
              Hide room
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Reveal the rooms folded inside their envelopes, so one can be picked. A view only — it stores nothing, and Esc reverts it.">
          <Button
            variant={showAllRooms ? "contained" : "outlined"}
            color={showAllRooms ? "primary" : "inherit"}
            size="small"
            startIcon={<UnfoldMoreOutlined sx={{ fontSize: 16 }} />}
            sx={toolSx}
            onClick={onToggleShowAllRooms}
          >
            All rooms
          </Button>
        </Tooltip>
      </Stack>

      <Divider orientation="vertical" flexItem />

      <Stack direction="row" spacing={2} alignItems="center">
        {toolButton(
          "wall",
          "Wall",
          <VerticalSplitOutlined sx={{ fontSize: 16 }} />,
          "Not built: adding a wall needs split_wall and the boundary walk",
          false,
        )}
        {toolButton(
          "door",
          "Door",
          <DoorFrontOutlined sx={{ fontSize: 16 }} />,
          "Click a wall to put a door in it",
          true,
        )}
        {toolButton(
          "stairs",
          "Stairs",
          <StairsOutlined sx={{ fontSize: 16 }} />,
          "Not built: tagging a shaft regenerates the vertical doors",
          false,
        )}
        {toolButton(
          "elevator",
          "Elevator",
          <ElevatorOutlined sx={{ fontSize: 16 }} />,
          "Not built: tagging a shaft regenerates the vertical doors",
          false,
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
        <MenuItem value="devices" disabled>
          Devices
        </MenuItem>
      </TextField>
    </Box>
  );
}

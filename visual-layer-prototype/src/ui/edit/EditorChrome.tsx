/**
 * The pieces of the editor's frame that the editor and the segmentation
 * review both use (Figma 42:75117, 19:91706): the bar over the plan and
 * its joined button groups, the zoom in the plan's corner, and the mode
 * switch at the top of the drawer.
 */
import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Add from "@mui/icons-material/Add";
import CenterFocusStrongOutlined from "@mui/icons-material/CenterFocusStrongOutlined";
import Remove from "@mui/icons-material/Remove";

/** The fill a pressed button takes, in the bar and in the mode switch. */
export const PRESSED_BACKGROUND = "#e9f2f9";

/** The bar over the plan: white, 64 tall, a rule under it. */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        borderBottom: 1,
        borderColor: "divider",
        display: "flex",
        alignItems: "center",
        height: 64,
        flexShrink: 0,
        px: 3,
        gap: 3,
        // Narrow windows clip the bar rather than wrap it: a second
        // line would come off the plan.
        overflow: "hidden",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Box>
  );
}

/** Buttons that belong together, drawn joined. */
export function BarGroup({ children }: { children: ReactNode }) {
  return (
    <ButtonGroup
      variant="outlined"
      color="inherit"
      size="small"
      sx={{ flexShrink: 0, "& .MuiButton-root": { height: 30 } }}
    >
      {children}
    </ButtonGroup>
  );
}

export interface BarButtonProps {
  label?: string;
  icon: ReactNode;
  hint: string;
  /** Armed, or otherwise on. */
  pressed?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
}

/**
 * One button of the bar. With a label it is a tool; without, an icon
 * button the width of its icon. The tooltip's span is what lets a
 * disabled button still say why it is disabled.
 */
export function BarButton({
  label,
  icon,
  hint,
  pressed = false,
  disabled = false,
  onClick,
  ariaLabel,
}: BarButtonProps) {
  return (
    <Tooltip title={hint}>
      <Box component="span" sx={{ display: "inline-flex" }}>
        <Button
          startIcon={label ? icon : undefined}
          disabled={disabled}
          onClick={onClick}
          aria-label={ariaLabel ?? label}
          aria-pressed={pressed}
          sx={{
            ...(label ? {} : { minWidth: 36, width: 36, px: 0 }),
            ...(pressed
              ? {
                  bgcolor: PRESSED_BACKGROUND,
                  color: "primary.main",
                  "&:hover": { bgcolor: PRESSED_BACKGROUND },
                }
              : {}),
          }}
        >
          {label ?? icon}
        </Button>
      </Box>
    </Tooltip>
  );
}

/**
 * Zoom out, zoom in, fit — in the bottom-right corner of the plan they
 * act on. The parent has to be `position: relative`.
 */
export function ZoomControls({
  onZoomOut,
  onZoomIn,
  onZoomFit,
}: {
  onZoomOut: () => void;
  onZoomIn: () => void;
  onZoomFit: () => void;
}) {
  const sx = {
    minWidth: 36,
    width: 36,
    height: 30,
    px: 0,
    bgcolor: "background.paper",
    "&:hover": { bgcolor: "background.paper" },
  } as const;
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ position: "absolute", right: 24, bottom: 24, zIndex: 2 }}
    >
      <Tooltip title="Zoom out">
        <Button variant="outlined" color="inherit" size="small" sx={sx} onClick={onZoomOut} aria-label="Zoom out">
          <Remove sx={{ fontSize: 16 }} />
        </Button>
      </Tooltip>
      <Tooltip title="Zoom in">
        <Button variant="outlined" color="inherit" size="small" sx={sx} onClick={onZoomIn} aria-label="Zoom in">
          <Add sx={{ fontSize: 16 }} />
        </Button>
      </Tooltip>
      <Tooltip title="Fit the floor to the view">
        <Button variant="outlined" color="inherit" size="small" sx={sx} onClick={onZoomFit} aria-label="Fit to view">
          <CenterFocusStrongOutlined sx={{ fontSize: 16 }} />
        </Button>
      </Tooltip>
    </Stack>
  );
}

export type EditorMode = "structure" | "devices" | "access";

/**
 * Structure, Devices, Access — at the top of the drawer, because the
 * drawer is what the mode changes most. A group of buttons rather than
 * a dropdown: three choices are few enough to be seen at once, and the
 * one that is on stays in view.
 */
const EDITOR_MODES: { id: EditorMode; label: string }[] = [
  { id: "structure", label: "Structure" },
  { id: "devices", label: "Devices" },
  { id: "access", label: "Access" },
];

export function ModeSwitch<T extends string = EditorMode>({
  mode,
  onChange,
  options = EDITOR_MODES as unknown as { id: T; label: string }[],
}: {
  mode: T;
  onChange: (mode: T) => void;
  /** The editor's three by default; the view has two of its own. */
  options?: { id: T; label: string }[];
}) {
  return (
    <Box sx={{ px: 1, pt: 1, flexShrink: 0 }}>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={mode}
        // Pressing the one that is on would hand back null; a mode is
        // always one of the three.
        onChange={(_e, next: T | null) => next && onChange(next)}
        sx={{
          "& .MuiToggleButton-root": {
            height: 48,
            px: 2,
            fontWeight: 500,
            color: "text.primary",
          },
          "& .MuiToggleButton-root.Mui-selected": {
            bgcolor: PRESSED_BACKGROUND,
            color: "primary.main",
            "&:hover": { bgcolor: PRESSED_BACKGROUND },
          },
        }}
      >
        {options.map((o) => (
          <ToggleButton key={o.id} value={o.id}>
            {o.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  );
}

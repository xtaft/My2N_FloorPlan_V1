/**
 * What a device says about itself, on the plan.
 *
 * Figma 132:292838 — two variants of one card. The default is the
 * name, the product, how it is doing, and the two facts the box
 * reports about itself. The second adds a camera view, and the design
 * gives it to one device: the IP Style on the way in from the street,
 * which is the only one here with a camera pointing at anybody.
 *
 * That condition is read off the plan rather than stored. An intercom
 * is the product with the lens, and "from the exterior" means the door
 * it is on has the outside on one side of it — so the same rule would
 * put a camera on a second entrance intercom the day somebody adds
 * one, and would take it off this one if the lobby stopped being an
 * entrance. Nothing in the fixture says "has camera".
 *
 * The view itself is drawn as a placeholder, not a photograph. There
 * is no camera behind this prototype, and a stock picture of somebody
 * else's porch presented as this building's front door would be the
 * one thing on the screen that is not true.
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowForward from "@mui/icons-material/ArrowForward";
import OpenInFull from "@mui/icons-material/OpenInFull";
import VideocamOutlined from "@mui/icons-material/VideocamOutlined";
import { deviceStatusName, productName, type Device } from "../../model";

export interface DeviceDetailCardProps {
  device: Device | null;
  /** True for the intercom on a door to the outside. */
  withCamera: boolean;
  at: { top: number; left: number } | null;
  onClose: () => void;
}

const CARD = 304;

export function DeviceDetailCard({
  device,
  withCamera,
  at,
  onClose,
}: DeviceDetailCardProps) {
  return (
    <Popover
      open={Boolean(device && at)}
      anchorReference="anchorPosition"
      anchorPosition={at ?? { top: 0, left: 0 }}
      onClose={onClose}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      slotProps={{
        paper: { sx: { bgcolor: "#eeeeee", width: CARD, p: 2 } },
      }}
    >
      {device && (
        <>
          <Typography variant="body1" fontWeight={500}>
            {device.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {productName(device.device_type)}
          </Typography>

          <Divider sx={{ my: 1.5 }} />

          <Chip
            size="small"
            label={deviceStatusName(device.status as never)}
            variant="outlined"
            sx={{
              height: 24,
              fontSize: 13,
              color: TONE[device.status] ?? TONE.ok,
              borderColor: TONE[device.status] ?? TONE.ok,
            }}
          />

          <Stack spacing={0.5} sx={{ mt: 1.5 }}>
            <Fact label="Firmware version:" value={device.firmware} />
            <Fact label="IP address:" value={device.ip_address} />
          </Stack>

          {withCamera && <CameraView />}

          <Button
            variant="outlined"
            color="inherit"
            size="small"
            endIcon={<ArrowForward sx={{ fontSize: 16 }} />}
            sx={{ mt: 2, bgcolor: "background.paper" }}
          >
            Device detail
          </Button>
        </>
      )}
    </Popover>
  );
}

const TONE: Record<string, string> = {
  ok: "#2E7D32",
  not_verified: "#C77700",
  offline: "#C62828",
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Stack>
  );
}

/**
 * Where the picture goes. Said in words, because an invented one would
 * read as this building's doorstep and is the only thing on the card
 * that could not be checked against anything.
 */
function CameraView() {
  return (
    <Box
      sx={{
        mt: 2,
        height: 170,
        borderRadius: 1,
        bgcolor: "#2f3133",
        color: "rgba(255,255,255,0.72)",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.5,
      }}
    >
      <VideocamOutlined sx={{ fontSize: 28 }} />
      <Typography variant="caption">Live view</Typography>
      <OpenInFull
        sx={{
          position: "absolute",
          top: 8,
          right: 8,
          fontSize: 18,
          color: "rgba(255,255,255,0.9)",
        }}
      />
    </Box>
  );
}

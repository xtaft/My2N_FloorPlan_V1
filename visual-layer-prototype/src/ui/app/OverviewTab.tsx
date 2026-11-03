/**
 * The Overview tab.
 *
 * There is no design for this one — the Figma file has the tab in the
 * bar and no frame behind it — so it is built from what the model can
 * actually answer rather than from a guess at a layout. Everything on
 * it is derived; nothing here is a number somebody typed.
 *
 * The last card is the point of the screen. A floor plan is worth
 * drawing because it turns "is the building set up correctly?" into
 * questions with answers, and those answers are findings: a device
 * nobody has placed, a reader checking a door into nowhere, a lift
 * shaft that only exists on one storey. The counts above it are
 * context for reading them.
 */
import { useMemo } from "react";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid2";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import {
  accessType,
  allPeople,
  buildingDevices,
  buildingSpaces,
  operators,
  residents,
  shaftMembers,
  unguardedDevices,
  type VisualLayer,
} from "../../model";

export interface OverviewTabProps {
  layer: VisualLayer;
  hasPlan: boolean;
}

export function OverviewTab({ layer, hasPlan }: OverviewTabProps) {
  const spaces = useMemo(() => buildingSpaces(layer), [layer]);
  const devices = useMemo(
    () => buildingDevices(layer, hasPlan),
    [layer, hasPlan],
  );

  const placed = devices.filter((d) => d.placement !== null).length;
  const waiting = devices.length - placed;
  const offline = devices.filter((d) => d.status === "offline").length;
  const unverified = devices.filter((d) => d.status === "not_verified").length;

  const findings = useMemo(() => {
    const out: string[] = [];
    if (waiting > 0) {
      out.push(
        `${waiting} device${waiting === 1 ? "" : "s"} not placed on the plan`,
      );
    }
    const loose = unguardedDevices(layer);
    if (loose.length > 0) {
      out.push(
        `${loose.length} reader${loose.length === 1 ? "" : "s"} checking nothing`,
      );
    }
    if (hasPlan) {
      for (const [shaft, members] of shaftMembers(layer)) {
        if (members.length < 2) {
          out.push(`Shaft ${shaft} reaches only one storey`);
        }
      }
      const unknown = layer.file.rooms.filter(
        (r) => accessType(layer, r) === null,
      ).length;
      if (unknown > 0) {
        out.push(
          `${unknown} space${unknown === 1 ? "" : "s"} with no category`,
        );
      }
    }
    return out;
  }, [layer, waiting, hasPlan]);

  return (
    <Stack spacing={3}>
      <Grid container spacing={3}>
        <Card
          title="The building"
          lines={[
            hasPlan
              ? [`${layer.floors.length}`, "storeys drawn"]
              : ["—", "no floor plan yet"],
            [`${spaces.filter((s) => s.apartment).length}`, "apartments"],
            [
              `${spaces.filter((s) => !s.apartment).length}`,
              "common spaces",
            ],
          ]}
        />
        <Card
          title="Devices"
          lines={[
            [`${devices.length}`, "in the building"],
            [`${placed}`, "placed"],
            [`${waiting}`, "waiting to be placed"],
          ]}
        />
        <Card
          title="Health"
          lines={[
            [`${offline}`, "offline"],
            [`${unverified}`, "not verified"],
            [
              `${devices.length - offline - unverified}`,
              "all good",
            ],
          ]}
        />
        <Card
          title="People"
          lines={[
            [`${allPeople(layer).length}`, "in total"],
            [`${residents(layer).length}`, "residents"],
            [`${operators(layer).length}`, "operators"],
          ]}
        />
      </Grid>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Needs attention
        </Typography>
        {findings.length === 0 ? (
          <Stack direction="row" spacing={1.5} alignItems="center">
            <CheckCircleOutline sx={{ color: "#2E7D32" }} />
            <Typography variant="body2">
              Nothing to resolve. Every device is placed, every reader checks
              a way in, and every space has a category.
            </Typography>
          </Stack>
        ) : (
          <Stack spacing={1.5}>
            {findings.map((f) => (
              <Stack key={f} direction="row" spacing={1.5} alignItems="center">
                <WarningAmberOutlined sx={{ color: "#C77700" }} />
                <Typography variant="body2">{f}</Typography>
              </Stack>
            ))}
          </Stack>
        )}
        {!hasPlan && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: "block" }}>
            Some checks need a floor plan: whether a lift reaches every
            storey, and whether every space has been named, are questions
            about a drawing.
          </Typography>
        )}
      </Paper>
    </Stack>
  );
}

function Card({
  title,
  lines,
}: {
  title: string;
  lines: [string, string][];
}) {
  return (
    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
      <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
        <Typography variant="body2" color="text.secondary">
          {title}
        </Typography>
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          {lines.map(([value, label]) => (
            <Box key={label}>
              <Typography variant="h5" component="span">
                {value}
              </Typography>
              <Typography
                variant="body2"
                component="span"
                color="text.secondary"
                sx={{ ml: 1 }}
              >
                {label}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Paper>
    </Grid>
  );
}

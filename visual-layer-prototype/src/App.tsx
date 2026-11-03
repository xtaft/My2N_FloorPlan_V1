import { useMemo, useState } from "react";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CssBaseline from "@mui/material/CssBaseline";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { ThemeProvider } from "@mui/material/styles";
import { AccessPanel } from "./ui/AccessPanel";
import { FloorPlanCanvas, typesOnFloor } from "./ui/FloorPlanCanvas";
import { NavigationDrawer } from "./ui/NavigationDrawer";
import { theme } from "./ui/theme";
import {
  buildAdjacency,
  defaultStartRoom,
  reachable,
  shaftMembers,
  unguardedDevices,
  visualLayer as layer,
} from "./model";

export default function App() {
  const [floorId, setFloorId] = useState(layer.floors[0].id);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [showAllRooms, setShowAllRooms] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Built once per topology change, not per render.
  const adjacency = useMemo(() => buildAdjacency(layer), []);
  const startRoom = useMemo(() => defaultStartRoom(layer), []);

  const reach = useMemo(() => {
    if (!profileId) return null;
    const profile = layer.profiles.find((p) => p.id === profileId);
    if (!profile) return null;
    return reachable(
      layer,
      startRoom,
      { allowedDevices: new Set(profile.devices) },
      adjacency,
    );
  }, [profileId, adjacency, startRoom]);

  const warnings = useMemo(() => {
    const out: string[] = [];
    if (layer.unplacedDevices.length > 0) {
      out.push(`${layer.unplacedDevices.length} devices not placed`);
    }
    const unguarded = unguardedDevices(layer);
    if (unguarded.length > 0) {
      out.push(`${unguarded.length} readers guarding nothing`);
    }
    for (const [shaft, members] of shaftMembers(layer)) {
      if (members.length < 2) out.push(`shaft ${shaft} has one member`);
    }
    return out;
  }, []);

  const legend = useMemo(() => typesOnFloor(layer, floorId), [floorId]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <AppBar position="static" elevation={0} color="default">
          <Toolbar variant="dense" sx={{ gap: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Floor Plan — Visual Layer
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {layer.file.counts.rooms} rooms · {layer.file.counts.walls} walls ·{" "}
              {layer.file.counts.doors} doors · {layer.file.counts.devices}{" "}
              devices
            </Typography>
            <Box sx={{ flex: 1 }} />
            {warnings.length === 0 ? (
              <Chip size="small" label="nothing to resolve" color="success" />
            ) : (
              warnings.map((w) => (
                <Chip key={w} size="small" label={w} color="warning" />
              ))
            )}
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={showAllRooms}
                  onChange={(e) => setShowAllRooms(e.target.checked)}
                />
              }
              label={
                <Typography variant="caption">Show all rooms</Typography>
              }
            />
          </Toolbar>
          <Divider />
          <Tabs
            value={floorId}
            onChange={(_, v) => {
              setFloorId(v);
              setSelectedRoomId(null);
              setSelectedGroupId(null);
            }}
            variant="scrollable"
          >
            {layer.floors.map((f) => (
              <Tab
                key={f.id}
                value={f.id}
                label={`${f.name} (level ${f.level})`}
                sx={{ textTransform: "none", minHeight: 40 }}
              />
            ))}
          </Tabs>
          <Divider />
        </AppBar>

        <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
          <Box
            sx={{
              width: 280,
              flexShrink: 0,
              borderRight: 1,
              borderColor: "divider",
            }}
          >
            <NavigationDrawer
              layer={layer}
              floorId={floorId}
              reach={reach}
              selectedRoomId={selectedRoomId}
              selectedGroupId={selectedGroupId}
              onSelectRoom={(id) => {
                setSelectedRoomId(id);
                setSelectedGroupId(null);
              }}
              onSelectGroup={(id) => {
                setSelectedGroupId(id);
                setSelectedRoomId(null);
              }}
            />
          </Box>

          <Box sx={{ flex: 1, minWidth: 0, position: "relative", bgcolor: "#F6F7F8" }}>
            <FloorPlanCanvas
              layer={layer}
              floorId={floorId}
              showAllRooms={showAllRooms}
              reach={reach}
              selectedRoomId={selectedRoomId}
              selectedGroupId={selectedGroupId}
              onSelectRoom={(id) => {
                setSelectedRoomId(id);
                setSelectedGroupId(null);
              }}
            />
            <Stack
              direction="row"
              spacing={1}
              sx={{
                position: "absolute",
                left: 12,
                bottom: 12,
                flexWrap: "wrap",
                rowGap: 1,
              }}
            >
              {legend.map((id) => {
                const t = layer.spaceTypes.get(id);
                if (!t) return null;
                return (
                  <Chip
                    key={id}
                    size="small"
                    label={t.name}
                    sx={{ bgcolor: t.color, color: "#15181B" }}
                  />
                );
              })}
            </Stack>
          </Box>

          <Box
            sx={{
              width: 340,
              flexShrink: 0,
              borderLeft: 1,
              borderColor: "divider",
            }}
          >
            <AccessPanel
              layer={layer}
              profileId={profileId}
              onProfileChange={setProfileId}
              reach={reach}
              startRoom={startRoom}
              selectedRoomId={selectedRoomId}
            />
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

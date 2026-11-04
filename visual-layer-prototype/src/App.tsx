import { useMemo, useState } from "react";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
import EditOutlined from "@mui/icons-material/EditOutlined";
import { ThemeProvider } from "@mui/material/styles";
import { AccessPanel } from "./ui/AccessPanel";
import { BuildingScreen } from "./ui/app/BuildingScreen";
import {
  AddFloorsDialog,
  ChooseMethodDialog,
  CreatingDialog,
} from "./ui/onboarding/CreateFloorPlanWizard";
import { CheckFloorsScreen } from "./ui/onboarding/CheckFloorsScreen";
import { FloorPlanCanvas, typesOnFloor } from "./ui/FloorPlanCanvas";
import { NavigationDrawer } from "./ui/NavigationDrawer";
import { EditModeScreen } from "./ui/edit/EditModeScreen";
import type { NewFloorPage } from "./ui/edit/NewSpaceDialog";
import { theme } from "./ui/theme";
import {
  buildAdjacency,
  defaultStartRoom,
  fitToBuilding,
  fixture,
  initEditState,
  reachable,
  shaftMembers,
  unguardedDevices,
  addStoreys,
  type CreateMethod,
  type EditState,
  type FloorList,
} from "./model";

/** The mock's building; the model has no building entity above a floor. */
const BUILDING_NAME = "Tower A";
const PLACE = "Riverside, Prague 4";

export default function App() {
  // One editable model, shared by the viewer and edit mode, so an edit made
  // in one is visible in the other.
  const [edit, setEdit] = useState<EditState>(() => initEditState(fixture));
  const [savedAt, setSavedAt] = useState(0);
  /**
   * Where the product starts is the building, not the plan: the customer
   * has their apartments, residents and devices already, and the plan is
   * the thing they are about to make.
   */
  const [screen, setScreen] = useState<"building" | "check" | "view" | "edit">(
    "building",
  );
  const [hasPlan, setHasPlan] = useState(false);
  /**
   * The check screen is reached twice over: from the building, when the
   * plan is first made, and from the editor, when floors are added to a
   * plan that exists. Leaving it has to go back to the right one, and
   * cancelling the second kind has to take the added floors with it —
   * they went into the model before the pages could be checked, so
   * that the check screen had storeys to show.
   */
  const [checkFrom, setCheckFrom] = useState<"building" | "edit">("building");
  const [beforeAdding, setBeforeAdding] = useState<EditState | null>(null);

  /** Where the creation wizard has got to, and what it has collected. */
  const [step, setStep] = useState<"none" | "how" | "what" | "creating">(
    "none",
  );
  const [method, setMethod] = useState<CreateMethod>("pdf");
  const [pending, setPending] = useState<FloorList>([]);

  /**
   * New floors from the editor's Add new space.
   *
   * Pages are added as storeys first and checked second, because the
   * check screen shows the storey a page stands for. Nothing is drawn
   * on them — the prototype has no detector, and the fixture has no
   * sixth floor to stand in — so each is reviewed in its undetected
   * state and drawn by hand after. No pages means one empty floor,
   * made on the spot, which the dialog's own note says is what no
   * file does.
   */
  const addFloors = (name: string, pages: NewFloorPage[]) => {
    if (pages.length === 0) {
      const { state: next, floorIds } = addStoreys(edit, [name]);
      setEdit(next);
      if (floorIds[0]) setFloorId(floorIds[0]);
      return;
    }
    // One page with a name typed takes the name; several are named from
    // their files, since one name cannot be three floors'.
    const names =
      pages.length === 1 && name.trim()
        ? [name]
        : pages.map((p) => p.name.replace(/\.[^.]+$/, ""));
    const { state: next, floorIds } = addStoreys(edit, names);
    setBeforeAdding(edit);
    setEdit(next);
    setPending(
      floorIds.map((id, i) => ({
        id: `pending:${i + 1}`,
        name: pages[i].name,
        source: pages[i].source,
        segmented: false,
        ground: false,
        checked: false,
        floor_id: id,
      })),
    );
    setCheckFrom("edit");
    setScreen("check");
  };

  const startWizard = (picked: CreateMethod | null) => {
    setCheckFrom("building");
    setBeforeAdding(null);
    setPending([]);
    if (picked === null) {
      setStep("how");
      return;
    }
    setMethod(picked);
    setStep("what");
  };

  const layer = edit.layer;
  const [floorId, setFloorId] = useState(layer.floors[0].id);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [showAllRooms, setShowAllRooms] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Rebuilt whenever the model changes — the index is derived, never patched.
  const adjacency = useMemo(() => buildAdjacency(layer), [layer]);
  const startRoom = useMemo(() => defaultStartRoom(layer), [layer]);

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
  }, [layer, profileId, adjacency, startRoom]);

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
  }, [layer]);

  const legend = useMemo(() => typesOnFloor(layer, floorId), [layer, floorId]);

  if (screen === "check") {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <CheckFloorsScreen
          state={edit}
          onChange={setEdit}
          place={PLACE}
          buildingName={BUILDING_NAME}
          floors={pending}
          onFloors={setPending}
          onCancel={() => {
            if (checkFrom === "edit" && beforeAdding) setEdit(beforeAdding);
            setBeforeAdding(null);
            setScreen(checkFrom);
          }}
          onSave={() => {
            setBeforeAdding(null);
            setHasPlan(true);
            if (checkFrom === "edit" && pending[0]?.floor_id) {
              setFloorId(pending[0].floor_id);
            }
            setScreen("edit");
          }}
        />
      </ThemeProvider>
    );
  }

  if (screen === "building") {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BuildingScreen
          layer={layer}
          buildingName={BUILDING_NAME}
          place={PLACE}
          hasPlan={hasPlan}
          onCreatePlan={() => startWizard(null)}
          onCreatePlanWith={startWizard}
          onOpenPlan={() => setScreen("edit")}
        />
        <ChooseMethodDialog
          open={step === "how"}
          onCancel={() => setStep("none")}
          onNext={(picked) => {
            setMethod(picked);
            setStep("what");
          }}
        />
        <AddFloorsDialog
          open={step === "what"}
          method={method}
          floors={pending}
          onFloors={setPending}
          onBack={() => setStep("how")}
          onCancel={() => setStep("none")}
          onNext={() => {
            setPending(fitToBuilding(pending));
            setStep("creating");
          }}
        />
        <CreatingDialog
          open={step === "creating"}
          floors={pending}
          onBack={() => setStep("what")}
          onCancel={() => setStep("none")}
          onDone={() => {
            setStep("none");
            setScreen("check");
          }}
        />
      </ThemeProvider>
    );
  }

  if (screen === "edit") {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <EditModeScreen
          state={edit}
          onChange={setEdit}
          buildingName={BUILDING_NAME}
          place={PLACE}
          floorId={floorId}
          onFloorChange={setFloorId}
          dirty={edit.undo.length > savedAt}
          // Leaving the editor goes back to the building, where the
          // Floor Plan tab now holds the plan itself.
          onClose={() => setScreen("building")}
          onSave={() => {
            setSavedAt(edit.undo.length);
            setHasPlan(true);
            setScreen("building");
          }}
          onAddFloors={addFloors}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <AppBar position="static">
          <Toolbar variant="dense" sx={{ gap: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Floor Plan — Visual Layer
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {/* Counted here rather than read from the fixture's `counts`
                  block, which is derivable and so can go stale. */}
              {layer.file.rooms.length} rooms · {layer.file.walls.length} walls
              · {layer.file.doors.length} doors · {layer.file.devices.length}{" "}
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
              label={<Typography variant="caption">Show all rooms</Typography>}
            />
            <Button
              variant="contained"
              size="small"
              startIcon={<EditOutlined />}
              onClick={() => setScreen("edit")}
            >
              Edit
            </Button>
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

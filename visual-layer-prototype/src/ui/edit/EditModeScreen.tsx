/**
 * Edit mode, Structure. Figma: building/floorplan/editMode/StructureMode
 * (36:4871) — app bar, floor-plan action bar, then the 256 / canvas / 320
 * three-column content.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Snackbar from "@mui/material/Snackbar";
import { FloorPlanCanvas, type CanvasControls } from "../FloorPlanCanvas";
import { AlignFloorView } from "./AlignFloorView";
import { CANVAS_BACKGROUND } from "../theme";
import { CategoriesDrawer } from "./CategoriesDrawer";
import { EditAppBar } from "./EditAppBar";
import { FloorPlanActionBar, type EditModeName, type EditTool } from "./FloorPlanActionBar";
import { StructureTree } from "./StructureTree";
import {
  OperationRejected,
  addDoor,
  IDENTITY,
  alignFloor,
  deleteWall,
  divideRoom,
  floorTransform,
  landingsFor,
  referenceFloor,
  type Transform,
  setRoomSpaceType,
  shaftImpact,
  previewDeleteWall,
  previewDivide,
  type DivideRoomRequest,
  addSpaceType,
  canRedo,
  canUndo,
  previewAddDoor,
  recolorSpaceType,
  redo,
  renameSpaceType,
  setRoomSurfaced,
  undo,
  type EditState,
  type WallHit,
} from "../../model";

export interface EditModeScreenProps {
  state: EditState;
  onChange: (next: EditState) => void;
  buildingName: string;
  place: string;
  floorId: string;
  onFloorChange: (floorId: string) => void;
  onClose: () => void;
  onSave: () => void;
  /** True once anything has been edited since entering edit mode. */
  dirty: boolean;
}

/** "floors 0 to 4", or "floors 0 to 1 and 3 to 4" once a shaft is broken. */
function describeRuns(runs: number[][]): string {
  if (runs.length === 0) return "no floors";
  const parts = runs.map((run) =>
    run.length === 1 ? `${run[0]}` : `${run[0]} to ${run[run.length - 1]}`,
  );
  const joined =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  const total = runs.reduce((n, run) => n + run.length, 0);
  return `${total === 1 ? "floor" : "floors"} ${joined}`;
}

export function EditModeScreen({
  state,
  onChange,
  buildingName,
  place,
  floorId,
  onFloorChange,
  onClose,
  onSave,
  dirty,
}: EditModeScreenProps) {
  const [tool, setTool] = useState<EditTool>("select");
  const [mode, setMode] = useState<EditModeName>("structure");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: "ok" | "bad" } | null>(
    null,
  );
  const controls = useRef<CanvasControls | null>(null);
  // Stable, so the bridge's effect does not re-run on every render.
  const handleControls = useCallback((c: CanvasControls) => {
    controls.current = c;
  }, []);

  const { layer } = state;

  // Esc reverts the view toggle, as the doc specifies, and clears selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setTool("select");
      setSelectedRoomId(null);
      setSelectedGroupId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selectRoom = useCallback((id: string | null) => {
    setSelectedRoomId(id);
    setSelectedGroupId(null);
  }, []);

  const selectGroup = useCallback((id: string | null) => {
    setSelectedGroupId(id);
    setSelectedRoomId(null);
  }, []);

  /** Run an operation, and turn a refusal into a message rather than a throw. */
  const run = useCallback(
    (op: () => EditState) => {
      try {
        const next = op();
        onChange(next);
        const entry = next.undo[next.undo.length - 1];
        if (entry) setToast({ text: `${entry.label} — done`, kind: "ok" });
      } catch (e) {
        if (e instanceof OperationRejected) {
          setToast({ text: e.message, kind: "bad" });
          return;
        }
        throw e;
      }
    },
    [onChange],
  );

  const placementError = useCallback(
    (hit: WallHit) => {
      const preview = previewAddDoor(state, hit);
      return preview.ok ? null : preview.reason;
    },
    [state],
  );

  const handlePlaceDoor = useCallback(
    (hit: WallHit) =>
      run(() =>
        addDoor(state, { wallId: hit.wallId, t: hit.t, opensInto: hit.room }),
      ),
    [run, state],
  );

  const divideError = useCallback(
    (req: DivideRoomRequest) => {
      const preview = previewDivide(state, req);
      return preview.ok ? null : preview.reason;
    },
    [state],
  );

  const handleDivideRoom = useCallback(
    (req: DivideRoomRequest) => run(() => divideRoom(state, req)),
    [run, state],
  );

  const deleteWallError = useCallback(
    (wallId: string) => {
      const preview = previewDeleteWall(state, { wallId });
      return preview.ok ? null : preview.reason;
    },
    [state],
  );

  const handleDeleteWall = useCallback(
    (wallId: string) => run(() => deleteWall(state, { wallId })),
    [run, state],
  );

  /**
   * Taking a space out of the stairs or lift category is not a recolour: it
   * drops that storey out of the shaft, and the floors above it lose the
   * only thing connecting them. Ask first, and say what actually breaks —
   * which storeys stop being linked — rather than warning about "structure"
   * in the abstract.
   */
  const [confirming, setConfirming] = useState<{
    roomId: string;
    typeId: string | null;
    impact: ReturnType<typeof shaftImpact>;
  } | null>(null);

  /**
   * The transform being tried, kept here while align mode is open so the
   * floor's stored one is only touched on Apply — backing out has to leave
   * the building exactly as it was.
   */
  const [draftTransform, setDraftTransform] = useState<Transform | null>(null);
  const aligning = tool === "align" && draftTransform !== null;

  const startAlign = useCallback(() => {
    const floor = layer.floors.find((f) => f.id === floorId);
    setDraftTransform(floor ? floorTransform(floor) : IDENTITY);
  }, [layer, floorId]);

  const applyAlign = useCallback(() => {
    if (!draftTransform) return;
    run(() =>
      alignFloor(state, {
        floorId,
        transform: draftTransform,
        landings: landingsFor(layer, floorId, draftTransform),
      }),
    );
    setDraftTransform(null);
    setTool("select");
  }, [draftTransform, floorId, layer, run, state]);

  const assignCategory = useCallback(
    (roomId: string, typeId: string | null) => {
      const impact = shaftImpact(layer, roomId, typeId);
      if (impact) {
        setConfirming({ roomId, typeId, impact });
        return;
      }
      run(() => setRoomSpaceType(state, roomId, typeId));
    },
    [layer, run, state],
  );

  const undoLabel = state.undo[state.undo.length - 1]?.label ?? null;
  const redoLabel = state.redo[state.redo.length - 1]?.label ?? null;

  const showRoomById = useCallback(
    (roomId: string) => {
      run(() => setRoomSurfaced(state, roomId, true));
      selectRoom(roomId);
    },
    [run, state, selectRoom],
  );

  const hideRoomById = useCallback(
    (roomId: string) => {
      run(() => setRoomSurfaced(state, roomId, false));
    },
    [run, state],
  );

  const newCategoryName = useMemo(() => {
    const taken = new Set(layer.file.space_types.map((t) => t.id));
    for (let n = 1; ; n += 1) {
      const id = `category_${n}`;
      if (!taken.has(id)) return id;
    }
  }, [layer]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <EditAppBar
        place={place}
        canUndo={canUndo(state)}
        canRedo={canRedo(state)}
        undoLabel={undoLabel}
        redoLabel={redoLabel}
        dirty={dirty}
        onUndo={() => onChange(undo(state))}
        onRedo={() => onChange(redo(state))}
        onZoomIn={() => controls.current?.zoomIn()}
        onZoomOut={() => controls.current?.zoomOut()}
        onZoomFit={() => controls.current?.reset()}
        onClose={onClose}
        onSave={onSave}
      />

      <FloorPlanActionBar
        tool={tool}
        canAlign={referenceFloor(layer, floorId) !== null}
        onToolChange={(next) => {
          setTool(next);
          if (next === "align") startAlign();
          else setDraftTransform(null);
        }}
        mode={mode}
        onModeChange={setMode}
      />

      <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
        <StructureTree
          layer={layer}
          buildingName={buildingName}
          floorId={floorId}
          onFloorChange={onFloorChange}
          selectedRoomId={selectedRoomId}
          onSelectRoom={selectRoom}
        />

        <Box sx={{ flex: 1, minWidth: 0, bgcolor: CANVAS_BACKGROUND }}>
          {aligning ? (
            <AlignFloorView
              layer={layer}
              floorId={floorId}
              transform={draftTransform}
              onTransformChange={setDraftTransform}
              onApply={applyAlign}
              onCancel={() => {
                setDraftTransform(null);
                setTool("select");
              }}
            />
          ) : (
          <FloorPlanCanvas
            layer={layer}
            floorId={floorId}
            showAllRooms={false}
            reach={null}
            selectedRoomId={selectedRoomId}
            selectedGroupId={selectedGroupId}
            onSelectRoom={selectRoom}
            onSelectGroup={selectGroup}
            // The unbuilt tools leave the map selecting; the four that do
            // something drive it.
            tool={
              tool === "door" ||
              tool === "wall" ||
              tool === "remove_wall" ||
              tool === "show" ||
              tool === "hide"
                ? tool
                : "select"
            }
            // A device's status is about how the building is running, not
            // about its shape, so it is not shown while editing the shape.
            showDeviceStatus={false}
            onPlaceDoor={handlePlaceDoor}
            onDivideRoom={handleDivideRoom}
            divideError={divideError}
            onDeleteWall={handleDeleteWall}
            deleteWallError={deleteWallError}
            onShowRoom={showRoomById}
            onHideRoom={hideRoomById}
            placementError={placementError}
            onControls={handleControls}
          />
          )}
        </Box>

        <CategoriesDrawer
          layer={layer}
          selectedRoomId={selectedRoomId}
          onSelectRoom={(id) => {
            selectRoom(id);
            const room = layer.rooms.get(id);
            if (room && room.floor_id !== floorId) onFloorChange(room.floor_id);
          }}
          onRename={(id, name) => run(() => renameSpaceType(state, id, name))}
          onRecolor={(id, color) => run(() => recolorSpaceType(state, id, color))}
          onAssignCategory={assignCategory}
          onNewCategory={() =>
            run(() =>
              addSpaceType(state, {
                id: newCategoryName,
                name: "New category",
                color: "#9E9E9E",
              }),
            )
          }
        />
      </Box>

      <Dialog
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        maxWidth="xs"
      >
        <DialogTitle>Take this space out of the shaft?</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            {confirming?.impact && (
              <>
                <p>
                  {layer.rooms.get(confirming.roomId)?.name} is part of the{" "}
                  {confirming.impact.name} shaft running through this building.
                  Changing its category takes it out, and the{" "}
                  {confirming.impact.lostLinks === 1
                    ? "link"
                    : `${confirming.impact.lostLinks} links`}{" "}
                  through it {confirming.impact.lostLinks === 1 ? "goes" : "go"}{" "}
                  with it.
                </p>
                <p>
                  {describeRuns(confirming.impact.before)} would become{" "}
                  {describeRuns(confirming.impact.after)}. Access verification
                  runs over those links, so anything only reachable through
                  this shaft will stop being reachable.
                </p>
              </>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setConfirming(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              if (confirming) {
                const { roomId, typeId } = confirming;
                run(() => setRoomSpaceType(state, roomId, typeId));
              }
              setConfirming(null);
            }}
          >
            Change it anyway
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast !== null}
        autoHideDuration={toast?.kind === "bad" ? 8000 : 3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={toast?.kind === "bad" ? "warning" : "success"}
          variant="filled"
          onClose={() => setToast(null)}
        >
          {toast?.text}
        </Alert>
      </Snackbar>
    </Box>
  );
}

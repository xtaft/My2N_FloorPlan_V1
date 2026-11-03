/**
 * Edit mode, Structure. Figma: building/floorplan/editMode/StructureMode
 * (36:4871) — app bar, floor-plan action bar, then the 256 / canvas / 320
 * three-column content.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Snackbar from "@mui/material/Snackbar";
import { FloorPlanCanvas, type CanvasControls } from "../FloorPlanCanvas";
import { CANVAS_BACKGROUND } from "../theme";
import { CategoriesDrawer } from "./CategoriesDrawer";
import { EditAppBar } from "./EditAppBar";
import { FloorPlanActionBar, type EditModeName, type EditTool } from "./FloorPlanActionBar";
import { StructureTree } from "./StructureTree";
import {
  OperationRejected,
  addDoor,
  deleteWall,
  divideRoom,
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
        onToolChange={setTool}
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

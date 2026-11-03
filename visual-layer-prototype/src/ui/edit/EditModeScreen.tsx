/**
 * Edit mode, Structure. Figma: building/floorplan/editMode/StructureMode
 * (36:4871) — app bar, floor-plan action bar, then the 256 / canvas / 320
 * three-column content.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Delete from "@mui/icons-material/Delete";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import Snackbar from "@mui/material/Snackbar";
import { FloorPlanCanvas, type CanvasControls } from "../FloorPlanCanvas";
import { AlignFloorView } from "./AlignFloorView";
import { StructureRowMenu, type RowTarget } from "./StructureRowMenu";
import { TREE_DEFAULT } from "./StructureTree";
import { DRAWER_DEFAULT } from "./CategoriesDrawer";
import { DoorMenu } from "./DoorMenu";
import { ImportSpaceList } from "./ImportSpaceList";
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
  applySpaceList,
  deleteDoor,
  placeSpace,
  removeUnplacedSpace,
  deleteRoom,
  detachRoom,
  flipDoorHinge,
  flipDoorSwing,
  dissolveGroup,
  renameGroup,
  renameRoom,
  reassignSpaceType,
  deleteSpaceType,
  setGroupRoomsSurfaced,
  setGroupSpaceType,
  setRoomSpaceType,
  shaftImpact,
  unassignRoom,
  type Group,
  type Room,
  previewDeleteWall,
  previewDivide,
  type DivideRoomRequest,
  addSpaceType,
  newSpaceType,
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
  const [importing, setImporting] = useState(false);
  /** The menu on a space that has no shape yet. */
  const [unplacedMenu, setUnplacedMenu] = useState<{
    el: HTMLElement;
    spaceId: string;
  } | null>(null);
  /**
   * A space armed for placing. The next room clicked on the plan takes its
   * name and category — this is the import's first matching step done by
   * hand, for the rows whose names nobody could have guessed.
   */
  const [placing, setPlacing] = useState<string | null>(null);
  const [treeWidth, setTreeWidth] = useState(TREE_DEFAULT);
  const [drawerWidth, setDrawerWidth] = useState(DRAWER_DEFAULT);
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

  /** Which row's menu is open, and on what. */
  const [rowMenu, setRowMenu] = useState<{
    el: HTMLElement | null;
    at?: { top: number; left: number };
    target: RowTarget;
  } | null>(null);
  /** The door whose menu is open, and where on screen it was clicked. */
  const [doorMenu, setDoorMenu] = useState<{
    doorId: string;
    at: { top: number; left: number };
  } | null>(null);
  /** The row being renamed in place, and the text so far. */
  const [renaming, setRenaming] = useState<{
    id: string;
    kind: "room" | "group";
    draft: string;
  } | null>(null);

  const commitRename = useCallback(() => {
    if (!renaming) return;
    const { id, kind, draft } = renaming;
    run(() =>
      kind === "room"
        ? renameRoom(state, id, draft)
        : renameGroup(state, id, draft),
    );
    setRenaming(null);
  }, [renaming, run, state]);

  /**
   * Folding a whole envelope away is not all-or-nothing: a room holding
   * hardware stays put, and the toast says which and why rather than the
   * operation silently doing less than it was asked.
   */
  const toggleHidden = useCallback(
    (target: RowTarget, hide: boolean) => {
      if (target.kind === "room") {
        run(() => setRoomSurfaced(state, target.room.id, !hide));
        return;
      }
      try {
        const { state: next, kept } = setGroupRoomsSurfaced(
          state,
          target.group.id,
          !hide,
        );
        onChange(next);
        setToast({
          text:
            kept.length > 0
              ? `Hid what it could — ${kept.length} stayed. ${kept[0]}`
              : `${hide ? "Hide" : "Show"} rooms — done`,
          kind: kept.length > 0 ? "bad" : "ok",
        });
      } catch (e) {
        if (e instanceof OperationRejected) {
          setToast({ text: e.message, kind: "bad" });
          return;
        }
        throw e;
      }
    },
    [onChange, run, state],
  );

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

  /**
   * Make a category and hand its id back, so the drawer can put the row
   * straight into rename — the name is the one thing the user came to the
   * button to decide, and a row called "New category" is not an answer.
   */
  const newCategory = useCallback((): string | null => {
    const type = newSpaceType(layer);
    try {
      onChange(addSpaceType(state, type));
      setToast({ text: "New category — done", kind: "ok" });
      return type.id;
    } catch (e) {
      if (e instanceof OperationRejected) {
        setToast({ text: e.message, kind: "bad" });
        return null;
      }
      throw e;
    }
  }, [layer, onChange, state]);

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
          onRowMenu={(el, target) => setRowMenu({ el, target })}
          renaming={renaming}
          onRenameChange={(draft) =>
            setRenaming((cur) => (cur ? { ...cur, draft } : cur))
          }
          onRenameCommit={commitRename}
          onRenameCancel={() => setRenaming(null)}
          width={treeWidth}
          onWidthChange={setTreeWidth}
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
            onDropSpace={(spaceId, roomId) =>
              run(() => placeSpace(state, spaceId, roomId))
            }
            placingSpace={placing !== null}
            onPlaceSpace={(roomId) => {
              const spaceId = placing;
              if (!spaceId) return;
              run(() => placeSpace(state, spaceId, roomId));
              setPlacing(null);
            }}
            onSpaceMenu={(target, at) => {
              const found =
                target.kind === "room"
                  ? layer.rooms.get(target.id)
                  : layer.groups.get(target.id);
              if (!found) return;
              setRowMenu({
                el: null,
                at,
                target:
                  target.kind === "room"
                    ? { kind: "room", room: found as Room }
                    : { kind: "group", group: found as Group },
              });
            }}
            // A door is a piece of structure, so it is selectable where
            // structure is edited and nowhere else. In devices mode a
            // click near a doorway is after the device on it.
            onDoorMenu={
              mode === "structure"
                ? (doorId, at) => setDoorMenu({ doorId, at })
                : undefined
            }
            selectedDoorId={doorMenu?.doorId ?? null}
            // Structure mode is about walls, doors and spaces. The
            // devices are the other mode's subject and only crowd this
            // one — a reader's 40px marker sits exactly where the doors
            // being edited are.
            showDevices={mode === "devices"}
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
          onReassign={(fromId, toId) =>
            run(() => reassignSpaceType(state, fromId, toId))
          }
          onDeleteCategory={(typeId) =>
            run(() => deleteSpaceType(state, typeId))
          }
          onRowMenu={(el, target) => setRowMenu({ el, target })}
          width={drawerWidth}
          onWidthChange={setDrawerWidth}
          onImportSpaces={() => setImporting(true)}
          onUnplacedMenu={(el, spaceId) => setUnplacedMenu({ el, spaceId })}
          onNewCategory={newCategory}
        />
      </Box>

      {/* What a space with no shape can do: take one, or go. */}
      <Menu
        anchorEl={unplacedMenu?.el ?? null}
        open={Boolean(unplacedMenu)}
        onClose={() => setUnplacedMenu(null)}
        slotProps={{ paper: { sx: { width: 256 } } }}
      >
        <MenuItem
          sx={{ minHeight: 36, py: 0.25 }}
          onClick={() => {
            setPlacing(unplacedMenu?.spaceId ?? null);
            setUnplacedMenu(null);
          }}
        >
          <ListItemIcon sx={{ minWidth: 0, mr: 2, color: "action.active" }}>
            <PlaceOutlined sx={{ fontSize: 20 }} />
          </ListItemIcon>
          <ListItemText
            primary="Place on the plan"
            primaryTypographyProps={{ variant: "body1" }}
          />
        </MenuItem>
        <Divider sx={{ my: 1 }} />
        <MenuItem
          sx={{ minHeight: 36, py: 0.25 }}
          onClick={() => {
            const id = unplacedMenu?.spaceId;
            if (id) run(() => removeUnplacedSpace(state, id));
            setUnplacedMenu(null);
          }}
        >
          <ListItemIcon sx={{ minWidth: 0, mr: 2, color: "error.main" }}>
            <Delete sx={{ fontSize: 20 }} />
          </ListItemIcon>
          <ListItemText
            primary="Remove from the list"
            primaryTypographyProps={{ variant: "body1", color: "error.main" }}
          />
        </MenuItem>
      </Menu>

      {/* While a space is armed, say which one and offer a way out. */}
      <Snackbar
        open={placing !== null}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        message={`Click the space on the plan that is ${
          (layer.file.unplaced_spaces ?? []).find((x) => x.id === placing)
            ?.name ?? "this space"
        }`}
        action={
          <Button color="inherit" size="small" onClick={() => setPlacing(null)}>
            Cancel
          </Button>
        }
      />

      <ImportSpaceList
        open={importing}
        layer={layer}
        onClose={() => setImporting(false)}
        onImport={(matches) => run(() => applySpaceList(state, matches))}
      />

      <DoorMenu
        door={doorMenu ? (layer.doors.get(doorMenu.doorId) ?? null) : null}
        at={doorMenu?.at ?? null}
        onClose={() => setDoorMenu(null)}
        onFlipSwing={() =>
          doorMenu && run(() => flipDoorSwing(state, doorMenu.doorId))
        }
        onFlipHinge={() =>
          doorMenu && run(() => flipDoorHinge(state, doorMenu.doorId))
        }
        onDelete={() =>
          doorMenu && run(() => deleteDoor(state, doorMenu.doorId))
        }
      />

      <StructureRowMenu
        layer={layer}
        anchorEl={rowMenu?.el ?? null}
        at={rowMenu?.at ?? null}
        target={rowMenu?.target ?? null}
        onClose={() => setRowMenu(null)}
        onRename={() => {
          if (!rowMenu) return;
          const { target } = rowMenu;
          setRenaming(
            target.kind === "room"
              ? { id: target.room.id, kind: "room", draft: target.room.name }
              : { id: target.group.id, kind: "group", draft: target.group.name },
          );
        }}
        onToggleHidden={(hide) => rowMenu && toggleHidden(rowMenu.target, hide)}
        onAssignCategory={(typeId) => {
          if (!rowMenu) return;
          const { target } = rowMenu;
          if (target.kind === "room") assignCategory(target.room.id, typeId);
          else run(() => setGroupSpaceType(state, target.group.id, typeId));
        }}
        onDetach={() => {
          const target = rowMenu?.target;
          if (target?.kind !== "room") return;
          run(() => detachRoom(state, target.room.id));
        }}
        onUnassign={() => {
          const target = rowMenu?.target;
          if (target?.kind !== "room") return;
          run(() => unassignRoom(state, target.room.id));
        }}
        onDelete={() => {
          const target = rowMenu?.target;
          if (!target) return;
          run(() =>
            target.kind === "group"
              ? dissolveGroup(state, target.group.id)
              : deleteRoom(state, target.room.id),
          );
        }}
      />


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

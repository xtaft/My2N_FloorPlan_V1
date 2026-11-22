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
import { EditImageView } from "./EditImageView";
import { StructureRowMenu, type RowTarget } from "./StructureRowMenu";
import { TREE_DEFAULT } from "./StructureTree";
import { DRAWER_DEFAULT } from "./CategoriesDrawer";
import { DoorMenu } from "./DoorMenu";
import { DiscardChangesDialog } from "./DiscardChangesDialog";
import { ModeSwitch, ZoomControls } from "./EditorChrome";
import { NewSpaceDialog, type NewFloorPage } from "./NewSpaceDialog";
import { ImportSpaceList } from "./ImportSpaceList";
import { CategoriesDrawer } from "./CategoriesDrawer";
import { DeviceMenu } from "./DeviceMenu";
import { AccessDeviceMenu } from "./AccessDeviceMenu";
import { AccessDrawer } from "./AccessDrawer";
import { DevicesDrawer } from "./DevicesDrawer";
import { PersonMenu } from "./PersonMenu";
import { EditAppBar } from "./EditAppBar";
import { FloorPlanActionBar, type EditModeName, type EditTool } from "./FloorPlanActionBar";
import { StructureTree } from "./StructureTree";
import {
  OperationRejected,
  addDoor,
  IDENTITY,
  alignFloor,
  deleteWall,
  addWall,
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
  unassignDevice,
  unassignGroup,
  unassignRoom,
  moveInTree,
  renameFloor,
  duplicateFloor,
  deleteFloor,
  setFloorBackground,
  placeFloorBackground,
  fitBackground,
  floorExtent,
  type PlanRect,
  renameUnplacedSpace,
  type Group,
  type Room,
  previewDeleteWall,
  previewAddWall,
  type AddWallRequest,
  addSpaceType,
  newSpaceType,
  createEnvelope,
  canRedo,
  canUndo,
  previewAddDoor,
  recolorSpaceType,
  redo,
  accessBadges,
  accessPaint,
  devicePass,
  type Device,
  accessShading,
  devicesHeldBy,
  addPersonToGroup,
  removePersonFromGroup,
  type AccessGroup,
  flipDeviceSide,
  placeDeviceInSpace,
  placeDeviceOnDoor,
  renameDevice,
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
  /** Leave without the changes: the plan goes back to its saved state. */
  onDiscard: () => void;
  /** True once anything has been edited since entering edit mode. */
  dirty: boolean;
  /**
   * A new floor leaves the editor: with pages it goes to be checked,
   * without it is made empty. Either way the screens above decide,
   * since the check screen is theirs.
   */
  onAddFloors: (name: string, pages: NewFloorPage[]) => void;
  /** Access groups, and the one write access mode makes: who is in them. */
  groups: readonly AccessGroup[];
  onGroupsChange: (next: AccessGroup[]) => void;
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
  onDiscard,
  dirty,
  onAddFloors,
  groups,
  onGroupsChange,
}: EditModeScreenProps) {
  const [newSpace, setNewSpace] = useState(false);
  /** Close was pressed with changes unsaved, and the question is up. */
  const [leaving, setLeaving] = useState(false);
  const [tool, setTool] = useState<EditTool>("select");
  const [importing, setImporting] = useState(false);
  /**
   * The tree's rows drag. Entered from any row's Reorder, left with the
   * tree's Done — or by leaving Structure, since moving a row is an edit
   * to the structure.
   */
  const [reordering, setReordering] = useState(false);
  /**
   * A space armed for placing. The next room clicked on the plan takes its
   * name and category — this is the import's first matching step done by
   * hand, for the rows whose names nobody could have guessed.
   */
  const [placing, setPlacing] = useState<string | null>(null);
  const [treeWidth, setTreeWidth] = useState(TREE_DEFAULT);
  const [drawerWidth, setDrawerWidth] = useState(DRAWER_DEFAULT);
  const [mode, setMode] = useState<EditModeName>("structure");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  // A tool armed in structure mode has nothing to act on in devices
  // mode, and leaving it armed would make the pointer behave oddly on a
  // screen whose buttons are all greyed.
  useEffect(() => {
    if (mode !== "structure") setTool("select");
  }, [mode]);
  /** Access mode: the groups and devices ticked, and the person asked
   *  about. A person and a tick list are different questions, so
   *  choosing one clears the other. */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [personId, setPersonId] = useState<string | null>(null);
  const [accessMenu, setAccessMenu] = useState<{
    el: HTMLElement | null;
    at?: { top: number; left: number };
    deviceId: string;
    /** Opened on a multi-device selection, so it offers the bulk acts. */
    bulk: boolean;
  } | null>(null);
  const [personMenu, setPersonMenu] = useState<{
    el: HTMLElement;
    personId: string;
  } | null>(null);

  const [draggingDevice, setDraggingDevice] = useState<{
    id: string;
    deviceType: string;
  } | null>(null);
  const [renamingDeviceId, setRenamingDeviceId] = useState<string | null>(null);
  const [deviceMenu, setDeviceMenu] = useState<{
    el: HTMLElement | null;
    at?: { top: number; left: number };
    deviceId: string;
  } | null>(null);
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

  /**
   * What the access question is being asked with: a person's own keys,
   * or whatever is ticked. Never both — picking one clears the other.
   */
  const allowed = useMemo(() => {
    if (personId) return new Set(devicesHeldBy(layer, personId, groups));
    return picked;
  }, [layer, personId, picked, groups]);

  const shading = useMemo(
    () =>
      mode === "access"
        ? // A person is asked about from the street; a selection of
          // devices is asked about from the doors themselves.
          accessShading(layer, allowed, personId ? "outside" : "devices")
        : null,
    [mode, layer, allowed, personId],
  );

  /** And for each device on the plan: does its door let the selection through. */
  const deviceAccess = useMemo(
    () => (mode === "access" ? (d: Device) => devicePass(d, allowed) : undefined),
    [mode, allowed],
  );

  /** The same answer, for the tree: the map only shows one storey. */
  const badges = useMemo(
    () => accessBadges(layer, shading),
    [layer, shading],
  );


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

  /** Like run(), for the groups: a value swapped, a toast, or the reason. */
  const changeGroups = useCallback(
    (op: () => AccessGroup[], label: string) => {
      try {
        onGroupsChange(op());
        setToast({ text: `${label} — done`, kind: "ok" });
      } catch (e) {
        if (e instanceof OperationRejected) {
          setToast({ text: e.message, kind: "bad" });
          return;
        }
        throw e;
      }
    },
    [onGroupsChange],
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

  const addWallError = useCallback(
    (req: AddWallRequest) => {
      const preview = previewAddWall(state, req);
      return preview.ok ? null : preview.reason;
    },
    [state],
  );

  const handleAddWall = useCallback(
    (req: AddWallRequest) => run(() => addWall(state, req)),
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

  /**
   * Edit image: where the background is being tried. Like the align
   * draft, it is kept here and only stored on Apply.
   */
  const [draftImage, setDraftImage] = useState<PlanRect | null>(null);
  const background = layer.floors.find((f) => f.id === floorId)?.background ?? null;
  const editingImage = tool === "image" && draftImage !== null && background !== null;

  const startImage = useCallback(() => {
    const image = layer.floors.find((f) => f.id === floorId)?.background;
    setDraftImage(
      image ? { x: image.x, y: image.y, width: image.width, height: image.height } : null,
    );
  }, [layer, floorId]);

  const applyImage = useCallback(() => {
    if (!draftImage) return;
    run(() => placeFloorBackground(state, floorId, draftImage));
    setDraftImage(null);
    setTool("select");
  }, [draftImage, floorId, run, state]);

  // The image being edited belongs to one floor. Turning to another,
  // or the image going away under an undo, ends the edit.
  useEffect(() => {
    if (tool === "image" && !background) {
      setDraftImage(null);
      setTool("select");
    }
  }, [tool, background]);
  useEffect(() => {
    setDraftImage(null);
    setTool((was) => (was === "image" ? "select" : was));
  }, [floorId]);

  /** Which row's menu is open, and on what. */
  const [rowMenu, setRowMenu] = useState<{
    el: HTMLElement | null;
    at?: { top: number; left: number };
    target: RowTarget;
    /** Which list or surface it was opened from: the items differ. */
    place: "navigation" | "map" | "drawer";
  } | null>(null);
  /** The hidden file input behind "Add background image", and the floor it is for. */
  const backgroundPicker = useRef<HTMLInputElement | null>(null);
  const backgroundFor = useRef<string | null>(null);
  /** The door whose menu is open, and where on screen it was clicked. */
  const [doorMenu, setDoorMenu] = useState<{
    doorId: string;
    at: { top: number; left: number };
  } | null>(null);
  /** The row being renamed in place, and the text so far. */
  const [renaming, setRenaming] = useState<{
    id: string;
    kind: "room" | "group" | "space" | "floor";
    draft: string;
  } | null>(null);

  const commitRename = useCallback(() => {
    if (!renaming) return;
    const { id, kind, draft } = renaming;
    run(() =>
      kind === "room"
        ? renameRoom(state, id, draft)
        : kind === "group"
          ? renameGroup(state, id, draft)
          : kind === "floor"
            ? renameFloor(state, id, draft)
            : renameUnplacedSpace(state, id, draft),
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
      // A floor and a space with no shape have nothing to fold.
      if (target.kind !== "group") return;
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

  const modeSwitch = <ModeSwitch mode={mode} onChange={setMode} />;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <EditAppBar
        place={place}
        // With nothing changed there is nothing to ask about.
        onClose={() => (dirty ? setLeaving(true) : onClose())}
        onSave={onSave}
        saveHint={
          dirty ? "Keep the changes and leave edit mode" : "Nothing has changed yet"
        }
      />

      <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
        <StructureTree
          layer={layer}
          buildingName={buildingName}
          floorId={floorId}
          onFloorChange={onFloorChange}
          selectedRoomId={selectedRoomId}
          onSelectRoom={selectRoom}
          onSelectGroup={selectGroup}
          selectedGroupId={selectedGroupId}
          onRowMenu={
            mode === "structure"
              ? (el, target) => setRowMenu({ el, target, place: "navigation" })
              : undefined
          }
          badges={badges}
          renaming={renaming}
          onRenameChange={(draft) =>
            setRenaming((cur) => (cur ? { ...cur, draft } : cur))
          }
          onRenameCommit={commitRename}
          onRenameCancel={() => setRenaming(null)}
          width={treeWidth}
          onWidthChange={setTreeWidth}
          onNewSpace={mode === "structure" ? () => setNewSpace(true) : undefined}
          reordering={reordering && mode === "structure"}
          onReorderDone={() => setReordering(false)}
          onMove={(moving, to) => {
            // Let go where it already was: nothing happened, so nothing
            // is announced.
            try {
              if (moveInTree(state, moving, to) === state) return;
            } catch {
              // run() below turns the refusal into its message.
            }
            run(() => moveInTree(state, moving, to));
          }}
        />

        {/* The plan and the bar that acts on it are one column: tree on
            the left, drawer on the right, and between them everything
            that is about the drawing. */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
        <FloorPlanActionBar
          tool={tool}
          canAlign={referenceFloor(layer, floorId) !== null}
          hasImage={background !== null}
          onToolChange={(next) => {
            setTool(next);
            if (next === "align") startAlign();
            else setDraftTransform(null);
            if (next === "image") startImage();
            else setDraftImage(null);
          }}
          mode={mode}
          canUndo={canUndo(state)}
          canRedo={canRedo(state)}
          undoLabel={undoLabel}
          redoLabel={redoLabel}
          onUndo={() => onChange(undo(state))}
          onRedo={() => onChange(redo(state))}
        />
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            position: "relative",
            bgcolor: "background.paper",
          }}
        >
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
          ) : editingImage ? (
            <EditImageView
              layer={layer}
              floorId={floorId}
              src={background.src}
              rect={draftImage}
              onRectChange={setDraftImage}
              onApply={applyImage}
              onCancel={() => {
                setDraftImage(null);
                setTool("select");
              }}
            />
          ) : (
          <FloorPlanCanvas
            grid
            layer={layer}
            floorId={floorId}
            showAllRooms={false}
            reach={null}
            selectedRoomId={selectedRoomId}
            selectedGroupId={selectedGroupId}
            // In access mode the spaces are the answer, not the
            // question: clicking one asks nothing, so it does nothing.
            onSelectRoom={mode === "access" ? () => {} : selectRoom}
            onSelectGroup={mode === "access" ? undefined : selectGroup}
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
            // A device's status is what the devices mode is about, and
            // noise in the mode that is about walls.
            // Status in every mode that is about the devices: how a reader
            // is doing matters whether you are placing it or asking what
            // it opens. Structure mode is about walls and names.
            showDeviceStatus={mode !== "structure"}
            deviceAccess={deviceAccess}
            onPlaceDoor={handlePlaceDoor}
            onAddWall={handleAddWall}
            addWallError={addWallError}
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
            // In devices mode the devices are the only thing with
            // anything to say. A room, a space or a doorway answering a
            // click there would be offering structure edits from the
            // mode that is not about structure.
            onSpaceMenu={mode !== "structure" ? undefined : (target, at) => {
              const found =
                target.kind === "room"
                  ? layer.rooms.get(target.id)
                  : layer.groups.get(target.id);
              if (!found) return;
              setRowMenu({
                el: null,
                at,
                place: "map",
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
            // Access mode draws the devices too — they are what the
            // answer is made of — but people never appear on the plan,
            // because a person is not somewhere, they are allowed
            // somewhere, and that is what the colours say.
            showDevices={mode !== "structure"}
            // Devices mode is about the devices: the spaces are there to
            // place them by, not to be edited, and are drawn to say so.
            mutedRooms={mode === "devices"}
            paint={shading ? accessPaint(shading) : undefined}
            selectedDeviceId={mode === "structure" ? null : selectedDeviceId}
            dragging={draggingDevice}
            onDropOnDoor={(deviceId, doorId, side) => {
              setDraggingDevice(null);
              run(() => placeDeviceOnDoor(state, deviceId, doorId, side));
            }}
            onDropInSpace={(deviceId, roomId) => {
              setDraggingDevice(null);
              run(() => placeDeviceInSpace(state, deviceId, roomId));
            }}
            // Access mode makes the devices the only thing on the
            // plan that answers a click, for the same reason devices
            // mode does: they are what the screen is about. The menu
            // differs — there it is rename and unassign, here it is
            // what this credential is doing to the answer on screen.
            onDeviceMenu={
              mode === "structure"
                ? undefined
                : (deviceId, at) => {
                    setSelectedDeviceId(deviceId);
                    if (mode === "access") {
                      setAccessMenu({ el: null, at, deviceId, bulk: false });
                    } else {
                      setDeviceMenu({ el: null, at, deviceId });
                    }
                  }
            }
            onShowRoom={showRoomById}
            onHideRoom={hideRoomById}
            placementError={placementError}
            onControls={handleControls}
          />
          )}
          {!aligning && !editingImage && (
            <ZoomControls
              onZoomOut={() => controls.current?.zoomOut()}
              onZoomIn={() => controls.current?.zoomIn()}
              onZoomFit={() => controls.current?.reset()}
            />
          )}
        </Box>
        </Box>

        {mode === "access" ? (
          <AccessDrawer
            header={modeSwitch}
            layer={layer}
            groups={groups}
            focusedDeviceId={selectedDeviceId}
            onDeviceFocus={(id) => {
              setSelectedDeviceId(id);
              const device = layer.file.devices.find((d) => d.id === id);
              if (device?.host_id && device.floor_id && device.floor_id !== floorId) {
                onFloorChange(device.floor_id);
              }
            }}
            picked={picked}
            onPicked={(next) => {
              setPicked(next);
              if (next.size > 0) setPersonId(null);
            }}
            personId={personId}
            onPerson={(id) => {
              setPersonId(id);
              if (id) setPicked(new Set());
            }}
            onDeviceMenu={(el, deviceId) =>
              setAccessMenu({
                el,
                deviceId,
                // Several ticked and you are acting on the selection,
                // not on the row the pointer happens to be over.
                bulk: picked.size > 1,
              })
            }
            onPersonMenu={(el, id) => setPersonMenu({ el, personId: id })}
            width={drawerWidth}
            onWidthChange={setDrawerWidth}
          />
        ) : mode === "devices" ? (
          <DevicesDrawer
            header={modeSwitch}
            layer={layer}
            selectedId={selectedDeviceId}
            onSelect={(id) => {
              setSelectedDeviceId(id);
              // Following a device to its storey, the way clicking a
              // space in the other panel follows that.
              const device = id
                ? layer.file.devices.find((d) => d.id === id)
                : undefined;
              if (
                device?.host_id &&
                device.floor_id &&
                device.floor_id !== floorId
              ) {
                onFloorChange(device.floor_id);
              }
            }}
            onMenu={(el, deviceId) => setDeviceMenu({ el, deviceId })}
            onDragStart={(deviceId) => {
              const device = layer.file.devices.find((d) => d.id === deviceId);
              if (device) {
                setDraggingDevice({
                  id: device.id,
                  deviceType: device.device_type,
                });
              }
            }}
            onDragEnd={() => setDraggingDevice(null)}
            renamingId={renamingDeviceId}
            onRenameCommit={(deviceId, name) => {
              setRenamingDeviceId(null);
              run(() => renameDevice(state, deviceId, name));
            }}
            onRenameCancel={() => setRenamingDeviceId(null)}
            width={drawerWidth}
            onWidthChange={setDrawerWidth}
          />
        ) : (
        <CategoriesDrawer
          header={modeSwitch}
          layer={layer}
          selectedRoomId={selectedRoomId}
          onSelectRoom={(id) => {
            selectRoom(id);
            const room = layer.rooms.get(id);
            if (room && room.floor_id !== floorId) onFloorChange(room.floor_id);
          }}
          onSelectGroup={(id) => {
            selectGroup(id);
            const group = layer.groups.get(id);
            if (group && group.floor_id !== floorId) onFloorChange(group.floor_id);
          }}
          onRename={(id, name) => run(() => renameSpaceType(state, id, name))}
          onRecolor={(id, color) => run(() => recolorSpaceType(state, id, color))}
          onReassign={(fromId, toId) =>
            run(() => reassignSpaceType(state, fromId, toId))
          }
          onDeleteCategory={(typeId) =>
            run(() => deleteSpaceType(state, typeId))
          }
          onRowMenu={(el, target) => setRowMenu({ el, target, place: "drawer" })}
          width={drawerWidth}
          onWidthChange={setDrawerWidth}
          onImportSpaces={() => setImporting(true)}
          onUnplacedMenu={(el, spaceId) => {
            const space = (layer.file.unplaced_spaces ?? []).find(
              (x) => x.id === spaceId,
            );
            if (space) setRowMenu({ el, target: { kind: "space", space }, place: "drawer" });
          }}
          onNewCategory={newCategory}
        />
        )}
      </Box>

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

      <DiscardChangesDialog
        open={leaving}
        onStay={() => setLeaving(false)}
        onDiscard={() => {
          setLeaving(false);
          onDiscard();
        }}
        onSaveAndClose={() => {
          setLeaving(false);
          onSave();
        }}
      />

      <NewSpaceDialog
        open={newSpace}
        layer={layer}
        buildingName={buildingName}
        onClose={() => setNewSpace(false)}
        onCreateEnvelope={(kind, name, members) => {
          setNewSpace(false);
          run(() => createEnvelope(state, { kind, name, members }));
        }}
        onCreateFloor={(name, pages) => {
          setNewSpace(false);
          onAddFloors(name, pages);
        }}
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

      <DeviceMenu
        device={
          deviceMenu
            ? (layer.file.devices.find((d) => d.id === deviceMenu.deviceId) ??
              null)
            : null
        }
        at={deviceMenu?.at ?? null}
        anchorEl={deviceMenu?.el ?? null}
        onClose={() => setDeviceMenu(null)}
        onRename={() => setRenamingDeviceId(deviceMenu?.deviceId ?? null)}
        onFlipSide={() => {
          if (deviceMenu) run(() => flipDeviceSide(state, deviceMenu.deviceId));
        }}
        onUnassign={() =>
          deviceMenu && run(() => unassignDevice(state, deviceMenu.deviceId))
        }
      />

      <AccessDeviceMenu
        open={Boolean(accessMenu)}
        anchorEl={accessMenu?.el ?? null}
        at={accessMenu?.at ?? null}
        count={accessMenu?.bulk ? picked.size : 1}
        inPath={accessMenu ? picked.has(accessMenu.deviceId) : false}
        onClose={() => setAccessMenu(null)}
        onShowInPath={() => {
          if (!accessMenu) return;
          setPersonId(null);
          setPicked(new Set([...picked, accessMenu.deviceId]));
        }}
        onRemoveFromPath={() => {
          if (!accessMenu) return;
          const next = new Set(picked);
          next.delete(accessMenu.deviceId);
          setPicked(next);
        }}
      />

      <PersonMenu
        open={Boolean(personMenu)}
        anchorEl={personMenu?.el ?? null}
        personId={personMenu?.personId ?? null}
        groups={groups}
        onClose={() => setPersonMenu(null)}
        onAddToGroup={(groupId) => changeGroups(() => addPersonToGroup(groups, groupId, personMenu!.personId), `Added to ${groups.find((g) => g.id === groupId)?.name ?? "group"}`)}
        onRemoveFromGroup={(groupId) => changeGroups(() => removePersonFromGroup(groups, groupId, personMenu!.personId), `Removed from ${groups.find((g) => g.id === groupId)?.name ?? "group"}`)}
      />

      <StructureRowMenu
        layer={layer}
        anchorEl={rowMenu?.el ?? null}
        at={rowMenu?.at ?? null}
        target={rowMenu?.target ?? null}
        place={rowMenu?.place}
        onClose={() => setRowMenu(null)}
        onDuplicate={() => {
          const target = rowMenu?.target;
          if (target?.kind !== "floor") return;
          try {
            const made = duplicateFloor(state, target.floor.id);
            onChange(made.state);
            // Shown straight away: a copy nobody is looking at might as
            // well not have been made.
            onFloorChange(made.floorId);
            setToast({ text: `Duplicate ${target.floor.name} — done`, kind: "ok" });
          } catch (e) {
            if (!(e instanceof OperationRejected)) throw e;
            setToast({ text: e.message, kind: "bad" });
          }
        }}
        onBackground={(add) => {
          const target = rowMenu?.target;
          if (target?.kind !== "floor") return;
          if (!add) {
            run(() => setFloorBackground(state, target.floor.id, null));
            return;
          }
          backgroundFor.current = target.floor.id;
          backgroundPicker.current?.click();
        }}
        onRename={() => {
          if (!rowMenu) return;
          const { target } = rowMenu;
          if (target.kind === "room") {
            setRenaming({ id: target.room.id, kind: "room", draft: target.room.name });
          } else if (target.kind === "group") {
            setRenaming({ id: target.group.id, kind: "group", draft: target.group.name });
          } else if (target.kind === "space") {
            setRenaming({ id: target.space.id, kind: "space", draft: target.space.name });
          } else {
            setRenaming({ id: target.floor.id, kind: "floor", draft: target.floor.name });
          }
        }}
        onReorder={() => {
          // Dragging is among the tree's rows, so nothing else should be
          // armed while it is on.
          setTool("select");
          setPlacing(null);
          setReordering(true);
        }}
        onPlace={() => {
          const target = rowMenu?.target;
          if (target?.kind !== "space") return;
          setReordering(false);
          setPlacing(target.space.id);
        }}
        onToggleHidden={(hide) => rowMenu && toggleHidden(rowMenu.target, hide)}
        onAssignCategory={(typeId) => {
          if (!rowMenu) return;
          const { target } = rowMenu;
          if (target.kind === "room") assignCategory(target.room.id, typeId);
          else if (target.kind === "group") {
            run(() => setGroupSpaceType(state, target.group.id, typeId));
          }
        }}
        onDetach={() => {
          const target = rowMenu?.target;
          if (target?.kind !== "room") return;
          run(() => detachRoom(state, target.room.id));
        }}
        onUnassign={() => {
          const target = rowMenu?.target;
          if (target?.kind === "room") {
            run(() => unassignRoom(state, target.room.id));
          } else if (target?.kind === "group") {
            run(() => unassignGroup(state, target.group.id));
          }
        }}
        onDelete={() => {
          const target = rowMenu?.target;
          if (!target) return;
          if (target.kind === "group") {
            run(() => dissolveGroup(state, target.group.id));
          } else if (target.kind === "room") {
            run(() => deleteRoom(state, target.room.id));
          } else if (target.kind === "space") {
            run(() => removeUnplacedSpace(state, target.space.id));
          } else {
            // The plan cannot go on showing a floor that is gone.
            const gone = target.floor.id;
            const other = layer.floors.find((f) => f.id !== gone);
            try {
              const next = deleteFloor(state, gone);
              if (gone === floorId && other) onFloorChange(other.id);
              onChange(next);
              setToast({ text: `Delete ${target.floor.name} — done`, kind: "ok" });
            } catch (e) {
              if (!(e instanceof OperationRejected)) throw e;
              setToast({ text: e.message, kind: "bad" });
            }
          }
        }}
      />

      {/* "Add background image" opens this. An image is read into the
          floor as a data URL: there is no server to put it on. */}
      <input
        ref={backgroundPicker}
        type="file"
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          const id = backgroundFor.current;
          // Cleared so choosing the same file twice still fires.
          e.target.value = "";
          if (!file || !id) return;
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result !== "string") return;
            const src = reader.result;
            // Its own proportions are needed to place it, and only the
            // decoded image knows them.
            const probe = new Image();
            probe.onload = () => {
              const rect = fitBackground(floorExtent(state.file, id), {
                width: probe.naturalWidth,
                height: probe.naturalHeight,
              });
              run(() => setFloorBackground(state, id, { src, ...rect }));
            };
            probe.onerror = () =>
              setToast({ text: "That file could not be read as an image.", kind: "bad" });
            probe.src = src;
          };
          reader.readAsDataURL(file);
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

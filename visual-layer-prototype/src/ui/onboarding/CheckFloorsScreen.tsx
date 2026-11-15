/**
 * Check the floors before the plan is made.
 *
 * Figma: 19:91706, and 30:23820 for a floor nothing could be read from.
 *
 * Detection is a guess, and this is the step where somebody looks at it.
 * Three things are being checked, in the order the right-hand panel lists
 * them: which spaces are shared, which are stairs and lifts, and whether
 * the floor sits over the one below it. A floor counts as checked once it
 * has been looked at, which is why opening it is what marks it — asking
 * for a second click to say "yes I looked" would be asking twice.
 *
 * No segmentation happens here. The spaces are the ones the model already
 * has; what this screen does is let the categories be corrected, which is
 * the same operation the editor's menus use.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Check from "@mui/icons-material/Check";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import DragHandle from "@mui/icons-material/DragHandle";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import LayersOutlined from "@mui/icons-material/LayersOutlined";
import Redo from "@mui/icons-material/Redo";
import SearchIcon from "@mui/icons-material/Search";
import OpenWith from "@mui/icons-material/OpenWith";
import RotateLeft from "@mui/icons-material/RotateLeft";
import RotateRight from "@mui/icons-material/RotateRight";
import Undo from "@mui/icons-material/Undo";
import { AlignFloorView } from "../edit/AlignFloorView";
import { AttentionBadge } from "../AttentionBadge";
import { FloorPlanCanvas, type CanvasControls } from "../FloorPlanCanvas";
import { EditAppBar } from "../edit/EditAppBar";
import { ActionBar, BarButton, BarGroup, ZoomControls } from "../edit/EditorChrome";
import { PANEL_BACKGROUND } from "../theme";
import {
  IDENTITY,
  applyTransform,
  OperationRejected,
  alignFloor,
  allChecked,
  canRedo,
  canUndo,
  floorShaftRings,
  floorCentre,
  floorTransform,
  referenceFloor,
  rotateAbout,
  invertTransform,
  floorsNeedingAlignment,
  landingsFor,
  markChecked,
  moveFloor,
  redo,
  ringsToPath,
  setGroupSpaceType,
  setRoomSpaceType,
  storeyLevels,
  storeyName,
  undo,
  type EditState,
  type FloorList,
  type Room,
  type Transform,
} from "../../model";

const CANVAS_BACKGROUND = "#eeeeee";

const NO_REFERENCE =
  "The lowest storey is the reference every other floor is fitted to";

/** The categories this step is about, in the order the panel lists them. */
const MARKS: { id: string; label: string; color: string }[] = [
  { id: "circulation", label: "Shared spaces", color: "#AEDAF5" },
  { id: "stairs", label: "Stair", color: "#E2B6E8" },
  { id: "elevator", label: "Elevator", color: "#F5C08A" },
];

const MARK_COLOR = new Map(MARKS.map((m) => [m.id, m.color]));

/**
 * Colour on this plan means "this is one of the things you are being
 * asked about".
 *
 * So the three marked kinds are filled and everything else is left bare.
 * A room or an apartment needs no colour here, because the panel says
 * anything left unmarked stays one — painting them would be arguing with
 * the instruction, and a plan where everything is coloured makes the
 * three that matter impossible to pick out.
 *
 * The fills are the legend's own values, from the one list above, so the
 * swatch beside the instruction and the space on the plan cannot say
 * different things.
 */
function paintForReview(room: Room): string | null {
  return MARK_COLOR.get(room.space_type ?? "") ?? null;
}

export interface CheckFloorsScreenProps {
  state: EditState;
  onChange: (next: EditState) => void;
  place: string;
  buildingName: string;
  floors: FloorList;
  onFloors: (next: FloorList) => void;
  onCancel: () => void;
  onSave: () => void;
}

export function CheckFloorsScreen({
  state,
  onChange,
  place,
  buildingName,
  floors,
  onFloors,
  onCancel,
  onSave,
}: CheckFloorsScreenProps) {
  const layer = state.layer;

  const [atId, setAtId] = useState<string | null>(floors[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    target: { kind: "room" | "group"; id: string };
    at: { top: number; left: number };
  } | null>(null);
  const [draft, setDraft] = useState<Transform | null>(null);
  /**
   * The floors in the order they were first opened.
   *
   * A floor is aligned against the one checked before it, not against the
   * storey underneath: the previous floor is the one the user has just
   * decided is right, so it is the only thing they have to line up with.
   * Walk the list from the bottom and the two coincide; jump about and
   * they do not, and the previous one is still the right answer.
   */
  const [order, setOrder] = useState<string[]>([]);

  const index = Math.max(0, floors.findIndex((f) => f.id === atId));
  const floor = floors[index];

  /**
   * Which drawn floor stands for this page.
   *
   * The pending floors are pages somebody dropped in; the model already
   * holds a building. Pairing them by position is what lets the real plan
   * be checked without inventing a detector.
   */
  // A page added to a building that has a plan carries its own storey;
  // the first wizard's pages are paired with the drawn floors by position.
  const floorId =
    floor?.floor_id ?? layer.floors[index % layer.floors.length]?.id ?? "";

  const levels = useMemo(() => storeyLevels(floors), [floors]);
  /** Floors whose stairs and lifts are not over the ones below. */
  const out = useMemo(() => floorsNeedingAlignment(layer), [layer]);

  // Looking at a floor is what checks it.
  const go = useCallback(
    (id: string) => {
      setAtId(id);
      setDraft(null);
      onFloors(markChecked(floors, id));
    },
    [floors, onFloors],
  );

  // The floor on screen is checked by being on screen — including the
  // first one, which nobody navigated to. After the render, not during
  // it: this sets state the parent owns.
  const here = floor?.id;
  const read = floor?.checked;
  useEffect(() => {
    if (!here) return;
    setOrder((was) => (was.includes(here) ? was : [...was, here]));
    if (!read) onFloors(markChecked(floors, here));
  }, [here, read, floors, onFloors]);

  /** The model floor standing for a page, by position in the list. */
  const modelFloorOf = useCallback(
    (pendingId: string | undefined) => {
      if (!pendingId) return undefined;
      const i = floors.findIndex((f) => f.id === pendingId);
      if (i < 0) return undefined;
      return floors[i].floor_id ?? layer.floors[i % layer.floors.length]?.id;
    },
    [floors, layer],
  );

  const previousId = useMemo(() => {
    const at = order.indexOf(here ?? "");
    const before = at > 0 ? order[at - 1] : at === -1 ? order.at(-1) : undefined;
    return modelFloorOf(before);
  }, [order, here, modelFloorOf]);

  /**
   * The previous floor's shafts, drawn over this one.
   *
   * Visible without opening a tool, because "this floor should line up
   * with the one below" is a thing to notice rather than a thing to go
   * looking for. The rings are carried into this floor's own coordinates
   * — out of the other floor's transform and back through this one — so
   * where they sit on screen is exactly how far out the fit is.
   */
  const shaftGuide = useMemo(() => {
    if (!previousId || previousId === floorId) return null;
    const from = layer.floors.find((f) => f.id === previousId);
    const onto = layer.floors.find((f) => f.id === floorId);
    if (!from || !onto) return null;

    const fromT = floorTransform(from);
    const ontoT = floorTransform(onto);
    const shafts = floorShaftRings(layer, previousId);
    if (shafts.length === 0) return null;

    return (
      <g pointerEvents="none">
        {shafts.map((shaft) => (
          <path
            key={shaft.groupId}
            d={ringsToPath(
              shaft.rings.map((ring) =>
                ring.map((v) => ({
                  ...invertTransform(ontoT, applyTransform(fromT, v)),
                  id: v.id,
                })),
              ),
            )}
            fill="none"
            stroke="#2196f3"
            strokeWidth={4}
            strokeDasharray="12 8"
            fillRule="evenodd"
          />
        ))}
      </g>
    );
  }, [layer, previousId, floorId]);

  const run = (op: () => EditState) => {
    try {
      onChange(op());
    } catch (e) {
      if (!(e instanceof OperationRejected)) throw e;
    }
  };

  const mark = (typeId: string | null) => {
    if (!menu) return;
    const { kind, id } = menu.target;
    run(() =>
      kind === "group"
        ? setGroupSpaceType(state, id, typeId)
        : setRoomSpaceType(state, id, typeId),
    );
    setMenu(null);
  };

  const applyAlign = () => {
    if (!draft) return;
    run(() =>
      alignFloor(state, {
        floorId,
        transform: draft,
        landings: landingsFor(layer, floorId, draft),
      }),
    );
    setDraft(null);
  };

  const startAlign = () => {
    const f = layer.floors.find((x) => x.id === floorId);
    setDraft(f ? floorTransform(f) : IDENTITY);
  };

  /** The lowest storey is what the others are fitted to. */
  const canAlignHere = Boolean(floor?.segmented) && referenceFloor(layer, floorId) !== null;

  /** A quarter turn, into the align draft — on the spot, about the floor's middle. */
  const turn = (radians: number) => {
    const f = layer.floors.find((x) => x.id === floorId);
    const from = draft ?? (f ? floorTransform(f) : IDENTITY);
    setDraft(rotateAbout(from, floorCentre(layer, floorId), radians));
  };

  /** The canvas's own zoom, driven from the corner of the plan. */
  const controls = useRef<CanvasControls | null>(null);
  const handleControls = useCallback((c: CanvasControls) => {
    controls.current = c;
  }, []);

  const shown = query.trim()
    ? floors.filter((f) =>
        f.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : floors;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <EditAppBar
        place={place}
        onClose={onCancel}
        onSave={onSave}
        saveDisabled={!allChecked(floors)}
        saveHint={allChecked(floors) ? "" : "Look at every floor before saving"}
      />

      <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* ------------------------------------------------- the floors */}
        <Box
          sx={{
            width: 256,
            flexShrink: 0,
            borderRight: 1,
            borderColor: "divider",
            bgcolor: PANEL_BACKGROUND,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Box sx={{ p: 1 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 20 }} />
                  </InputAdornment>
                ),
              }}
            />
          </Box>
          <Typography
            variant="body2"
            fontWeight={500}
            sx={{ px: 2, py: 1, display: "flex", alignItems: "center", gap: 1 }}
          >
            <LayersOutlined sx={{ fontSize: 18 }} />
            {buildingName}
          </Typography>

          <List dense disablePadding sx={{ flex: 1, overflowY: "auto" }}>
            {shown.map((f) => {
              const level = levels.get(f.id);
              return (
                <ListItemButton
                  key={f.id}
                  selected={f.id === floor?.id}
                  draggable
                  onDragStart={() => setDragging(f.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragging && dragging !== f.id) {
                      onFloors(moveFloor(floors, dragging, floors.indexOf(f)));
                    }
                  }}
                  onDragEnd={() => setDragging(null)}
                  onClick={() => go(f.id)}
                  sx={{ pl: 1, opacity: dragging === f.id ? 0.4 : 1 }}
                >
                  <Box sx={{ width: 24 }}>
                    {f.checked && (
                      <Check sx={{ fontSize: 18, color: "#2E7D32" }} />
                    )}
                  </Box>
                  <LayersOutlined
                    sx={{
                      fontSize: 18,
                      mr: 1,
                      color: f.id === floor?.id ? "primary.main" : "inherit",
                    }}
                  />
                  <ListItemText
                    primary={
                      level === undefined ? f.name : storeyName(level)
                    }
                    secondary={f.name}
                    primaryTypographyProps={{ variant: "body2", noWrap: true }}
                    secondaryTypographyProps={{ variant: "caption", noWrap: true }}
                  />
                  {f.segmented && out.has(modelFloorOf(f.id) ?? "") && (
                    <Box sx={{ display: "flex", mr: 1 }}>
                      <AttentionBadge
                        label="Needs aligning"
                        hint="This floor does not sit over the one below. Use Align floor."
                      />
                    </Box>
                  )}
                  <DragHandle
                    sx={{ fontSize: 18, color: "text.secondary", cursor: "grab" }}
                  />
                </ListItemButton>
              );
            })}
          </List>
        </Box>

        {/* --------------------------------------------------- the plan */}
        <Box
          sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}
        >
        <ActionBar>
          <BarGroup>
            <BarButton
              icon={<Undo sx={{ fontSize: 16 }} />}
              ariaLabel="Undo"
              hint={
                canUndo(state)
                  ? `Undo ${state.undo[state.undo.length - 1].label.toLowerCase()}`
                  : "Nothing to undo"
              }
              disabled={!canUndo(state)}
              onClick={() => onChange(undo(state))}
            />
            <BarButton
              icon={<Redo sx={{ fontSize: 16 }} />}
              ariaLabel="Redo"
              hint={
                canRedo(state)
                  ? `Redo ${state.redo[state.redo.length - 1].label.toLowerCase()}`
                  : "Nothing to redo"
              }
              disabled={!canRedo(state)}
              onClick={() => onChange(redo(state))}
            />
          </BarGroup>

          {/* Turning is part of aligning: a quarter turn opens the align
              view with the floor already turned, where it is seen
              against the floor below and applied or let go like any
              other move. Nothing is turned behind the user's back. */}
          <BarGroup>
            <BarButton
              icon={<RotateLeft sx={{ fontSize: 16 }} />}
              ariaLabel="Rotate left"
              hint={canAlignHere ? "Turn this floor a quarter turn left" : NO_REFERENCE}
              disabled={!canAlignHere}
              onClick={() => turn(-Math.PI / 2)}
            />
            <BarButton
              icon={<RotateRight sx={{ fontSize: 16 }} />}
              ariaLabel="Rotate right"
              hint={canAlignHere ? "Turn this floor a quarter turn right" : NO_REFERENCE}
              disabled={!canAlignHere}
              onClick={() => turn(Math.PI / 2)}
            />
          </BarGroup>

          <BarGroup>
            <BarButton
              label="Apply to similar floors"
              icon={<ContentCopyOutlined sx={{ fontSize: 16 }} />}
              hint="Not built: nothing here says which floors are alike"
              disabled
            />
          </BarGroup>

          {/* One tool, not two: moving the floor over the one below is
              what aligning it is, and the align view is where the
              moving happens. */}
          <BarGroup>
            <BarButton
              label="Align floor"
              icon={<OpenWith sx={{ fontSize: 16 }} />}
              hint={canAlignHere ? "Move this floor until it sits over the one below" : NO_REFERENCE}
              disabled={!canAlignHere}
              pressed={Boolean(draft)}
              onClick={draft ? applyAlign : startAlign}
            />
          </BarGroup>
        </ActionBar>
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            position: "relative",
            bgcolor: CANVAS_BACKGROUND,
          }}
        >
          {!floor ? null : !floor.segmented ? (
            <UndetectedFloor />
          ) : draft ? (
            <AlignFloorView
              layer={layer}
              floorId={floorId}
              transform={draft}
              onTransformChange={setDraft}
              onApply={applyAlign}
              onCancel={() => setDraft(null)}
              referenceFloorId={previousId}
              paint={paintForReview}
            />
          ) : (
            <FloorPlanCanvas
              grid
              layer={layer}
              floorId={floorId}
              showAllRooms={false}
              reach={null}
              selectedRoomId={null}
              selectedGroupId={null}
              onSelectRoom={() => {}}
              tool="select"
              onSpaceMenu={(target, at) => setMenu({ target, at })}
              showDevices={false}
              paint={paintForReview}
              overlay={shaftGuide}
              onControls={handleControls}
            />
          )}
          {floor?.segmented && !draft && (
            <ZoomControls
              onZoomOut={() => controls.current?.zoomOut()}
              onZoomIn={() => controls.current?.zoomIn()}
              onZoomFit={() => controls.current?.reset()}
            />
          )}
        </Box>
        </Box>

        {/* -------------------------------------------- what to look at */}
        <Box
          sx={{
            width: 320,
            flexShrink: 0,
            borderLeft: 1,
            borderColor: "divider",
            bgcolor: PANEL_BACKGROUND,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Typography variant="body1" fontWeight={500} sx={{ p: 2, pb: 1 }}>
            For this floor
          </Typography>

          <Box sx={{ flex: 1, overflowY: "auto", px: 2 }}>
            {floor && !floor.segmented ? (
              <Step
                n={null}
                title="No spaces detected"
                body={
                  <>
                    My2N could not detect any spaces in this plan.
                    <br />
                    <br />
                    The layout can be drawn manually in the next step. The
                    uploaded file is kept and can be used as a base.
                  </>
                }
              />
            ) : (
              <>
                <Step
                  n={1}
                  title="Mark shared spaces"
                  body="Click each hallway, lobby or other shared space. Anything left unmarked stays a room or an apartment."
                >
                  <Legend
                    layer={layer}
                    floorId={floorId}
                    only={["circulation"]}
                  />
                </Step>
                <Step
                  n={2}
                  title="Mark stairs and elevators"
                  body="My2N marked the stairs and elevators it found. Click any it missed, or click a marked one to change or remove it."
                >
                  <Legend
                    layer={layer}
                    floorId={floorId}
                    only={["stairs", "elevator"]}
                  />
                </Step>
                <Step
                  n={3}
                  title="Floor alignment"
                  body={
                    previousId
                      ? `This floor should line up with ${layer.floors.find((f) => f.id === previousId)?.name ?? "the floor below"}, which you checked last. Use Align floor to move this one until its lift shafts and stairs sit over the outline.`
                      : "This is the first floor you have looked at, so there is nothing yet to line it up with. The floors you check after it will line up with this one."
                  }
                >
                  {previousId && (
                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 1 }}>
                      <svg width={44} height={10} aria-hidden>
                        <line
                          x1={2}
                          y1={5}
                          x2={42}
                          y2={5}
                          stroke="#2196f3"
                          strokeWidth={3}
                          strokeDasharray="8 5"
                          strokeLinecap="round"
                        />
                      </svg>
                      <Typography variant="caption" color="text.secondary">
                        Where the floor below's lifts and stairs are. This is
                        the place to match this floor to.
                      </Typography>
                    </Stack>
                  )}
                </Step>
              </>
            )}
          </Box>

          <Divider />
          <Stack
            direction="row"
            alignItems="center"
            sx={{ p: 2 }}
            spacing={1}
          >
            <Button
              disabled={index <= 0}
              onClick={() => go(floors[index - 1].id)}
            >
              Previous
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              disabled={index >= floors.length - 1}
              onClick={() => go(floors[index + 1].id)}
            >
              Next
            </Button>
          </Stack>
        </Box>
      </Box>

      <Menu
        open={Boolean(menu)}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={menu?.at}
      >
        {MARKS.map((m) => (
          <MenuItem key={m.id} onClick={() => mark(m.id)}>
            <Box
              sx={{
                width: 14,
                height: 14,
                mr: 1.5,
                borderRadius: "2px",
                bgcolor: m.color,
                border: 1,
                borderColor: "divider",
              }}
            />
            {m.label}
          </MenuItem>
        ))}
        <Divider />
        {/* "or click a marked one to change or remove it" — removing a mark
            is leaving it as whatever the plan says it is. */}
        <MenuItem onClick={() => mark(null)}>Not marked</MenuItem>
      </Menu>
    </Box>
  );
}

function Step({
  n,
  title,
  body,
  children,
}: {
  n: number | null;
  title: string;
  /** The paragraph under the heading. */
  body: React.ReactNode;
  /** Anything after it — a legend, which is rows rather than prose. */
  children?: React.ReactNode;
}) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ mb: 3 }}>
      <Box
        sx={{
          width: 22,
          height: 22,
          flexShrink: 0,
          borderRadius: "50%",
          bgcolor: n === null ? "text.disabled" : "primary.main",
          color: "#fff",
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {n ?? <InfoOutlined sx={{ fontSize: 14 }} />}
      </Box>
      <Box>
        <Typography variant="body1" fontWeight={500}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {body}
        </Typography>
        {children}
      </Box>
    </Stack>
  );
}

/** How many of each kind this floor has, which is what there is to check. */
function Legend({
  layer,
  floorId,
  only,
}: {
  layer: import("../../model").VisualLayer;
  floorId: string;
  only: string[];
}) {
  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const group of layer.file.groups) {
      if (group.floor_id !== floorId || !group.space_type) continue;
      out.set(group.space_type, (out.get(group.space_type) ?? 0) + 1);
    }
    return out;
  }, [layer, floorId]);

  return (
    <Box sx={{ mt: 1.5 }}>
      {MARKS.filter((m) => only.includes(m.id)).map((m) => (
        <Stack
          key={m.id}
          direction="row"
          alignItems="center"
          spacing={1.5}
          sx={{ py: 0.25 }}
        >
          <Box
            sx={{
              width: 14,
              height: 14,
              borderRadius: "2px",
              bgcolor: m.color,
              border: 1,
              borderColor: "divider",
            }}
          />
          <Typography variant="body2" sx={{ flex: 1, color: "text.primary" }}>
            {m.label}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {counts.get(m.id) ?? 0}
          </Typography>
        </Stack>
      ))}
    </Box>
  );
}

/**
 * A floor detection found nothing on.
 *
 * It is not an error and does not stop the plan: the page is kept and the
 * layout can be drawn over it in the editor. Saying so here is the whole
 * job of this state.
 */
function UndetectedFloor() {
  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Box
        sx={{
          width: 560,
          height: 360,
          bgcolor: "#f5f5f5",
          border: 1,
          borderColor: "#bdbdbd",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          The uploaded page, with nothing read from it
        </Typography>
      </Box>
    </Box>
  );
}

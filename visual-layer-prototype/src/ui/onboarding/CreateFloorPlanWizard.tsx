/**
 * The three modals between "no floor plans yet" and the check screen.
 *
 * Figma: 2:57030 (how), 3:59336 and 30:25475 (what), 16:6858 (wait).
 *
 * The two upload steps are one component because they are one step asked
 * twice: the PDF path wants vector plans to detect from, the manual path
 * wants anything to draw over and will take nothing at all. What differs
 * is the title, the wording, whether a blank floor is on offer and whether
 * you may go on with an empty list.
 */
import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AddCircle from "@mui/icons-material/AddCircle";
import CheckCircle from "@mui/icons-material/CheckCircle";
import Close from "@mui/icons-material/Close";
import DragHandle from "@mui/icons-material/DragHandle";
import EditOutlined from "@mui/icons-material/EditOutlined";
import FileUploadOutlined from "@mui/icons-material/FileUploadOutlined";
import ScheduleOutlined from "@mui/icons-material/Schedule";
import SwapVert from "@mui/icons-material/SwapVert";
import SyncOutlined from "@mui/icons-material/Sync";
import {
  addBlankFloor,
  addFloors,
  moveFloor,
  removeFloor,
  reverseFloors,
  setGroundFloor,
  type CreateMethod,
  type FloorList,
} from "../../model";

/**
 * Whether a file is a plan to detect from, a picture to draw over, or
 * neither. Read from the browser's type first and the extension second,
 * because a file dragged from some places arrives with no type at all.
 */
function pdfKind(file: File): "pdf" | "image" | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/.test(name)) {
    return "image";
  }
  return null;
}

// -------------------------------------------------------- step 1: how

export function ChooseMethodDialog({
  open,
  onCancel,
  onNext,
}: {
  open: boolean;
  onCancel: () => void;
  onNext: (method: CreateMethod) => void;
}) {
  const [method, setMethod] = useState<CreateMethod>("pdf");

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <TitleBar title="Create Floor Plans" onClose={onCancel} />
      <DialogContent>
        <Typography variant="body1" sx={{ mb: 2 }}>
          How do you want to create the building layout and structure?
        </Typography>
        <Stack direction="row" spacing={2}>
          <MethodCard
            picked={method === "pdf"}
            onPick={() => setMethod("pdf")}
            icon={<FileUploadOutlined sx={{ fontSize: 20 }} />}
            title="Upload PDF floor plans"
            badge="Recommended"
            body="Upload vector PDF floor plans and My2N will detect rooms and apartments for you."
          />
          <MethodCard
            picked={method === "manual"}
            onPick={() => setMethod("manual")}
            icon={<EditOutlined sx={{ fontSize: 20 }} />}
            title="Draw layout manually"
            body="Draw the layout manually yourself, optionally over an image."
          />
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: "block" }}>
          My2N builds your building structure from your plans: floors, rooms
          and apartments.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={() => onNext(method)}>
          Next
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function MethodCard({
  picked,
  onPick,
  icon,
  title,
  badge,
  body,
}: {
  picked: boolean;
  onPick: () => void;
  icon: React.ReactNode;
  title: string;
  badge?: string;
  body: string;
}) {
  return (
    <Paper
      variant="outlined"
      onClick={onPick}
      sx={{
        flex: 1,
        p: 2,
        cursor: "pointer",
        borderColor: picked ? "primary.main" : "divider",
        borderWidth: picked ? 2 : 1,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1}>
        {icon}
        <Typography variant="body1" fontWeight={500} sx={{ flex: 1 }}>
          {title}
        </Typography>
        {badge && (
          <Typography variant="body2" color="primary">
            {badge}
          </Typography>
        )}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {body}
      </Typography>
    </Paper>
  );
}

// ------------------------------------------------------ step 2: what

export function AddFloorsDialog({
  open,
  method,
  floors,
  onFloors,
  onBack,
  onCancel,
  onNext,
}: {
  open: boolean;
  method: CreateMethod;
  floors: FloorList;
  onFloors: (next: FloorList) => void;
  onBack: () => void;
  onCancel: () => void;
  onNext: () => void;
}) {
  const pdfOnly = method === "pdf";
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  /**
   * What a dropped or chosen file is.
   *
   * A PDF is the only thing worth running detection on. Anything else is
   * a picture of a plan, which can be drawn over but not read — so the
   * check screen will say nothing was detected rather than pretend.
   */
  const take = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const dropped = [...files]
      .filter((f) => pdfKind(f) !== null)
      .map((f) => ({ name: f.name, source: pdfKind(f)! }));
    // What was dropped is what is listed — however many pages, in the
    // order they came. The building's storey count is settled later,
    // when the check begins (see fitToBuilding): these two steps are
    // about the files, and the check is about the floors.
    if (dropped.length > 0) onFloors(addFloors(floors, dropped));
  };

  const accept = pdfOnly
    ? "application/pdf,.pdf"
    : "application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg";

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <TitleBar
        title={pdfOnly ? "Add Floors" : "Upload Floor Plans"}
        onClose={onCancel}
      />
      <DialogContent>
        <Typography variant="body1" sx={{ mb: 2 }}>
          {pdfOnly
            ? "Upload one PDF per floor or one PDF with page per floor."
            : "Upload an image for each floor to draw over, such as a scan, a photo or a screenshot. Floors can also be added without an image as a blank canvas."}
        </Typography>

        <input
          ref={picker}
          type="file"
          multiple
          accept={accept}
          hidden
          onChange={(e) => {
            take(e.target.files);
            // Cleared so choosing the same file twice still fires.
            e.target.value = "";
          }}
        />
        <Box
          onClick={() => picker.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            take(e.dataTransfer.files);
          }}
          sx={{
            border: "1px dashed",
            borderColor: over ? "primary.main" : "divider",
            bgcolor: over ? "action.hover" : undefined,
            borderRadius: 1,
            py: 4,
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          <FileUploadOutlined sx={{ color: "text.secondary" }} />
          <Typography variant="body1" sx={{ mt: 1 }}>
            {pdfOnly ? "Drop PDF floor plans here or " : "Drop floor plans here or "}
            <Box component="span" sx={{ color: "primary.main" }}>
              browse
            </Box>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {pdfOnly ? "one image per floor" : "JPEG, PNG or PDF; one image per floor"}
          </Typography>
        </Box>

        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ mt: 3, mb: 0.5 }}
        >
          <Typography variant="body1" sx={{ flex: 1 }}>
            Floor ({floors.length})
          </Typography>
          <Button
            variant="outlined"
            color="inherit"
            size="small"
            endIcon={<SwapVert sx={{ fontSize: 18 }} />}
            disabled={floors.length < 2}
            onClick={() => onFloors(reverseFloors(floors))}
          >
            Reverse
          </Button>
          {!pdfOnly && (
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              endIcon={<AddCircle sx={{ fontSize: 18 }} />}
              onClick={() => onFloors(addBlankFloor(floors))}
            >
              Blank floor
            </Button>
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Highest floor is placed on top. Drag floors to reorder.
        </Typography>

        <Paper variant="outlined" sx={{ mt: 1 }}>
          <Stack
            direction="row"
            sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}
          >
            <Typography variant="body2" sx={{ flex: 1, pl: 3 }}>
              Floor
            </Typography>
            <Typography variant="body2" sx={{ width: 96, textAlign: "center" }}>
              Ground
            </Typography>
            <Box sx={{ width: 32 }} />
          </Stack>

          {floors.length === 0 ? (
            <Typography
              variant="body2"
              sx={{ py: 2, textAlign: "center", color: "text.secondary" }}
            >
              No floors uploaded
            </Typography>
          ) : (
            floors.map((floor, i) => (
              <Stack
                key={floor.id}
                direction="row"
                alignItems="center"
                draggable
                onDragStart={() => setDragging(floor.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragging && dragging !== floor.id) {
                    onFloors(moveFloor(floors, dragging, i));
                  }
                }}
                onDragEnd={() => setDragging(null)}
                sx={{
                  px: 2,
                  py: 1,
                  borderBottom: i < floors.length - 1 ? 1 : 0,
                  borderColor: "divider",
                  opacity: dragging === floor.id ? 0.4 : 1,
                }}
              >
                <IconButton
                  size="small"
                  onClick={() => onFloors(removeFloor(floors, floor.id))}
                >
                  <Close sx={{ fontSize: 18 }} />
                </IconButton>
                <Typography variant="body2" sx={{ flex: 1, pl: 1 }} noWrap>
                  {floor.name}
                </Typography>
                <Box sx={{ width: 96, textAlign: "center" }}>
                  <Radio
                    size="small"
                    checked={floor.ground}
                    onChange={() => onFloors(setGroundFloor(floors, floor.id))}
                  />
                </Box>
                <Box
                  sx={{ width: 32, cursor: "grab", color: "text.secondary" }}
                >
                  <DragHandle sx={{ fontSize: 18 }} />
                </Box>
              </Stack>
            ))
          )}
        </Paper>
      </DialogContent>
      <Divider />
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onBack}>Back</Button>
        <Box sx={{ flex: 1 }} />
        {pdfOnly ? (
          <Button onClick={onCancel}>Cancel</Button>
        ) : (
          // Manual drawing can start from nothing, so Skip is a real way
          // on rather than a way out.
          <Button onClick={onNext}>Skip</Button>
        )}
        <Button
          variant="contained"
          disabled={floors.length === 0}
          onClick={onNext}
        >
          Next
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ----------------------------------------------------- step 3: wait

/**
 * Detection, one floor at a time.
 *
 * Nothing is detected here — the fixture is already segmented, and the
 * user asked for no segmentation. What this step is for is the shape of
 * the wait: which floor is being worked on, how many are left, and the
 * fact that you may close it and come back.
 */
export function CreatingDialog({
  open,
  floors,
  onBack,
  onCancel,
  onDone,
}: {
  open: boolean;
  floors: FloorList;
  onBack: () => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [done, setDone] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setDone(0);
      return;
    }
    if (done >= floors.length) return;
    timer.current = window.setTimeout(() => setDone((n) => n + 1), 500);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [open, done, floors.length]);

  const finished = floors.length > 0 && done >= floors.length;

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <TitleBar title="Creating Floor Plans" onClose={onCancel} />
      <DialogContent>
        <Typography variant="body1">
          My2N is detecting walls, doors and spaces on each floor. This
          usually takes a few minutes. You can close this and keep working.
          We’ll notify you when the floors are ready.
        </Typography>

        <Stack direction="row" alignItems="center" spacing={2} sx={{ my: 2 }}>
          <LinearProgress
            variant="determinate"
            value={floors.length ? (done / floors.length) * 100 : 0}
            sx={{ flex: 1, height: 4, borderRadius: 2 }}
          />
          <Typography variant="body2" color="text.secondary">
            {done}/{floors.length}
          </Typography>
        </Stack>

        <Paper variant="outlined">
          {floors.map((floor, i) => {
            const state = i < done ? "done" : i === done ? "busy" : "waiting";
            return (
              <Stack
                key={floor.id}
                direction="row"
                alignItems="center"
                spacing={1.5}
                sx={{
                  px: 2,
                  py: 1,
                  borderBottom: i < floors.length - 1 ? 1 : 0,
                  borderColor: "divider",
                }}
              >
                {state === "done" ? (
                  <CheckCircle sx={{ fontSize: 20, color: "#2E7D32" }} />
                ) : state === "busy" ? (
                  <SyncOutlined sx={{ fontSize: 20, color: "text.secondary" }} />
                ) : (
                  <ScheduleOutlined
                    sx={{ fontSize: 20, color: "text.secondary" }}
                  />
                )}
                <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                  {floor.name}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: state === "done" ? "#2E7D32" : "text.secondary" }}
                >
                  {state === "done"
                    ? "Processed"
                    : state === "busy"
                      ? "Processing"
                      : "Waiting"}
                </Typography>
              </Stack>
            );
          })}
        </Paper>
      </DialogContent>
      <Divider />
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onBack}>Back</Button>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" disabled={!finished} onClick={onDone}>
          Next
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ----------------------------------------------------------------- shared

function TitleBar({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <>
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", pr: 1.5 }}
      >
        <Box sx={{ flex: 1 }}>{title}</Box>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>
      <Divider />
    </>
  );
}

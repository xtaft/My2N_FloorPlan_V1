import { useEffect, useRef, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Divider from '@mui/material/Divider';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import FormHelperText from '@mui/material/FormHelperText';
import CircularProgress from '@mui/material/CircularProgress';
import CloseIcon from '@mui/icons-material/Close';
import UploadIcon from '@mui/icons-material/Upload';
import DeleteIcon from '@mui/icons-material/Delete';

const PDF_HELPER_TEXT =
  'Add one PDF per floor. Name each file with its floor number so it lands on the right level — e.g. 1.pdf, 2.pdf, 3.pdf. For underground floors, use a minus sign: -1.pdf, -2.pdf.';
const CSV_HELPER_TEXT =
  "Upload a CSV listing each floor and the spaces on it. We use it to build your building's structure and match every plan to the right floor.";

// Deliberately wider than "PDF": the test folder holds PNG floor plans
// (-1.png, 0.png, ...) alongside any real PDFs, and a too-narrow filter
// showing an apparently-empty folder is the classic way for this to fail
// mid-interview. Nothing downstream reads the file bytes anyway (see this
// component's doc comment), so the filter is a convenience, not a contract.
const FLOOR_PLAN_ACCEPT = '.pdf,.png,.jpg,.jpeg';
const ROOM_TABLE_ACCEPT = '.csv';

// Purely theatrical: nothing is actually processed on "Create Floor Plan"
// (see this component's doc comment), but jumping straight to a finished
// floor plan reads as "this was already built", not "we just derived it
// from your files". Three seconds is long enough to register as work
// happening without stalling an interview.
const CREATE_DELAY_MS = 3000;

// One picked file's name + a locally-generated id (lets the same name be
// picked again later in the same dialog session without a React key
// collision). Only the name is kept — nothing here parses the file.
function toFileEntry(file) {
  return { id: `${file.name}-${Math.random()}`, name: file.name };
}

// Shared by both the "empty" and "has files" states of either phase — Figma
// draws them as one resizable dropzone/list frame (see upload_frame in
// 39:56620/41:60682/39:56730/39:56675), just with different contents.
function UploadFrame({ files, onRemove, onBrowseClick, browseLabel }) {
  if (files.length === 0) {
    return (
      <Box
        sx={{
          border: '1px dashed rgba(2,136,209,0.5)',
          borderRadius: 2,
          minHeight: 320,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <Typography variant="subtitle1" color="text.secondary">
          Drag and drop your files here or upload manually
        </Typography>
        <Button variant="outlined" size="small" endIcon={<UploadIcon fontSize="small" />} onClick={onBrowseClick}>
          {browseLabel}
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ border: '1px solid rgba(0,0,0,0.5)', borderRadius: 2, display: 'flex', flexDirection: 'column' }}>
      <List dense sx={{ maxHeight: 260, overflow: 'auto' }}>
        {files.map((file) => (
          <ListItem
            key={file.id}
            secondaryAction={
              <IconButton edge="end" size="small" aria-label={`Remove ${file.name}`} onClick={() => onRemove(file.id)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            }
          >
            <ListItemText primaryTypographyProps={{ fontSize: 14 }}>{file.name}</ListItemText>
          </ListItem>
        ))}
      </List>
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
        <Button variant="outlined" size="small" endIcon={<UploadIcon fontSize="small" />} onClick={onBrowseClick}>
          {browseLabel}
        </Button>
      </Box>
    </Box>
  );
}

/**
 * The "Create Floor Plan" flow (Figma nodes 39:56620/41:60682 "Upload PDF
 * Floor plans", then 39:56730/39:56675 "Upload Room Table") — one Dialog
 * whose title/content swap between two phases rather than four separate
 * dialogs, since that's exactly what the four nodes are: the same dialog
 * shape with an empty-vs-populated upload_frame and a phase-specific title/
 * helper text.
 *
 * "Upload PDFs"/"Upload CSV" open the browser's real file picker via a
 * hidden <input type="file">. This previously used an in-app fake picker
 * (FakeFilePickerDialog.jsx, now unused but kept around) to avoid exposing
 * the presenter's file system during remote-controlled interviews; that
 * constraint was lifted in favour of the real dialog, with the test files
 * rearranged so browsing to them is presentable.
 *
 * Note the browser cannot preselect a starting folder — the OS dialog opens
 * wherever it was last left, so the first pick of a session may need
 * navigating to the test folder.
 *
 * Only the picked files' *names* are kept; nothing reads their contents.
 * Reaching the final "Create Floor Plan" click just calls onCreateFloorPlan,
 * which (see LocationTabScreen.jsx) navigates to the already-built floor
 * plan editor and its existing demo data — this wizard only exists to
 * demonstrate the upload UX leading there, not to actually derive floors
 * from whatever's picked.
 *
 * No back button between phases, matching Figma's own DialogActions (only
 * Cancel + Next/Create in every one of the four nodes) — Cancel or the
 * close icon abandon the whole flow instead.
 */
export default function CreateFloorPlanWizard({ open, onClose, onCreateFloorPlan }) {
  const [phase, setPhase] = useState('pdf'); // 'pdf' | 'csv'
  const [pdfFiles, setPdfFiles] = useState([]);
  const [csvFile, setCsvFile] = useState(null);
  const [creating, setCreating] = useState(false);
  const pdfInputRef = useRef(null);
  const csvInputRef = useRef(null);
  const createTimerRef = useRef(null);

  // Without this, closing the tab/navigating away mid-delay would leave the
  // timer to fire against an unmounted tree and navigate out from under
  // whatever the user moved on to.
  useEffect(() => () => clearTimeout(createTimerRef.current), []);

  const reset = () => {
    setPhase('pdf');
    setPdfFiles([]);
    setCsvFile(null);
    setCreating(false);
  };

  const handleClose = () => {
    if (creating) return; // mid-"processing"; let it finish rather than half-cancel
    onClose();
    reset();
  };

  // Clearing the input's own value after reading it matters: without it,
  // picking the same file again fires no `change` event at all (the value
  // hasn't changed), so re-adding a file you just removed would silently
  // do nothing.
  const handlePdfFilesPicked = (event) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (picked.length === 0) return;
    setPdfFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...picked.filter((f) => !existing.has(f.name)).map(toFileEntry)];
    });
  };

  const handleCsvFilePicked = (event) => {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (picked) setCsvFile(toFileEntry(picked));
  };

  const isPdfPhase = phase === 'pdf';
  const title = isPdfPhase ? 'Upload PDF Floor plans' : 'Upload Room Table';
  const helperText = isPdfPhase ? PDF_HELPER_TEXT : CSV_HELPER_TEXT;
  const canAdvance = isPdfPhase ? pdfFiles.length > 0 : !!csvFile;
  const advanceLabel = isPdfPhase ? 'Next' : 'Create Floor Plan';

  const handleAdvance = () => {
    if (!canAdvance || creating) return;
    if (isPdfPhase) {
      setPhase('csv');
      return;
    }
    setCreating(true);
    createTimerRef.current = setTimeout(() => {
      onCreateFloorPlan();
      reset();
    }, CREATE_DELAY_MS);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {title}
        <IconButton size="small" onClick={handleClose} aria-label="Close" disabled={creating}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 3 }}>
        <Box sx={{ position: 'relative' }}>
          {isPdfPhase ? (
            <UploadFrame
              files={pdfFiles}
              onRemove={(id) => setPdfFiles((prev) => prev.filter((f) => f.id !== id))}
              onBrowseClick={() => pdfInputRef.current?.click()}
              browseLabel={pdfFiles.length === 0 ? 'Upload PDFs' : 'Upload more PDFs'}
            />
          ) : (
            <UploadFrame
              files={csvFile ? [csvFile] : []}
              onRemove={() => setCsvFile(null)}
              onBrowseClick={() => csvInputRef.current?.click()}
              browseLabel="Upload CSV"
            />
          )}
          {/* Covers the frame rather than replacing it, so the picked files
              stay visible behind the spinner — it should read as "these are
              being processed", not as the list having been cleared. */}
          {creating && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                borderRadius: 2,
                bgcolor: 'rgba(255,255,255,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CircularProgress />
            </Box>
          )}
        </Box>
        <FormHelperText sx={{ mt: 1.5 }}>{helperText}</FormHelperText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button color="primary" onClick={handleClose} disabled={creating}>
          Cancel
        </Button>
        <Button variant="contained" color="primary" disabled={!canAdvance || creating} onClick={handleAdvance}>
          {advanceLabel}
        </Button>
      </DialogActions>

      <input
        ref={pdfInputRef}
        type="file"
        accept={FLOOR_PLAN_ACCEPT}
        multiple
        hidden
        onChange={handlePdfFilesPicked}
      />
      <input ref={csvInputRef} type="file" accept={ROOM_TABLE_ACCEPT} hidden onChange={handleCsvFilePicked} />
    </Dialog>
  );
}

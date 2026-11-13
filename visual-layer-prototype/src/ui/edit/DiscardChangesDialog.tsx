/**
 * Leaving the editor with changes unsaved — Figma 2:53364.
 *
 * Two ways out and no third: keep the work and go, or let it go and go.
 * Clicking away or pressing Escape stays in the editor, which is the
 * only thing not offered as a button because it is not a decision.
 */
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";

export interface DiscardChangesDialogProps {
  open: boolean;
  onStay: () => void;
  onDiscard: () => void;
  onSaveAndClose: () => void;
}

export function DiscardChangesDialog({
  open,
  onStay,
  onDiscard,
  onSaveAndClose,
}: DiscardChangesDialogProps) {
  return (
    <Dialog open={open} onClose={onStay} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>Discard changes</DialogTitle>
      <DialogContent>
        <Typography variant="body1">
          Are you sure you want to discard unsaved changes?
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: "center", gap: 2 }}>
        <Button variant="outlined" color="error" onClick={onDiscard}>
          Discard changes
        </Button>
        <Button variant="contained" onClick={onSaveAndClose}>
          Save and close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

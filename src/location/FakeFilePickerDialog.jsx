import { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Checkbox from '@mui/material/Checkbox';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import FolderIcon from '@mui/icons-material/Folder';
import ImageIcon from '@mui/icons-material/Image';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DescriptionIcon from '@mui/icons-material/Description';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

function iconForFile(name) {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'pdf') return PictureAsPdfIcon;
  if (['png', 'jpg', 'jpeg'].includes(ext)) return ImageIcon;
  if (ext === 'csv') return DescriptionIcon;
  return InsertDriveFileIcon;
}

/**
 * A fake, in-app stand-in for the OS's native file-open dialog — used
 * instead of window.showOpenFilePicker/<input type="file"> (both of which
 * would let a remote-controlled interview participant browse this machine's
 * real file system) so CreateFloorPlanWizard's "Upload PDFs"/"Upload CSV"
 * only ever shows the fixed, known contents of one specific test folder
 * (`fileNames`, hardcoded to match what's actually on disk in
 * uploads_for_prototype_testing/ — see CreateFloorPlanWizard.jsx), never
 * anything else on the presenter's machine.
 *
 * Deliberately styled to *read* as a generic OS file-open dialog (a
 * breadcrumb-style path bar, a plain file list, a "File name" readout, Open/
 * Cancel) rather than matching this app's own Material look — the whole
 * point is for a participant to recognize it as "the file picker", not as
 * more app UI.
 */
export default function FakeFilePickerDialog({ open, pathLabel, fileNames, multiple, onCancel, onOpen }) {
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    if (open) setSelected([]);
  }, [open]);

  const toggle = (name) => {
    if (multiple) {
      setSelected((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
    } else {
      setSelected([name]);
    }
  };

  const allSelected = selected.length === fileNames.length;
  const toggleSelectAll = () => setSelected(allSelected ? [] : [...fileNames]);

  const handleOpen = () => {
    if (selected.length === 0) return;
    onOpen(selected);
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.5, bgcolor: 'grey.100', borderBottom: '1px solid rgba(0,0,0,0.12)' }}>
        <FolderIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
        <Typography variant="body2" color="text.secondary" noWrap>
          {pathLabel}
        </Typography>
      </Box>

      <List dense sx={{ minHeight: 200, maxHeight: 320, overflow: 'auto', py: 0 }}>
        {multiple && (
          <>
            <ListItemButton onClick={toggleSelectAll} dense>
              <Checkbox
                edge="start"
                size="small"
                checked={allSelected}
                indeterminate={selected.length > 0 && !allSelected}
                tabIndex={-1}
                disableRipple
                sx={{ mr: 0.5 }}
              />
              <ListItemText primaryTypographyProps={{ fontSize: 14, fontWeight: 500 }}>Select all</ListItemText>
            </ListItemButton>
            <Divider />
          </>
        )}
        {fileNames.map((name) => {
          const Icon = iconForFile(name);
          const isSelected = selected.includes(name);
          return (
            <ListItemButton key={name} selected={isSelected} onClick={() => toggle(name)} dense>
              {multiple && (
                <Checkbox edge="start" size="small" checked={isSelected} tabIndex={-1} disableRipple sx={{ mr: 0.5 }} />
              )}
              <ListItemIcon sx={{ minWidth: 32 }}>
                <Icon fontSize="small" sx={{ color: 'action.active' }} />
              </ListItemIcon>
              <ListItemText primaryTypographyProps={{ fontSize: 14 }}>{name}</ListItemText>
            </ListItemButton>
          );
        })}
      </List>

      <Divider />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.5 }}>
        <TextField
          size="small"
          fullWidth
          label="File name"
          value={selected.join(', ')}
          InputProps={{ readOnly: true }}
        />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, px: 2, pb: 2 }}>
        <Button variant="outlined" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="contained" disabled={selected.length === 0} onClick={handleOpen}>
          Open
        </Button>
      </Box>
    </Dialog>
  );
}

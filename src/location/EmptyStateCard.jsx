import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';

/**
 * Matches Figma's "ShC TableEmptyState" (e.g. node 40:60618) — used
 * identically by every Location tab's empty state (see
 * screens/LocationTabScreen.jsx): a generic illustration, a title, and a
 * body line. No action button here — Floor Plan's "Create Floor Plan" lives
 * on the header's "New" button instead (LocationShell's onPrimaryAction),
 * so there's one primary entry point, not a second one duplicated inside
 * the empty state. The illustration itself is a plain icon rather than
 * Figma's raster placeholder art — that asset is served from a temporary
 * (7-day) Figma URL not meant for hotlinking, and it's purely decorative,
 * so a generic stand-in loses nothing functional.
 */
export default function EmptyStateCard({ title, body }) {
  return (
    <Paper elevation={0} sx={{ minHeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 480, px: 6, py: 3 }}>
        <InsertDriveFileOutlinedIcon sx={{ fontSize: 96, color: 'action.disabled', mb: 2 }} />
        <Typography variant="h5" color="text.secondary" textAlign="center">
          {title}
        </Typography>
        <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ mt: 2 }}>
          {body}
        </Typography>
      </Box>
    </Paper>
  );
}

import { createTheme } from '@mui/material/styles';
import defaultShadows from '@mui/material/styles/shadows';

// Figma's "elevation/12" design token (used by the AppBar, FloorPlanNavigation
// drawer, ActionBar, and DropDownDrawer — they're meant to read as the same
// elevation level). MUI's own elevation={12} recipe doesn't match this, so it
// replaces the corresponding slot in the theme's shadow scale: every
// `elevation={12}` Paper (and anything referencing theme.shadows[12]) now
// resolves to this exact value instead of MUI's generic default.
const figmaElevation12 =
  '0px 5px 22px 4px rgba(0,0,0,0.12), 0px 12px 17px 2px rgba(0,0,0,0.14), 0px 7px 8px -4px rgba(0,0,0,0.2)';

const shadows = [...defaultShadows];
shadows[12] = figmaElevation12;

// Matches the Figma design tokens used across the Floor Plan Feature file
// (--primary/main: #2196f3, --background/default: #eee).
const theme = createTheme({
  palette: {
    primary: { main: '#2196f3' },
    background: { default: '#eeeeee', paper: '#ffffff' },
  },
  shape: { borderRadius: 4 },
  shadows,
});

export default theme;

import { createTheme } from "@mui/material/styles";

/**
 * The tokens the Figma file defines, read from its variables. The design is
 * built on Material UI, so most of this is restating MUI's own defaults —
 * which is the point: where the design and MUI already agree, the component
 * carries the style and nothing here has to.
 */
export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#2196f3", contrastText: "#ffffff" },
    text: {
      primary: "rgba(0, 0, 0, 0.87)",
      secondary: "rgba(0, 0, 0, 0.6)",
      disabled: "rgba(0, 0, 0, 0.38)",
    },
    divider: "rgba(0, 0, 0, 0.12)",
    background: { default: "#eeeeee", paper: "#ffffff" },
    grey: { 50: "#fafafa", 400: "#bdbdbd" },
  },
  shape: { borderRadius: 4 },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h6: {
      fontSize: 20,
      fontWeight: 500,
      lineHeight: 1.6,
      letterSpacing: "0.15px",
    },
    body1: {
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: "0.15px",
    },
    body2: {
      fontSize: 14,
      fontWeight: 400,
      lineHeight: 1.43,
      letterSpacing: "0.17px",
    },
    button: {
      fontSize: 14,
      fontWeight: 500,
      lineHeight: "24px",
      letterSpacing: "0.4px",
      textTransform: "none",
    },
  },
  components: {
    MuiAppBar: {
      defaultProps: { elevation: 0, color: "default" },
      styleOverrides: { root: { backgroundColor: "#ffffff" } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        // The action bar's buttons are size="small", which the design draws
        // at 13/500 with the tighter letter spacing.
        sizeSmall: { fontSize: 13, lineHeight: "22px", letterSpacing: "0.46px" },
      },
    },
    MuiListItemButton: {
      styleOverrides: { root: { minHeight: 48 } },
    },
  },
});

/** The canvas sits on the design's page background, not on paper. */
export const CANVAS_BACKGROUND = "#eeeeee";

/**
 * Three surfaces, sampled from the design rather than guessed at.
 *
 * The page is #eeeeee and a card on it is white, which the palette above
 * already says. Between them the design uses two more: the band holding
 * the breadcrumb, the building and the tabs is a shade lighter than the
 * page, and the navigation tree and the mode drawers are a shade darker
 * than a card. Leaving either of them to inherit — the band showing page
 * grey, the tree showing card white — is what made the header read wrong.
 */
export const HEADER_BACKGROUND = "#f5f5f5";
export const PANEL_BACKGROUND = "#fafafa";

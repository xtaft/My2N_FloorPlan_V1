import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    background: { default: "#FFFFFF" },
    primary: { main: "#17406B" },
  },
  typography: {
    fontFamily:
      '"Inter", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
  },
  components: {
    MuiAppBar: {
      styleOverrides: { root: { backgroundColor: "#FFFFFF" } },
    },
  },
});

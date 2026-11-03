import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative base, so a `dist/` build works both at a domain root and under a
  // GitHub Pages subpath without being rebuilt.
  base: "./",
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the built site works wherever it's served from —
  // GitHub Pages puts a project site under /<repo-name>/, and a hardcoded
  // absolute base would break every asset URL the moment the repo is renamed
  // (or served from a custom domain / opened straight off disk).
  base: './',
});

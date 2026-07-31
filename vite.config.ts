import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Dev server for the demo page only — the package itself is built by tsup. */
export default defineConfig({
  plugins: [react()],
  root: 'demo',
  server: {
    host: '127.0.0.1',
    port: 4195,
    open: false,
  },
});

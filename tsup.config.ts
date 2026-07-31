import { defineConfig } from 'tsup';
import { copyFileSync } from 'node:fs';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['react', 'react-dom'],
  // The stylesheet ships as-is so consumers can override the custom
  // properties without fighting a bundled copy.
  onSuccess: async () => {
    copyFileSync('src/joystick.css', 'dist/joystick.css');
  },
});

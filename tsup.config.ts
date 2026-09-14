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
  // `@jugaaadi/advance-scroll-input` is a peer, loaded only via the runtime
  // `import()` in `FieldRows.tsx` when a consumer passes `fieldRows` — never
  // bundled, so a consumer who wants only the wheel never pays for it, and a
  // consumer who does use it gets the ONE copy their own app already has.
  external: ['react', 'react-dom', '@jugaaadi/advance-scroll-input'],
  // The stylesheet ships as-is so consumers can override the custom
  // properties without fighting a bundled copy.
  onSuccess: async () => {
    copyFileSync('src/joystick.css', 'dist/joystick.css');
  },
});

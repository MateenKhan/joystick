/**
 * A Node ESM loader that makes exactly ONE specifier unresolvable:
 * `@jugaaadi/advance-scroll-input`. Everything else resolves normally.
 *
 * This is what lets `test/field-rows-missing.test.mjs` prove the "peer
 * package missing" path against the REAL shipped bundle (`dist/index.js`)
 * rather than a re-implementation of `loadScrollInput` — the peer IS
 * installed in this repo (it's a devDependency, for the demo and for
 * `test/field-rows.test.mjs`), so the only way to exercise "it is not
 * installed" honestly is to deny that one resolution, in a child process,
 * without touching anything on disk. The live demo on port 4159 and the rest
 * of this repo's `node_modules` are untouched by this file.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@jugaaadi/advance-scroll-input') {
    const err = new Error(
      `Cannot find package '@jugaaadi/advance-scroll-input' (denied by test/support/deny-peer-loader.mjs)`
    );
    err.code = 'ERR_MODULE_NOT_FOUND';
    throw err;
  }
  return nextResolve(specifier, context);
}

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  /* Nest's DI reads constructor parameter types from `emitDecoratorMetadata`,
     which esbuild does not emit. SWC does, so it transforms the tests too. */
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      exclude: [
        /* Composition roots — a bootstrap call and decorator metadata, with
           nothing to assert that the e2e path does not already cover. */
        'src/main.ts',
        'src/**/*.module.ts',
      ],
      thresholds: { 100: true },
    },
  },
});

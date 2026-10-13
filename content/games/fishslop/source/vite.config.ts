import { defineConfig } from 'vitest/config';

// BASE_PATH lets the GitHub Pages build serve from /<repo>/ while dev stays at /.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});

import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// The window, built into dist/renderer and loaded from disk: relative paths, nothing fetched.
export default defineConfig({
  root: resolve(import.meta.dirname, 'src/renderer'),
  base: './',
  plugins: [vue()],
  // TERMINAL_DIST=../terminal/dist builds against a local @dskripchenko/terminal, to work on both at once.
  resolve: process.env.TERMINAL_DIST ? { alias: { '@dskripchenko/terminal': resolve(process.env.TERMINAL_DIST, 'index.mjs') } } : {},
  build: {
    outDir: resolve(import.meta.dirname, 'dist/renderer'),
    emptyOutDir: true,
    target: 'chrome140',
    sourcemap: true,
    chunkSizeWarningLimit: 2048,
  },
  test: {
    root: import.meta.dirname,
    include: ['tests/unit/**/*.spec.ts'],
    environment: 'node',
  },
})

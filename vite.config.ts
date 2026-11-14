import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// The window, built into dist/renderer and loaded from disk: relative paths, nothing fetched.
// The shell integration's scripts are text, as the main build bundles them (for the tests).
const scripts = {
  name: 'shell-scripts',
  load(id: string) {
    return /\.(zsh|bash|ps1)$/.test(id) ? `export default ${JSON.stringify(readFileSync(id, 'utf8'))}` : null
  },
}

export default defineConfig({
  root: resolve(import.meta.dirname, 'src/renderer'),
  base: './',
  plugins: [vue(), scripts],
  // TERMINAL_DIST=../terminal/dist builds against a local @dskripchenko/terminal, to work on both at once.
  resolve: process.env.TERMINAL_DIST ? { alias: { '@dskripchenko/terminal': resolve(process.env.TERMINAL_DIST, 'index.mjs') } } : {},
  build: {
    outDir: resolve(import.meta.dirname, 'dist/renderer'),
    emptyOutDir: true,
    target: 'chrome140',
    sourcemap: true,
    chunkSizeWarningLimit: 2048,
    // The window, and the viewer page shown in it on a scheme of its own.
    rollupOptions: { input: { index: resolve(import.meta.dirname, 'src/renderer/index.html'), viewer: resolve(import.meta.dirname, 'src/renderer/viewer.html') } },
  },
  test: {
    root: import.meta.dirname,
    include: ['tests/unit/**/*.spec.ts'],
    environment: 'node',
  },
})

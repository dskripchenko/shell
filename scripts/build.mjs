// Builds the main process and the preload with esbuild, the window with Vite, into dist/.
import { build } from 'esbuild'
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { build as vite } from 'vite'

rmSync('dist', { recursive: true, force: true })

const common = { bundle: true, sourcemap: true, logLevel: 'warning', target: 'node22', platform: 'node', format: 'cjs' }
// TERMINAL_DIST=../terminal/dist: the main process keeps a terminal per pane too (see vite.config.ts).
const terminal = process.env.TERMINAL_DIST ? { alias: { '@dskripchenko/terminal': resolve(process.env.TERMINAL_DIST, 'index.cjs') } } : {}
// The shell integration's scripts go in as text.
await build({ ...common, entryPoints: ['src/main/index.ts'], outfile: 'dist/main.cjs', ...terminal, external: ['electron', 'node-pty'], loader: { '.zsh': 'text', '.bash': 'text', '.ps1': 'text' } })
await build({ ...common, entryPoints: ['src/preload/preload.ts'], outfile: 'dist/preload.cjs', external: ['electron'] })
await vite({ configFile: 'vite.config.ts', logLevel: 'warn' })
mkdirSync('dist/renderer/vendor', { recursive: true })
// embed's whole bundle for the viewer page: every block, nothing fetched at run time.
cpSync('node_modules/@dskripchenko/embed/dist/embed.bundle.js', 'dist/renderer/vendor/embed.bundle.js')
// The window's icon (Linux shows it; macOS and Windows take the bundle's).
cpSync('build/icons/png/512.png', 'dist/icon.png')

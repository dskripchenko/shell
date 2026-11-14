// Builds the main process and the preload with esbuild, the window with Vite, into dist/.
import { build } from 'esbuild'
import { cpSync, rmSync } from 'node:fs'
import { build as vite } from 'vite'

rmSync('dist', { recursive: true, force: true })

const common = { bundle: true, sourcemap: true, logLevel: 'warning', target: 'node22', platform: 'node', format: 'cjs' }
await build({ ...common, entryPoints: ['src/main/index.ts'], outfile: 'dist/main.cjs', external: ['electron', 'node-pty'] })
await build({ ...common, entryPoints: ['src/preload/preload.ts'], outfile: 'dist/preload.cjs', external: ['electron'] })
await vite({ configFile: 'vite.config.ts', logLevel: 'warn' })
// The window's icon (Linux shows it; macOS and Windows take the bundle's).
cpSync('build/icons/png/512.png', 'dist/icon.png')

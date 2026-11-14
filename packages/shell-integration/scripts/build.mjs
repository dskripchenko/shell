// The package for npm: ESM and CommonJS bundles (the shells' scripts inside as text) and types.
import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
rmSync(dist, { recursive: true, force: true })
const common = {
  entryPoints: [join(root, 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  loader: { '.zsh': 'text', '.bash': 'text', '.ps1': 'text' },
  packages: 'external',
  logLevel: 'warning',
}
await build({ ...common, format: 'esm', outfile: join(dist, 'index.mjs') })
await build({ ...common, format: 'cjs', outfile: join(dist, 'index.cjs') })
execFileSync('npx', ['tsc', '-p', join(root, 'tsconfig.build.json')], { stdio: 'inherit', cwd: root, shell: process.platform === 'win32' })
console.log('built', dist)

// The README's screenshots: taken from the built app (tests/readme), then
// shrunk into docs/images — 1600 px wide, 256 colours — with ImageMagick.
//
//   pnpm build && pnpm readme:shots
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const shots = mkdtempSync(join(tmpdir(), 'shell-shots-'))
execFileSync('pnpm', ['exec', 'playwright', 'test', '-c', 'playwright.readme.config.ts'], {
  stdio: 'inherit',
  env: { ...process.env, SHELL_SHOTS: shots },
  shell: process.platform === 'win32',
})

const magick = ['magick', 'convert'].find((tool) => {
  try {
    execFileSync(tool, ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})
if (!magick) {
  console.error(`ImageMagick is needed to shrink the pictures; they are in ${shots}`)
  process.exit(1)
}
mkdirSync(join('docs', 'images'), { recursive: true })
for (const name of readdirSync(shots).filter((n) => n.endsWith('.png'))) {
  const out = join('docs', 'images', name)
  execFileSync(magick, [join(shots, name), '-resize', '1600x', '-dither', 'None', '-colors', '256', '-strip', `PNG8:${out}`])
  console.log(`${out}  ${Math.round(statSync(out).size / 1024)} KB`)
}

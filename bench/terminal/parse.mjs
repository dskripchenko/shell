import { Terminal as D } from '../../../terminal/dist/index.mjs'
import xh from '@xterm/headless'
import fs from 'fs'
const ls = fs.readFileSync('real-ls.txt', 'utf8').replace(/\n/g, '\r\n')
const data = ls.repeat(3)
const chunks = []; for (let i = 0; i < data.length; i += 16384) chunks.push(data.slice(i, i + 16384))
for (const sb of [1000, 5000, 20000]) {
  for (let rep = 0; rep < 2; rep++) {
    const d = new D({ cols: 160, rows: 48, scrollback: sb })
    let t = performance.now(); for (const c of chunks) d.write(c); const td = performance.now() - t
    const x = new xh.Terminal({ cols: 160, rows: 48, scrollback: sb, allowProposedApi: true })
    t = performance.now(); for (const c of chunks) x.write(c); await new Promise((r) => x.write('', r)); const tx = performance.now() - t
    if (rep) console.log(`scrollback ${sb}: dsk @dskripchenko/terminal ${td.toFixed(0)} ms, xterm parse ${tx.toFixed(0)} ms  (${(data.length/1048576).toFixed(1)} MB)`)
  }
}

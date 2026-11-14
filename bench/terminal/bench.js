// Terminal emulator benchmark: @dskripchenko/terminal (engine 'terminal') vs xterm.js (DOM, WebGL) in Electron.
import { Terminal as OwnTerminal, TerminalView, DARK_THEME } from '../../../terminal/dist/index.mjs'
import { Terminal as XTerminal } from '@xterm/xterm'
import { WebglAddon } from '@xterm/addon-webgl'

const COLS = 160
const ROWS = 48
const params = new URLSearchParams(location.search)
const engine = params.get('engine')
const scenario = params.get('scenario')

// ---- deterministic data --------------------------------------------------------------
let seed = 42
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const pick = (a) => a[Math.floor(rnd() * a.length)]
const words = 'the agent reads files writes code runs tests checks types refactors module function const return import export async await promise value error result config server client render state store'.split(' ')
const rgb = () => `\x1b[38;2;${Math.floor(rnd() * 255)};${Math.floor(rnd() * 255)};${Math.floor(rnd() * 255)}m`
const sentence = (n) => Array.from({ length: n }, () => pick(words)).join(' ')

function bulkLog(lines) {
  const lv = ['\x1b[32mINFO \x1b[0m', '\x1b[33mWARN \x1b[0m', '\x1b[31mERROR\x1b[0m', '\x1b[36mDEBUG\x1b[0m']
  let s = ''
  for (let i = 0; i < lines; i++) {
    s += `\x1b[2m2026-11-14 12:${String(i % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.${String(i % 1000).padStart(3, '0')}\x1b[0m ${pick(lv)} \x1b[34msrc/${pick(words)}/${pick(words)}.ts:${i % 400}\x1b[0m ${sentence(6 + Math.floor(rnd() * 10))}\r\n`
  }
  return s
}

// Ink-style frame, as Claude Code redraws its live area: sync on, erase previous lines, draw, sync off.
function agentFrames(n) {
  const spin = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  const frames = []
  let prev = 0
  for (let f = 0; f < n; f++) {
    let s = '\x1b[?2026h\x1b[?25l'
    for (let i = 0; i < prev; i++) s += '\x1b[2K\x1b[1A'
    s += '\x1b[2K\x1b[G'
    if (f % 5 === 0) s += `\x1b[38;2;120;120;120m⏺\x1b[0m ${rgb()}Update\x1b[0m(src/${pick(words)}.ts) ${sentence(10)}\r\n` // a static line that stays
    const lines = []
    lines.push(`\x1b[38;2;215;119;87m${spin[f % spin.length]}\x1b[0m \x1b[1m${pick(words)}ing…\x1b[0m \x1b[2m(${f}s · ↑ ${f * 13} tokens · esc to interrupt)\x1b[0m`)
    lines.push('')
    lines.push(`\x1b[38;2;100;100;100m╭${'─'.repeat(COLS - 4)}╮\x1b[0m`)
    for (let i = 0; i < 18; i++) lines.push(`\x1b[38;2;100;100;100m│\x1b[0m ${rgb()}${String(i + 1).padStart(3)}\x1b[0m \x1b[48;2;30;50;30m+ ${sentence(12).slice(0, COLS - 20).padEnd(COLS - 12)}\x1b[0m\x1b[38;2;100;100;100m│\x1b[0m`)
    lines.push(`\x1b[38;2;100;100;100m╰${'─'.repeat(COLS - 4)}╯\x1b[0m`)
    lines.push(`\x1b[2m  ? for shortcuts\x1b[0m${' '.repeat(40)}\x1b[38;2;80;160;80m● auto-accept edits on\x1b[0m`)
    s += lines.join('\r\n') + '\x1b[?2026l'
    prev = lines.length - 1
    frames.push(s)
  }
  return frames
}

function tokenStream(n) {
  const out = []
  for (let i = 0; i < n; i++) {
    let t = pick(words) + (rnd() < 0.1 ? ',' : '') + ' '
    if (rnd() < 0.05) t = `\x1b[1m${t}\x1b[0m`
    if (rnd() < 0.03) t = `\x1b[36m\`${pick(words)}\`\x1b[0m `
    if (rnd() < 0.04) t += '\r\n'
    out.push(t)
  }
  return out
}

function tuiFrames(n) {
  const frames = ['\x1b[?1049h']
  for (let f = 0; f < n; f++) {
    let s = '\x1b[?2026h\x1b[H'
    for (let r = 0; r < ROWS; r++) {
      s += `\x1b[${r + 1};1H`
      let col = 0
      while (col < COLS) {
        const w = Math.min(COLS - col, 4 + Math.floor(rnd() * 20))
        s += `\x1b[38;5;${Math.floor(rnd() * 256)};48;5;${Math.floor(rnd() * 24) + 232}m` + (pick(words) + ' ').repeat(10).slice(0, w)
        col += w
      }
    }
    frames.push(s + '\x1b[0m\x1b[?2026l')
  }
  return frames
}

function chunk(str, size) {
  const out = []
  for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size))
  return out
}

const SCENARIOS = {
  bulk: () => ({ chunks: chunk(bulkLog(50000), 16384) }),
  ls: () => ({ chunks: chunk(window.REAL.ls, 16384) }),
  gitlog: () => ({ chunks: chunk(window.REAL.gitlog.repeat(5), 16384) }),
  agent: () => ({ chunks: agentFrames(1500) }),
  agent60: () => ({ chunks: agentFrames(600), paceMs: 1000 / 60 }),
  stream: () => ({ chunks: tokenStream(20000) }),
  tui: () => ({ chunks: tuiFrames(400) }),
}

// ---- engines -------------------------------------------------------------------------
const host = document.getElementById('host')

function makeEngine() {
  if (engine === 'terminal') {
    const term = new OwnTerminal({ scrollback: 5000 })
    const view = new TerminalView(term, host, { theme: DARK_THEME, fontSize: 13, fontFamily: 'Menlo, monospace' })
    return {
      fix: () => term.resize(COLS, ROWS),
      size: () => [term.cols, term.rows],
      write: (d) => (term.write(d), Promise.resolve()),
      screen: () => term.screenText().split('\n').map((l) => l.trimEnd()),
      nodes: () => host.querySelectorAll('*').length,
      dispose: () => view.dispose(),
    }
  }
  const term = new XTerminal({ cols: COLS, rows: ROWS, scrollback: 5000, fontSize: 13, fontFamily: 'Menlo, monospace', allowProposedApi: true })
  term.open(host)
  if (engine === 'xterm-webgl') term.loadAddon(new WebglAddon())
  return {
    write: (d) => new Promise((r) => term.write(d, r)),
    screen: () => {
      const b = term.buffer.active
      const out = []
      for (let i = 0; i < term.rows; i++) out.push((b.getLine(b.viewportY + i)?.translateToString(true) ?? '').trimEnd())
      return out
    },
    nodes: () => host.querySelectorAll('*').length,
    fix: () => {},
    size: () => [term.cols, term.rows],
    dispose: () => term.dispose(),
  }
}

// ---- measurement ---------------------------------------------------------------------
const mc = new MessageChannel()
const queue = []
mc.port1.onmessage = () => queue.shift()?.()
const macrotask = () => new Promise((r) => (queue.push(r), mc.port2.postMessage(0)))
const raf = () => new Promise((r) => requestAnimationFrame(r))

async function run() {
  const { chunks, paceMs } = SCENARIOS[scenario]()
  const bytes = chunks.reduce((a, c) => a + c.length, 0)
  const e = makeEngine()
  await raf(); await raf()
  e.fix()
  await raf(); await raf()
  if (globalThis.gc) gc()
  const heap0 = performance.memory.usedJSHeapSize

  // frame gaps
  const frames = []
  let running = true
  const tick = (t) => { frames.push(t); if (running) requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  let longTasks = 0, longTaskMs = 0
  const po = new PerformanceObserver((l) => l.getEntries().forEach((x) => { longTasks++; longTaskMs += x.duration }))
  po.observe({ type: 'longtask' })

  console.log('START')
  await macrotask()
  const t0 = performance.now()
  let last
  for (let i = 0; i < chunks.length; i++) {
    if (paceMs) {
      const due = t0 + i * paceMs
      while (performance.now() < due - 1) await new Promise((r) => setTimeout(r, Math.max(0, due - performance.now() - 1)))
    } else await macrotask()
    last = e.write(chunks[i])
  }
  await last
  await raf(); await raf()
  const total = performance.now() - t0
  running = false
  po.disconnect()

  const gaps = frames.slice(1).map((t, i) => t - frames[i]).sort((a, b) => a - b)
  const q = (p) => gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))] : 0
  if (globalThis.gc) gc()
  const heap1 = performance.memory.usedJSHeapSize
  const result = {
    engine, scenario, bytes, writes: chunks.length,
    totalMs: Math.round(total),
    lagMs: paceMs ? Math.round(total - chunks.length * paceMs) : undefined,
    mbps: +(bytes / 1048576 / (total / 1000)).toFixed(2),
    frames: frames.length, fps: +(frames.length / (total / 1000)).toFixed(1),
    gapP50: +q(0.5).toFixed(1), gapP95: +q(0.95).toFixed(1), gapMax: +q(1).toFixed(1),
    jank50: gaps.filter((g) => g > 50).length,
    longTasks, longTaskMs: Math.round(longTaskMs),
    heapMB: +((heap1 - heap0) / 1048576).toFixed(1),
    domNodes: e.nodes(),
    size: e.size(),
    screen: e.screen(),
  }
  console.log('RESULT ' + JSON.stringify(result))
}

run().catch((err) => console.log('RESULT ' + JSON.stringify({ engine, scenario, error: String(err?.stack ?? err) })))

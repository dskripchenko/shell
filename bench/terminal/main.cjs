const { app, BrowserWindow } = require('electron')
const fs = require('fs'), path = require('path')
app.commandLine.appendSwitch('js-flags', '--expose-gc')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('enable-precise-memory-info')
app.on('window-all-closed', () => {})
const engines = (process.env.ENGINES || 'terminal,xterm-dom,xterm-webgl').split(',')
const scenarios = (process.env.SCENARIOS || 'bulk,ls,gitlog,agent,agent60,stream,tui').split(',')
const reps = +(process.env.REPS || 3)
const out = []
function cpu(w) {
  const pid = w.webContents.getOSProcessId(), m = app.getAppMetrics()
  const get = (f) => m.filter(f).reduce((a, x) => a + (x.cpu.cumulativeCPUUsage ?? 0), 0)
  return { renderer: get((x) => x.pid === pid), gpu: get((x) => x.type === 'GPU') }
}
async function one(engine, scenario) {
  let cpu0 = null
  const w = new BrowserWindow({ width: 1400, height: 880, x: 0, y: 0, show: true, webPreferences: { backgroundThrottling: false } })
  const res = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ engine, scenario, error: 'timeout' }), 240000)
    w.webContents.on('console-message', (e) => {
      const msg = e.message
      if (msg === 'START') cpu0 = cpu(w)
      if (typeof msg === 'string' && msg.startsWith('RESULT ')) {
        clearTimeout(timer)
        const r = JSON.parse(msg.slice(7)), c = cpu(w)
        if (cpu0) { r.cpuRendererS = +(c.renderer - cpu0.renderer).toFixed(2); r.cpuGpuS = +(c.gpu - cpu0.gpu).toFixed(2) }
        resolve(r)
      }
    })
    w.loadFile(path.join(__dirname, 'index.html'), { query: { engine, scenario } })
  })
  w.destroy()
  return res
}
app.whenReady().then(async () => {
  for (let r = 0; r < reps; r++) for (const s of scenarios) for (const e of engines) {
    const res = await one(e, s); res.rep = r; out.push(res)
    console.log(JSON.stringify({ ...res, screen: undefined }))
    fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(out))
  }
  app.quit()
})

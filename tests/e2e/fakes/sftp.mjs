#!/usr/bin/env node
// A stand-in for OpenSSH's sftp in batch mode (-b -), serving FAKE_SFTP_ROOT as the host's /.
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, rmdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

const root = process.env.FAKE_SFTP_ROOT
const host = process.argv.at(-1)
if (!root || host !== 'fakebox') {
  process.stderr.write(`ssh: Could not resolve hostname ${host}\nConnection closed\n`)
  process.exit(255)
}
const at = (p) => join(root, p)
const words = (line) => [...line.matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)].map((m) => (m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2]))
const fail = (msg) => {
  process.stderr.write(msg + '\n')
  process.exit(1)
}
let input = ''
process.stdin.on('data', (d) => (input += d))
process.stdin.on('end', () => {
  for (const line of input.split('\n').filter(Boolean)) {
    const [cmd, ...a] = words(line)
    const args = a.filter((x) => x !== '-R' && x !== '-la')
    if (cmd === 'pwd') console.log('Remote working directory: /home')
    else if (cmd === 'ls') {
      const dir = at(args[0])
      if (!existsSync(dir)) fail(`Couldn't stat remote file: No such file or directory`)
      console.log(`sftp> ls -la "${args[0]}"`)
      for (const name of ['.', '..', ...readdirSync(dir)]) {
        const s = statSync(join(dir, name))
        console.log(`${s.isDirectory() ? 'd' : '-'}rw-r--r--    1 me       me   ${String(s.size).padStart(10)} Jan  1  2025 ${name}`)
      }
    } else if (cmd === 'get') cpSync(at(args[0]), join(args[1], basename(args[0])), { recursive: true })
    else if (cmd === 'put') cpSync(args[0], at(join(args[1], basename(args[0]))), { recursive: true })
    else if (cmd === 'mkdir') mkdirSync(at(args[0]))
    else if (cmd === 'rename') renameSync(at(args[0]), at(args[1]))
    else if (cmd === 'rm') rmSync(at(args[0]))
    else if (cmd === 'rmdir') rmdirSync(at(args[0]))
    else fail(`Invalid command: ${cmd}`)
  }
})

import { describe, expect, it } from 'vitest'
import { parseRemote, parseSftpList, parseSshConfig, remoteDir, sftpQuote } from '../../src/common/ssh'

describe('~/.ssh/config', () => {
  it('hosts with their names, users and ports; patterns and Match left out; Include noted', () => {
    const { hosts, includes } = parseSshConfig(`
# comment
Include config.d/*
Host prod prod-alias
  HostName 10.0.0.5
  User deploy
  Port 2222
Host *.internal !bad
  User x
Host dev   # the dev box
  HostName dev.example.com
Match host foo
  User nobody
Host dev
  User again
`)
    expect(hosts).toEqual([
      { alias: 'prod', hostname: '10.0.0.5', user: 'deploy', port: 2222 },
      { alias: 'prod-alias', hostname: '10.0.0.5', user: 'deploy', port: 2222 },
      { alias: 'dev', hostname: 'dev.example.com' },
    ])
    expect(includes).toEqual(['config.d/*'])
  })
})

describe('sftp in batch mode', () => {
  it('ls -la read into entries: kinds, sizes, times, names with spaces and links', () => {
    const now = new Date(2026, 10, 14, 12, 0)
    const out = `sftp> ls -la "/srv/app"
drwxr-xr-x    5 deploy   deploy       4096 Nov 14 10:05 .
drwxr-xr-x    3 root     root         4096 Jan  2  2025 ..
drwxr-xr-x    2 deploy   deploy       4096 Nov 13 09:00 logs
-rw-r--r--    1 deploy   deploy       1234 Dec 20 18:30 old note.txt
-rw-r--r--    1 deploy   deploy        512 Mar  3  2024 config.yaml
lrwxrwxrwx    1 deploy   deploy         11 Nov 14 08:00 current -> releases/42
-rw-r--r--    1 deploy   deploy         42 Nov 14 11:00 .env
`
    const e = parseSftpList(out, now)
    expect(e.map((x) => [x.name, x.kind, x.size, x.hidden])).toEqual([
      ['logs', 'dir', 4096, false],
      ['old note.txt', 'file', 1234, false],
      ['config.yaml', 'file', 512, false],
      ['current', 'link', 11, false],
      ['.env', 'file', 42, true],
    ])
    // Dec 20 with a time, in November: last year's.
    expect(new Date(e[1]!.mtime).getFullYear()).toBe(2025)
    expect(new Date(e[2]!.mtime).getFullYear()).toBe(2024)
  })

  it('paths quoted for a batch line; remote places', () => {
    expect(sftpQuote('/srv/a "b"\\c')).toBe('"/srv/a \\"b\\"\\\\c"')
    expect(remoteDir('prod', '/srv/app')).toBe('sftp://prod/srv/app')
    expect(parseRemote('sftp://prod/srv/app')).toEqual({ alias: 'prod', path: '/srv/app' })
    expect(parseRemote('sftp://prod')).toEqual({ alias: 'prod', path: '/' })
    expect(parseRemote('/local/path')).toBeNull()
  })
})

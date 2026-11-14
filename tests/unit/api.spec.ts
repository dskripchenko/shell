import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cleanText, presencePath, readApiRequest } from '../../src/main/api'

const T = 'secret'
const ask = (url: string, body: object | string, auth = `Bearer ${T}`, method = 'POST') => readApiRequest(method, url, auth, T, typeof body === 'string' ? body : JSON.stringify(body))
const abs = process.platform === 'win32' ? 'C:\\w\\app' : '/w/app'

describe('the local API', () => {
  it('takes its own token, POST, JSON', () => {
    expect(ask('/api/open-tab', { cwd: abs }, 'Bearer other')).toEqual({ error: 401 })
    expect(ask('/api/open-tab', { cwd: abs }, `Bearer ${T}`, 'GET')).toEqual({ error: 405 })
    expect(ask('/api/open-tab', 'not json')).toEqual({ error: 400 })
    expect(ask('/api/nothing', {})).toEqual({ error: 404 })
  })

  it('reads a tab, a paste and a review', () => {
    expect(ask('/api/open-tab', { cwd: abs, name: ' build ' })).toEqual({ kind: 'open-tab', cwd: abs, name: 'build' })
    expect(ask('/api/open-tab', { cwd: 'app' })).toEqual({ error: 400 })
    expect(ask('/api/paste', { repo: abs, text: 'a.ts:2 — rename it' })).toEqual({ kind: 'paste', repo: abs, text: 'a.ts:2 — rename it' })
    expect(ask('/api/paste', { repo: abs, text: '  ' })).toEqual({ error: 400 })
    expect(ask('/api/review', { repo: abs, state: 'waiting', message: 'Changes to look at' })).toEqual({ kind: 'review', repo: abs, state: 'waiting', message: 'Changes to look at' })
    expect(ask('/api/review', { repo: abs, state: 'maybe' })).toEqual({ error: 400 })
  })

  it('lets no text press keys of its own', () => {
    expect(cleanText('one\r\ntwo\x1b[201~\x03\tthree\x9b')).toBe('one\ntwo[201~\tthree')
  })

  it('says where it is in the user’s runtime folder', () => {
    expect(presencePath({ SHELL_PRESENCE: '/x.json' }, '/tmp')).toBe('/x.json')
    expect(presencePath({ XDG_RUNTIME_DIR: '/run/user/1' }, '/tmp')).toBe(join('/run/user/1', 'shell-presence.json'))
  })
})

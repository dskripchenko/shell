import { describe, expect, it } from 'vitest'
import { agentOf, DEFAULT_AGENTS, nextAgent, QUIET_MS, strongest, type AgentInput, type AgentState } from '../../src/common/agents'

const A = DEFAULT_AGENTS

describe('which command is an agent', () => {
  it('by its first word, past variables, env and runners', () => {
    expect(agentOf('claude', A)).toBe('claude')
    expect(agentOf('claude --resume', A)).toBe('claude')
    expect(agentOf('ANTHROPIC_MODEL=x claude', A)).toBe('claude')
    expect(agentOf('env FOO=1 codex exec "fix"', A)).toBe('codex')
    expect(agentOf('npx @google/gemini-cli', A)).toBeNull()
    expect(agentOf('npx gemini', A)).toBe('gemini')
    expect(agentOf('pnpm dlx opencode@latest', A)).toBe('opencode')
    expect(agentOf('/opt/homebrew/bin/aider --model x', A)).toBe('aider')
    expect(agentOf('C:\\tools\\claude.exe', A)).toBe('claude')
    expect(agentOf('git status', A)).toBeNull()
    expect(agentOf('echo claude', A)).toBeNull()
    expect(agentOf('', A)).toBeNull()
  })
})

describe('what an agent is doing', () => {
  const run = (steps: [AgentInput, number][]): AgentState | null => steps.reduce<AgentState | null>((s, [input, now]) => nextAgent(s, input, now, A), null)

  it('works while it writes; its turn is done when it goes quiet; looked at, done is seen', () => {
    let s = run([[{ kind: 'command', text: 'claude' }, 0], [{ kind: 'output' }, 100]])
    expect(s).toMatchObject({ name: 'claude', status: 'running' })
    s = nextAgent(s, { kind: 'tick' }, 100 + QUIET_MS / 2, A)
    expect(s!.status).toBe('running')
    s = nextAgent(s, { kind: 'tick' }, 100 + QUIET_MS + 1, A)
    expect(s!.status).toBe('done')
    s = nextAgent(s, { kind: 'seen' }, 5000, A)
    expect(s!.status).toBe('idle')
    // Seen and quiet: no mark until it writes again; then it works again.
    expect(nextAgent(s, { kind: 'tick' }, 99_999, A)!.status).toBe('idle')
    expect(nextAgent(s, { kind: 'output' }, 100_000, A)!.status).toBe('running')
  })

  it('asks for the person: waiting until the person types; its own redraws do not end it', () => {
    let s = run([[{ kind: 'command', text: 'codex' }, 0], [{ kind: 'output' }, 10], [{ kind: 'notify', text: 'Codex needs approval' }, 20]])
    expect(s).toMatchObject({ status: 'waiting', message: 'Codex needs approval' })
    s = nextAgent(s, { kind: 'output' }, 30, A)
    expect(s!.status).toBe('waiting')
    expect(nextAgent(s, { kind: 'tick' }, 99_999, A)!.status).toBe('waiting')
    s = nextAgent(s, { kind: 'input' }, 40, A)
    expect(s).toMatchObject({ status: 'running' })
    expect(s!.message).toBeUndefined()
    expect(run([[{ kind: 'command', text: 'claude' }, 0], [{ kind: 'bell' }, 5]])!.status).toBe('waiting')
  })

  it('ends: well — done; with an error — failed, and stays so', () => {
    expect(run([[{ kind: 'command', text: 'claude' }, 0], [{ kind: 'end', code: 0 }, 9]])!.status).toBe('done')
    const failed = run([[{ kind: 'command', text: 'claude' }, 0], [{ kind: 'end', code: 1 }, 9]])
    expect(failed!.status).toBe('failed')
    expect(nextAgent(failed, { kind: 'bell' }, 10, A)!.status).toBe('failed')
    expect(nextAgent(failed, { kind: 'output' }, 10, A)!.status).toBe('failed')
    // The shell's prompt after it is not the agent working; seen, an ended agent is gone.
    const done = run([[{ kind: 'command', text: 'claude' }, 0], [{ kind: 'end', code: 0 }, 9], [{ kind: 'output' }, 10], [{ kind: 'input' }, 11], [{ kind: 'tick' }, 99_999]])
    expect(done!.status).toBe('done')
    expect(nextAgent(done, { kind: 'seen' }, 100_000, A)).toBeNull()
  })

  it('no agent: nothing to tell; another command after it is not one', () => {
    expect(run([[{ kind: 'command', text: 'ls' }, 0], [{ kind: 'output' }, 1], [{ kind: 'bell' }, 2]])).toBeNull()
    expect(run([[{ kind: 'command', text: 'claude' }, 0], [{ kind: 'end', code: 0 }, 1], [{ kind: 'command', text: 'ls' }, 2]])).toBeNull()
  })

  it('a tab shows the one that most needs the person', () => {
    const s = (status: AgentState['status']): AgentState => ({ name: 'claude', status, lastOutput: 0 })
    expect(strongest([s('running'), s('done'), s('waiting')])).toBe('waiting')
    expect(strongest([s('running'), s('failed')])).toBe('failed')
    expect(strongest([null, undefined])).toBeNull()
  })
})

describe('an agent that says its turns itself', () => {
  it('signals rule: quiet is not done, its screen does not make it work; done when it says so', () => {
    let s = nextAgent(null, { kind: 'command', text: 'claude' }, 0, A)
    s = nextAgent(s, { kind: 'signal', state: 'running' }, 10, A)
    expect(s).toMatchObject({ status: 'running', precise: true })
    expect(nextAgent(s, { kind: 'tick' }, 99_999, A)!.status).toBe('running')
    s = nextAgent(s, { kind: 'signal', state: 'done' }, 20, A)
    expect(nextAgent(s, { kind: 'output' }, 30, A)!.status).toBe('done')
    s = nextAgent(s, { kind: 'signal', state: 'waiting', message: 'Claude needs your permission to use Bash' }, 40, A)
    expect(s).toMatchObject({ status: 'waiting', message: 'Claude needs your permission to use Bash' })
  })

  it('a signal from a pane with no agent known yet makes one', () => {
    expect(nextAgent(null, { kind: 'signal', state: 'waiting', agent: 'claude' }, 0, A)).toMatchObject({ name: 'claude', status: 'waiting', precise: true })
  })
})

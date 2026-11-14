/**
 * AI agents in panes: which command is one, and what it is doing — working,
 * waiting for the person, done with its turn, or ended with an error. Told by
 * what its pane shows: the integration's marks (the command and its end), a
 * notification or a bell (it asks for the person), and its output (it works
 * while its screen moves; quiet after working, its turn is done).
 */

/** `idle`: seen after its turn, quiet, shown with no mark until it writes again. */
export type AgentStatus = 'running' | 'waiting' | 'done' | 'failed' | 'idle'

export interface AgentState {
  /** The agent's command: `claude`, `codex`… */
  name: string
  status: AgentStatus
  /** When it last wrote something (ms). */
  lastOutput: number
  /** What it said when it asked for the person. */
  message?: string
  /** Its program ended: the shell's output after it is not the agent's. */
  ended?: boolean
}

export const DEFAULT_AGENTS = ['claude', 'codex', 'grok', 'gemini', 'aider', 'opencode', 'cursor-agent', 'amp', 'qwen', 'goose']

/** How long a working agent may stay quiet before its turn counts as done (ms). */
export const QUIET_MS = 3000

/**
 * The agent a command line starts, or null: its first word after variable
 * assignments and a runner (`npx`, `bunx`, `pnpm dlx`…), by its file name.
 */
export function agentOf(command: string, agents: string[]): string | null {
  const words = command.trim().split(/\s+/).filter(Boolean)
  let i = 0
  while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]!)) i++
  if (words[i] === 'env') i++
  while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]!)) i++
  const runner = words[i]
  if (runner && ['npx', 'bunx', 'pnpx', 'uvx'].includes(runner)) i++
  else if (runner && ['pnpm', 'yarn', 'npm', 'bun'].includes(runner) && ['dlx', 'exec', 'x'].includes(words[i + 1] ?? '')) i += 2
  while (i < words.length && words[i]!.startsWith('-')) i++
  const word = words[i]
  if (!word) return null
  const name = word.split(/[\\/]/).pop()!.replace(/\.(exe|cmd|ps1)$/i, '').replace(/@[^@]*$/, '').toLowerCase()
  return agents.includes(name) ? name : null
}

export type AgentInput =
  | { kind: 'command'; text: string }
  | { kind: 'end'; code: number | null }
  | { kind: 'notify'; text: string }
  | { kind: 'bell' }
  | { kind: 'output' }
  /** The person typed in the pane. */
  | { kind: 'input' }
  /** The pane was looked at: a done turn is seen. */
  | { kind: 'seen' }
  /** Time passing: a quiet agent's turn is done. */
  | { kind: 'tick' }

/** The next state of a pane's agent after something happens in it; null: no agent there. */
export function nextAgent(state: AgentState | null, input: AgentInput, now: number, agents: string[]): AgentState | null {
  switch (input.kind) {
    case 'command': {
      const name = agentOf(input.text, agents)
      return name ? { name, status: 'running', lastOutput: now } : null
    }
    case 'end':
      if (!state) return null
      return { ...state, status: input.code === 0 || input.code === null ? 'done' : 'failed', message: undefined, ended: true }
    case 'notify':
    case 'bell':
      if (!state || state.ended) return state
      return { ...state, status: 'waiting', message: input.kind === 'notify' ? input.text : state.message }
    case 'output':
      if (!state) return null
      // A waiting agent redraws its question; only the person's answer moves it on.
      if (state.status === 'waiting' || state.ended) return state
      return { ...state, status: 'running', lastOutput: now }
    case 'input':
      if (!state || state.ended) return state
      return { ...state, status: 'running', lastOutput: now, message: undefined }
    case 'seen':
      // An ended agent, seen, is gone from its pane; a turn done, seen, leaves it idle.
      if (state?.ended) return null
      return state && state.status === 'done' ? { ...state, status: 'idle' } : state
    case 'tick':
      if (state && state.status === 'running' && now - state.lastOutput > QUIET_MS) return { ...state, status: 'done' }
      return state
  }
}

/** What a tab or a group shows for its panes' agents: the one that most needs the person. */
export function strongest(states: (AgentState | null | undefined)[]): AgentStatus | null {
  const order: AgentStatus[] = ['waiting', 'failed', 'done', 'running']
  for (const s of order) if (states.some((x) => x?.status === s)) return s
  return null
}

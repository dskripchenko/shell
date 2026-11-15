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
  /** It tells its turns itself (shell-notify, its hooks): quiet is not taken for done. */
  precise?: boolean
  /**
   * The person gave it a task (a prompt on its command line, Enter in it, an answer to its
   * question) and it has not gone quiet since: only then its output is taken for work. Without
   * one, its screen moving is a redraw (started, resized, its tab shown), not work.
   */
  turn?: boolean
}

export const DEFAULT_AGENTS = ['claude', 'codex', 'grok', 'gemini', 'aider', 'opencode', 'cursor-agent', 'amp', 'qwen', 'goose']

/** How long a working agent may stay quiet before its turn counts as done (ms). */
export const QUIET_MS = 3000

/**
 * The agent a command line starts, or null: its first word after variable
 * assignments and a runner (`npx`, `bunx`, `pnpm dlx`…), by its file name.
 */
export function agentOf(command: string, agents: string[]): string | null {
  return agentCall(command, agents)?.name ?? null
}

/** The agent a command line starts and whether it is given a task there (a word that is not an option). */
function agentCall(command: string, agents: string[]): { name: string; task: boolean } | null {
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
  if (!agents.includes(name)) return null
  return { name, task: words.slice(i + 1).some((w) => !w.startsWith('-')) }
}

export type AgentInput =
  | { kind: 'command'; text: string }
  | { kind: 'end'; code: number | null }
  | { kind: 'notify'; text: string }
  | { kind: 'bell' }
  | { kind: 'output' }
  /** The person typed in the pane; `submit`: it ended with Enter. */
  | { kind: 'input'; submit?: boolean }
  /** The pane was looked at: a done turn is seen. */
  | { kind: 'seen' }
  /** Time passing: a quiet agent's turn is done. */
  | { kind: 'tick' }
  /** The agent said it itself (shell-notify, from its hooks). */
  | { kind: 'signal'; state: 'running' | 'waiting' | 'done'; agent?: string; message?: string }

/** The next state of a pane's agent after something happens in it; null: no agent there. */
export function nextAgent(state: AgentState | null, input: AgentInput, now: number, agents: string[]): AgentState | null {
  switch (input.kind) {
    case 'command': {
      const call = agentCall(input.text, agents)
      if (!call) return null
      // Started with no task, it waits for one: no mark until the person gives it.
      return { name: call.name, status: call.task ? 'running' : 'idle', lastOutput: now, turn: call.task }
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
      // A waiting agent redraws its question; only the person's answer moves it on. One that tells
      // its turns itself is not moved by its screen.
      // Without a task given, its screen moving is a redraw.
      if (state.status === 'waiting' || state.ended || state.precise || !state.turn) return state
      return { ...state, status: 'running', lastOutput: now }
    case 'input':
      if (!state || state.ended) return state
      // Typing a prompt is not a task yet; Enter is. Any key answers a question (a menu takes digits).
      if (state.status !== 'waiting' && !input.submit) return state
      if (state.precise) return { ...state, status: state.status === 'waiting' ? 'running' : state.status, message: undefined }
      return { ...state, status: 'running', lastOutput: now, message: undefined, turn: true }
    case 'seen':
      // An ended agent, seen, is gone from its pane; a turn done, seen, leaves it idle.
      if (state?.ended) return null
      return state && state.status === 'done' ? { ...state, status: 'idle' } : state
    case 'tick':
      if (state && !state.precise && state.status === 'running' && now - state.lastOutput > QUIET_MS) return { ...state, status: 'done', turn: false }
      return state
    case 'signal': {
      const base: AgentState = state && !state.ended ? state : { name: input.agent ?? 'agent', status: 'running', lastOutput: now }
      return { ...base, status: input.state, precise: true, lastOutput: now, message: input.state === 'waiting' ? input.message : undefined }
    }
  }
}

/** What a tab or a group shows for its panes' agents: the one that most needs the person. */
export function strongest(states: (AgentState | null | undefined)[]): AgentStatus | null {
  const order: AgentStatus[] = ['waiting', 'failed', 'done', 'running']
  for (const s of order) if (states.some((x) => x?.status === s)) return s
  return null
}

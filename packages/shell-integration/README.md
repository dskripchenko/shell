# @dskripchenko/shell-integration

Shell integration for terminal apps built on a pseudo-terminal (`node-pty`
and the like):

- **zsh, bash and PowerShell mark their commands** — the prompt, the command
  typed, its output, its exit code (OSC 133, with the command's text as
  VS Code's 633;E) — and **say their folder** (OSC 7). The user's own startup
  files run first, as in any terminal; the marks come after. Any other shell
  runs as it is.
- **A reader of those marks** from a shell's output, with notifications
  (OSC 9, OSC 777) and the bell; a sequence cut between two pieces of output
  is read whole.
- **The journal of AI agents' edits** shared by the apps that watch agents: one
  Claude Code hook (PostToolUse on edits) appends each edit to
  `agent-edits.jsonl` in the repository's git folder — the same for its
  worktrees, never committed — with the terminal pane the agent runs in.

No dependencies. Node 20 or later.

## Marks

```ts
import { EventReader, integrate } from '@dskripchenko/shell-integration'
import { spawn } from 'node-pty'

const shell = process.env.SHELL ?? '/bin/zsh'
// Its arguments and environment with the marks; null for a shell without a script.
// The folder is the app's own: the zsh and bash scripts are written there.
const launch = integrate(shell, ['-l'], '/path/to/app-data/shell-integration')
const pty = spawn(shell, launch?.args ?? ['-l'], { env: { ...process.env, ...launch?.env } })

const reader = new EventReader()
pty.onData((data) => {
  for (const e of reader.read(data)) {
    // { kind: 'prompt' } | { kind: 'command', text } | { kind: 'start' } | { kind: 'end', code }
    // | { kind: 'cwd', path } | { kind: 'notify', text } | { kind: 'bell' }
  }
})
```

`SHELL_INTEGRATION=0` in the environment leaves the shell as it is.

## The journal of agents' edits

```ts
import { EDITS_MATCHER, editsHookCommand, JOURNAL, readEdits } from '@dskripchenko/shell-integration'

// In Claude Code's settings: { hooks: { PostToolUse: [{ matcher: EDITS_MATCHER, hooks: [{ type: 'command', command: editsHookCommand() }] }] } }
// Read back: `${git rev-parse --git-common-dir}/${JOURNAL}`
const edits = readEdits(text) // [{ path, pane, session, tool, cwd, time }]
```

The hook is one line of POSIX sh (`git`, `date`, `tr`, `cat`); outside a
repository it writes nothing. The pane is `SHELL_PANE_ID` of the terminal the
agent runs in, cleaned to `[A-Za-z0-9_-]`.

Used by [shell](https://github.com/dskripchenko/shell) and
[folio](https://github.com/dskripchenko/folio). MIT.

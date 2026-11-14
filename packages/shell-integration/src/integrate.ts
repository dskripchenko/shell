/**
 * Shell integration: small scripts that make a shell mark its commands — a
 * prompt, the command, its output, its exit code (OSC 133, with the command's
 * text as VS Code's 633;E) — and say its folder (OSC 7). The user's own
 * startup files run first, as they would in any terminal; the marks are added
 * after. zsh, bash and PowerShell; any other shell runs as it is.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import bash from './scripts/marks.bash'
import powershell from './scripts/marks.ps1'
import zshrc from './scripts/marks.zsh'
import zshWrap from './scripts/wrap.zsh'

export interface Launch {
  /** The shell's arguments, in place of the ones it was going to start with. */
  args: string[]
  /** Variables added to its environment. */
  env: Record<string, string>
}

const ZSH_WRAP = (file: string): string => zshWrap.split('__FILE__').join(file)

/** The shell's name as the scripts know it: zsh, bash, powershell; or null. */
export function shellKind(shell: string): 'zsh' | 'bash' | 'powershell' | null {
  const name = basename(shell.replace(/\\/g, '/')).toLowerCase().replace(/\.exe$/, '')
  if (name === 'zsh') return 'zsh'
  if (name === 'bash') return 'bash'
  if (name === 'powershell' || name === 'pwsh') return 'powershell'
  return null
}

/**
 * How to start a shell with the marks: its arguments and environment. Null for
 * a shell with no script, when `SHELL_INTEGRATION=0`, when the arguments
 * already run a command (`-c`, `-Command`), or when `dir` cannot be written.
 * `dir` is a folder of the app's own, where the zsh and bash scripts are put.
 */
export function integrate(shell: string, args: string[], dir: string, env: Record<string, string | undefined> = process.env): Launch | null {
  if (env.SHELL_INTEGRATION === '0') return null
  if (args.some((a) => /^-(c|Command|EncodedCommand|File)$/i.test(a))) return null
  const kind = shellKind(shell)
  try {
    if (kind === 'zsh') {
      const zdot = join(dir, 'zsh')
      mkdirSync(zdot, { recursive: true })
      writeFileSync(join(zdot, '.zshenv'), ZSH_WRAP('.zshenv'))
      writeFileSync(join(zdot, '.zprofile'), ZSH_WRAP('.zprofile'))
      writeFileSync(join(zdot, '.zshrc'), ZSH_WRAP('.zshrc') + zshrc)
      return { args, env: { ZDOTDIR: zdot, SHELL_INTEGRATION_USER_ZDOTDIR: env.ZDOTDIR || env.HOME || '' } }
    }
    if (kind === 'bash') {
      mkdirSync(dir, { recursive: true })
      const file = join(dir, 'marks.bash')
      writeFileSync(file, bash)
      // Interactive, with the marks' file in place of ~/.bashrc; it reads the login files itself.
      return { args: ['--init-file', file, '-i'], env: {} }
    }
    if (kind === 'powershell') {
      // An encoded command, not a script file: no execution policy stops it.
      const encoded = Buffer.from(powershell, 'utf16le').toString('base64')
      return { args: [...args.filter((a) => !/^-NoExit$/i.test(a)), '-NoExit', '-EncodedCommand', encoded], env: {} }
    }
  } catch {
    // The folder cannot be written: the shell runs without the marks.
  }
  return null
}

/**
 * Keys to commands: every key press is looked at before the terminal sees
 * it; a bound chord runs its command and goes no further, the rest go to the
 * program in the pane.
 */
import { chordOf, defaultBindings, displayKeys, KeyMatcher, mergeBindings, type Binding } from '../common/keys'
import { COMMANDS, run } from './commands'
import { ui } from './store'

let bindings: Binding[] = []
let matcher = new KeyMatcher([])
let chainTimer: number | undefined

/** Mistakes in the user's keys, said with the config's. */
export let keyErrors: string[] = []

export function rebuild(): void {
  const merged = mergeBindings(defaultBindings(ui.platform), ui.settings?.config.keys ?? {})
  keyErrors = [...merged.errors, ...merged.bindings.filter((b) => !COMMANDS.has(b.command)).map((b) => `[keys] "${b.keys}": нет команды «${b.command}»`)]
  bindings = merged.bindings.filter((b) => COMMANDS.has(b.command))
  matcher = new KeyMatcher(bindings)
}

/** The keys of a command as this system writes them, or ''. */
export function keysOf(command: string): string {
  const b = bindings.find((x) => x.command === command)
  return b ? displayKeys(b.keys, ui.platform) : ''
}

/** Keys that edit text are left to a text field (the palette's, the rename dialog's). */
const EDITING = new Set(['terminal.copy', 'terminal.paste', 'terminal.selectAll'])

function inTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('.term-host')) return false
  return target.matches('input, textarea, select, [contenteditable="true"]')
}

export function install(): void {
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.isComposing || e.key === 'Process') return
      const chord = chordOf(e)
      if (!chord) return
      const field = inTextField(e.target)
      // In a text field a plain key types; only chords with a modifier may be commands.
      if (field && !/(ctrl|alt|cmd)\+/.test(chord) && !matcher.pending) return
      const r = matcher.feed(chord)
      if (r.kind === 'none') {
        ui.chain = ''
        return
      }
      if (r.kind === 'run' && field && EDITING.has(r.command)) return
      e.preventDefault()
      e.stopPropagation()
      window.clearTimeout(chainTimer)
      if (r.kind === 'pending') {
        ui.chain = (ui.chain ? ui.chain + ' ' : '') + displayKeys(chord, ui.platform)
        chainTimer = window.setTimeout(() => {
          matcher.reset()
          ui.chain = ''
        }, 2000)
        return
      }
      ui.chain = ''
      run(r.command)
    },
    true,
  )
}

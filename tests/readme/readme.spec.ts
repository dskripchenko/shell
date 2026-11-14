import { _electron as electron, expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { editsHookCommand } from '../../packages/shell-integration/src/agentEdits'

/**
 * The README's screenshots (docs/images): a small project, an agent at work in
 * it (a stand-in for Claude Code), a second tab running a server, saved
 * projects; taken at 1440×900. Run by `pnpm readme:shots`, which then shrinks them.
 */
const OUT = process.env.SHELL_SHOTS ?? join(process.cwd(), 'test-results', 'readme')
const mac = process.platform === 'darwin'
const MOD = mac ? 'Meta' : 'Control'

/** A stand-in for Claude Code: it reads the cart, edits it, adds a file, then waits for the person. */
const AGENT = `#!/bin/bash
c() { printf '\\033[%sm%s\\033[0m' "$1" "$2"; }
printf '\\n'; c '38;5;173' '✻ '; c 1 'Welcome to Claude Code'; printf '\\n\\n'
c 2 '  /help for help, /status for your current setup'; printf '\\n\\n'
c 2 '  cwd: '; printf '%s\\n\\n' "\${PWD/#$HOME/~}"
printf '%s\\n\\n' "$(c 2 '>') Add a size to the cart and a discount function, with tests"
sleep 0.6
c '38;5;173' '⏺ '; printf 'I will read the cart first.\\n\\n'
c '38;5;173' '⏺ '; c 1 'Read'; printf '(src/cart.ts)\\n'
c 2 '  ⎿  Read 20 lines'; printf '\\n\\n'
sleep 0.4
c '38;5;173' '⏺ '; c 1 'Update'; printf '(src/cart.ts)\\n'
sed -i.bak 's/i.price \\* i.count/i.price * i.quantity/' src/cart.ts && rm -f src/cart.ts.bak
printf '  \\033[2m⎿\\033[0m  Updated src/cart.ts with \\033[32m6 additions\\033[0m and \\033[31m1 removal\\033[0m\\n'
cat >> src/cart.ts <<'TS'

export function size(cart: { items: unknown[] }): number {
  return cart.items.length
}
TS
printf '{"session_id":"c0ffee42","tool_name":"Edit","cwd":"%s","tool_input":{"file_path":"%s/src/cart.ts"}}' "$PWD" "$PWD" | sh "$EDITS_HOOK"
printf '\\n'; c '38;5;173' '⏺ '; c 1 'Write'; printf '(src/discount.ts)\\n'
printf '/** A price less a percent, to the cent. */\\nexport function discount(total: number, percent: number): number {\\n  return Math.round(total * (100 - percent)) / 100\\n}\\n' > src/discount.ts
printf '{"session_id":"c0ffee42","tool_name":"Write","cwd":"%s","tool_input":{"file_path":"%s/src/discount.ts"}}' "$PWD" "$PWD" | sh "$EDITS_HOOK"
printf '  \\033[2m⎿\\033[0m  Wrote 4 lines to src/discount.ts\\n\\n'
c '38;5;173' '⏺ '; c 1 'Bash'; printf '(npm test)\\n'
printf '  \\033[2m⎿\\033[0m  \\033[32m✓\\033[0m the cart (3 tests)  \\033[32m✓\\033[0m discount (2 tests)\\n\\n'
c '38;5;173' '⏺ '; printf 'Done: the cart has a size, discount() rounds to the cent. Shall I commit?\\n\\n'
printf '\\033[2m╭──────────────────────────────────────╮\\033[0m\\n'
printf '\\033[2m│\\033[0m > \\033[7m \\033[0m                                  \\033[2m│\\033[0m\\n'
printf '\\033[2m╰──────────────────────────────────────╯\\033[0m\\n'
printf '\\033[?25l'
shell-notify waiting "Claude is waiting for your answer" --agent claude
sleep 600
`

/** A dev server's output, in another tab. */
const SERVER = `#!/bin/bash
printf '\\n  \\033[1;32mVITE\\033[0m v6.3.1  ready in \\033[1m412\\033[0m ms\\n\\n'
printf '  \\033[32m➜\\033[0m  \\033[1mLocal\\033[0m:   \\033[36mhttp://localhost:5173/\\033[0m\\n'
printf '  \\033[2m➜  Network: use --host to expose\\033[0m\\n\\n'
for p in /src/main.ts /src/cart.ts /src/discount.ts /src/style.css; do printf '\\033[2m%s\\033[0m \\033[36m[vite]\\033[0m hmr update \\033[2m%s\\033[0m\\n' "$(date +%H:%M:%S)" "$p"; done
sleep 600
`

test('the README screenshots', async () => {
  test.setTimeout(240_000)
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'shell-shots-')))
  const bin = join(home, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'claude'), AGENT)
  writeFileSync(join(bin, 'dev-server'), SERVER)
  chmodSync(join(bin, 'claude'), 0o755)
  chmodSync(join(bin, 'dev-server'), 0o755)
  writeFileSync(join(home, 'edits-hook.sh'), editsHookCommand())
  // A plain, short prompt; no word from macOS about zsh.
  writeFileSync(join(home, '.bash_profile'), "export BASH_SILENCE_DEPRECATION_WARNING=1\nPS1='\\[\\e[32m\\]dana\\[\\e[0m\\]:\\[\\e[34m\\]\\W\\[\\e[0m\\]$ '\n")

  // The project: a cart, its docs with a diagram.
  const proj = join(home, 'shop')
  mkdirSync(join(proj, 'src'), { recursive: true })
  mkdirSync(join(proj, 'docs'), { recursive: true })
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.name=Dana', '-c', 'user.email=dana@example.com', ...a], { cwd: proj, encoding: 'utf8' })
  writeFileSync(join(proj, 'package.json'), '{\n  "name": "shop",\n  "private": true,\n  "scripts": { "dev": "dev-server", "test": "vitest run" }\n}\n')
  writeFileSync(join(proj, 'src', 'cart.ts'), ['import type { Item } from "./item"', '', '/** The items chosen, and what they cost together. */', 'export class Cart {', '  items: Item[] = []', '', '  add(item: Item): void {', '    this.items.push(item)', '  }', '', '  total(): number {', '    let sum = 0', '    for (const i of this.items) sum += i.price * i.count', '    return sum', '  }', '}', ''].join('\n'))
  writeFileSync(join(proj, 'src', 'item.ts'), 'export interface Item {\n  name: string\n  price: number\n  quantity: number\n}\n')
  writeFileSync(join(proj, 'src', 'main.ts'), 'import { Cart } from "./cart"\n\nexport const cart = new Cart()\n')
  writeFileSync(join(proj, 'README.md'), '# Shop\n\nA small shop.\n')
  writeFileSync(
    join(proj, 'docs', 'checkout.md'),
    '# Checkout\n\nHow an order is paid.\n\n```mermaid\nsequenceDiagram\n  participant C as Customer\n  participant S as Shop\n  participant P as Payments\n  C->>S: Place the order\n  S->>P: Charge the card\n  P-->>S: Paid\n  S-->>C: Receipt\n```\n\n| Step | Who | Takes |\n|---|---|---|\n| Order | Customer | 1 min |\n| Charge | Payments | 2 s |\n| Receipt | Shop | at once |\n\n- [x] Cart\n- [x] Discounts\n- [ ] Refunds\n',
  )
  git('init', '-q', '--initial-branch=main')
  git('add', '.')
  git('commit', '-qm', 'The shop: a cart')
  writeFileSync(join(proj, 'README.md'), '# Shop\n\nA small shop with a cart.\n')
  git('commit', '-qam', 'The readme')
  git('checkout', '-q', '-b', 'discounts')

  // shell's data: the settings, a session of three groups, saved projects.
  const data = mkdtempSync(join(tmpdir(), 'shell-shots-data-'))
  writeFileSync(join(data, 'config.toml'), '[shell]\nprogram = "/bin/bash"\nargs = ["-l"]\n[quake]\nenabled = false\n[folio]\nenabled = false\n[ui]\nlanguage = "en"\n[font]\nsize = 13\n[theme]\nname = "UID Dark"\n[[triggers]]\npattern = "hmr update"\naction = "highlight"\ncolor = "rgba(59, 130, 246, 0.28)"\n')
  const pane = (id: string, cwd: string) => ({ kind: 'pane', id, cwd })
  const workspace = {
    groups: [
      {
        id: 'g1', name: 'shop', color: '#3b82f6', cwd: proj, activeTab: 't1',
        tabs: [
          { id: 't1', name: 'claude', root: { kind: 'split', dir: 'row', sizes: [0.58, 0.42], children: [pane('p1', proj), { kind: 'split', dir: 'column', sizes: [0.5, 0.5], children: [pane('p2', proj), pane('p3', join(proj, 'src'))] }] }, focus: 'p1' },
          { id: 't2', name: 'server', color: '#22a05b', root: pane('p4', proj), focus: 'p4' },
          { id: 't3', name: 'tests', root: pane('p5', proj), focus: 'p5' },
        ],
      },
      { id: 'g2', name: 'docs-site', color: '#22a05b', cwd: home, activeTab: 't4', tabs: [{ id: 't4', root: pane('p6', home), focus: 'p6' }] },
      { id: 'g3', name: 'infra', color: '#e8822f', cwd: home, activeTab: 't5', tabs: [{ id: 't5', root: pane('p7', home), focus: 'p7' }] },
    ],
    activeGroup: 'g1',
    sidebarCollapsed: false,
  }
  writeFileSync(join(data, 'session.json'), JSON.stringify({ workspace }))
  const project = (id: string, name: string, root: string, color: string, opened: number) => ({ id, name, root, color, tabs: [{ root: { kind: 'pane', cwd: '' }, focus: 0 }], activeTab: 0, opened })
  writeFileSync(join(data, 'projects.json'), JSON.stringify({ projects: [project('a', 'shop', proj, '#3b82f6', 3), project('b', 'docs-site', join(home, 'docs-site'), '#22a05b', 2), project('c', 'infra', join(home, 'infra'), '#e8822f', 1), project('d', 'mobile-app', join(home, 'mobile-app'), '#8b5cf6', 0)] }))

  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, SHELL_DATA: data, SHELL_E2E: '1', HOME: home, PATH: `${bin}:${process.env.PATH}`, EDITS_HOOK: join(home, 'edits-hook.sh'), FOLIO_PRESENCE: join(home, 'no-folio.json'), SHELL_PRESENCE: join(home, 'no-shell.json'), LANG: 'en_US.UTF-8', GIT_PAGER: 'cat' },
  })
  const page = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1440, 900))
  await page.waitForSelector('.term-host .dsk-term')
  const text = () => page.evaluate(() => (window as unknown as { shellTest: { text(): string } }).shellTest.text())
  const shot = async (name: string) => {
    await page.mouse.move(1430, 890)
    await page.waitForTimeout(700)
    await page.screenshot({ path: join(OUT, name + '.png') })
  }
  /** A command typed into a pane, by clicking it first. */
  const run = async (paneId: string, line: string) => {
    await page.locator(`.term-host[data-pane="${paneId}"]`).click({ position: { x: 60, y: 40 } })
    await page.keyboard.type(line)
    await page.keyboard.press('Enter')
  }
  const prompts = () => page.locator('.dsk-term-row', { hasText: 'dana:' }).count()
  await expect.poll(prompts, { timeout: 30_000 }).toBeGreaterThanOrEqual(3)

  // The server in its tab, then back to the agent's.
  await page.locator('.tab', { hasText: 'server' }).click()
  await run('p4', 'npm run dev')
  await expect.poll(text).toContain('hmr update')
  await page.locator('.tab', { hasText: 'claude' }).click()

  // The panes: the agent; git's history; the folder's files.
  await run('p2', 'git log --oneline --graph --decorate --color=always -n 8')
  await run('p3', 'wc -l *.ts')
  await run('p1', 'claude')
  await expect.poll(text, { timeout: 20_000 }).toContain('Shall I commit?')
  await expect(page.locator('.tab', { hasText: 'claude' }).locator('.agent-mark.waiting')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.tab', { hasText: 'claude' }).locator('.tab-git')).toContainText('discounts', { timeout: 15_000 })
  await shot('main')

  // The agent's changes: the files, whose edit each is, a diff.
  await page.locator('.term-host[data-pane="p1"]').click({ position: { x: 60, y: 40 } })
  await page.keyboard.press(`${MOD}+Shift+g`)
  const changes = page.locator('.changes')
  await expect(changes.locator('.changes-file')).toHaveCount(2, { timeout: 15_000 })
  await changes.locator('.changes-file', { hasText: 'cart.ts' }).click()
  await expect(changes.locator('.diff-line.add').first()).toBeVisible()
  await changes.locator('.diff-line.add').first().click()
  await changes.locator('.diff-comment textarea').fill('Keep count as the field name: the API sends it.')
  await shot('changes')
  await changes.locator('.diff-comment').getByRole('button', { name: 'Cancel' }).click()
  await page.keyboard.press(`${MOD}+Shift+g`)

  // The viewer: a document with a live diagram, beside the panes.
  await run('p2', 'clear; echo "the flow: docs/checkout.md"')
  const link = page.locator('.term-host[data-pane="p2"] .dsk-term-link', { hasText: 'docs/checkout.md' }).last()
  await expect(link).toBeVisible()
  await link.click({ modifiers: [MOD] })
  const doc = page.frameLocator('.viewer-frame[src="shell-doc://app/viewer.html"]')
  await expect(doc.locator('svg').first()).toBeVisible({ timeout: 30_000 })
  await shot('viewer')
  await page.locator('.viewer').getByRole('button', { name: 'Close the viewer' }).click()

  // The file panels over the terminal, a file's start in the quick view.
  await page.locator('.term-host[data-pane="p3"]').click({ position: { x: 60, y: 40 } })
  await page.keyboard.press('Control+o')
  const cmd = page.locator('.commander')
  await expect(cmd.locator('.fpanel').first().locator('.fpanel-row')).toContainText(['..'])
  await cmd.locator('.fpanel').first().locator('.fpanel-row', { hasText: 'cart.ts' }).click()
  await page.keyboard.press('Insert')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('F3')
  await expect(cmd.locator('.quick-text')).toContainText('Cart')
  await shot('commander')
  await page.keyboard.press('F10')

  // Projects: the switcher.
  await page.keyboard.press(`${MOD}+Shift+o`)
  await expect(page.getByRole('dialog', { name: 'Projects' })).toBeVisible()
  await shot('projects')
  await page.keyboard.press('Escape')

  // A picture in the output and a command's block menu, in the tests tab.
  await page.locator('.tab', { hasText: 'tests' }).click()
  const icon = readFileSync(join(process.cwd(), 'build', 'icons', 'png', '256.png')).toString('base64')
  const show = join(home, 'show.cjs')
  writeFileSync(show, `const b = ${JSON.stringify(icon)}; const parts = b.match(/.{1,4096}/g); parts.forEach((p, i) => process.stdout.write('\\x1b_G' + (i === 0 ? 'a=T,f=100,c=16,' : '') + 'm=' + (i < parts.length - 1 ? 1 : 0) + ';' + p + '\\x1b\\\\')); process.stdout.write('\\n')`)
  await run('p5', 'node ~/show.cjs')
  await expect(page.locator('.term-host[data-pane="p5"] .dsk-term-picture')).toHaveCount(1, { timeout: 10_000 })
  await run('p5', 'git status --short')
  await expect.poll(text).toContain('src/discount.ts')
  await page.locator('.term-host[data-pane="p5"] .dsk-term-row', { hasText: 'src/discount.ts' }).last().click({ button: 'right' })
  await expect(page.getByRole('menu')).toBeVisible()
  await shot('blocks')
  await page.keyboard.press('Escape')

  // Light, with the project's tree.
  await page.locator('.tab', { hasText: 'claude' }).click()
  await page.evaluate(() => (window as unknown as { shell: { setSetting(s: string, k: string, v: string): Promise<unknown> } }).shell.setSetting('theme', 'name', 'UID Light'))
  await page.waitForTimeout(800)
  await page.keyboard.press(mac ? 'Meta+Shift+e' : 'Control+Shift+x')
  await expect(page.locator('.project-tree .tree-row').first()).toBeVisible()
  await page.locator('.project-tree .tree-row', { hasText: 'src' }).click()
  await shot('light')
  await app.close()
})


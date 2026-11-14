/** The prompt library on disk: `prompts/*.md` in the data folder, examples written at the first look. */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { EXAMPLES, promptFile, type Prompt } from '../common/prompts'

export class PromptStore {
  readonly dir: string

  constructor(data: string) {
    this.dir = join(data, 'prompts')
  }

  list(): Prompt[] {
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true })
      for (const p of EXAMPLES) writeFileSync(join(this.dir, promptFile(p.name)), p.text + '\n')
    }
    const out: Prompt[] = []
    for (const name of readdirSync(this.dir).sort((a, b) => a.localeCompare(b)).slice(0, 500)) {
      if (!['.md', '.txt'].includes(extname(name).toLowerCase())) continue
      const file = join(this.dir, name)
      try {
        if (!statSync(file).isFile() || statSync(file).size > 64 * 1024) continue
        out.push({ name: name.slice(0, -extname(name).length), text: readFileSync(file, 'utf8').replace(/\n$/, '') })
      } catch {
        // Unreadable: left out.
      }
    }
    return out
  }

  /** A new prompt, its name made free if taken: the file's name back. */
  add(name: string, text: string): string {
    mkdirSync(this.dir, { recursive: true })
    let file = promptFile(name)
    for (let i = 2; existsSync(join(this.dir, file)); i++) file = promptFile(`${name} ${i}`)
    writeFileSync(join(this.dir, file), text + '\n')
    return file
  }
}

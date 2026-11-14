/**
 * The viewer page: one file, shown by the elements of @dskripchenko/embed
 * (markdown with live blocks, diagrams, BPMN, draw.io, API references) or as
 * a picture, a player, highlighted code. It runs sandboxed on its own origin;
 * the window sends it what to show and hears back only which link was clicked.
 */
import { codeAsMarkdown, viewKind } from '../common/viewer'

interface Show {
  type: 'show'
  name: string
  base: string
  url: string
  text: string | null
  size: number
  theme: 'light' | 'dark'
  background: string
  foreground: string
}

declare const DskEmbed: { configure(o: { theme?: string; locale?: string }): void } | undefined

const view = document.getElementById('view')!
const base = document.getElementById('base') as HTMLBaseElement

function el<T extends HTMLElement>(tag: string, props: Record<string, unknown> = {}): T {
  const e = document.createElement(tag) as T
  Object.assign(e, props)
  return e
}

function show(m: Show): void {
  base.href = m.base
  document.documentElement.dataset.theme = m.theme
  document.documentElement.style.setProperty('--bg', m.background)
  document.documentElement.style.setProperty('--fg', m.foreground)
  try {
    DskEmbed?.configure({ theme: m.theme, locale: 'ru' })
  } catch {
    // An older embed without configure: its own theme.
  }
  view.className = ''
  view.replaceChildren()
  const k = viewKind(m.name, m.text)
  const text = m.text ?? ''
  switch (k.kind) {
    case 'markdown':
      view.append(el('dsk-markdown', { source: text }))
      break
    case 'code':
      view.append(el('dsk-markdown', { source: codeAsMarkdown(text, k.lang) }))
      break
    case 'diagram': {
      const d = el('dsk-diagram', { source: text })
      d.setAttribute('syntax', k.syntax)
      view.append(d)
      break
    }
    case 'bpmn':
    case 'dmn':
    case 'drawio':
    case 'openapi':
    case 'asyncapi':
      view.append(el(`dsk-${k.kind}`, { source: text }))
      break
    case 'image':
      view.className = 'media'
      view.append(el('img', { src: m.url, alt: m.name }))
      break
    case 'video':
      view.append(el('dsk-video', { src: m.url }))
      break
    case 'audio':
      view.append(el('dsk-audio', { src: m.url }))
      break
    case 'binary':
      view.append(el('p', { className: 'note', textContent: `Двоичный файл, ${m.size} байт — не показывается` }))
      break
  }
}

window.addEventListener('message', (e) => {
  if (e.source !== window.parent || !e.data || e.data.type !== 'show') return
  show(e.data as Show)
})

// A link clicked: the window decides — another file of the folder in the viewer, the web in the browser.
document.addEventListener('click', (e) => {
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!a || a.getAttribute('href')?.startsWith('#')) return
  e.preventDefault()
  window.parent.postMessage({ type: 'link', href: a.href }, '*')
})

// A double click: where, for the window to open the source there (in folio). The rendered
// page does not say its source's lines: a block is told by its text, a line of code by its place.
document.addEventListener('dblclick', (e) => {
  const path = e.composedPath().filter((n): n is HTMLElement => n instanceof HTMLElement)
  const pre = path.find((n) => n.tagName === 'PRE')
  if (pre) {
    const cs = getComputedStyle(pre)
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4
    const top = pre.getBoundingClientRect().top + parseFloat(cs.paddingTop || '0')
    const index = Math.max(0, Math.floor((e.clientY - top + pre.scrollTop) / lh))
    const lines = (pre.textContent ?? '').split('\n')
    window.parent.postMessage({ type: 'edit', text: lines[Math.min(index, lines.length - 1)] ?? '', index }, '*')
    return
  }
  const block = path.find((n) => /^(P|LI|H[1-6]|TD|TH|BLOCKQUOTE|DT|DD)$/.test(n.tagName))
  window.parent.postMessage({ type: 'edit', text: block?.textContent ?? '' }, '*')
})

window.parent.postMessage({ type: 'ready' }, '*')

/**
 * Fuzzy matching for the palette: the letters of the query in order, closer
 * together and at the starts of words scoring higher. A query typed in the
 * other keyboard layout (ЙЦУКЕН for QWERTY and back) is tried too.
 */

const RU = 'йцукенгшщзхъфывапролджэячсмитьбю'
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,."

/** The same keys pressed in the other layout. */
export function otherLayout(text: string): string {
  let out = ''
  for (const ch of text.toLowerCase()) {
    const ru = RU.indexOf(ch)
    if (ru >= 0) out += EN[ru]
    else {
      const en = EN.indexOf(ch)
      out += en >= 0 ? RU[en] : ch
    }
  }
  return out
}

export interface Match {
  score: number
  /** Positions of the matched characters in the text, for highlighting. */
  positions: number[]
}

function matchOne(query: string, text: string): Match | null {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (!q) return { score: 0, positions: [] }
  const chars = [...q].filter((ch) => ch !== ' ')
  const wordStart = (i: number) => i === 0 || /[\s·./_\-:]/.test(t[i - 1]!)
  const fits = (rest: string[], from: number): boolean => {
    let at = from
    for (const ch of rest) {
      at = t.indexOf(ch, at)
      if (at < 0) return false
      at++
    }
    return true
  }
  const positions: number[] = []
  let score = 0
  let from = 0
  for (let k = 0; k < chars.length; k++) {
    const ch = chars[k]!
    let at = t.indexOf(ch, from)
    if (at < 0) return null
    // A later start of a word with the same letter is better, if the rest still fits after it.
    const prevAt = positions.at(-1)
    if (!wordStart(at) && !(prevAt !== undefined && at === prevAt + 1)) {
      for (let i = t.indexOf(ch, at + 1); i >= 0; i = t.indexOf(ch, i + 1)) {
        if (wordStart(i) && fits(chars.slice(k + 1), i + 1)) {
          at = i
          break
        }
      }
    }
    const prev = positions.at(-1)
    if (prev !== undefined && at === prev + 1) score += 5
    if (at === 0 || /[\s·./_\-:]/.test(t[at - 1]!)) score += 8
    score -= Math.min(at - from, 10) * 0.5
    positions.push(at)
    from = at + 1
  }
  if (t.startsWith(q)) score += 20
  return { score, positions }
}

export function fuzzy(query: string, text: string): Match | null {
  const direct = matchOne(query, text)
  const other = matchOne(otherLayout(query), text)
  if (!direct) return other
  if (!other) return direct
  return other.score > direct.score ? other : direct
}

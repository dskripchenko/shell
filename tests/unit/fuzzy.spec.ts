import { describe, expect, it } from 'vitest'
import { fuzzy, otherLayout } from '../../src/common/fuzzy'

describe('fuzzy matching for the palette', () => {
  it('letters in order, positions to highlight', () => {
    expect(fuzzy('nwt', 'Новая вкладка')).toBeNull()
    expect(fuzzy('нвк', 'Новая вкладка')?.positions).toEqual([0, 6, 7]) // the в of «вкладка», not the one inside «Новая»
    expect(fuzzy('xyz', 'Разделить вправо')).toBeNull()
  })

  it('a word start and a run of letters score higher', () => {
    const a = fuzzy('лвр', 'Разделить вправо')!
    const b = fuzzy('впр', 'Разделить вправо')!
    expect(b.score).toBeGreaterThan(a.score)
    expect(fuzzy('раз', 'Разделить вправо')!.score).toBeGreaterThan(b.score)
  })

  it('a query typed in the other layout still finds', () => {
    expect(otherLayout('ыздше')).toBe('split')
    expect(otherLayout('ghjtrn')).toBe('проект')
    expect(fuzzy('ыздше', 'pane.split')).not.toBeNull()
    expect(fuzzy('ghjtrn', 'Открыть проект')).not.toBeNull()
  })
})

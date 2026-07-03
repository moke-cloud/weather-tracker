import { describe, it, expect } from 'vitest'
import { getPersonalWeights, MIN_ENTRIES } from './headache-personalize'
import type { DiaryEntry } from './types'

function entry(overrides: Partial<DiaryEntry>): DiaryEntry {
  return {
    id: `t_${Math.random()}`,
    timestamp: Date.now(),
    severity: 3,
    riskScore: 50,
    pressure: 1013,
    pressureChange3h: 0,
    temperature: 20,
    humidity: 60,
    note: '',
    ...overrides,
  }
}

describe('getPersonalWeights', () => {
  it(`記録が${MIN_ENTRIES}件未満なら null (個人化しない)`, () => {
    const entries = Array.from({ length: MIN_ENTRIES - 1 }, () =>
      entry({ pressureChange3h: -3 })
    )
    expect(getPersonalWeights(entries)).toBeNull()
  })

  it('気圧低下時の発症が多いと pressure_rate の重みが上がる', () => {
    const entries = Array.from({ length: 10 }, () =>
      entry({ pressureChange3h: -3 })
    )
    const p = getPersonalWeights(entries)
    expect(p).not.toBeNull()
    expect(p!.weights.pressure_rate).toBeGreaterThan(0.35)
    expect(p!.basis).toBe(10)
    expect(p!.notes.length).toBeGreaterThan(0)
  })

  it('気圧低下と無関係な発症が続くと pressure_rate の重みが下がる', () => {
    const entries = Array.from({ length: 10 }, () =>
      entry({ pressureChange3h: 1, pressure: 1020, humidity: 50 })
    )
    const p = getPersonalWeights(entries)
    expect(p).not.toBeNull()
    expect(p!.weights.pressure_rate).toBeLessThan(0.35)
  })

  it('調整後も重みの合計は1になる', () => {
    const entries = Array.from({ length: 8 }, () =>
      entry({ pressureChange3h: -2.5, humidity: 90, pressure: 1002 })
    )
    const p = getPersonalWeights(entries)
    const total = Object.values(p!.weights).reduce((s, v) => s + v, 0)
    expect(total).toBeCloseTo(1, 5)
  })

  it('気象データが記録されていない日記だけなら null', () => {
    const entries = Array.from({ length: 10 }, () =>
      entry({ pressure: null, pressureChange3h: null, humidity: null })
    )
    expect(getPersonalWeights(entries)).toBeNull()
  })
})

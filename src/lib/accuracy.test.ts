import { describe, it, expect } from 'vitest'
import { computeSkillsFromEntries, skillsToWeights } from './accuracy'
import type { ForecastLogEntry } from './types'

const NOW = new Date('2026-07-03T12:00:00+09:00').getTime()
const PRIORS = { JMA: 0.45, ECMWF: 0.35, GFS: 0.2 }

function verifiedEntry(
  model: string,
  tempError: number,
  pressError: number,
  index: number
): ForecastLogEntry {
  const target = new Date(NOW - (index + 1) * 3_600_000).toISOString()
  return {
    key: `loc|${model}|${target}`,
    locationId: 'loc',
    model,
    targetTime: target,
    issuedAt: NOW - (index + 4) * 3_600_000,
    predictedTemp: 20 + tempError,
    predictedPressure: 1010 + pressError,
    observedTemp: 20,
    observedPressure: 1010,
    verifiedAt: NOW,
  }
}

describe('computeSkillsFromEntries', () => {
  it('照合データが無ければ prior の重みをそのまま返す', () => {
    const skills = computeSkillsFromEntries([], PRIORS, NOW)
    const w = skillsToWeights(skills)
    expect(w.JMA).toBeCloseTo(0.45, 2)
    expect(w.ECMWF).toBeCloseTo(0.35, 2)
    expect(w.GFS).toBeCloseTo(0.2, 2)
  })

  it('誤差の小さいモデルほど重みが大きくなる', () => {
    const entries: ForecastLogEntry[] = []
    for (let i = 0; i < 30; i++) {
      entries.push(verifiedEntry('JMA', 0.5, 0.3, i)) // 高精度
      entries.push(verifiedEntry('ECMWF', 1.5, 1.0, i))
      entries.push(verifiedEntry('GFS', 4.0, 3.0, i)) // 低精度
    }
    const skills = computeSkillsFromEntries(entries, PRIORS, NOW)
    const jma = skills.find((s) => s.model === 'JMA')!
    const gfs = skills.find((s) => s.model === 'GFS')!

    expect(jma.maeTemp).toBeCloseTo(0.5, 2)
    expect(gfs.maeTemp).toBeCloseTo(4.0, 2)
    expect(jma.weight).toBeGreaterThan(gfs.weight)
    // 合計は1
    const total = skills.reduce((s, m) => s + m.weight, 0)
    expect(total).toBeCloseTo(1, 5)
  })

  it('サンプルが少ないうちは prior 寄りに留まる', () => {
    const entries: ForecastLogEntry[] = []
    for (let i = 0; i < 2; i++) {
      entries.push(verifiedEntry('JMA', 5.0, 4.0, i)) // JMAが大外し
      entries.push(verifiedEntry('ECMWF', 0.2, 0.1, i))
      entries.push(verifiedEntry('GFS', 0.2, 0.1, i))
    }
    const skills = computeSkillsFromEntries(entries, PRIORS, NOW)
    const jma = skills.find((s) => s.model === 'JMA')!
    // 2サンプルでは prior 0.45 から大きくは動かない
    expect(jma.weight).toBeGreaterThan(0.3)
  })

  it('7日より古い照合データは無視される', () => {
    const old: ForecastLogEntry = {
      ...verifiedEntry('GFS', 10, 10, 0),
      targetTime: new Date(NOW - 10 * 24 * 3_600_000).toISOString(),
    }
    const skills = computeSkillsFromEntries([old], PRIORS, NOW)
    const gfs = skills.find((s) => s.model === 'GFS')!
    expect(gfs.sampleCount).toBe(0)
  })
})

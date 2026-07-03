import { describe, it, expect } from 'vitest'
import { computeUmbrellaForecast } from './umbrella'
import type { ModelForecast, HourlyPoint } from './types'

const NOW = new Date('2026-07-03T09:00:00+09:00').getTime()

function hourTime(offset: number): string {
  return new Date(NOW + offset * 3_600_000).toISOString()
}

function makeModel(
  label: string,
  hours: number,
  overrides: (i: number) => Partial<HourlyPoint>
): ModelForecast {
  return {
    model: label,
    color: '#000',
    hourly: Array.from({ length: hours }, (_, i) => ({
      time: hourTime(i),
      temperature: null,
      apparentTemperature: null,
      weatherCode: null,
      pressureMsl: null,
      surfacePressure: null,
      precipitation: 0,
      precipitationProbability: 0,
      humidity: null,
      windSpeed: 2,
      ...overrides(i),
    })),
  }
}

describe('computeUmbrellaForecast', () => {
  it('雨なしなら「傘の出番なし」', () => {
    const m = makeModel('JMA', 24, () => ({}))
    const f = computeUmbrellaForecast([m], m, 24, NOW)
    expect(f.ranges).toHaveLength(0)
    expect(f.summary).toContain('傘の出番はなさそう')
  })

  it('降水確率60%以上の連続時間帯は「傘必須」レンジになる', () => {
    const m = makeModel('JMA', 24, (i) =>
      i >= 6 && i <= 9 ? { precipitationProbability: 70, precipitation: 0.5 } : {}
    )
    const f = computeUmbrellaForecast([m], m, 24, NOW)
    expect(f.ranges).toHaveLength(1)
    expect(f.ranges[0].level).toBe('umbrella')
    expect(f.ranges[0].start).toBe(hourTime(6))
    expect(f.ranges[0].end).toBe(hourTime(9))
    expect(f.summary).toContain('傘必須')
  })

  it('強い雨 (4mm/h以上) は strong になる', () => {
    const m = makeModel('JMA', 24, (i) =>
      i === 3 ? { precipitation: 6, precipitationProbability: 90 } : {}
    )
    const f = computeUmbrellaForecast([m], m, 24, NOW)
    expect(f.ranges[0].level).toBe('strong')
  })

  it('雨 + 強風 (10m/s以上) も strong になる', () => {
    const m = makeModel('JMA', 24, (i) =>
      i === 3 ? { precipitation: 1.5, precipitationProbability: 80, windSpeed: 12 } : {}
    )
    const f = computeUmbrellaForecast([m], m, 24, NOW)
    expect(f.ranges[0].level).toBe('strong')
  })

  it('1時間の乾いた隙間は1つのレンジに結合される', () => {
    const rainHours = new Set([5, 6, 8, 9]) // 7時に隙間
    const m = makeModel('JMA', 24, (i) =>
      rainHours.has(i) ? { precipitationProbability: 65 } : {}
    )
    const f = computeUmbrellaForecast([m], m, 24, NOW)
    expect(f.ranges).toHaveLength(1)
    expect(f.ranges[0].start).toBe(hourTime(5))
    expect(f.ranges[0].end).toBe(hourTime(9))
  })

  it('合意度はそのレンジで雨を予測するモデルの割合になる', () => {
    const rainy = (i: number) =>
      i === 3 ? { precipitationProbability: 70, precipitation: 1 } : {}
    const dry = () => ({})
    const models = [
      makeModel('JMA', 24, rainy),
      makeModel('ECMWF', 24, rainy),
      makeModel('GFS', 24, dry),
    ]
    const f = computeUmbrellaForecast(models, models[0], 24, NOW)
    expect(f.ranges[0].confidence).toBeCloseTo(2 / 3, 1)
  })

  it('降水確率30-59%は折りたたみレベル', () => {
    const m = makeModel('JMA', 24, (i) =>
      i === 2 ? { precipitationProbability: 45 } : {}
    )
    const f = computeUmbrellaForecast([m], m, 24, NOW)
    expect(f.ranges[0].level).toBe('fold')
    expect(f.summary).toContain('折りたたみ')
  })
})

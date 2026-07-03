import { describe, it, expect } from 'vitest'
import { computeConsensus, effectiveWeights, CONSENSUS_LABEL } from './consensus'
import type { ModelForecast, AmedasObservation, HourlyPoint } from './types'

const NOW = new Date('2026-07-03T12:00:00+09:00').getTime()

function makePoint(time: string, overrides: Partial<HourlyPoint> = {}): HourlyPoint {
  return {
    time,
    temperature: null,
    apparentTemperature: null,
    weatherCode: null,
    pressureMsl: null,
    surfacePressure: null,
    precipitation: null,
    precipitationProbability: null,
    humidity: null,
    windSpeed: null,
    ...overrides,
  }
}

function makeModel(
  label: string,
  hours: number,
  overrides: (i: number) => Partial<HourlyPoint>
): ModelForecast {
  return {
    model: label,
    color: '#000',
    hourly: Array.from({ length: hours }, (_, i) =>
      makePoint(new Date(NOW + i * 3_600_000).toISOString(), overrides(i))
    ),
  }
}

describe('effectiveWeights', () => {
  it('短期リードでは既定の短期重み (JMA優位) を返す', () => {
    const w = effectiveWeights(6)
    expect(w.JMA).toBeCloseTo(0.45)
    expect(w.ECMWF).toBeCloseTo(0.35)
  })

  it('中期リード (60h以降) では ECMWF 優位に切り替わる', () => {
    const w = effectiveWeights(72)
    expect(w.ECMWF).toBeCloseTo(0.5)
    expect(w.JMA).toBeCloseTo(0.25)
  })

  it('遷移帯 (36-60h) では線形にブレンドされる', () => {
    const w = effectiveWeights(48) // 中間点
    expect(w.JMA).toBeCloseTo((0.45 + 0.25) / 2)
    expect(w.ECMWF).toBeCloseTo((0.35 + 0.5) / 2)
  })

  it('動的重みは短期側を置き換える', () => {
    const w = effectiveWeights(6, { JMA: 0.6, ECMWF: 0.3, GFS: 0.1 })
    expect(w.JMA).toBeCloseTo(0.6)
  })
})

describe('computeConsensus', () => {
  it('数値フィールドは重み付き平均になる', () => {
    const models = [
      makeModel('JMA', 3, () => ({ temperature: 20 })),
      makeModel('ECMWF', 3, () => ({ temperature: 24 })),
      makeModel('GFS', 3, () => ({ temperature: 30 })),
    ]
    const c = computeConsensus(models, null, null, NOW)
    expect(c).not.toBeNull()
    expect(c!.model).toBe(CONSENSUS_LABEL)
    // 0.45*20 + 0.35*24 + 0.2*30 = 23.4
    expect(c!.hourly[0].temperature).toBeCloseTo(23.4, 1)
  })

  it('null のモデルは除外し、残りの重みで再正規化する (JMAに降水確率が無いケース)', () => {
    const models = [
      makeModel('JMA', 3, () => ({ precipitationProbability: null })),
      makeModel('ECMWF', 3, () => ({ precipitationProbability: 60 })),
      makeModel('GFS', 3, () => ({ precipitationProbability: 80 })),
    ]
    const c = computeConsensus(models, null, null, NOW)
    // (0.35*60 + 0.2*80) / 0.55 = 67.27
    expect(c!.hourly[0].precipitationProbability).toBeCloseTo(67.27, 1)
  })

  it('weatherCode は最重みの非nullモデルから採用する', () => {
    const models = [
      makeModel('JMA', 3, () => ({ weatherCode: null })),
      makeModel('ECMWF', 3, () => ({ weatherCode: 61 })),
      makeModel('GFS', 3, () => ({ weatherCode: 3 })),
    ]
    const c = computeConsensus(models, null, null, NOW)
    expect(c!.hourly[0].weatherCode).toBe(61)
  })

  it('AMeDAS実測でナッジングされ、12時間かけて減衰する', () => {
    const models = [makeModel('JMA', 24, () => ({ temperature: 20, pressureMsl: 1010 }))]
    const amedas: AmedasObservation = {
      time: new Date(NOW).toISOString(),
      temp: 22, // +2°C のバイアス
      humidity: null,
      pressureSea: 1013, // +3hPa のバイアス
      pressureStation: null,
      precipitation1h: null,
      windSpeed: null,
      windDirection: null,
    }
    const c = computeConsensus(models, amedas, null, NOW)
    // 観測時刻: 全量補正
    expect(c!.hourly[0].temperature).toBeCloseTo(22, 1)
    expect(c!.hourly[0].pressureMsl).toBeCloseTo(1013, 1)
    // +6h: 半減
    expect(c!.hourly[6].temperature).toBeCloseTo(21, 1)
    // +12h以降: 補正なし
    expect(c!.hourly[12].temperature).toBeCloseTo(20, 1)
    expect(c!.hourly[18].temperature).toBeCloseTo(20, 1)
  })

  it('異常な観測差は上限でクランプされる', () => {
    const models = [makeModel('JMA', 3, () => ({ temperature: 20 }))]
    const amedas: AmedasObservation = {
      time: new Date(NOW).toISOString(),
      temp: 40, // +20°C は異常 → cap 5°C
      humidity: null,
      pressureSea: null,
      pressureStation: null,
      precipitation1h: null,
      windSpeed: null,
      windDirection: null,
    }
    const c = computeConsensus(models, amedas, null, NOW)
    expect(c!.hourly[0].temperature).toBeCloseTo(25, 1)
  })

  it('モデルが空なら null', () => {
    expect(computeConsensus([], null, null, NOW)).toBeNull()
  })
})

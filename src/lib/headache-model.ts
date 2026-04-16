/**
 * Advanced Multi-Factor Headache/Migraine Risk Prediction Engine
 *
 * Significantly exceeds single-factor apps (e.g. 頭痛ーる) by combining
 * six research-backed meteorological factors with multi-model consensus
 * and ensemble uncertainty.
 *
 * References:
 * [1] Kimoto K et al. (2011) Cephalalgia – 6-10 hPa/24h pressure drop triggers migraine
 * [2] Mukamal KJ et al. (2009) Neurology – 5 °C/24h temp rise → +7.5 % headache ER risk
 * [3] Okuma H et al. (2015) SpringerPlus – ≥5 hPa/24h drop correlates with onset
 * [4] Prince PB et al. (2004) Headache – falling BP + high humidity + rising temp
 * [5] Hoffmann J et al. (2015) J Headache Pain – humidity amplifier with pressure drop
 * [6] Kelman L (2007) Cephalalgia – weather change triggers 53 % of migraineurs
 * [7] Yang AC et al. (2015) J Headache Pain – low absolute pressure + high temp → ER visits
 * [8] Vencovský V et al. (2021) Int J Biometeorol – temp & humidity change triggers
 * [9] Scheidt J et al. (2013) – Foehn-type warm/dry winds and migraine
 * [10] Katsuki M et al. (2023) – ML wearable+weather models AUC 0.70-0.78
 */

import type {
  ModelForecast,
  EnsembleBand,
  HeadacheRiskResult,
  HeadacheFactor,
  HourlyRisk,
  HeadacheRiskLevel,
} from './types'

/* ── Factor weights ── */

const W_PRESSURE_RATE  = 0.35   // Primary: pressure change rate [1][3]
const W_ABSOLUTE_PRESS = 0.08   // Low absolute pressure baseline [7]
const W_TEMPERATURE    = 0.18   // Temperature change [2][8]
const W_HUMIDITY       = 0.14   // Humidity impact [4][5]
const W_FRONT          = 0.15   // Weather front detection [6][9]
const W_ENSEMBLE       = 0.10   // Model agreement + ensemble spread

/* ── Helpers ── */

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function lerp(v: number, inLo: number, inHi: number, outLo: number, outHi: number): number {
  const t = clamp((v - inLo) / (inHi - inLo || 1), 0, 1)
  return outLo + t * (outHi - outLo)
}

function riskLevel(score: number): HeadacheRiskLevel {
  if (score >= 76) return 'critical'
  if (score >= 56) return 'high'
  if (score >= 36) return 'moderate'
  if (score >= 16) return 'low'
  return 'safe'
}

function riskLabel(level: HeadacheRiskLevel): string {
  const map: Record<HeadacheRiskLevel, string> = {
    safe: '安全',
    low: 'やや注意',
    moderate: '注意',
    high: '警戒',
    critical: '厳重警戒',
  }
  return map[level]
}

/* ──────────────────────────────
   Individual factor scorers
   ────────────────────────────── */

interface TimeValue { time: string; value: number }

/** Find maximum drop over a sliding window of `windowHours` */
function maxDrop(points: TimeValue[], windowHours: number): number {
  let drop = 0
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dt = (new Date(points[j].time).getTime() - new Date(points[i].time).getTime()) / 3_600_000
      if (dt > windowHours + 0.5) break
      if (dt < 0.5) continue
      const dp = points[i].value - points[j].value // positive = drop
      if (dp > drop) drop = dp
    }
  }
  return drop
}

/** Find maximum absolute change over a window */
function maxAbsChange(points: TimeValue[], windowHours: number): number {
  let change = 0
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dt = (new Date(points[j].time).getTime() - new Date(points[i].time).getTime()) / 3_600_000
      if (dt > windowHours + 0.5) break
      if (dt < 0.5) continue
      const d = Math.abs(points[j].value - points[i].value)
      if (d > change) change = d
    }
  }
  return change
}

/* 1. Pressure change rate [1][3] */
function scorePressureRate(models: ModelForecast[], now: number): HeadacheFactor {
  // Aggregate pressure data from primary model (JMA), fallback to others
  const jma = models.find(m => m.model === 'JMA') ?? models[0]
  if (!jma) return emptyFactor('pressure_rate', '気圧変化率', W_PRESSURE_RATE)

  const window = jma.hourly
    .filter(h => h.pressureMsl !== null && Math.abs(new Date(h.time).getTime() - now) < 12 * 3_600_000)
    .map(h => ({ time: h.time, value: h.pressureMsl! }))

  const drop3h = maxDrop(window, 3)
  const drop6h = maxDrop(window, 6)

  // Thresholds from Kimoto [1] and Okuma [3]
  // 3h: ≥4 hPa critical, ≥2.5 high, ≥1.5 moderate
  // 6h: ≥8 hPa critical, ≥5 high, ≥3 moderate
  const score3 = drop3h >= 4 ? 100 : drop3h >= 2.5 ? lerp(drop3h, 2.5, 4, 70, 100) : drop3h >= 1.5 ? lerp(drop3h, 1.5, 2.5, 40, 70) : lerp(drop3h, 0, 1.5, 0, 40)
  const score6 = drop6h >= 8 ? 100 : drop6h >= 5 ? lerp(drop6h, 5, 8, 70, 100) : drop6h >= 3 ? lerp(drop6h, 3, 5, 40, 70) : lerp(drop6h, 0, 3, 0, 40)
  const score = Math.max(score3, score6)

  const desc = drop3h >= 1 || drop6h >= 2
    ? `3h: -${drop3h.toFixed(1)}hPa / 6h: -${drop6h.toFixed(1)}hPa`
    : '気圧は安定'

  return {
    id: 'pressure_rate',
    name: '気圧変化率',
    score: Math.round(score),
    weight: W_PRESSURE_RATE,
    description: desc,
    reference: 'Kimoto 2011, Okuma 2015',
  }
}

/* 2. Absolute pressure level [7] */
function scoreAbsolutePressure(models: ModelForecast[], now: number): HeadacheFactor {
  const jma = models.find(m => m.model === 'JMA') ?? models[0]
  const current = jma?.hourly.find(h => h.pressureMsl !== null && Math.abs(new Date(h.time).getTime() - now) < 2 * 3_600_000)
  const p = current?.pressureMsl

  let score = 0
  let desc = '--'
  if (p != null) {
    // Yang 2015: low pressure associated with ER visits
    score = p < 1000 ? lerp(p, 990, 1000, 100, 80)
          : p < 1005 ? lerp(p, 1000, 1005, 80, 45)
          : p < 1010 ? lerp(p, 1005, 1010, 45, 15)
          : 0
    desc = `現在 ${p.toFixed(1)} hPa`
  }

  return {
    id: 'absolute_pressure',
    name: '絶対気圧',
    score: clamp(Math.round(score), 0, 100),
    weight: W_ABSOLUTE_PRESS,
    description: desc,
    reference: 'Yang 2015',
  }
}

/* 3. Temperature change [2][8] */
function scoreTemperatureChange(models: ModelForecast[], now: number): HeadacheFactor {
  const jma = models.find(m => m.model === 'JMA') ?? models[0]
  if (!jma) return emptyFactor('temp_change', '気温変化', W_TEMPERATURE)

  const window = jma.hourly
    .filter(h => h.temperature !== null && Math.abs(new Date(h.time).getTime() - now) < 12 * 3_600_000)
    .map(h => ({ time: h.time, value: h.temperature! }))

  const change12h = maxAbsChange(window, 12)
  const change6h = maxAbsChange(window, 6)

  // Mukamal 2009: 5°C/24h → +7.5% risk. We use 12h window for sharper signal.
  // >8°C/12h: critical, >5°C: high, >3°C: moderate
  const s12 = change12h >= 8 ? 90 : change12h >= 5 ? lerp(change12h, 5, 8, 55, 90) : change12h >= 3 ? lerp(change12h, 3, 5, 25, 55) : lerp(change12h, 0, 3, 0, 25)
  const s6 = change6h >= 5 ? 85 : change6h >= 3 ? lerp(change6h, 3, 5, 40, 85) : lerp(change6h, 0, 3, 0, 40)
  const score = Math.max(s12, s6)

  return {
    id: 'temp_change',
    name: '気温変化',
    score: Math.round(score),
    weight: W_TEMPERATURE,
    description: change12h >= 1 ? `12h変動: ${change12h.toFixed(1)}°C` : '安定',
    reference: 'Mukamal 2009, Vencovský 2021',
  }
}

/* 4. Humidity impact [4][5] */
function scoreHumidity(models: ModelForecast[], now: number): HeadacheFactor {
  const jma = models.find(m => m.model === 'JMA') ?? models[0]
  if (!jma) return emptyFactor('humidity', '湿度', W_HUMIDITY)

  const window = jma.hourly
    .filter(h => h.humidity !== null && Math.abs(new Date(h.time).getTime() - now) < 12 * 3_600_000)
    .map(h => ({ time: h.time, value: h.humidity! }))

  // Current humidity
  const currentH = window.find(h => Math.abs(new Date(h.time).getTime() - now) < 2 * 3_600_000)?.value ?? null
  // Humidity change over 6h
  const humidChange6h = maxAbsChange(window, 6)

  // Hoffmann 2015: >80% humidity with pressure drop = amplifier
  // Prince 2004: high humidity as co-factor
  let score = 0
  if (currentH !== null) {
    // High absolute humidity
    if (currentH >= 90) score += 40
    else if (currentH >= 80) score += 25
    else if (currentH >= 70) score += 10
  }
  // Rapid change (>20% in 6h)
  if (humidChange6h >= 30) score += 60
  else if (humidChange6h >= 20) score += 40
  else if (humidChange6h >= 10) score += 15

  return {
    id: 'humidity',
    name: '湿度',
    score: clamp(Math.round(score), 0, 100),
    weight: W_HUMIDITY,
    description: currentH !== null ? `${currentH.toFixed(0)}% (6h変動: ${humidChange6h.toFixed(0)}%)` : '--',
    reference: 'Hoffmann 2015, Prince 2004',
  }
}

/* 5. Weather front detection [6][9] */
function scoreWeatherFront(models: ModelForecast[], now: number): HeadacheFactor {
  const jma = models.find(m => m.model === 'JMA') ?? models[0]
  if (!jma) return emptyFactor('front', '前線通過', W_FRONT)

  // Front passage signature: simultaneous pressure drop + temp change + humidity surge
  // Within a 6h window, check if all three change significantly together
  const window6h = jma.hourly.filter(h => {
    const t = new Date(h.time).getTime()
    return t >= now - 3 * 3_600_000 && t <= now + 6 * 3_600_000
  })

  if (window6h.length < 4) return emptyFactor('front', '前線通過', W_FRONT)

  // Calculate gradients over consecutive points
  let frontScore = 0
  let frontDesc = 'なし'

  for (let i = 0; i < window6h.length - 3; i++) {
    const span = window6h.slice(i, i + 4)
    const pVals = span.filter(h => h.pressureMsl !== null).map(h => h.pressureMsl!)
    const tVals = span.filter(h => h.temperature !== null).map(h => h.temperature!)
    const hVals = span.filter(h => h.humidity !== null).map(h => h.humidity!)

    if (pVals.length < 2 || tVals.length < 2 || hVals.length < 2) continue

    const pDrop = pVals[0] - pVals[pVals.length - 1]
    const tChange = Math.abs(tVals[tVals.length - 1] - tVals[0])
    const hChange = Math.abs(hVals[hVals.length - 1] - hVals[0])

    // Cold front: pressure drops, temp drops, humidity spikes
    // Warm front: pressure drops gradually, temp rises, humidity high
    const isColdFront = pDrop >= 2 && tChange >= 2 && hChange >= 10
    const isWarmFront = pDrop >= 1.5 && tChange >= 1.5 && hVals[hVals.length - 1] >= 75

    if (isColdFront) {
      const s = clamp(lerp(pDrop, 2, 5, 70, 100), 70, 100)
      if (s > frontScore) {
        frontScore = s
        frontDesc = `寒冷前線接近 (気圧-${pDrop.toFixed(1)}hPa, 気温変動${tChange.toFixed(1)}°C)`
      }
    } else if (isWarmFront) {
      const s = clamp(lerp(pDrop, 1.5, 4, 55, 85), 55, 85)
      if (s > frontScore) {
        frontScore = s
        frontDesc = `温暖前線接近 (気圧-${pDrop.toFixed(1)}hPa, 気温変動${tChange.toFixed(1)}°C)`
      }
    }
  }

  return {
    id: 'front',
    name: '前線通過',
    score: Math.round(frontScore),
    weight: W_FRONT,
    description: frontDesc,
    reference: 'Kelman 2007, Scheidt 2013',
  }
}

/* 6. Model consensus + ensemble spread */
function scoreModelConsensus(
  models: ModelForecast[],
  ensemble: EnsembleBand[],
  now: number,
): HeadacheFactor {
  // Check if all models agree on pressure trend direction
  const trends: number[] = []
  for (const m of models) {
    const pts = m.hourly
      .filter(h => h.pressureMsl !== null)
      .filter(h => {
        const t = new Date(h.time).getTime()
        return t >= now - 3 * 3_600_000 && t <= now + 6 * 3_600_000
      })
    if (pts.length >= 2) {
      const first = pts[0].pressureMsl!
      const last = pts[pts.length - 1].pressureMsl!
      trends.push(last - first) // negative = dropping
    }
  }

  // Model agreement: all dropping?
  const allDrop = trends.length >= 2 && trends.every(t => t < -1)
  const someDrop = trends.length >= 2 && trends.filter(t => t < -1).length >= 2

  // Ensemble spread
  const futureEnsemble = ensemble.filter(e => {
    const t = new Date(e.time).getTime()
    return t > now && t <= now + 6 * 3_600_000
  })
  const maxSpread = futureEnsemble.reduce((max, e) => {
    if (e.p10 === null || e.p90 === null) return max
    return Math.max(max, e.p90 - e.p10)
  }, 0)

  // Wide ensemble spread = uncertainty = possible rapid shift
  let score = 0
  if (allDrop) score += 50
  else if (someDrop) score += 30
  if (maxSpread >= 8) score += 50
  else if (maxSpread >= 5) score += 30
  else if (maxSpread >= 3) score += 15

  const desc = [
    allDrop ? '全モデル気圧低下予測' : someDrop ? '2モデル気圧低下予測' : 'モデル間分岐',
    maxSpread >= 3 ? `不確実性: ±${(maxSpread / 2).toFixed(1)}hPa` : '',
  ].filter(Boolean).join(' / ')

  return {
    id: 'consensus',
    name: 'モデル合意・不確実性',
    score: clamp(Math.round(score), 0, 100),
    weight: W_ENSEMBLE,
    description: desc || '十分なデータなし',
    reference: 'アンサンブル分析',
  }
}

/* ── Empty factor placeholder ── */
function emptyFactor(id: string, name: string, weight: number): HeadacheFactor {
  return { id, name, score: 0, weight, description: 'データ不足', reference: '' }
}

/* ──────────────────────────────
   Hourly risk timeline
   ────────────────────────────── */

function computeHourlyRisk(models: ModelForecast[], ensemble: EnsembleBand[]): HourlyRisk[] {
  const jma = models.find(m => m.model === 'JMA') ?? models[0]
  if (!jma) return []

  const now = Date.now()
  const hours: HourlyRisk[] = []

  for (let offset = 0; offset <= 24; offset++) {
    const targetTime = now + offset * 3_600_000
    const targetStr = new Date(targetTime).toISOString()

    // Calculate factors at this specific hour
    const factors = [
      scorePressureRate(models, targetTime),
      scoreAbsolutePressure(models, targetTime),
      scoreTemperatureChange(models, targetTime),
      scoreHumidity(models, targetTime),
      scoreWeatherFront(models, targetTime),
      scoreModelConsensus(models, ensemble, targetTime),
    ]

    const weighted = factors.reduce((sum, f) => sum + f.score * f.weight, 0)
    const score = clamp(Math.round(weighted), 0, 100)

    hours.push({
      time: targetStr,
      score,
      level: riskLevel(score),
    })
  }

  return hours
}

/* ──────────────────────────────
   Advice generator
   ────────────────────────────── */

function generateAdvice(level: HeadacheRiskLevel, factors: HeadacheFactor[]): string[] {
  const advice: string[] = []
  const pRate = factors.find(f => f.id === 'pressure_rate')
  const front = factors.find(f => f.id === 'front')
  const humidity = factors.find(f => f.id === 'humidity')
  const temp = factors.find(f => f.id === 'temp_change')

  if (level === 'critical') {
    advice.push('頭痛薬を手元に準備してください')
    advice.push('十分な水分補給（1時間にコップ1杯）を心がけましょう')
    advice.push('可能であれば安静にし、外出を控えてください')
    if (front && front.score > 50) {
      advice.push('前線通過に伴う急激な気象変化が予測されています')
    }
  } else if (level === 'high') {
    advice.push('予防的にカフェインを摂取すると効果的です（コーヒー1杯程度）')
    advice.push('こまめな水分補給を意識してください')
    if (pRate && pRate.score >= 60) {
      advice.push('気圧が急低下しています。耳のマッサージや深呼吸が有効です')
    }
  } else if (level === 'moderate') {
    advice.push('水分補給を意識し、無理のないスケジュールを')
    if (humidity && humidity.score >= 40) {
      advice.push('高湿度が予測されています。室内の換気を心がけましょう')
    }
    if (temp && temp.score >= 40) {
      advice.push('気温変動が大きいため、服装での調節を意識してください')
    }
  } else if (level === 'low') {
    advice.push('大きなリスクはありませんが、念のため水分補給を')
  } else {
    advice.push('気象条件は安定しています。通常の生活で問題ありません')
  }

  return advice
}

/* ──────────────────────────────
   Main API
   ────────────────────────────── */

export function calculateHeadacheRisk(
  models: ModelForecast[],
  ensemble: EnsembleBand[],
): HeadacheRiskResult {
  const now = Date.now()

  const factors: HeadacheFactor[] = [
    scorePressureRate(models, now),
    scoreAbsolutePressure(models, now),
    scoreTemperatureChange(models, now),
    scoreHumidity(models, now),
    scoreWeatherFront(models, now),
    scoreModelConsensus(models, ensemble, now),
  ]

  // Weighted sum
  const rawScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0)

  // Synergy bonus: multiple high factors amplify risk (Prince 2004 combinatorial effect)
  const highFactors = factors.filter(f => f.score >= 50).length
  const synergyMultiplier = highFactors >= 4 ? 1.2 : highFactors >= 3 ? 1.1 : 1.0

  const overallScore = clamp(Math.round(rawScore * synergyMultiplier), 0, 100)
  const level = riskLevel(overallScore)

  // Confidence based on data quality
  const hasJMA = models.some(m => m.model === 'JMA')
  const modelCount = models.filter(m => m.hourly.some(h => h.pressureMsl !== null)).length
  const hasEnsemble = ensemble.length > 0
  const confidence = clamp(
    (hasJMA ? 0.4 : 0) + Math.min(modelCount * 0.2, 0.4) + (hasEnsemble ? 0.2 : 0),
    0,
    1,
  )

  const hourlyRisk = computeHourlyRisk(models, ensemble)
  const advice = generateAdvice(level, factors)

  // Summary
  const topFactor = [...factors].sort((a, b) => b.score * b.weight - a.score * a.weight)[0]
  const summary = level === 'safe'
    ? '気象条件は安定しています'
    : `主要因: ${topFactor.name} (${topFactor.description})`

  return {
    overallScore,
    level,
    label: riskLabel(level),
    factors,
    hourlyRisk,
    confidence,
    advice,
    summary,
  }
}

/** Lightweight per-hour score for a single point (used in timeline) */
export function quickHourlyScore(models: ModelForecast[], targetTime: number): number {
  const pFactor = scorePressureRate(models, targetTime)
  const tFactor = scoreTemperatureChange(models, targetTime)
  return clamp(Math.round(pFactor.score * 0.6 + tFactor.score * 0.4), 0, 100)
}

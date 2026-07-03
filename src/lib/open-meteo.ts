import type {
  ModelForecast,
  HourlyPoint,
  EnsembleBand,
  AirQualityData,
  DailyForecast,
} from './types'
import { fetchJson } from './resilient-fetch'

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const ENSEMBLE_URL = 'https://ensemble-api.open-meteo.com/v1/ensemble'
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality'
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'

/**
 * 予報モデル。多モデル合意 (multi-model consensus) は単一モデルを
 * ほぼ常に上回るという検証結果に基づき、主要気象機関6モデルを取得する。
 * - JMA MSM: 日本域5km高解像度 (短期の日本最強)
 * - ECMWF IFS: 世界最高精度のグローバルモデル (中期)
 * - ICON: ドイツDWD、グローバル上位常連
 * - UKMO: 英国気象庁 Unified Model
 * - GFS: 米NOAA (降水確率の主要ソース)
 * - GEM: カナダ環境省
 */
export const MODELS = [
  { id: 'jma_seamless', label: 'JMA', color: '#3b82f6' },
  { id: 'ecmwf_ifs025', label: 'ECMWF', color: '#10b981' },
  { id: 'icon_seamless', label: 'ICON', color: '#a855f7' },
  { id: 'ukmo_seamless', label: 'UKMO', color: '#ec4899' },
  { id: 'gfs_seamless', label: 'GFS', color: '#f59e0b' },
  { id: 'gem_seamless', label: 'GEM', color: '#14b8a6' },
] as const

const HOURLY_PARAMS = [
  'temperature_2m',
  'apparent_temperature',
  'weather_code',
  'pressure_msl',
  'surface_pressure',
  'precipitation',
  'precipitation_probability',
  'relative_humidity_2m',
  'wind_speed_10m',
].join(',')

const DAILY_PARAMS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'precipitation_probability_max',
  'uv_index_max',
].join(',')

// 複数モデル指定時: hourly.temperature_2m_jma_seamless のようにモデル名サフィックス付き。
// 単一モデル指定時 (フォールバック経路): hourly.temperature_2m のままサフィックスなし。

type ApiData = Record<string, unknown>

function getArray(obj: ApiData, key: string): (number | null)[] {
  const val = obj[key]
  if (Array.isArray(val)) return val
  return []
}

/** サフィックス付き→なしの順で系列を探す (一括/個別リクエスト両対応) */
function getSeries(obj: ApiData, param: string, modelId: string): (number | null)[] {
  const suffixed = getArray(obj, `${param}_${modelId}`)
  if (suffixed.length > 0) return suffixed
  return getArray(obj, param)
}

function parseHourlyPoints(
  hourly: ApiData,
  times: string[],
  modelId: string
): HourlyPoint[] {
  const temps = getSeries(hourly, 'temperature_2m', modelId)
  const apparent = getSeries(hourly, 'apparent_temperature', modelId)
  const codes = getSeries(hourly, 'weather_code', modelId)
  const pMsl = getSeries(hourly, 'pressure_msl', modelId)
  const pSurf = getSeries(hourly, 'surface_pressure', modelId)
  const precip = getSeries(hourly, 'precipitation', modelId)
  const precipProb = getSeries(hourly, 'precipitation_probability', modelId)
  const humid = getSeries(hourly, 'relative_humidity_2m', modelId)
  const wind = getSeries(hourly, 'wind_speed_10m', modelId)

  return times.map((t, i) => ({
    time: t,
    temperature: temps[i] ?? null,
    apparentTemperature: apparent[i] ?? null,
    weatherCode: codes[i] ?? null,
    pressureMsl: pMsl[i] ?? null,
    surfacePressure: pSurf[i] ?? null,
    precipitation: precip[i] ?? null,
    precipitationProbability: precipProb[i] ?? null,
    humidity: humid[i] ?? null,
    windSpeed: wind[i] ?? null,
  }))
}

function parseDaily(daily: ApiData, times: string[]): DailyForecast[] {
  const primaryModel = 'jma_seamless'
  // 降水確率を提供するモデルのみ (JMAはnull): ECMWF → GFS の順で採用
  const precipProbModel = 'ecmwf_ifs025'
  const precipProbFallback = 'gfs_seamless'

  const pick = (param: string, modelId: string): (number | null)[] =>
    getSeries(daily, param, modelId)

  return times.map((d, i) => ({
    date: d,
    weatherCode: pick('weather_code', primaryModel)[i] ?? null,
    tempMax: pick('temperature_2m_max', primaryModel)[i] ?? null,
    tempMin: pick('temperature_2m_min', primaryModel)[i] ?? null,
    precipSum: pick('precipitation_sum', primaryModel)[i] ?? null,
    precipProbMax:
      pick('precipitation_probability_max', precipProbModel)[i] ??
      pick('precipitation_probability_max', precipProbFallback)[i] ??
      null,
    uvIndexMax: pick('uv_index_max', primaryModel)[i] ?? null,
  }))
}

interface ForecastApiResponse {
  hourly?: ApiData
  daily?: ApiData
}

export interface MultiModelResult {
  models: ModelForecast[]
  daily: DailyForecast[]
  /** ok=一括取得成功 / partial=個別フォールバックで一部のみ取得 */
  status: 'ok' | 'partial'
}

function buildForecastUrl(lat: number, lon: number, modelIds: string): string {
  return (
    `${FORECAST_URL}?latitude=${lat}&longitude=${lon}` +
    `&models=${modelIds}` +
    `&hourly=${HOURLY_PARAMS}` +
    `&daily=${DAILY_PARAMS}` +
    `&past_days=3&forecast_days=7` +
    `&timezone=Asia%2FTokyo`
  )
}

/**
 * マルチモデル予報の取得。
 * 1. 3モデル一括リクエスト
 * 2. 失敗したら各モデルを個別リクエスト (1モデルの障害が全体を殺さない)
 * 3. 全滅なら throw (呼び出し側がキャッシュへフォールバック)
 */
export async function fetchMultiModelForecast(
  lat: number,
  lon: number
): Promise<MultiModelResult> {
  try {
    const url = buildForecastUrl(lat, lon, MODELS.map((m) => m.id).join(','))
    const data = await fetchJson<ForecastApiResponse>(url)
    const parsed = parseCombined(data)
    if (parsed) return { ...parsed, status: 'ok' }
  } catch {
    // 一括リクエスト失敗 → 個別フォールバックへ
  }

  const results = await Promise.allSettled(
    MODELS.map((m) =>
      fetchJson<ForecastApiResponse>(buildForecastUrl(lat, lon, m.id), {
        retries: 1,
      })
    )
  )

  const models: ModelForecast[] = []
  let daily: DailyForecast[] = []
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return
    const m = MODELS[i]
    const hourly = r.value.hourly ?? {}
    const times = (hourly.time as string[] | undefined) ?? []
    if (times.length === 0) return
    models.push({
      model: m.label,
      color: m.color,
      hourly: parseHourlyPoints(hourly, times, m.id),
    })
    const dailyData = r.value.daily ?? {}
    const dailyTimes = (dailyData.time as string[] | undefined) ?? []
    if (daily.length === 0 && dailyTimes.length > 0) {
      daily = parseDaily(dailyData, dailyTimes)
    }
  })

  if (models.length === 0) {
    throw new Error('全ての予報モデルの取得に失敗しました')
  }
  return { models, daily, status: 'partial' }
}

function parseCombined(
  data: ForecastApiResponse
): { models: ModelForecast[]; daily: DailyForecast[] } | null {
  const hourly = data.hourly ?? {}
  const daily = data.daily ?? {}
  const hourlyTimes = (hourly.time as string[] | undefined) ?? []
  const dailyTimes = (daily.time as string[] | undefined) ?? []
  if (hourlyTimes.length === 0) return null

  const models: ModelForecast[] = MODELS.map((m) => ({
    model: m.label,
    color: m.color,
    hourly: parseHourlyPoints(hourly, hourlyTimes, m.id),
  }))
  return { models, daily: parseDaily(daily, dailyTimes) }
}

/**
 * メンバー系列から p10/median/p90、「3h以内に1.5hPa以上降下する確率」、
 * 「降水確率 (0.1mm/h以上のメンバー割合)」を算出。
 * 降水確率はアンサンブル由来のほうが決定論的モデル由来より検証成績が良い。
 */
export function computeEnsembleBands(
  times: string[],
  pressureMembers: (number | null)[][],
  precipMembers: (number | null)[][] = []
): EnsembleBand[] {
  const DROP_THRESHOLD_HPA = 1.5
  const DROP_WINDOW_HOURS = 3
  const RAIN_THRESHOLD_MM = 0.1

  return times.map((t, i) => {
    const values = pressureMembers
      .map((series) => series[i])
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b)

    // 降水確率: この時刻に雨を降らせているメンバーの割合
    let rainCount = 0
    let rainTotal = 0
    for (const series of precipMembers) {
      const v = series[i]
      if (v == null) continue
      rainTotal++
      if (v >= RAIN_THRESHOLD_MM) rainCount++
    }
    const rainProb = rainTotal > 0 ? rainCount / rainTotal : null

    if (values.length === 0) {
      return { time: t, median: null, p10: null, p90: null, dropProb3h: null, rainProb }
    }

    // 各メンバーについて、i 時点から3時間以内の最小値との差が閾値以上か
    let dropCount = 0
    let dropTotal = 0
    for (const series of pressureMembers) {
      const base = series[i]
      if (base == null) continue
      let minAhead = base
      for (let j = i + 1; j < Math.min(i + DROP_WINDOW_HOURS + 1, series.length); j++) {
        const v = series[j]
        if (v != null && v < minAhead) minAhead = v
      }
      dropTotal++
      if (base - minAhead >= DROP_THRESHOLD_HPA) dropCount++
    }

    const p10Idx = Math.floor(values.length * 0.1)
    const medIdx = Math.floor(values.length * 0.5)
    const p90Idx = Math.floor(values.length * 0.9)

    return {
      time: t,
      median: values[medIdx],
      p10: values[p10Idx],
      p90: values[p90Idx],
      dropProb3h: dropTotal > 0 ? dropCount / dropTotal : null,
      rainProb,
    }
  })
}

/** アンサンブル予報モデル: ECMWF ENS 51メンバー + NOAA GEFS 31メンバー */
const ENSEMBLE_MODELS = ['ecmwf_ifs025', 'gfs025'] as const

interface EnsembleRaw {
  times: string[]
  pressure: (number | null)[][]
  precip: (number | null)[][]
}

function parseEnsembleResponse(hourly: ApiData): EnsembleRaw | null {
  const times = (hourly.time as string[] | undefined) ?? []
  if (times.length === 0) return null
  // コントロールラン (サフィックスなし) + 摂動メンバー (memberXX)
  const memberKeys = (param: string): string[] =>
    Object.keys(hourly).filter(
      (k) => k === param || k.startsWith(`${param}_member`)
    )
  const pressureKeys = memberKeys('pressure_msl')
  const precipKeys = memberKeys('precipitation')
  if (pressureKeys.length === 0 && precipKeys.length === 0) return null
  return {
    times,
    pressure: pressureKeys.map((k) => getArray(hourly, k)),
    precip: precipKeys.map((k) => getArray(hourly, k)),
  }
}

/**
 * マルチモデルアンサンブル取得。ECMWF ENS と GEFS を別リクエストで
 * 並列取得してメンバーをプールする (片方の障害が全体を殺さない +
 * 単一モデルリクエストはメンバーのキー形式が安定)。
 */
export async function fetchEnsembleForecast(
  lat: number,
  lon: number
): Promise<EnsembleBand[]> {
  const results = await Promise.allSettled(
    ENSEMBLE_MODELS.map((model) =>
      fetchJson<{ hourly?: ApiData }>(
        `${ENSEMBLE_URL}?latitude=${lat}&longitude=${lon}` +
          `&models=${model}` +
          `&hourly=pressure_msl,precipitation` +
          `&past_days=3&forecast_days=5` +
          `&timezone=Asia%2FTokyo`,
        { retries: 1 }
      )
    )
  )

  const parsed: EnsembleRaw[] = []
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value.hourly) continue
    const p = parseEnsembleResponse(r.value.hourly)
    if (p) parsed.push(p)
  }
  if (parsed.length === 0) return []

  // 時間軸は最初の成功モデルを基準にし、他モデルは時刻文字列で整列する
  const base = parsed[0]
  const pressure: (number | null)[][] = [...base.pressure]
  const precip: (number | null)[][] = [...base.precip]

  for (const other of parsed.slice(1)) {
    const indexByTime = new Map(other.times.map((t, i) => [t, i]))
    const align = (series: (number | null)[]): (number | null)[] =>
      base.times.map((t) => {
        const idx = indexByTime.get(t)
        return idx == null ? null : series[idx] ?? null
      })
    pressure.push(...other.pressure.map(align))
    precip.push(...other.precip.map(align))
  }

  return computeEnsembleBands(base.times, pressure, precip)
}

export async function fetchAirQuality(
  lat: number,
  lon: number
): Promise<AirQualityData | null> {
  const url =
    `${AIR_QUALITY_URL}?latitude=${lat}&longitude=${lon}` +
    `&hourly=uv_index,pm2_5,pm10,us_aqi` +
    `&forecast_days=2&timezone=Asia%2FTokyo`

  try {
    const data = await fetchJson<{ hourly?: ApiData }>(url)
    const h = data.hourly
    if (!h) return null
    return {
      time: (h.time as string[] | undefined) ?? [],
      uvIndex: getArray(h, 'uv_index'),
      pm25: getArray(h, 'pm2_5'),
      pm10: getArray(h, 'pm10'),
      usAqi: getArray(h, 'us_aqi'),
    }
  } catch {
    return null
  }
}

export interface GeoResult {
  name: string
  latitude: number
  longitude: number
  country: string
  admin1?: string
}

export async function searchLocation(query: string): Promise<GeoResult[]> {
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(query)}&count=8&language=ja&format=json`
  const data = await fetchJson<{ results?: GeoResult[] }>(url, { retries: 1 })
  if (!data.results) return []
  return data.results.map((r) => ({
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    country: r.country,
    admin1: r.admin1,
  }))
}

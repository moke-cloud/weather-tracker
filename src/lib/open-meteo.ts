import type {
  ModelForecast,
  HourlyPoint,
  EnsembleBand,
  AirQualityData,
  DailyForecast,
} from './types'

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const ENSEMBLE_URL = 'https://ensemble-api.open-meteo.com/v1/ensemble'
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality'
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'

const MODELS = [
  { id: 'jma_seamless', label: 'JMA', color: '#3b82f6' },
  { id: 'ecmwf_ifs025', label: 'ECMWF', color: '#10b981' },
  { id: 'gfs_seamless', label: 'GFS', color: '#f59e0b' },
] as const

const HOURLY_PARAMS = [
  'temperature_2m',
  'weather_code',
  'pressure_msl',
  'surface_pressure',
  'precipitation',
  'relative_humidity_2m',
  'wind_speed_10m',
].join(',')

const DAILY_PARAMS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'uv_index_max',
].join(',')

// API returns a single hourly/daily object with model-suffixed field names:
//   hourly.temperature_2m_jma_seamless, hourly.temperature_2m_ecmwf_ifs025, etc.
//   hourly.time is shared across all models

type ApiData = Record<string, unknown>

function getArray(obj: ApiData, key: string): (number | null)[] {
  const val = obj[key]
  if (Array.isArray(val)) return val
  return []
}

export async function fetchMultiModelForecast(
  lat: number,
  lon: number
): Promise<{ models: ModelForecast[]; daily: DailyForecast[] }> {
  const modelIds = MODELS.map((m) => m.id).join(',')
  const url =
    `${FORECAST_URL}?latitude=${lat}&longitude=${lon}` +
    `&models=${modelIds}` +
    `&hourly=${HOURLY_PARAMS}` +
    `&daily=${DAILY_PARAMS}` +
    `&past_days=3&forecast_days=7` +
    `&timezone=Asia%2FTokyo`

  const res = await fetch(url)
  const data: { hourly?: ApiData; daily?: ApiData } = await res.json()

  const hourly = data.hourly ?? {}
  const daily = data.daily ?? {}
  const hourlyTimes = (hourly.time as string[] | undefined) ?? []
  const dailyTimes = (daily.time as string[] | undefined) ?? []

  // Parse hourly data per model
  const models: ModelForecast[] = MODELS.map((m) => {
    const suffix = `_${m.id}`
    const temps = getArray(hourly, `temperature_2m${suffix}`)
    const codes = getArray(hourly, `weather_code${suffix}`)
    const pMsl = getArray(hourly, `pressure_msl${suffix}`)
    const pSurf = getArray(hourly, `surface_pressure${suffix}`)
    const precip = getArray(hourly, `precipitation${suffix}`)
    const humid = getArray(hourly, `relative_humidity_2m${suffix}`)
    const wind = getArray(hourly, `wind_speed_10m${suffix}`)

    const points: HourlyPoint[] = hourlyTimes.map((t, i) => ({
      time: t,
      temperature: temps[i] ?? null,
      weatherCode: codes[i] ?? null,
      pressureMsl: pMsl[i] ?? null,
      surfacePressure: pSurf[i] ?? null,
      precipitation: precip[i] ?? null,
      humidity: humid[i] ?? null,
      windSpeed: wind[i] ?? null,
    }))

    return { model: m.label, color: m.color, hourly: points }
  })

  // Parse daily data (use JMA as primary for daily view)
  const primaryModel = MODELS[0].id
  const dailyForecasts: DailyForecast[] = dailyTimes.map((d, i) => ({
    date: d,
    weatherCode: getArray(daily, `weather_code_${primaryModel}`)[i] ?? null,
    tempMax: getArray(daily, `temperature_2m_max_${primaryModel}`)[i] ?? null,
    tempMin: getArray(daily, `temperature_2m_min_${primaryModel}`)[i] ?? null,
    precipSum: getArray(daily, `precipitation_sum_${primaryModel}`)[i] ?? null,
    uvIndexMax: getArray(daily, `uv_index_max_${primaryModel}`)[i] ?? null,
  }))

  return { models, daily: dailyForecasts }
}

export async function fetchEnsembleForecast(
  lat: number,
  lon: number
): Promise<EnsembleBand[]> {
  const url =
    `${ENSEMBLE_URL}?latitude=${lat}&longitude=${lon}` +
    `&models=ecmwf_ifs025` +
    `&hourly=pressure_msl` +
    `&past_days=3&forecast_days=5` +
    `&timezone=Asia%2FTokyo`

  try {
    const res = await fetch(url)
    const data = await res.json()
    const hourly = data.hourly as Record<string, unknown> | undefined
    if (!hourly) return []

    const times = hourly.time as string[]
    const memberKeys = Object.keys(hourly).filter((k) =>
      k.startsWith('pressure_msl_member')
    )

    if (memberKeys.length === 0) return []

    return times.map((t, i) => {
      const values = memberKeys
        .map((k) => (hourly[k] as (number | null)[])[i])
        .filter((v): v is number => v !== null)
        .sort((a, b) => a - b)

      if (values.length === 0)
        return { time: t, median: null, p10: null, p90: null }

      const p10Idx = Math.floor(values.length * 0.1)
      const medIdx = Math.floor(values.length * 0.5)
      const p90Idx = Math.floor(values.length * 0.9)

      return {
        time: t,
        median: values[medIdx],
        p10: values[p10Idx],
        p90: values[p90Idx],
      }
    })
  } catch {
    return []
  }
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
    const res = await fetch(url)
    const data = await res.json()
    const h = data.hourly
    if (!h) return null
    return {
      time: h.time,
      uvIndex: h.uv_index,
      pm25: h.pm2_5,
      pm10: h.pm10,
      usAqi: h.us_aqi,
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
  const res = await fetch(url)
  const data = await res.json()
  if (!data.results) return []
  return data.results.map(
    (r: {
      name: string
      latitude: number
      longitude: number
      country: string
      admin1?: string
    }) => ({
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      country: r.country,
      admin1: r.admin1,
    })
  )
}

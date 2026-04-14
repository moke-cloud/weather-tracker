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

interface ForecastResponse {
  daily?: {
    time: string[]
    weather_code: (number | null)[]
    temperature_2m_max: (number | null)[]
    temperature_2m_min: (number | null)[]
    precipitation_sum: (number | null)[]
    uv_index_max: (number | null)[]
  }
  [key: string]: unknown
}

interface HourlyBlock {
  time: string[]
  temperature_2m: (number | null)[]
  weather_code: (number | null)[]
  pressure_msl: (number | null)[]
  surface_pressure: (number | null)[]
  precipitation: (number | null)[]
  relative_humidity_2m: (number | null)[]
  wind_speed_10m: (number | null)[]
}

function parseHourlyBlock(block: HourlyBlock): HourlyPoint[] {
  return block.time.map((t, i) => ({
    time: t,
    temperature: block.temperature_2m[i],
    weatherCode: block.weather_code[i],
    pressureMsl: block.pressure_msl[i],
    surfacePressure: block.surface_pressure[i],
    precipitation: block.precipitation[i],
    humidity: block.relative_humidity_2m[i],
    windSpeed: block.wind_speed_10m[i],
  }))
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
  const data: ForecastResponse = await res.json()

  const models: ModelForecast[] = MODELS.map((m) => {
    const key = `hourly_${m.id}`
    const block = data[key] as HourlyBlock | undefined
    return {
      model: m.label,
      color: m.color,
      hourly: block ? parseHourlyBlock(block) : [],
    }
  })

  const daily: DailyForecast[] = data.daily
    ? data.daily.time.map((d, i) => ({
        date: d,
        weatherCode: data.daily!.weather_code[i],
        tempMax: data.daily!.temperature_2m_max[i],
        tempMin: data.daily!.temperature_2m_min[i],
        precipSum: data.daily!.precipitation_sum[i],
        uvIndexMax: data.daily!.uv_index_max[i],
      }))
    : []

  return { models, daily }
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

    if (values.length === 0) return { time: t, median: null, p10: null, p90: null }

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
    (r: { name: string; latitude: number; longitude: number; country: string; admin1?: string }) => ({
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      country: r.country,
      admin1: r.admin1,
    })
  )
}

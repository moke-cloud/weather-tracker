export interface Location {
  id: string
  name: string
  latitude: number
  longitude: number
  amedasStationId?: string
  createdAt: number
}

export interface AmedasObservation {
  time: string
  temp: number | null
  humidity: number | null
  pressureSea: number | null
  pressureStation: number | null
  precipitation1h: number | null
  windSpeed: number | null
  windDirection: string | null
}

export interface ModelForecast {
  model: string
  color: string
  hourly: HourlyPoint[]
}

export interface HourlyPoint {
  time: string
  temperature: number | null
  apparentTemperature: number | null
  weatherCode: number | null
  pressureMsl: number | null
  surfacePressure: number | null
  precipitation: number | null
  precipitationProbability: number | null
  humidity: number | null
  windSpeed: number | null
}

export interface EnsembleBand {
  time: string
  median: number | null
  p10: number | null
  p90: number | null
}

export interface AirQualityData {
  time: string[]
  uvIndex: (number | null)[]
  pm25: (number | null)[]
  pm10: (number | null)[]
  usAqi: (number | null)[]
}

export interface DailyForecast {
  date: string
  weatherCode: number | null
  tempMax: number | null
  tempMin: number | null
  precipSum: number | null
  precipProbMax: number | null
  uvIndexMax: number | null
}

export interface LocationWeather {
  location: Location
  amedas: AmedasObservation | null
  models: ModelForecast[]
  ensemble: EnsembleBand[]
  airQuality: AirQualityData | null
  daily: DailyForecast[]
  fetchedAt: number
}

export interface GeoSearchResult {
  name: string
  latitude: number
  longitude: number
  country: string
  admin1?: string
}

/* ── Headache prediction types ── */

export type HeadacheRiskLevel = 'safe' | 'low' | 'moderate' | 'high' | 'critical'

export interface HeadacheFactor {
  id: string
  name: string
  score: number
  weight: number
  description: string
  reference: string
}

export interface HourlyRisk {
  time: string
  score: number
  level: HeadacheRiskLevel
}

export interface HeadacheRiskResult {
  overallScore: number
  level: HeadacheRiskLevel
  label: string
  factors: HeadacheFactor[]
  hourlyRisk: HourlyRisk[]
  confidence: number
  advice: string[]
  summary: string
}

/* ── Headache diary ── */

export interface DiaryEntry {
  id: string
  timestamp: number
  severity: 1 | 2 | 3 | 4 | 5
  riskScore: number
  pressure: number | null
  pressureChange3h: number | null
  temperature: number | null
  humidity: number | null
  note: string
}

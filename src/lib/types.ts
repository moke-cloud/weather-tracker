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
  /** この時刻から3時間以内に1.5hPa以上気圧が下がるメンバーの割合 (0-1) */
  dropProb3h?: number | null
  /** この時刻に0.1mm/h以上の降水があるメンバーの割合 (0-1) */
  rainProb?: number | null
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

/** 各データソースの取得結果 (可用性ステータス表示用) */
export interface SourceStatus {
  /** ok=3モデル取得 / partial=一部モデルのみ / error=全滅 */
  forecast: 'ok' | 'partial' | 'error'
  ensemble: 'ok' | 'error'
  airQuality: 'ok' | 'error'
  amedas: 'ok' | 'error'
}

export interface LocationWeather {
  location: Location
  amedas: AmedasObservation | null
  models: ModelForecast[]
  /** マルチモデル加重平均 + AMeDAS実測バイアス補正のコンセンサス予報 */
  consensus: ModelForecast | null
  ensemble: EnsembleBand[]
  airQuality: AirQualityData | null
  daily: DailyForecast[]
  fetchedAt: number
  /** true = 全ソース失敗時にキャッシュから復元した古いデータ */
  stale?: boolean
  sources?: SourceStatus
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
  /** 個人化に使った日記件数 (null = 既定重みで計算) */
  personalizedBasis?: number | null
}

/* ── Umbrella forecast ── */

/** fold=折りたたみで十分 / umbrella=傘必須 / strong=強雨・強風 (しっかりした傘+注意) */
export type UmbrellaLevel = 'fold' | 'umbrella' | 'strong'

export interface UmbrellaRange {
  /** ISO時刻 (レンジ開始・この時間を含む) */
  start: string
  /** ISO時刻 (レンジ終了・この時間を含む) */
  end: string
  level: UmbrellaLevel
  maxProbability: number
  maxPrecipitation: number
  /** モデル間合意度 0-1 (雨を予測するモデルの割合の平均) */
  confidence: number
}

export interface UmbrellaHour {
  time: string
  level: UmbrellaLevel | null
  probability: number | null
  precipitation: number | null
  confidence: number
}

export interface UmbrellaForecast {
  hours: UmbrellaHour[]
  ranges: UmbrellaRange[]
  summary: string
}

/* ── Forecast verification (accuracy tracking) ── */

/** 予報時点で記録し、実測が入り次第照合するログエントリ */
export interface ForecastLogEntry {
  /** `${locationId}|${model}|${targetTime}` */
  key: string
  locationId: string
  model: string
  /** 予報対象時刻 (ISO) */
  targetTime: string
  issuedAt: number
  predictedTemp: number | null
  predictedPressure: number | null
  /** 照合済み実測値 (未照合は null) */
  observedTemp: number | null
  observedPressure: number | null
  verifiedAt: number | null
}

/** モデルごとの直近検証成績 */
export interface ModelSkill {
  model: string
  sampleCount: number
  maeTemp: number | null
  maePressure: number | null
  /** 検証成績から算出した合成重み (全モデル合計1) */
  weight: number
}

/* ── Headache personalization ── */

export interface PersonalWeights {
  /** factor id → 倍率適用済みの正規化ウェイト */
  weights: Record<string, number>
  /** 学習に使った日記件数 */
  basis: number
  /** ユーザー向け説明 (どの因子に敏感か) */
  notes: string[]
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

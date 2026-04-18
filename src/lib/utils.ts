const WIND_DIRS = [
  '静穏', '北', '北北東', '北東', '東北東', '東', '東南東', '南東',
  '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西',
] as const

export function windDirectionLabel(code: number | null): string {
  if (code === null || code < 0 || code > 16) return '--'
  return WIND_DIRS[code]
}

const WMO_WEATHER: Record<number, { icon: string; label: string }> = {
  0: { icon: '☀️', label: '快晴' },
  1: { icon: '🌤️', label: '晴れ' },
  2: { icon: '⛅', label: '曇り時々晴れ' },
  3: { icon: '☁️', label: '曇り' },
  45: { icon: '🌫️', label: '霧' },
  48: { icon: '🌫️', label: '着氷性の霧' },
  51: { icon: '🌦️', label: '弱い霧雨' },
  53: { icon: '🌦️', label: '霧雨' },
  55: { icon: '🌦️', label: '強い霧雨' },
  61: { icon: '🌧️', label: '弱い雨' },
  63: { icon: '🌧️', label: '雨' },
  65: { icon: '🌧️', label: '強い雨' },
  71: { icon: '❄️', label: '弱い雪' },
  73: { icon: '❄️', label: '雪' },
  75: { icon: '❄️', label: '強い雪' },
  80: { icon: '🌦️', label: '弱いにわか雨' },
  81: { icon: '🌧️', label: 'にわか雨' },
  82: { icon: '🌧️', label: '激しいにわか雨' },
  85: { icon: '🌨️', label: '弱いにわか雪' },
  86: { icon: '🌨️', label: '激しいにわか雪' },
  95: { icon: '⛈️', label: '雷雨' },
  96: { icon: '⛈️', label: '雷雨（雹）' },
  99: { icon: '⛈️', label: '激しい雷雨（雹）' },
}

export function weatherIcon(code: number | null): string {
  if (code === null) return '--'
  return WMO_WEATHER[code]?.icon ?? '?'
}

export function weatherLabel(code: number | null): string {
  if (code === null) return '--'
  return WMO_WEATHER[code]?.label ?? '不明'
}

export function formatHour(isoString: string): string {
  const d = new Date(isoString)
  return `${d.getHours()}時`
}

export function formatDate(isoString: string): string {
  const d = new Date(isoString)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function formatDateTime(isoString: string): string {
  const d = new Date(isoString)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function uvLevel(index: number | null): { label: string; color: string } {
  if (index === null) return { label: '--', color: 'text-gray-400' }
  if (index < 3) return { label: '弱い', color: 'text-green-500' }
  if (index < 6) return { label: '中程度', color: 'text-yellow-500' }
  if (index < 8) return { label: '強い', color: 'text-orange-500' }
  if (index < 11) return { label: '非常に強い', color: 'text-red-500' }
  return { label: '極端', color: 'text-purple-600' }
}

export function aqiLevel(aqi: number | null): { label: string; color: string } {
  if (aqi === null) return { label: '--', color: 'text-gray-400' }
  if (aqi <= 50) return { label: '良好', color: 'text-green-500' }
  if (aqi <= 100) return { label: '普通', color: 'text-yellow-500' }
  if (aqi <= 150) return { label: '敏感な人に不健康', color: 'text-orange-500' }
  if (aqi <= 200) return { label: '不健康', color: 'text-red-500' }
  return { label: '非常に不健康', color: 'text-purple-600' }
}

/**
 * 体感温度 (Apparent Temperature) を計算する。
 *
 * Australian Bureau of Meteorology の式 (Steadman 1994)。
 * Open-Meteo の apparent_temperature も同じ式を採用している。
 *
 *   AT = Ta + 0.33 × e − 0.70 × ws − 4.00
 *   e  = (RH / 100) × 6.105 × exp(17.27 × Ta / (237.7 + Ta))
 *
 * - Ta: 気温 (℃)
 * - RH: 相対湿度 (%, 0-100)
 * - ws: 風速 (m/s) - 10m高度想定
 * - e : 水蒸気圧 (hPa)
 *
 * 湿度・風速がnullの場合は、利用可能な成分のみで近似値を返す
 * (湿度null時は湿度50%相当、風速null時は0 m/sで計算)。
 *
 * 気温が無い場合のみnullを返す。
 */
export function computeApparentTemperature(
  temperature: number | null,
  humidity: number | null,
  windSpeed: number | null,
): number | null {
  if (temperature === null || !Number.isFinite(temperature)) return null

  const ta = temperature
  const rh = humidity !== null && Number.isFinite(humidity) ? humidity : 50
  const ws = windSpeed !== null && Number.isFinite(windSpeed) ? windSpeed : 0

  // Water vapor pressure (hPa)
  const e = (rh / 100) * 6.105 * Math.exp((17.27 * ta) / (237.7 + ta))
  const at = ta + 0.33 * e - 0.70 * ws - 4.0
  return Math.round(at * 10) / 10
}

export function pressureChangeRate(
  pressures: { time: string; value: number }[]
): number | null {
  if (pressures.length < 2) return null
  const latest = pressures[pressures.length - 1]
  const threeHoursAgo = pressures.find((p) => {
    const diff = new Date(latest.time).getTime() - new Date(p.time).getTime()
    return diff >= 2.5 * 3600_000 && diff <= 3.5 * 3600_000
  })
  if (!threeHoursAgo) return null
  const hours =
    (new Date(latest.time).getTime() - new Date(threeHoursAgo.time).getTime()) /
    3600_000
  return (latest.value - threeHoursAgo.value) / hours
}

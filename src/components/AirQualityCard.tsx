import type { AirQualityData } from '../lib/types'
import { uvLevel, aqiLevel } from '../lib/utils'

interface AirQualityCardProps {
  data: AirQualityData | null
}

export function AirQualityCard({ data }: AirQualityCardProps) {
  if (!data) return null

  const now = new Date()
  const idx = data.time.findIndex((t) => {
    const diff = new Date(t).getTime() - now.getTime()
    return diff >= 0 && diff < 3600_000
  })
  const i = idx >= 0 ? idx : 0

  const uv = data.uvIndex[i]
  const pm25 = data.pm25[i]
  const pm10 = data.pm10[i]
  const aqi = data.usAqi[i]

  const uvInfo = uvLevel(uv)
  const aqiInfo = aqiLevel(aqi)

  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 p-4 shadow-sm">
      <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">
        UV / 大気質
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            UV指数
          </div>
          <div className="text-2xl font-bold">
            {uv !== null ? uv.toFixed(1) : '--'}
          </div>
          <div className={`text-xs font-medium ${uvInfo.color}`}>
            {uvInfo.label}
          </div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            AQI (US)
          </div>
          <div className="text-2xl font-bold">
            {aqi !== null ? aqi : '--'}
          </div>
          <div className={`text-xs font-medium ${aqiInfo.color}`}>
            {aqiInfo.label}
          </div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            PM2.5
          </div>
          <div className="text-lg font-bold">
            {pm25 !== null ? `${pm25.toFixed(0)}` : '--'}
            <span className="text-xs font-normal ml-1">{'\u00B5'}g/m{'\u00B3'}</span>
          </div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            PM10
          </div>
          <div className="text-lg font-bold">
            {pm10 !== null ? `${pm10.toFixed(0)}` : '--'}
            <span className="text-xs font-normal ml-1">{'\u00B5'}g/m{'\u00B3'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

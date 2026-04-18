import type { AirQualityData } from '../lib/types'
import { uvLevel, aqiLevel } from '../lib/utils'
import { InfoTooltip } from './InfoTooltip'

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

  // PM2.5 基準判定 (WHO 24h: 15 / 日本環境省: 35 μg/m³)
  const pm25Status =
    pm25 === null
      ? null
      : pm25 <= 15
        ? { label: 'WHO基準クリア', color: 'text-green-500' }
        : pm25 <= 35
          ? { label: 'WHO超/日本基準内', color: 'text-yellow-500' }
          : { label: '日本環境省注意値超', color: 'text-red-500' }

  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 p-4 shadow-sm">
      <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">
        UV / 大気質
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {/* UV */}
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
          <div className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mb-1">
            UV指数
            <InfoTooltip term="uvIndex" />
          </div>
          <div className="text-2xl font-bold">
            {uv !== null ? uv.toFixed(1) : '--'}
            {uv !== null && <span className="text-xs font-normal ml-1 text-slate-400">/ 11+</span>}
          </div>
          <div className={`text-xs font-medium ${uvInfo.color}`}>
            {uvInfo.label}
          </div>
        </div>

        {/* AQI */}
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
          <div className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mb-1">
            AQI (US)
            <InfoTooltip term="aqi" />
          </div>
          <div className="text-2xl font-bold">
            {aqi !== null ? aqi : '--'}
            {aqi !== null && <span className="text-xs font-normal ml-1 text-slate-400">/ 500</span>}
          </div>
          <div className={`text-xs font-medium ${aqiInfo.color}`}>
            {aqiInfo.label}
          </div>
        </div>

        {/* PM2.5 */}
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
          <div className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mb-1">
            PM2.5
            <InfoTooltip term="pm25" />
          </div>
          <div className="text-lg font-bold">
            {pm25 !== null ? `${pm25.toFixed(0)}` : '--'}
            <span className="text-xs font-normal ml-1">{'\u00B5'}g/m{'\u00B3'}</span>
          </div>
          {pm25Status && (
            <div className={`text-[10px] font-medium ${pm25Status.color}`}>
              {pm25Status.label}
            </div>
          )}
        </div>

        {/* PM10 */}
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
          <div className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mb-1">
            PM10
            <InfoTooltip term="pm10" />
          </div>
          <div className="text-lg font-bold">
            {pm10 !== null ? `${pm10.toFixed(0)}` : '--'}
            <span className="text-xs font-normal ml-1">{'\u00B5'}g/m{'\u00B3'}</span>
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500">
            WHO基準: 45以下
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 text-[10px] text-slate-400 dark:text-slate-500 space-y-0.5">
        <p>UV: 0-2 弱 / 3-5 中 / 6-7 強 / 8-10 非常に強い / 11+ 極端</p>
        <p>AQI: 0-50 良好 / 51-100 普通 / 101-150 敏感な人に不健康 / 151+ 不健康</p>
      </div>
    </div>
  )
}

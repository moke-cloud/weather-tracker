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
        ? { label: 'WHO基準クリア', color: 'text-safe-text' }
        : pm25 <= 35
          ? { label: 'WHO超/日本基準内', color: 'text-caution-text' }
          : { label: '日本環境省注意値超', color: 'text-danger' }

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-2.5">
        {/* UV */}
        <Cell label="UV指数" term="uvIndex">
          <div className="nums font-display text-2xl font-bold text-ink">
            {uv !== null ? uv.toFixed(1) : '--'}
            {uv !== null && <span className="text-xs font-normal ml-1 text-ink-subtle">/ 11+</span>}
          </div>
          <div className={`text-xs font-medium ${uvInfo.color}`}>{uvInfo.label}</div>
        </Cell>

        {/* AQI */}
        <Cell label="AQI (US)" term="aqi">
          <div className="nums font-display text-2xl font-bold text-ink">
            {aqi !== null ? aqi : '--'}
            {aqi !== null && <span className="text-xs font-normal ml-1 text-ink-subtle">/ 500</span>}
          </div>
          <div className={`text-xs font-medium ${aqiInfo.color}`}>{aqiInfo.label}</div>
        </Cell>

        {/* PM2.5 */}
        <Cell label="PM2.5" term="pm25">
          <div className="nums text-lg font-bold text-ink">
            {pm25 !== null ? `${pm25.toFixed(0)}` : '--'}
            <span className="text-xs font-normal ml-1 text-ink-muted">{'µ'}g/m{'³'}</span>
          </div>
          {pm25Status && (
            <div className={`text-[10px] font-medium ${pm25Status.color}`}>{pm25Status.label}</div>
          )}
        </Cell>

        {/* PM10 */}
        <Cell label="PM10" term="pm10">
          <div className="nums text-lg font-bold text-ink">
            {pm10 !== null ? `${pm10.toFixed(0)}` : '--'}
            <span className="text-xs font-normal ml-1 text-ink-muted">{'µ'}g/m{'³'}</span>
          </div>
          <div className="text-[10px] text-ink-subtle">WHO基準: 45以下</div>
        </Cell>
      </div>

      {/* Legend */}
      <div className="mt-3 text-[10px] text-ink-subtle space-y-0.5">
        <p>UV: 0-2 弱 / 3-5 中 / 6-7 強 / 8-10 非常に強い / 11+ 極端</p>
        <p>AQI: 0-50 良好 / 51-100 普通 / 101-150 敏感な人に不健康 / 151+ 不健康</p>
      </div>
    </div>
  )
}

function Cell({
  label,
  term,
  children,
}: {
  label: string
  term: 'uvIndex' | 'aqi' | 'pm25' | 'pm10'
  children: React.ReactNode
}) {
  return (
    <div className="bg-surface-sunk rounded-md p-3">
      <div className="inline-flex items-center gap-1 text-xs text-ink-muted mb-1">
        {label}
        <InfoTooltip term={term} />
      </div>
      {children}
    </div>
  )
}

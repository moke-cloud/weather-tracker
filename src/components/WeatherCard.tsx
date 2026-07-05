import type { AmedasObservation, ModelForecast } from '../lib/types'
import {
  windDirectionLabel,
  weatherLabel,
  computeApparentTemperature,
} from '../lib/utils'
import { currentSky } from '../lib/sky'
import { WeatherIcon } from './WeatherIcon'
import { InfoTooltip } from './InfoTooltip'
import type { GlossaryKey } from '../lib/glossary'

interface WeatherCardProps {
  amedas: AmedasObservation | null
  models: ModelForecast[]
}

export function WeatherCard({ amedas, models }: WeatherCardProps) {
  const now = new Date()
  const currentModel = models[0] // JMA as primary
  const currentHour = currentModel?.hourly.find((h) => {
    const t = new Date(h.time)
    return Math.abs(t.getTime() - now.getTime()) < 3600_000
  })

  const temp = amedas?.temp ?? currentHour?.temperature ?? null
  const humidity = amedas?.humidity ?? currentHour?.humidity ?? null
  const pressureSea = amedas?.pressureSea ?? currentHour?.pressureMsl
  const windSpeed = amedas?.windSpeed ?? currentHour?.windSpeed ?? null
  const precip = amedas?.precipitation1h ?? currentHour?.precipitation
  const wCode = currentHour?.weatherCode ?? null
  const source = amedas ? 'AMeDAS実測' : 'JMA予報'
  const sourceTerm: GlossaryKey = amedas ? 'amedas' : 'jmaMsm'

  // 体感温度: AMeDAS実測があれば計算、なければ予報モデルの apparent_temperature を使用
  const apparentTemp = amedas
    ? computeApparentTemperature(temp, humidity, windSpeed)
    : currentHour?.apparentTemperature ?? computeApparentTemperature(temp, humidity, windSpeed)
  const apparentSource = amedas ? '計算値' : '予報値'

  // 今の空 (天気 × 時間帯) を背景グラデーションに反映
  const sky = currentSky(wCode, now)
  const onDark = sky.textOn === 'dark'
  // 空バンドはシーン色 (テーマ非依存) なので、文字もテーマで反転しない sky-ink / white を使う
  const skyText = onDark ? 'text-white' : 'text-sky-ink'
  const skyMuted = onDark ? 'text-white/90' : 'text-sky-ink/85'
  const badge = onDark
    ? 'bg-sky-ink/30 text-white ring-1 ring-white/25'
    : 'bg-sky-ink/8 text-sky-ink ring-1 ring-sky-ink/10'

  return (
    <div className="rounded-lg bg-surface shadow-md overflow-hidden">
      {/* Sky band — 今の空をそのまま色で表現 */}
      <div className="relative px-4 pt-3.5 pb-4" style={{ background: sky.gradient }}>
        <div className="flex items-center justify-between">
          <h3 className={`text-xs font-medium tracking-wide ${skyMuted}`}>現在の天気</h3>
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${badge}`}>
            {source}
            <InfoTooltip term={sourceTerm} className={onDark ? 'text-white/90' : 'text-sky-ink'} />
          </span>
        </div>

        <div className="flex items-center gap-3 mt-2">
          <WeatherIcon
            code={wCode}
            date={now}
            size={60}
            className={onDark ? 'text-white/90 drop-shadow-sm' : 'text-sky-ink/85 drop-shadow-sm'}
          />
          <div className="min-w-0">
            <div className={`font-display nums text-4xl font-bold leading-none ${skyText}`}>
              {temp !== null && temp !== undefined ? `${temp.toFixed(1)}°` : '--'}
              <span className="text-xl font-semibold">C</span>
            </div>
            {apparentTemp !== null && temp != null && (
              <div className={`inline-flex items-center gap-1 mt-1 text-xs ${skyMuted}`}>
                <span className="nums">体感 {apparentTemp.toFixed(1)}{'°'}C</span>
                <span className="text-[10px] opacity-80">({apparentSource})</span>
                <InfoTooltip term="apparentTemperature" className={onDark ? 'text-white/90' : 'text-sky-ink'} />
              </div>
            )}
            <div className={`text-sm mt-0.5 ${skyText}`}>{weatherLabel(wCode)}</div>
          </div>
        </div>
      </div>

      {/* Readings */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-2.5 text-sm">
          <Stat
            label="海面気圧"
            term="pressureHpa"
            value={pressureSea != null ? `${pressureSea.toFixed(1)} hPa` : '--'}
          />
          <Stat
            label="湿度"
            term="humidity"
            value={humidity != null ? `${humidity}%` : '--'}
          />
          <Stat
            label="風速"
            term="windSpeed"
            value={
              windSpeed != null
                ? `${windSpeed.toFixed(1)} m/s ${amedas?.windDirection ? windDirectionLabel(Number(amedas.windDirection)) : ''}`
                : '--'
            }
          />
          <Stat
            label="降水量"
            term="precipitation"
            value={precip != null ? `${precip.toFixed(1)} mm/h` : '--'}
          />
        </div>

        {amedas && (
          <div className="inline-flex items-center gap-1 mt-3 text-xs text-ink-subtle">
            <span className="nums">
              観測時刻 {new Date(amedas.time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <InfoTooltip term="observationTime" />
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  term,
}: {
  label: string
  value: string
  term?: GlossaryKey
}) {
  return (
    <div className="bg-surface-sunk rounded-md px-3 py-2">
      <div className="inline-flex items-center gap-1 text-xs text-ink-muted">
        {label}
        {term && <InfoTooltip term={term} />}
      </div>
      <div className="nums font-semibold text-ink mt-0.5">{value}</div>
    </div>
  )
}

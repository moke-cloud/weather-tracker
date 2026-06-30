import type { DailyForecast } from '../lib/types'
import { formatDate } from '../lib/utils'
import { WeatherIcon } from './WeatherIcon'
import { StatusDot, UmbrellaIcon, DropletIcon } from './icons'
import { InfoTooltip } from './InfoTooltip'

interface ForecastTableProps {
  daily: DailyForecast[]
}

export function ForecastTable({ daily }: ForecastTableProps) {
  return (
    <div className="rounded-lg bg-surface p-4 shadow-md">
      <h3 className="text-xs font-medium tracking-wide text-ink-muted mb-2">週間予報</h3>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {daily.slice(0, 7).map((d) => (
          <DayCard key={d.date} day={d} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[10px] text-ink-subtle">
        <span className="inline-flex items-center gap-1">
          <StatusDot className="bg-hot" size={8} /> 最高 /
          <StatusDot className="bg-cool" size={8} /> 最低 (℃)
        </span>
        <span className="inline-flex items-center gap-1">
          <UmbrellaIcon size={12} className="text-cool" /> 最大降水確率 (%)
          <InfoTooltip term="precipProbability" />
        </span>
        <span className="inline-flex items-center gap-1">
          <DropletIcon size={12} className="text-cool" /> 合計降水量 (mm)
          <InfoTooltip term="precipitation" />
        </span>
      </div>
    </div>
  )
}

function DayCard({ day }: { day: DailyForecast }) {
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  const d = new Date(day.date + 'T00:00:00')
  const wd = weekdays[d.getDay()]
  const isToday = new Date().toDateString() === d.toDateString()

  return (
    <div
      className={`flex-shrink-0 w-16 text-center rounded-md p-2 ${
        isToday
          ? 'bg-accent-soft ring-1 ring-accent/40'
          : 'bg-surface-sunk'
      }`}
    >
      <div className="nums text-xs text-ink-muted">
        {isToday ? (
          <span className="font-bold text-accent-strong">今日</span>
        ) : (
          <>
            {formatDate(day.date + 'T00:00:00')}
            <span
              className={
                wd === '日'
                  ? 'text-hot ml-0.5'
                  : wd === '土'
                    ? 'text-cool ml-0.5'
                    : 'ml-0.5'
              }
            >
              {wd}
            </span>
          </>
        )}
      </div>
      <div className="flex justify-center my-1" title="天気">
        <WeatherIcon code={day.weatherCode} size={26} className="text-ink-muted" />
      </div>
      <div className="nums text-xs" title="最高/最低気温 (℃)">
        <span className="text-hot font-semibold">
          {day.tempMax !== null ? `${day.tempMax.toFixed(0)}°` : '--'}
        </span>
        <span className="text-ink-subtle mx-0.5">/</span>
        <span className="text-cool font-semibold">
          {day.tempMin !== null ? `${day.tempMin.toFixed(0)}°` : '--'}
        </span>
      </div>
      {day.precipProbMax !== null && (
        <div
          className={`nums inline-flex items-center justify-center gap-0.5 text-xs mt-0.5 font-medium ${
            day.precipProbMax >= 50 ? 'text-cool' : 'text-ink-subtle'
          }`}
          title={`最大降水確率 ${day.precipProbMax}%`}
        >
          <UmbrellaIcon size={11} /> {day.precipProbMax}%
        </div>
      )}
      {day.precipSum !== null && day.precipSum > 0 && (
        <div className="nums text-[10px] text-cool" title={`1日の合計降水量 ${day.precipSum.toFixed(1)} mm`}>
          {day.precipSum.toFixed(0)}mm
        </div>
      )}
    </div>
  )
}

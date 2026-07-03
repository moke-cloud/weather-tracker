import { useMemo } from 'react'
import type { LocationWeather, UmbrellaLevel } from '../lib/types'
import { computeUmbrellaForecast } from '../lib/umbrella'
import { InfoTooltip } from './InfoTooltip'
import { UmbrellaIcon, StatusDot } from './icons'

interface UmbrellaTimelineProps {
  data: LocationWeather
}

const LEVEL_CELL: Record<UmbrellaLevel, string> = {
  fold: 'bg-cool/45',
  umbrella: 'bg-cool',
  strong: 'bg-danger',
}

const LEVEL_TEXT: Record<UmbrellaLevel, string> = {
  fold: '折りたたみ傘',
  umbrella: '傘必須',
  strong: '強雨・強風',
}

const LEVEL_DOT: Record<UmbrellaLevel, string> = {
  fold: 'bg-cool/60',
  umbrella: 'bg-cool',
  strong: 'bg-danger',
}

function dayLabel(time: string): string {
  const d = new Date(time)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.floor((d.getTime() - today.getTime()) / 86_400_000)
  if (diff <= 0) return '今日'
  if (diff === 1) return '明日'
  return '明後日'
}

function formatRangeTime(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  const sDay = dayLabel(start)
  const eDay = dayLabel(end)
  const endHour = e.getHours() + 1 // レンジは end の1時間を含む
  if (sDay === eDay) {
    return `${sDay} ${s.getHours()}時〜${endHour}時`
  }
  return `${sDay} ${s.getHours()}時〜${eDay}${endHour}時`
}

export function UmbrellaTimeline({ data }: UmbrellaTimelineProps) {
  // 「現在」はデータ取得時刻 (レンダー中の Date.now() は純粋性違反)
  const forecast = useMemo(
    () =>
      computeUmbrellaForecast(
        data.models,
        data.consensus,
        undefined,
        data.fetchedAt,
        data.ensemble
      ),
    [data]
  )

  const needAny = forecast.ranges.length > 0

  return (
    <div className="rounded-lg bg-surface shadow-md p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-ink-muted">
          <UmbrellaIcon size={14} className={needAny ? 'text-cool' : 'text-ink-subtle'} />
          傘予報 (48時間)
          <InfoTooltip term="umbrellaForecast" />
        </h3>
        {!needAny && (
          <span className="text-xs text-ink-subtle">傘の出番なし</span>
        )}
      </div>

      {/* 結論を先に */}
      <p className={`text-sm mb-3 ${needAny ? 'font-semibold text-ink' : 'text-ink-muted'}`}>
        {forecast.summary}
      </p>

      {/* 時間帯レンジの詳細 */}
      {needAny && (
        <div className="space-y-1.5 mb-3">
          {forecast.ranges.map(r => (
            <div key={r.start} className="flex items-center gap-2 text-xs">
              <StatusDot className={LEVEL_DOT[r.level]} size={7} />
              <span className="nums font-medium text-ink min-w-[9.5rem]">
                {formatRangeTime(r.start, r.end)}
              </span>
              <span className="text-ink-muted">{LEVEL_TEXT[r.level]}</span>
              <span className="nums text-ink-subtle ml-auto">
                {r.maxProbability > 0 ? `${r.maxProbability}%` : ''}
                {r.maxPrecipitation >= 0.5 ? ` ${r.maxPrecipitation}mm/h` : ''}
                {' ・合意度'}
                {Math.round(r.confidence * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 48hタイムラインバー */}
      {forecast.hours.length > 0 && (
        <div className="overflow-x-auto pb-1">
          <div className="min-w-[560px]">
            <div className="flex gap-px">
              {forecast.hours.map(h => (
                <div
                  key={h.time}
                  title={`${dayLabel(h.time)} ${new Date(h.time).getHours()}時 ${
                    h.level ? LEVEL_TEXT[h.level] : '傘不要'
                  }${h.probability != null ? ` / 降水確率${Math.round(h.probability)}%` : ''}`}
                  className={`h-5 flex-1 rounded-[2px] ${
                    h.level ? LEVEL_CELL[h.level] : 'bg-surface-sunk'
                  }`}
                />
              ))}
            </div>
            <div className="flex mt-1">
              {forecast.hours.map((h, i) => {
                const hour = new Date(h.time).getHours()
                const showLabel = i === 0 || hour % 6 === 0
                return (
                  <div key={h.time} className="flex-1 relative">
                    {showLabel && (
                      <span className="nums absolute left-0 text-[9px] text-ink-subtle whitespace-nowrap">
                        {hour === 0 ? dayLabel(h.time) : `${hour}時`}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* 凡例 */}
      <div className="flex items-center gap-3 text-[10px] text-ink-subtle mt-4">
        <span className="flex items-center gap-1">
          <StatusDot className={LEVEL_DOT.fold} size={6} /> 折りたたみ
        </span>
        <span className="flex items-center gap-1">
          <StatusDot className={LEVEL_DOT.umbrella} size={6} /> 傘必須
        </span>
        <span className="flex items-center gap-1">
          <StatusDot className={LEVEL_DOT.strong} size={6} /> 強雨・強風
        </span>
        <span className="ml-auto">コンセンサス予報から算出</span>
      </div>
    </div>
  )
}

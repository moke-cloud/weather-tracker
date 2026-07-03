import { useEffect, useState } from 'react'
import {
  fetchRainNowcast,
  RAIN_LEVELS,
  type RainNowcast as RainNowcastData,
} from '../lib/rain-nowcast'
import { InfoTooltip } from './InfoTooltip'
import { DropletIcon, StatusDot } from './icons'

interface RainNowcastProps {
  latitude: number
  longitude: number
  /** 親のデータ更新に同期して再取得するためのキー (data.fetchedAt) */
  refreshKey: number
}

/** レベル → セル背景色 (気象庁パレットの実色。データの意味を持つ色なのでtoken化しない) */
function levelColor(level: number): string | undefined {
  const rgb = RAIN_LEVELS[level]?.rgb
  return rgb ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : undefined
}

export function RainNowcast({ latitude, longitude, refreshKey }: RainNowcastProps) {
  const [nowcast, setNowcast] = useState<RainNowcastData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchRainNowcast(latitude, longitude).then((result) => {
      if (cancelled) return
      if (result) {
        setNowcast(result)
        setFailed(false)
      } else {
        setFailed(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [latitude, longitude, refreshKey])

  const raining =
    nowcast != null &&
    (nowcast.current.level > 0 || nowcast.forecast.some((f) => f.level > 0))

  return (
    <div className="rounded-lg bg-surface shadow-md p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-ink-muted">
          <DropletIcon size={14} className={raining ? 'text-cool' : 'text-ink-subtle'} />
          雨レーダー (実況〜60分先)
          <InfoTooltip term="rainNowcast" />
        </h3>
        {nowcast && (
          <span className="nums text-[10px] text-ink-subtle">
            実況{' '}
            {new Date(nowcast.observedAt).toLocaleTimeString('ja-JP', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}
      </div>

      {!nowcast && !failed && (
        <p className="text-sm text-ink-subtle py-2">レーダーデータ取得中...</p>
      )}
      {failed && !nowcast && (
        <p className="text-sm text-ink-muted py-2">
          レーダーデータを取得できませんでした。次回の自動更新で再試行します。
        </p>
      )}

      {nowcast && (
        <>
          {/* 結論を先に */}
          <p className={`text-sm mb-3 ${raining ? 'font-semibold text-ink' : 'text-ink-muted'}`}>
            {nowcast.summary}
          </p>

          {/* 実況+5分刻み12フレームのバー */}
          <div className="flex gap-px items-end">
            {[nowcast.current, ...nowcast.forecast].map((f) => {
              const color = levelColor(f.level)
              const info = RAIN_LEVELS[f.level]
              return (
                <div key={f.time} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    title={`${f.minutesFromNow === 0 ? '現在' : `+${f.minutesFromNow}分`}: ${
                      info ? `${info.label}${f.level > 0 ? ` (${info.range}mm/h)` : ''}` : '--'
                    }`}
                    className={`w-full h-6 rounded-[2px] ${color ? '' : 'bg-surface-sunk'} ${
                      f.minutesFromNow === 0 ? 'ring-1 ring-ink/25' : ''
                    }`}
                    style={color ? { backgroundColor: color } : undefined}
                  />
                </div>
              )
            })}
          </div>
          <div className="nums flex justify-between mt-1 text-[9px] text-ink-subtle">
            <span>現在</span>
            <span>+15分</span>
            <span>+30分</span>
            <span>+45分</span>
            <span>+60分</span>
          </div>

          {/* 凡例 (降水がある時だけ表示して情報密度を保つ) */}
          {raining && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[10px] text-ink-subtle">
              {RAIN_LEVELS.filter((l) => l.rgb).map((l) => (
                <span key={l.level} className="inline-flex items-center gap-1">
                  <span
                    className="inline-block w-3 h-3 rounded-[2px]"
                    style={{ backgroundColor: levelColor(l.level) }}
                  />
                  {l.range}
                </span>
              ))}
              <span className="w-full sm:w-auto">単位: mm/h</span>
            </div>
          )}

          <div className="flex items-center justify-between mt-3 text-[10px] text-ink-subtle">
            <span className="inline-flex items-center gap-1">
              <StatusDot className={raining ? 'bg-cool' : 'bg-safe'} size={6} />
              5分刻み・約1kmメッシュ
            </span>
            <span>出典: 気象庁 高解像度降水ナウキャスト</span>
          </div>
        </>
      )}
    </div>
  )
}

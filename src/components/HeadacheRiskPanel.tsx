import { useState, useCallback } from 'react'
import type {
  ModelForecast,
  EnsembleBand,
  HeadacheRiskResult,
  HeadacheRiskLevel,
  DiaryEntry,
} from '../lib/types'
import { calculateHeadacheRisk } from '../lib/headache-model'
import { addDiaryEntry } from '../lib/diary'

interface HeadacheRiskPanelProps {
  models: ModelForecast[]
  ensemble: EnsembleBand[]
}

const LEVEL_STYLES: Record<
  HeadacheRiskLevel,
  { bg: string; badge: string; ring: string; icon: string }
> = {
  safe: {
    bg: 'bg-white dark:bg-slate-800',
    badge: 'bg-green-500 text-white',
    ring: '',
    icon: '\u2705',
  },
  low: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    badge: 'bg-emerald-500 text-white',
    ring: '',
    icon: '\u{1F7E2}',
  },
  moderate: {
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    badge: 'bg-yellow-500 text-white',
    ring: 'ring-1 ring-yellow-300 dark:ring-yellow-700',
    icon: '\u{1F7E1}',
  },
  high: {
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    badge: 'bg-orange-500 text-white',
    ring: 'ring-2 ring-orange-400 dark:ring-orange-600',
    icon: '\u{1F7E0}',
  },
  critical: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    badge: 'bg-red-600 text-white',
    ring: 'ring-2 ring-red-400 dark:ring-red-600',
    icon: '\u{1F534}',
  },
}

export function HeadacheRiskPanel({ models, ensemble }: HeadacheRiskPanelProps) {
  const [showDetail, setShowDetail] = useState(false)
  const [diaryLogged, setDiaryLogged] = useState(false)
  const [diaryError, setDiaryError] = useState(false)

  const risk: HeadacheRiskResult = calculateHeadacheRisk(models, ensemble)
  const style = LEVEL_STYLES[risk.level]

  // Find current conditions from JMA model
  const jma = models.find(m => m.model === 'JMA')
  const now = Date.now()
  const currentHour = jma?.hourly.find(h =>
    h.pressureMsl !== null && Math.abs(new Date(h.time).getTime() - now) < 2 * 3_600_000
  )

  // Compute 3h pressure change for diary
  const threeHoursAgo = jma?.hourly.find(h => {
    if (h.pressureMsl === null) return false
    const diff = now - new Date(h.time).getTime()
    return diff >= 2.5 * 3_600_000 && diff <= 3.5 * 3_600_000
  })
  const pressureChange3h =
    currentHour?.pressureMsl != null && threeHoursAgo?.pressureMsl != null
      ? currentHour.pressureMsl - threeHoursAgo.pressureMsl
      : null

  const logHeadache = useCallback(async (severity: 1 | 2 | 3 | 4 | 5) => {
    const entry: DiaryEntry = {
      id: `diary_${Date.now()}`,
      timestamp: Date.now(),
      severity,
      riskScore: risk.overallScore,
      pressure: currentHour?.pressureMsl ?? null,
      pressureChange3h,
      temperature: currentHour?.temperature ?? null,
      humidity: currentHour?.humidity ?? null,
      note: '',
    }
    try {
      await addDiaryEntry(entry)
      setDiaryLogged(true)
      setTimeout(() => setDiaryLogged(false), 3000)
    } catch {
      setDiaryError(true)
      setTimeout(() => setDiaryError(false), 4000)
    }
  }, [risk.overallScore, currentHour, pressureChange3h])

  return (
    <div className={`rounded-xl p-4 shadow-sm ${style.bg} ${style.ring}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">
          頭痛リスク予測
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 dark:text-slate-500">
            信頼度 {Math.round(risk.confidence * 100)}%
          </span>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${style.badge}`}>
            {style.icon} {risk.label}
          </span>
        </div>
      </div>

      {/* Score gauge */}
      <div className="mb-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  risk.overallScore >= 76 ? 'bg-red-500' :
                  risk.overallScore >= 56 ? 'bg-orange-500' :
                  risk.overallScore >= 36 ? 'bg-yellow-500' :
                  risk.overallScore >= 16 ? 'bg-emerald-500' :
                  'bg-green-500'
                }`}
                style={{ width: `${risk.overallScore}%` }}
              />
            </div>
          </div>
          <span className="text-xl font-bold min-w-[3ch] text-right">{risk.overallScore}</span>
        </div>
      </div>

      {/* Summary */}
      <p className="text-sm mb-2">{risk.summary}</p>

      {/* Advice */}
      <div className="space-y-1 mb-3">
        {risk.advice.map((a, i) => (
          <p key={i} className="text-xs text-slate-500 dark:text-slate-400 flex gap-1.5">
            <span className="shrink-0">{'\u{1F4A1}'}</span>
            {a}
          </p>
        ))}
      </div>

      {/* Hourly risk timeline (mini) */}
      <HourlyMiniTimeline hourlyRisk={risk.hourlyRisk} />

      {/* Quick log button */}
      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <span className={`text-xs ${diaryError ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>
            {diaryError ? '\u274C 保存に失敗しました' : diaryLogged ? '\u2705 記録しました' : '今、頭痛がありますか？'}
          </span>
          {!diaryLogged && (
            <div className="flex gap-1">
              {([1, 2, 3, 4, 5] as const).map(sev => (
                <button
                  key={sev}
                  onClick={() => logHeadache(sev)}
                  className="w-7 h-7 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                  title={`重症度 ${sev}`}
                >
                  {sev}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          1(軽い)〜5(非常に辛い) をタップして記録
        </p>
      </div>

      {/* Detail toggle */}
      <button
        onClick={() => setShowDetail(v => !v)}
        className="mt-2 w-full text-xs text-blue-500 dark:text-blue-400 hover:underline"
      >
        {showDetail ? '詳細を閉じる' : '因子の詳細を見る'}
      </button>

      {/* Detail panel */}
      {showDetail && (
        <div className="mt-3 space-y-2">
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-2">
            各因子は医学論文に基づくスコアリング。重み付き合算 + 複合リスク補正。
          </p>
          {risk.factors.map(f => (
            <div key={f.id} className="flex items-center gap-2 text-xs">
              <div className="w-24 truncate text-slate-500 dark:text-slate-400" title={f.name}>
                {f.name}
              </div>
              <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    f.score >= 70 ? 'bg-red-400' :
                    f.score >= 40 ? 'bg-yellow-400' :
                    'bg-green-400'
                  }`}
                  style={{ width: `${f.score}%` }}
                />
              </div>
              <span className="w-8 text-right font-medium">{f.score}</span>
              <span className="w-10 text-right text-slate-400">x{(f.weight * 100).toFixed(0)}%</span>
            </div>
          ))}
          <div className="text-[10px] text-slate-400 dark:text-slate-500 pt-1 space-y-0.5">
            {risk.factors.filter(f => f.reference).map(f => (
              <p key={f.id}>{f.name}: {f.description} [{f.reference}]</p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* Mini hourly timeline (24h) */
function HourlyMiniTimeline({ hourlyRisk }: { hourlyRisk: HeadacheRiskResult['hourlyRisk'] }) {
  if (hourlyRisk.length === 0) return null

  return (
    <div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
        今後24時間のリスク推移
      </div>
      <div className="flex items-end gap-px h-10">
        {hourlyRisk.map((hr, i) => {
          const hour = new Date(hr.time).getHours()
          return (
            <div
              key={hr.time}
              className="flex-1 relative group"
              title={`${hour}時: スコア${hr.score}`}
            >
              <div
                className={`w-full rounded-t-sm min-h-[2px] transition-all ${
                  hr.score >= 76 ? 'bg-red-400' :
                  hr.score >= 56 ? 'bg-orange-400' :
                  hr.score >= 36 ? 'bg-yellow-400' :
                  hr.score >= 16 ? 'bg-emerald-400' :
                  'bg-green-300'
                } ${i === 0 ? 'opacity-100' : ''}`}
                style={{ height: `${Math.max(hr.score, 5)}%` }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
        <span>現在</span>
        <span>+12h</span>
        <span>+24h</span>
      </div>
    </div>
  )
}

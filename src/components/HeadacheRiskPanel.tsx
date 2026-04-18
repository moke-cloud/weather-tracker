import { useState, useCallback } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  Label,
} from 'recharts'
import type {
  ModelForecast,
  EnsembleBand,
  HeadacheRiskResult,
  HeadacheRiskLevel,
  DiaryEntry,
  HeadacheFactor,
} from '../lib/types'
import { calculateHeadacheRisk } from '../lib/headache-model'
import { addDiaryEntry } from '../lib/diary'
import { InfoTooltip } from './InfoTooltip'

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

/** 因子IDごとの「誰でもわかる」平易な説明。論文ベース閾値を日常語に翻訳 */
const FACTOR_PLAIN_INFO: Record<string, { meaning: string; threshold: string }> = {
  pressure_rate: {
    meaning: '短時間の気圧低下。頭痛トリガーとして最も強い因子。',
    threshold: '3時間で2.5 hPa以上の低下で「注意」、4 hPa以上で「危険」(Kimoto 2011)。',
  },
  absolute_pressure: {
    meaning: '現在の気圧そのものの低さ。低気圧が居座ると不調が長引く。',
    threshold: '1005 hPa未満で徐々にリスク増、1000 hPa未満で高リスク (Yang 2015)。',
  },
  temp_change: {
    meaning: '半日〜1日での気温の大きな上下。自律神経に負担。',
    threshold: '12時間で5℃以上の変動で「警戒」、8℃以上で「危険」(Mukamal 2009)。',
  },
  humidity: {
    meaning: '高湿度+急変。気圧低下と合わさると症状を増幅。',
    threshold: '湿度80%超+6時間で20%以上変動で高リスク (Hoffmann 2015)。',
  },
  front: {
    meaning: '寒冷・温暖前線の通過。気圧・気温・湿度が同時に動く強力なトリガー。',
    threshold: '気圧-2hPa + 気温2℃変動 + 湿度10%変動の同時発生で検出 (Kelman 2007)。',
  },
  model_consensus: {
    meaning: '複数予報モデルの一致度。不一致が大きいと予測自体が不確実。',
    threshold: 'モデル間の気圧差が2hPa超でリスク補正。',
  },
}

const LEVEL_DEFINITIONS: Array<{
  level: HeadacheRiskLevel
  range: string
  label: string
  icon: string
  action: string
  bgClass: string
}> = [
  {
    level: 'safe',
    range: '0-15',
    label: '安全',
    icon: '✅',
    action: '通常どおりの活動で問題なし。',
    bgClass: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  },
  {
    level: 'low',
    range: '16-35',
    label: 'やや注意',
    icon: '🟢',
    action: '敏感な方は水分補給・睡眠を意識。',
    bgClass: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
  },
  {
    level: 'moderate',
    range: '36-55',
    label: '注意',
    icon: '🟡',
    action: '鎮痛薬を携帯。無理な予定は控えめに。',
    bgClass: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
  },
  {
    level: 'high',
    range: '56-75',
    label: '警戒',
    icon: '🟠',
    action: '発症前の予防服薬を検討。早めの休息を。',
    bgClass: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
  },
  {
    level: 'critical',
    range: '76-100',
    label: '厳重警戒',
    icon: '🔴',
    action: '屋内待機を推奨。重要な予定は再調整を検討。',
    bgClass: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  },
]

export function HeadacheRiskPanel({ models, ensemble }: HeadacheRiskPanelProps) {
  const [showDetail, setShowDetail] = useState(false)
  const [showInfoModal, setShowInfoModal] = useState(false)
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
        <h3 className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 dark:text-slate-400">
          頭痛リスク予測
          <button
            type="button"
            onClick={() => setShowInfoModal(true)}
            aria-label="スコアとレベルの定義を表示"
            className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-current opacity-60 hover:opacity-100"
          >
            <span className="text-[9px] font-bold leading-none">i</span>
          </button>
        </h3>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
            信頼度 {Math.round(risk.confidence * 100)}%
            <InfoTooltip term="headacheConfidence" />
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
            <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden relative">
              {/* Threshold markers */}
              {[16, 36, 56, 76].map(t => (
                <div
                  key={t}
                  className="absolute top-0 bottom-0 w-px bg-slate-400/40 dark:bg-slate-500/40"
                  style={{ left: `${t}%` }}
                />
              ))}
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
          <span className="inline-flex items-baseline text-xl font-bold min-w-[3ch] text-right">
            {risk.overallScore}
            <span className="text-[10px] font-normal text-slate-400 ml-0.5">/100</span>
          </span>
        </div>
        <div className="flex justify-between mt-1 text-[9px] text-slate-400 dark:text-slate-500">
          <span>0 安全</span>
          <span>36 注意</span>
          <span>56 警戒</span>
          <span>76 厳重</span>
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
      {showDetail && <FactorDetail factors={risk.factors} />}

      {/* Score definition modal */}
      {showInfoModal && (
        <ScoreDefinitionModal onClose={() => setShowInfoModal(false)} />
      )}
    </div>
  )
}

/* ── Factor detail with plain-language thresholds ── */

function FactorDetail({ factors }: { factors: HeadacheFactor[] }) {
  return (
    <div className="mt-3 space-y-3">
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
        各因子は医学論文の閾値に基づき0-100で採点。下の重み(%)で合算後、
        3因子以上が同時に高ければ1.1-1.2倍の複合補正を適用して最終スコアを算出。
      </p>
      {factors.map(f => {
        const plain = FACTOR_PLAIN_INFO[f.id]
        return (
          <div key={f.id} className="rounded-lg bg-slate-50 dark:bg-slate-700/40 p-2 space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-24 truncate font-medium" title={f.name}>
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
              <span
                className="w-10 text-right font-medium"
                title="この因子のスコア (0-100)"
              >
                {f.score}/100
              </span>
              <span
                className="w-10 text-right text-slate-400 text-[10px]"
                title={`総合スコアへの寄与度。合計100%`}
              >
                重み{(f.weight * 100).toFixed(0)}%
              </span>
            </div>
            {f.description !== 'データ不足' && (
              <div className="text-[10px] text-slate-500 dark:text-slate-400 pl-[6.5rem]">
                現在値: {f.description}
              </div>
            )}
            {plain && (
              <div className="text-[10px] text-slate-500 dark:text-slate-400 pl-[6.5rem] space-y-0.5">
                <p>ℹ️ {plain.meaning}</p>
                <p className="opacity-80">基準: {plain.threshold}</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── Score definition modal ── */

function ScoreDefinitionModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">頭痛リスクスコアとは</h2>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <span className="text-xl leading-none">×</span>
          </button>
        </div>

        <div className="space-y-4 text-sm">
          <section>
            <h3 className="font-semibold mb-1">📊 スコアの意味</h3>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              0-100の数値で、数字が大きいほど「気象が原因で頭痛が起きやすい状態」を示します。
              単一要因ではなく、6つの気象因子を医学論文の閾値に基づき加重平均したものです。
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-2">🚦 5段階の意味と推奨行動</h3>
            <div className="space-y-2">
              {LEVEL_DEFINITIONS.map(d => (
                <div key={d.level} className={`rounded-lg border p-2 ${d.bgClass}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span>{d.icon}</span>
                    <span className="font-bold text-sm">{d.label}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      スコア {d.range}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{d.action}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-semibold mb-1">🔬 評価している6因子</h3>
            <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600 dark:text-slate-300">
              <li>気圧変化率 (重み35%): 短時間の気圧低下</li>
              <li>絶対気圧 (8%): 現在の気圧の低さそのもの</li>
              <li>気温変化 (18%): 半日〜1日の気温変動</li>
              <li>湿度 (14%): 高湿度と急変</li>
              <li>前線通過 (15%): 寒冷・温暖前線の接近</li>
              <li>モデル不確実性 (10%): 予報の確からしさ</li>
            </ul>
            <p className="text-[10px] text-slate-400 mt-1">
              3因子以上が同時に高い場合は1.1-1.2倍の複合補正を適用。
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-1">⚠️ 注意</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              これは一般的な気象因子に基づく参考値です。個人差が大きいため、
              頭痛日記を記録して自分の傾向を把握することをおすすめします。
              医療行為の代わりにはなりません。
            </p>
          </section>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium"
        >
          閉じる
        </button>
      </div>
    </div>
  )
}

/* ── Hourly risk area chart (24h) ── */

function riskColor(score: number): string {
  if (score >= 76) return '#ef4444'
  if (score >= 56) return '#f97316'
  if (score >= 36) return '#eab308'
  if (score >= 16) return '#10b981'
  return '#22c55e'
}

function HourlyMiniTimeline({ hourlyRisk }: { hourlyRisk: HeadacheRiskResult['hourlyRisk'] }) {
  if (hourlyRisk.length === 0) return null

  // Build chart data
  const data = hourlyRisk.map(hr => ({
    hour: `${new Date(hr.time).getHours()}`,
    score: hr.score,
    fill: riskColor(hr.score),
  }))

  // Find peak
  const peak = hourlyRisk.reduce((best, hr) => hr.score > best.score ? hr : best, hourlyRisk[0])
  const peakHour = new Date(peak.time).getHours()

  // Threshold zones for reference
  const thresholds = [
    { y: 36, label: '注意', color: '#eab308' },
    { y: 56, label: '警戒', color: '#f97316' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          今後24時間のリスク推移
          <InfoTooltip term="headacheScore" />
        </span>
        {peak.score >= 36 && (
          <span className="text-[11px] font-medium" style={{ color: riskColor(peak.score) }}>
            ピーク {peakHour}時 (スコア{peak.score})
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity={0.4} />
              <stop offset="50%" stopColor="#eab308" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="hour"
            tick={{ fontSize: 9, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            interval={5}
            tickFormatter={(v: string) => `${v}時`}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 9, fill: '#94a3b8' }}
            ticks={[0, 36, 56, 76, 100]}
            axisLine={false}
            tickLine={false}
            width={28}
          >
            <Label
              value="スコア"
              angle={-90}
              position="insideLeft"
              style={{ fontSize: 9, fill: '#94a3b8' }}
            />
          </YAxis>
          {thresholds.map(t => (
            <ReferenceLine
              key={t.y}
              y={t.y}
              stroke={t.color}
              strokeDasharray="3 3"
              strokeOpacity={0.4}
              label={{
                value: t.label,
                fill: t.color,
                fontSize: 8,
                position: 'right',
              }}
            />
          ))}
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              border: 'none',
              borderRadius: '8px',
              color: '#e2e8f0',
              fontSize: '11px',
              padding: '4px 8px',
            }}
            formatter={(value) => [`スコア ${value}/100`, 'リスク']}
            labelFormatter={(v) => `${v}時`}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#f97316"
            strokeWidth={2}
            fill="url(#riskGrad)"
            dot={false}
            activeDot={{ r: 3, fill: '#f97316' }}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-3 text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-0.5 bg-yellow-400 rounded" />
          36 = 注意ライン
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-0.5 bg-orange-400 rounded" />
          56 = 警戒ライン
        </span>
      </div>
    </div>
  )
}

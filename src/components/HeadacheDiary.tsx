import { useState, useEffect, useCallback } from 'react'
import type { DiaryEntry } from '../lib/types'
import { getDiaryEntries, removeDiaryEntry, getDiaryStats, getStorageInfo } from '../lib/diary'

export function HeadacheDiary() {
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [stats, setStats] = useState<{
    totalEntries: number
    avgSeverity: number
    avgRiskScore: number
    commonPressureRange: string
    avgPressureChange3h: string
  } | null>(null)
  const [storageInfo, setStorageInfo] = useState<{ used: string; quota: string; persisted: boolean } | null>(null)

  const reload = useCallback(async () => {
    const [ents, st, si] = await Promise.all([
      getDiaryEntries(20),
      getDiaryStats(),
      getStorageInfo(),
    ])
    setEntries(ents)
    setStats(st)
    setStorageInfo(si)
  }, [])

  useEffect(() => { reload() }, [reload])

  const handleDelete = useCallback(async (id: string) => {
    await removeDiaryEntry(id)
    reload()
  }, [reload])

  const severityEmoji = (s: number) =>
    s <= 1 ? '\u{1F7E2}' : s <= 2 ? '\u{1F7E1}' : s <= 3 ? '\u{1F7E0}' : s <= 4 ? '\u{1F534}' : '\u{1F7E3}'

  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 p-4 shadow-sm">
      <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">
        頭痛日記
      </h3>

      {/* Stats */}
      {stats && stats.totalEntries > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <StatBox label="記録数" value={String(stats.totalEntries)} />
          <StatBox label="平均重症度" value={String(stats.avgSeverity)} />
          <StatBox label="平均リスク" value={String(stats.avgRiskScore)} />
          <StatBox label="平均気圧変化" value={stats.avgPressureChange3h} />
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-4">
          頭痛リスクパネルの「1〜5」ボタンで記録を開始できます。
          <br />
          記録が増えると、個人の傾向が見えてきます。
        </p>
      ) : (
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {entries.map(e => (
            <div
              key={e.id}
              className="flex items-center gap-2 text-xs bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2"
            >
              <span className="text-base">{severityEmoji(e.severity)}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium">
                  重症度 {e.severity} / リスクスコア {e.riskScore}
                </div>
                <div className="text-slate-400 dark:text-slate-500">
                  {new Date(e.timestamp).toLocaleString('ja-JP', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {e.pressure !== null && ` / ${e.pressure.toFixed(0)}hPa`}
                  {e.pressureChange3h !== null && (
                    <span className={e.pressureChange3h < -1 ? 'text-red-400' : ''}>
                      ({e.pressureChange3h > 0 ? '+' : ''}{e.pressureChange3h.toFixed(1)}/3h)
                    </span>
                  )}
                  {e.temperature !== null && ` / ${e.temperature.toFixed(0)}\u00B0C`}
                  {e.humidity !== null && ` / ${e.humidity.toFixed(0)}%`}
                </div>
              </div>
              <button
                onClick={() => handleDelete(e.id)}
                className="text-slate-300 hover:text-red-400 dark:text-slate-600 dark:hover:text-red-400 transition-colors"
                title="削除"
              >
                {'\u2715'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Storage info */}
      <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
        {stats && stats.totalEntries >= 5 && (
          <span>発症時の気圧帯: {stats.commonPressureRange}</span>
        )}
        {storageInfo && (
          <span className="ml-auto">
            {storageInfo.persisted ? '\u{1F512}' : '\u26A0\uFE0F'}{' '}
            {storageInfo.used} / {storageInfo.quota}
            {!storageInfo.persisted && ' (永続化未許可)'}
          </span>
        )}
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2 text-center">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[10px] text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  )
}

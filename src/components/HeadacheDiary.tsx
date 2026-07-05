import { useState, useEffect, useCallback } from 'react'
import type { DiaryEntry } from '../lib/types'
import { getDiaryEntries, removeDiaryEntry, getDiaryStats, getStorageInfo } from '../lib/diary'
import { StatusDot, LockIcon, AlertIcon } from './icons'

/** 重症度 1-5 → 状態ドットの色 */
const SEVERITY_DOT: Record<number, string> = {
  1: 'bg-low',
  2: 'bg-caution',
  3: 'bg-warn',
  4: 'bg-danger',
  5: 'bg-danger',
}

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

  return (
    <div className="p-4">
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
        <p className="text-xs text-ink-subtle text-center py-4">
          頭痛リスクパネルの「1〜5」ボタンで記録を開始できます。
          <br />
          記録が増えると、個人の傾向が見えてきます。
        </p>
      ) : (
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {entries.map(e => (
            <div
              key={e.id}
              className="flex items-center gap-2 text-xs bg-surface-sunk rounded-md px-3 py-2"
            >
              <StatusDot className={SEVERITY_DOT[e.severity] ?? 'bg-ink-subtle'} size={12} />
              <div className="flex-1 min-w-0">
                <div className="nums font-medium text-ink">
                  重症度 {e.severity} / リスクスコア {e.riskScore}
                </div>
                <div className="nums text-ink-subtle">
                  {new Date(e.timestamp).toLocaleString('ja-JP', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {e.pressure !== null && ` / ${e.pressure.toFixed(0)}hPa`}
                  {e.pressureChange3h !== null && (
                    <span className={e.pressureChange3h < -1 ? 'text-danger' : ''}>
                      ({e.pressureChange3h > 0 ? '+' : ''}{e.pressureChange3h.toFixed(1)}/3h)
                    </span>
                  )}
                  {e.temperature !== null && ` / ${e.temperature.toFixed(0)}°C`}
                  {e.humidity !== null && ` / ${e.humidity.toFixed(0)}%`}
                </div>
              </div>
              <button
                onClick={() => handleDelete(e.id)}
                className="text-ink-subtle hover:text-danger transition-colors duration-200 ease-out"
                title="削除"
                aria-label="この記録を削除"
              >
                {'✕'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Storage info */}
      <div className="mt-3 pt-2 border-t border-line flex items-center justify-between text-[10px] text-ink-subtle">
        {stats && stats.totalEntries >= 5 && (
          <span>発症時の気圧帯: {stats.commonPressureRange}</span>
        )}
        {storageInfo && (
          <span className="nums ml-auto inline-flex items-center gap-1">
            {storageInfo.persisted
              ? <LockIcon size={11} className="text-ink-subtle" />
              : <AlertIcon size={11} className="text-warn-text" />}
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
    <div className="bg-surface-sunk rounded-md p-2 text-center">
      <div className="nums font-display text-lg font-bold text-ink">{value}</div>
      <div className="text-[10px] text-ink-muted">{label}</div>
    </div>
  )
}

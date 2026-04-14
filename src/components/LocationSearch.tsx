import { useState, useCallback } from 'react'
import { searchLocation, type GeoResult } from '../lib/open-meteo'
import { fetchAmedasStations, findNearestStation } from '../lib/amedas'
import type { Location } from '../lib/types'

interface LocationSearchProps {
  onAdd: (location: Location) => void
  onClose: () => void
}

export function LocationSearch({ onAdd, onClose }: LocationSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeoResult[]>([])
  const [searching, setSearching] = useState(false)

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await searchLocation(query)
      setResults(res)
    } finally {
      setSearching(false)
    }
  }, [query])

  const handleSelect = useCallback(
    async (result: GeoResult) => {
      let amedasId: string | undefined
      try {
        const stations = await fetchAmedasStations()
        const nearest = findNearestStation(
          stations,
          result.latitude,
          result.longitude
        )
        if (nearest) amedasId = nearest.id
      } catch {
        // AMeDAS mapping is optional
      }

      const location: Location = {
        id: `${result.latitude}_${result.longitude}_${Date.now()}`,
        name: result.admin1
          ? `${result.name} (${result.admin1})`
          : result.name,
        latitude: result.latitude,
        longitude: result.longitude,
        amedasStationId: amedasId,
        createdAt: Date.now(),
      }
      onAdd(location)
    },
    [onAdd]
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-5">
        <h2 className="text-lg font-bold mb-4">地点を追加</h2>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="地名を入力 (例: 東京、大阪、札幌...)"
            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {searching ? '...' : '検索'}
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1">
          {results.map((r, i) => (
            <button
              key={`${r.latitude}_${r.longitude}_${i}`}
              onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-sm transition-colors"
            >
              <span className="font-medium">{r.name}</span>
              {r.admin1 && (
                <span className="text-slate-500 dark:text-slate-400 ml-2">
                  {r.admin1}
                </span>
              )}
              <span className="text-slate-400 dark:text-slate-500 ml-2 text-xs">
                {r.country}
              </span>
            </button>
          ))}
          {results.length === 0 && !searching && query && (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
              検索結果がありません
            </p>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
        >
          閉じる
        </button>
      </div>
    </div>
  )
}

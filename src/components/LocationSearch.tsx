import { useState, useCallback } from 'react'
import { searchLocation, type GeoResult } from '../lib/open-meteo'
import { fetchAmedasStations, findNearestStation } from '../lib/amedas'
import type { Location } from '../lib/types'

interface LocationSearchProps {
  onAdd: (location: Location) => void
  onClose: () => void
}

const PRESET_CITIES: { name: string; lat: number; lon: number; label: string }[] = [
  { name: '札幌', lat: 43.0621, lon: 141.3544, label: '北海道' },
  { name: '仙台', lat: 38.2682, lon: 140.8694, label: '宮城県' },
  { name: '東京', lat: 35.6895, lon: 139.6917, label: '東京都' },
  { name: '横浜', lat: 35.4437, lon: 139.6380, label: '神奈川県' },
  { name: '名古屋', lat: 35.1815, lon: 136.9066, label: '愛知県' },
  { name: '京都', lat: 35.0116, lon: 135.7681, label: '京都府' },
  { name: '大阪', lat: 34.6937, lon: 135.5023, label: '大阪府' },
  { name: '神戸', lat: 34.6901, lon: 135.1956, label: '兵庫県' },
  { name: '広島', lat: 34.3853, lon: 132.4553, label: '広島県' },
  { name: '福岡', lat: 33.5904, lon: 130.4017, label: '福岡県' },
  { name: '那覇', lat: 26.2124, lon: 127.6809, label: '沖縄県' },
  { name: '静岡', lat: 34.9769, lon: 138.3831, label: '静岡県' },
  { name: '新潟', lat: 37.9026, lon: 139.0236, label: '新潟県' },
  { name: '金沢', lat: 36.5613, lon: 136.6562, label: '石川県' },
  { name: '岡山', lat: 34.6617, lon: 133.9350, label: '岡山県' },
  { name: '熊本', lat: 32.8032, lon: 130.7079, label: '熊本県' },
  { name: '鹿児島', lat: 31.5602, lon: 130.5581, label: '鹿児島県' },
  { name: 'さいたま', lat: 35.8617, lon: 139.6455, label: '埼玉県' },
  { name: '千葉', lat: 35.6047, lon: 140.1233, label: '千葉県' },
  { name: '松山', lat: 33.8392, lon: 132.7657, label: '愛媛県' },
]

export function LocationSearch({ onAdd, onClose }: LocationSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeoResult[]>([])
  const [searching, setSearching] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [showPresets, setShowPresets] = useState(true)

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return
    setSearching(true)
    setShowPresets(false)
    try {
      let res = await searchLocation(query)
      // Japanese input often returns nothing; retry with common mappings
      if (res.length === 0 && /[^\x00-\x7F]/.test(query)) {
        // Check preset cities for a direct match
        const preset = PRESET_CITIES.find(
          (c) => c.name === query || c.label.includes(query)
        )
        if (preset) {
          res = [{
            name: preset.name,
            latitude: preset.lat,
            longitude: preset.lon,
            country: '日本',
            admin1: preset.label,
          }]
        }
      }
      setResults(res)
    } finally {
      setSearching(false)
    }
  }, [query])

  const resolveAndAdd = useCallback(
    async (name: string, lat: number, lon: number, admin1?: string) => {
      let amedasId: string | undefined
      try {
        const stations = await fetchAmedasStations()
        const nearest = findNearestStation(stations, lat, lon)
        if (nearest) amedasId = nearest.id
      } catch {
        // optional
      }

      const location: Location = {
        id: `${lat}_${lon}_${Date.now()}`,
        name: admin1 ? `${name} (${admin1})` : name,
        latitude: lat,
        longitude: lon,
        amedasStationId: amedasId,
        createdAt: Date.now(),
      }
      onAdd(location)
    },
    [onAdd]
  )

  const handleGPS = useCallback(async () => {
    if (!navigator.geolocation) return
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        // Reverse geocode with Open-Meteo: find nearest city
        try {
          const res = await searchLocation(
            `${latitude.toFixed(2)},${longitude.toFixed(2)}`
          )
          if (res.length > 0) {
            await resolveAndAdd(
              res[0].name,
              latitude,
              longitude,
              res[0].admin1
            )
          } else {
            await resolveAndAdd(
              `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`,
              latitude,
              longitude
            )
          }
        } catch {
          await resolveAndAdd(
            `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`,
            latitude,
            longitude
          )
        }
        setGpsLoading(false)
      },
      () => {
        setGpsLoading(false)
        alert('位置情報の取得に失敗しました。ブラウザの位置情報許可を確認してください。')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [resolveAndAdd])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-5 max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-3">地点を追加</h2>

        {/* GPS Button */}
        <button
          onClick={handleGPS}
          disabled={gpsLoading}
          className="w-full mb-3 px-4 py-2.5 rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-50 transition-colors"
        >
          {gpsLoading ? '取得中...' : '\uD83D\uDCCD 現在地から追加'}
        </button>

        {/* Search */}
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              if (!e.target.value) setShowPresets(true)
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="ローマ字で検索 (例: shizuoka, tokyo)"
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
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
          日本語で見つからない場合はローマ字で入力してください
        </p>

        {/* Search Results */}
        {!showPresets && (
          <div className="space-y-1 mb-3">
            {results.map((r, i) => (
              <button
                key={`${r.latitude}_${r.longitude}_${i}`}
                onClick={() => resolveAndAdd(r.name, r.latitude, r.longitude, r.admin1)}
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
              <p className="text-sm text-slate-500 dark:text-slate-400 py-3 text-center">
                結果なし - ローマ字で再検索してみてください
              </p>
            )}
          </div>
        )}

        {/* Preset Cities */}
        {showPresets && (
          <div>
            <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
              主要都市（タップで追加）
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_CITIES.map((city) => (
                <button
                  key={city.name}
                  onClick={() => resolveAndAdd(city.name, city.lat, city.lon, city.label)}
                  className="px-3 py-1.5 text-xs rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  {city.name}
                </button>
              ))}
            </div>
          </div>
        )}

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

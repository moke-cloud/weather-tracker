import { useState, useCallback } from 'react'
import { searchLocation, type GeoResult } from '../lib/open-meteo'
import { fetchAmedasStations, findNearestStation } from '../lib/amedas'
import { lookupPostalCode } from '../lib/postal-code'
import { REGIONS, matchAddress, type AreaEntry } from '../lib/jp-areas'
import type { Location } from '../lib/types'

interface LocationSearchProps {
  onAdd: (location: Location) => void
  onClose: () => void
}

export function LocationSearch({ onAdd, onClose }: LocationSearchProps) {
  const [query, setQuery] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [postalResult, setPostalResult] = useState<AreaEntry | null>(null)
  const [postalAddress, setPostalAddress] = useState('')
  const [postalSearching, setPostalSearching] = useState(false)
  const [postalError, setPostalError] = useState('')
  const [results, setResults] = useState<GeoResult[]>([])
  const [searching, setSearching] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [expandedCity, setExpandedCity] = useState<string | null>(null)
  const [searchMode, setSearchMode] = useState<'preset' | 'search'>('preset')

  const resolveAndAdd = useCallback(
    async (name: string, lat: number, lon: number, admin1?: string) => {
      let amedasId: string | undefined
      try {
        const stations = await fetchAmedasStations()
        const nearest = findNearestStation(stations, lat, lon)
        if (nearest) amedasId = nearest.id
      } catch { /* optional */ }

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

  /* ── Postal code search ── */
  const handlePostalSearch = useCallback(async () => {
    const clean = postalCode.replace(/[^0-9]/g, '')
    if (clean.length !== 7) {
      setPostalError('7桁の郵便番号を入力してください')
      return
    }
    setPostalSearching(true)
    setPostalError('')
    setPostalResult(null)
    setPostalAddress('')

    try {
      const result = await lookupPostalCode(clean)
      if (!result) {
        setPostalError('該当する住所が見つかりません')
        return
      }
      setPostalAddress(result.fullAddress)

      // Match to ward/city database
      const matched = matchAddress(result.prefecture, result.city, result.area)
      if (matched) {
        setPostalResult(matched)
      } else {
        // Fallback: try Open-Meteo geocoding with the address
        const geoResults = await searchLocation(result.fullAddress)
        if (geoResults.length > 0) {
          setPostalResult({
            name: result.city + result.area,
            lat: geoResults[0].latitude,
            lon: geoResults[0].longitude,
            label: result.prefecture,
          })
        } else {
          setPostalError(`${result.fullAddress} の座標が取得できませんでした`)
        }
      }
    } catch {
      setPostalError('検索に失敗しました。ネットワークを確認してください。')
    } finally {
      setPostalSearching(false)
    }
  }, [postalCode])

  /* ── Text search ── */
  const handleSearch = useCallback(async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      let res = await searchLocation(query)
      if (res.length === 0 && /[^\x00-\x7F]/.test(query)) {
        const q = query.replace(/[市区町村県府都道]$/g, '')
        const allAreas: { name: string; lat: number; lon: number; label: string }[] = []
        for (const r of REGIONS) {
          for (const c of r.cities) {
            allAreas.push({ name: c.city, lat: c.lat, lon: c.lon, label: c.label })
            for (const w of c.wards) {
              allAreas.push(w)
            }
          }
        }
        const matches = allAreas.filter(
          a => a.name.includes(q) || a.label.includes(q)
        )
        if (matches.length > 0) {
          res = matches.map(a => ({
            name: a.name,
            latitude: a.lat,
            longitude: a.lon,
            country: '日本',
            admin1: a.label,
          }))
        }
      }
      setResults(res)
    } finally {
      setSearching(false)
    }
  }, [query])

  /* ── GPS ── */
  const handleGPS = useCallback(async () => {
    if (!navigator.geolocation) return
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        try {
          const res = await searchLocation(
            `${latitude.toFixed(2)},${longitude.toFixed(2)}`
          )
          if (res.length > 0) {
            await resolveAndAdd(res[0].name, latitude, longitude, res[0].admin1)
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
          {gpsLoading ? '取得中...' : '\u{1F4CD} 現在地から追加'}
        </button>

        {/* Postal code search */}
        <div className="mb-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
            〒 郵便番号で検索
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={postalCode}
              onChange={e => {
                let v = e.target.value.replace(/[^0-9\-]/g, '')
                if (v.length === 3 && !v.includes('-') && postalCode.length < v.length) {
                  v = v + '-'
                }
                setPostalCode(v)
                setPostalError('')
                setPostalResult(null)
              }}
              onKeyDown={e => e.key === 'Enter' && handlePostalSearch()}
              placeholder="例: 100-0001"
              maxLength={8}
              className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handlePostalSearch}
              disabled={postalSearching}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {postalSearching ? '...' : '検索'}
            </button>
          </div>
          {postalError && (
            <p className="text-xs text-red-500 mt-1.5">{postalError}</p>
          )}
          {postalResult && (
            <button
              onClick={() => resolveAndAdd(postalResult.name, postalResult.lat, postalResult.lon, postalResult.label)}
              className="w-full mt-2 text-left px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-sm transition-colors"
            >
              <span className="font-medium">{postalResult.name}</span>
              <span className="text-slate-500 dark:text-slate-400 ml-2">{postalResult.label}</span>
              <span className="text-xs text-slate-400 ml-2">{postalAddress}</span>
            </button>
          )}
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 mb-3">
          <button
            onClick={() => setSearchMode('preset')}
            className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-colors ${
              searchMode === 'preset'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            地域から選ぶ
          </button>
          <button
            onClick={() => setSearchMode('search')}
            className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-colors ${
              searchMode === 'search'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            テキスト検索
          </button>
        </div>

        {/* Text search mode */}
        {searchMode === 'search' && (
          <>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="地名を入力 (例: 渋谷区, shizuoka)"
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
            <div className="space-y-1 mb-3">
              {results.map((r, i) => (
                <button
                  key={`${r.latitude}_${r.longitude}_${i}`}
                  onClick={() => resolveAndAdd(r.name, r.latitude, r.longitude, r.admin1)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-sm transition-colors"
                >
                  <span className="font-medium">{r.name}</span>
                  {r.admin1 && <span className="text-slate-500 dark:text-slate-400 ml-2">{r.admin1}</span>}
                  <span className="text-slate-400 dark:text-slate-500 ml-2 text-xs">{r.country}</span>
                </button>
              ))}
              {results.length === 0 && !searching && query && (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-3 text-center">
                  結果なし
                </p>
              )}
            </div>
          </>
        )}

        {/* Preset mode: region → city → ward */}
        {searchMode === 'preset' && (
          <div className="space-y-3">
            {REGIONS.map(region => (
              <div key={region.region}>
                <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  {region.region}
                </h4>
                <div className="flex flex-wrap gap-1">
                  {region.cities.map(city => {
                    const hasWards = city.wards.length > 0
                    const isExpanded = expandedCity === `${region.region}_${city.city}`

                    return (
                      <div key={city.city} className={hasWards && isExpanded ? 'w-full' : ''}>
                        <button
                          onClick={() => {
                            if (hasWards) {
                              setExpandedCity(isExpanded ? null : `${region.region}_${city.city}`)
                            } else {
                              resolveAndAdd(city.city, city.lat, city.lon, city.label)
                            }
                          }}
                          className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                            isExpanded
                              ? 'bg-blue-500 text-white'
                              : hasWards
                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                                : 'bg-slate-100 dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-700 dark:hover:text-blue-300'
                          }`}
                        >
                          {city.city}
                          {hasWards && <span className="ml-0.5 text-[10px]">{isExpanded ? '\u25B2' : '\u25BC'}</span>}
                        </button>

                        {/* Ward expansion */}
                        {hasWards && isExpanded && (
                          <div className="mt-1 ml-2 mb-2 flex flex-wrap gap-1">
                            <button
                              onClick={() => resolveAndAdd(city.city, city.lat, city.lon, city.label)}
                              className="px-2 py-0.5 text-[11px] rounded-full bg-slate-200 dark:bg-slate-600 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                            >
                              {city.city}全体
                            </button>
                            {city.wards.map(ward => (
                              <button
                                key={ward.name}
                                onClick={() => resolveAndAdd(
                                  `${city.city}${ward.name}`,
                                  ward.lat,
                                  ward.lon,
                                  ward.label
                                )}
                                className="px-2 py-0.5 text-[11px] rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                              >
                                {ward.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
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

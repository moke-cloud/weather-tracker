import { useState, useCallback, useEffect } from 'react'
import { searchLocation, type GeoResult } from '../lib/open-meteo'
import { fetchAmedasStations, findNearestStation } from '../lib/amedas'
import { lookupPostalCode } from '../lib/postal-code'
import { REGIONS, matchAddress, type AreaEntry } from '../lib/jp-areas'
import type { Location } from '../lib/types'
import { PinIcon } from './icons'

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
  const [gpsError, setGpsError] = useState('')
  const [expandedCity, setExpandedCity] = useState<string | null>(null)
  const [searchMode, setSearchMode] = useState<'preset' | 'search'>('preset')

  // Escape でモーダルを閉じる
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

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
      if (res.length === 0 && /[^ -~]/.test(query)) {
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
    if (!navigator.geolocation) {
      setGpsError('このブラウザは位置情報に対応していません')
      return
    }
    setGpsLoading(true)
    setGpsError('')
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
        setGpsError('位置情報を取得できませんでした。ブラウザの位置情報の許可設定を確認してください。')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [resolveAndAdd])

  const inputCls =
    'flex-1 px-3 py-2 rounded-md border border-line-strong bg-surface-sunk text-ink text-sm placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent'
  const primaryBtn =
    'px-4 py-2 bg-accent text-accent-ink rounded-md text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 transition-colors duration-200 ease-out'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="地点を追加"
        className="relative w-full max-w-md bg-surface-raised rounded-xl shadow-lg p-5 max-h-[80vh] overflow-y-auto"
      >
        <h2 className="font-display text-lg font-bold text-ink mb-3">地点を追加</h2>

        {/* GPS Button */}
        <button
          onClick={handleGPS}
          disabled={gpsLoading}
          className="w-full mb-3 px-4 py-2.5 rounded-md border-2 border-dashed border-accent/50 text-accent-strong text-sm font-semibold hover:bg-accent-soft disabled:opacity-50 transition-colors duration-200 ease-out inline-flex items-center justify-center gap-1.5"
        >
          {gpsLoading ? '取得中...' : <><PinIcon size={16} /> 現在地から追加</>}
        </button>
        {gpsError && (
          <p className="text-xs text-danger -mt-2 mb-3" role="alert">{gpsError}</p>
        )}

        {/* Postal code search */}
        <div className="mb-3 p-3 rounded-md bg-surface-sunk">
          <div className="text-xs font-medium text-ink-muted mb-1.5">
            〒 郵便番号で検索
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={postalCode}
              onChange={e => {
                let v = e.target.value.replace(/[^0-9-]/g, '')
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
              className={`nums ${inputCls}`}
            />
            <button onClick={handlePostalSearch} disabled={postalSearching} className={primaryBtn}>
              {postalSearching ? '...' : '検索'}
            </button>
          </div>
          {postalError && (
            <p className="text-xs text-danger mt-1.5">{postalError}</p>
          )}
          {postalResult && (
            <button
              onClick={() => resolveAndAdd(postalResult.name, postalResult.lat, postalResult.lon, postalResult.label)}
              className="w-full mt-2 text-left px-3 py-2 rounded-md bg-accent-soft hover:bg-accent/25 text-sm transition-colors duration-200 ease-out"
            >
              <span className="font-medium text-ink">{postalResult.name}</span>
              <span className="text-ink-muted ml-2">{postalResult.label}</span>
              <span className="text-xs text-ink-subtle ml-2">{postalAddress}</span>
            </button>
          )}
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 mb-3">
          <button
            onClick={() => setSearchMode('preset')}
            className={`flex-1 py-1.5 text-xs rounded-md font-medium transition-colors duration-200 ease-out ${
              searchMode === 'preset'
                ? 'bg-accent text-accent-ink'
                : 'bg-surface-sunk text-ink-muted hover:bg-surface'
            }`}
          >
            地域から選ぶ
          </button>
          <button
            onClick={() => setSearchMode('search')}
            className={`flex-1 py-1.5 text-xs rounded-md font-medium transition-colors duration-200 ease-out ${
              searchMode === 'search'
                ? 'bg-accent text-accent-ink'
                : 'bg-surface-sunk text-ink-muted hover:bg-surface'
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
                className={inputCls}
                autoFocus
              />
              <button onClick={handleSearch} disabled={searching} className={primaryBtn}>
                {searching ? '...' : '検索'}
              </button>
            </div>
            <div className="space-y-1 mb-3">
              {results.map((r, i) => (
                <button
                  key={`${r.latitude}_${r.longitude}_${i}`}
                  onClick={() => resolveAndAdd(r.name, r.latitude, r.longitude, r.admin1)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-surface-sunk text-sm transition-colors duration-200 ease-out"
                >
                  <span className="font-medium text-ink">{r.name}</span>
                  {r.admin1 && <span className="text-ink-muted ml-2">{r.admin1}</span>}
                  <span className="text-ink-subtle ml-2 text-xs">{r.country}</span>
                </button>
              ))}
              {results.length === 0 && !searching && query && (
                <p className="text-sm text-ink-muted py-3 text-center">
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
                <h4 className="text-xs font-medium text-ink-muted mb-1.5">
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
                          className={`px-2.5 py-1 text-xs rounded-full transition-colors duration-200 ease-out ${
                            isExpanded
                              ? 'bg-accent text-accent-ink'
                              : hasWards
                                ? 'bg-accent-soft text-ink ring-1 ring-accent/30 hover:bg-accent/25'
                                : 'bg-surface-sunk text-ink hover:bg-accent-soft'
                          }`}
                        >
                          {city.city}
                          {hasWards && <span className="ml-0.5 text-[10px]">{isExpanded ? '▲' : '▼'}</span>}
                        </button>

                        {/* Ward expansion */}
                        {hasWards && isExpanded && (
                          <div className="mt-1 ml-2 mb-2 flex flex-wrap gap-1">
                            <button
                              onClick={() => resolveAndAdd(city.city, city.lat, city.lon, city.label)}
                              className="px-2 py-0.5 text-[11px] rounded-full bg-line text-ink hover:bg-accent-soft hover:text-accent-strong transition-colors duration-200 ease-out"
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
                                className="px-2 py-0.5 text-[11px] rounded-full bg-surface-sunk text-ink hover:bg-accent-soft hover:text-accent-strong transition-colors duration-200 ease-out"
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
          className="mt-4 w-full py-2 text-sm text-ink-muted hover:text-ink transition-colors duration-200 ease-out"
        >
          閉じる
        </button>
      </div>
    </div>
  )
}

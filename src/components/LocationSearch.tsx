import { useState, useCallback } from 'react'
import { searchLocation, type GeoResult } from '../lib/open-meteo'
import { fetchAmedasStations, findNearestStation } from '../lib/amedas'
import type { Location } from '../lib/types'

interface LocationSearchProps {
  onAdd: (location: Location) => void
  onClose: () => void
}

interface PresetCity {
  name: string
  lat: number
  lon: number
  label: string
}

const PRESET_REGIONS: { region: string; cities: PresetCity[] }[] = [
  {
    region: '北海道・東北',
    cities: [
      { name: '札幌市', lat: 43.0621, lon: 141.3544, label: '北海道' },
      { name: '旭川市', lat: 43.7707, lon: 142.3650, label: '北海道' },
      { name: '函館市', lat: 41.7687, lon: 140.7290, label: '北海道' },
      { name: '青森市', lat: 40.8244, lon: 140.7400, label: '青森県' },
      { name: '盛岡市', lat: 39.7036, lon: 141.1527, label: '岩手県' },
      { name: '仙台市', lat: 38.2682, lon: 140.8694, label: '宮城県' },
      { name: '秋田市', lat: 39.7200, lon: 140.1025, label: '秋田県' },
      { name: '山形市', lat: 38.2405, lon: 140.3634, label: '山形県' },
      { name: '福島市', lat: 37.7608, lon: 140.4748, label: '福島県' },
      { name: 'いわき市', lat: 37.0504, lon: 140.8878, label: '福島県' },
    ],
  },
  {
    region: '関東',
    cities: [
      { name: '東京(千代田区)', lat: 35.6895, lon: 139.6917, label: '東京都' },
      { name: '新宿区', lat: 35.6938, lon: 139.7035, label: '東京都' },
      { name: '八王子市', lat: 35.6664, lon: 139.3160, label: '東京都' },
      { name: '横浜市', lat: 35.4437, lon: 139.6380, label: '神奈川県' },
      { name: '川崎市', lat: 35.5309, lon: 139.7030, label: '神奈川県' },
      { name: '相模原市', lat: 35.5714, lon: 139.3735, label: '神奈川県' },
      { name: 'さいたま市', lat: 35.8617, lon: 139.6455, label: '埼玉県' },
      { name: '川越市', lat: 35.9251, lon: 139.4858, label: '埼玉県' },
      { name: '千葉市', lat: 35.6047, lon: 140.1233, label: '千葉県' },
      { name: '船橋市', lat: 35.6946, lon: 139.9828, label: '千葉県' },
      { name: '柏市', lat: 35.8676, lon: 139.9716, label: '千葉県' },
      { name: '水戸市', lat: 36.3418, lon: 140.4468, label: '茨城県' },
      { name: 'つくば市', lat: 36.0835, lon: 140.0766, label: '茨城県' },
      { name: '宇都宮市', lat: 36.5551, lon: 139.8836, label: '栃木県' },
      { name: '前橋市', lat: 36.3910, lon: 139.0638, label: '群馬県' },
      { name: '高崎市', lat: 36.3223, lon: 139.0032, label: '群馬県' },
    ],
  },
  {
    region: '中部',
    cities: [
      { name: '新潟市', lat: 37.9026, lon: 139.0236, label: '新潟県' },
      { name: '長岡市', lat: 37.4468, lon: 138.8510, label: '新潟県' },
      { name: '富山市', lat: 36.6953, lon: 137.2114, label: '富山県' },
      { name: '金沢市', lat: 36.5613, lon: 136.6562, label: '石川県' },
      { name: '福井市', lat: 36.0652, lon: 136.2216, label: '福井県' },
      { name: '甲府市', lat: 35.6642, lon: 138.5684, label: '山梨県' },
      { name: '長野市', lat: 36.2378, lon: 138.1813, label: '長野県' },
      { name: '松本市', lat: 36.2380, lon: 137.9720, label: '長野県' },
      { name: '岐阜市', lat: 35.4233, lon: 136.7606, label: '岐阜県' },
      { name: '静岡市', lat: 34.9769, lon: 138.3831, label: '静岡県' },
      { name: '浜松市', lat: 34.7108, lon: 137.7261, label: '静岡県' },
      { name: '沼津市', lat: 35.0955, lon: 138.8636, label: '静岡県' },
      { name: '名古屋市', lat: 35.1815, lon: 136.9066, label: '愛知県' },
      { name: '豊田市', lat: 35.0826, lon: 137.1560, label: '愛知県' },
      { name: '豊橋市', lat: 34.7692, lon: 137.3914, label: '愛知県' },
    ],
  },
  {
    region: '近畿',
    cities: [
      { name: '津市', lat: 34.7303, lon: 136.5086, label: '三重県' },
      { name: '四日市市', lat: 34.9650, lon: 136.6246, label: '三重県' },
      { name: '大津市', lat: 35.0045, lon: 135.8686, label: '滋賀県' },
      { name: '京都市', lat: 35.0116, lon: 135.7681, label: '京都府' },
      { name: '大阪市', lat: 34.6937, lon: 135.5023, label: '大阪府' },
      { name: '堺市', lat: 34.5733, lon: 135.4830, label: '大阪府' },
      { name: '神戸市', lat: 34.6901, lon: 135.1956, label: '兵庫県' },
      { name: '姫路市', lat: 34.8152, lon: 134.6854, label: '兵庫県' },
      { name: '奈良市', lat: 34.6851, lon: 135.8049, label: '奈良県' },
      { name: '和歌山市', lat: 34.2260, lon: 135.1675, label: '和歌山県' },
    ],
  },
  {
    region: '中国・四国',
    cities: [
      { name: '鳥取市', lat: 35.5011, lon: 134.2351, label: '鳥取県' },
      { name: '松江市', lat: 35.4723, lon: 133.0505, label: '島根県' },
      { name: '岡山市', lat: 34.6617, lon: 133.9350, label: '岡山県' },
      { name: '倉敷市', lat: 34.5850, lon: 133.7720, label: '岡山県' },
      { name: '広島市', lat: 34.3853, lon: 132.4553, label: '広島県' },
      { name: '福山市', lat: 34.4860, lon: 133.3625, label: '広島県' },
      { name: '山口市', lat: 34.1861, lon: 131.4706, label: '山口県' },
      { name: '下関市', lat: 33.9508, lon: 130.9418, label: '山口県' },
      { name: '徳島市', lat: 34.0658, lon: 134.5593, label: '徳島県' },
      { name: '高松市', lat: 34.3401, lon: 134.0434, label: '香川県' },
      { name: '松山市', lat: 33.8392, lon: 132.7657, label: '愛媛県' },
      { name: '高知市', lat: 33.5597, lon: 133.5311, label: '高知県' },
    ],
  },
  {
    region: '九州・沖縄',
    cities: [
      { name: '福岡市', lat: 33.5904, lon: 130.4017, label: '福岡県' },
      { name: '北九州市', lat: 33.8834, lon: 130.8752, label: '福岡県' },
      { name: '久留米市', lat: 33.3191, lon: 130.5083, label: '福岡県' },
      { name: '佐賀市', lat: 33.2494, lon: 130.2988, label: '佐賀県' },
      { name: '長崎市', lat: 32.7503, lon: 129.8779, label: '長崎県' },
      { name: '熊本市', lat: 32.8032, lon: 130.7079, label: '熊本県' },
      { name: '大分市', lat: 33.2382, lon: 131.6126, label: '大分県' },
      { name: '宮崎市', lat: 31.9111, lon: 131.4239, label: '宮崎県' },
      { name: '鹿児島市', lat: 31.5602, lon: 130.5581, label: '鹿児島県' },
      { name: '那覇市', lat: 26.2124, lon: 127.6809, label: '沖縄県' },
    ],
  },
]

// Flat list for search fallback
const ALL_PRESETS = PRESET_REGIONS.flatMap((r) => r.cities)

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
      // Japanese input often returns nothing; fall back to preset matching
      if (res.length === 0 && /[^\x00-\x7F]/.test(query)) {
        const q = query.replace(/[市区町村県府都道]$/g, '')
        const matches = ALL_PRESETS.filter(
          (c) => c.name.includes(q) || c.label.includes(q)
        )
        if (matches.length > 0) {
          res = matches.map((c) => ({
            name: c.name,
            latitude: c.lat,
            longitude: c.lon,
            country: '日本',
            admin1: c.label,
          }))
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
          {gpsLoading ? '取得中...' : '📍 現在地から追加'}
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

        {/* Preset Cities by Region */}
        {showPresets && (
          <div className="space-y-3">
            {PRESET_REGIONS.map((region) => (
              <div key={region.region}>
                <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  {region.region}
                </h4>
                <div className="flex flex-wrap gap-1">
                  {region.cities.map((city) => (
                    <button
                      key={`${city.name}_${city.lat}`}
                      onClick={() => resolveAndAdd(city.name, city.lat, city.lon, city.label)}
                      className="px-2.5 py-1 text-xs rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                    >
                      {city.name}
                    </button>
                  ))}
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

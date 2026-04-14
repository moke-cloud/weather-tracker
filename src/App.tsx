import { useState, useEffect, useCallback } from 'react'
import type { Location } from './lib/types'
import { getLocations, addLocation, removeLocation } from './lib/db'
import { Dashboard } from './components/Dashboard'
import { LocationSearch } from './components/LocationSearch'

function App() {
  const [locations, setLocations] = useState<Location[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return (
        localStorage.getItem('theme') === 'dark' ||
        (!localStorage.getItem('theme') &&
          window.matchMedia('(prefers-color-scheme: dark)').matches)
      )
    }
    return false
  })

  useEffect(() => {
    getLocations().then(setLocations)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const handleAddLocation = useCallback(async (location: Location) => {
    await addLocation(location)
    setLocations(await getLocations())
    setShowSearch(false)
  }, [])

  const handleRemoveLocation = useCallback(async (id: string) => {
    await removeLocation(id)
    setLocations(await getLocations())
  }, [])

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <span>{'\uD83C\uDF24\uFE0F'}</span>
            TenkiTracker
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSearch(true)}
              className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              + 地点追加
            </button>
            <button
              onClick={() => setDarkMode((prev) => !prev)}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={darkMode ? 'ライトモード' : 'ダークモード'}
            >
              {darkMode ? '\u2600\uFE0F' : '\uD83C\uDF19'}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <Dashboard
          locations={locations}
          onRemoveLocation={handleRemoveLocation}
        />
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-4 py-4 text-xs text-slate-400 dark:text-slate-500 text-center border-t border-slate-200 dark:border-slate-700">
        <p>
          データソース: JMA AMeDAS (実測値) / Open-Meteo (JMA MSM, ECMWF IFS,
          GFS 予報 + アンサンブル)
        </p>
        <p className="mt-1">
          マルチモデル比較 + アンサンブル信頼帯で予報の確信度を可視化
        </p>
      </footer>

      {/* Location search modal */}
      {showSearch && (
        <LocationSearch
          onAdd={handleAddLocation}
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  )
}

export default App

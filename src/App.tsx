import { useState, useEffect, useCallback } from 'react'
import type { Location } from './lib/types'
import { getLocations, addLocation, removeLocation } from './lib/db'
import {
  isNotificationEnabled,
  enableNotifications,
  disableNotifications,
} from './lib/notifications'
import { Dashboard } from './components/Dashboard'
import { LocationSearch } from './components/LocationSearch'

function App() {
  const [locations, setLocations] = useState<Location[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [notifEnabled, setNotifEnabled] = useState(isNotificationEnabled)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
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

  // PWA install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Show banner if not already installed
      if (!window.matchMedia('(display-mode: standalone)').matches) {
        setShowInstallBanner(true)
      }
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setShowInstallBanner(false)
  }, [deferredPrompt])

  const handleAddLocation = useCallback(async (location: Location) => {
    await addLocation(location)
    setLocations(await getLocations())
    setShowSearch(false)
  }, [])

  const handleRemoveLocation = useCallback(async (id: string) => {
    await removeLocation(id)
    setLocations(await getLocations())
  }, [])

  const toggleNotifications = useCallback(async () => {
    if (notifEnabled) {
      disableNotifications()
      setNotifEnabled(false)
    } else {
      const granted = await enableNotifications()
      setNotifEnabled(granted)
    }
  }, [notifEnabled])

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      {/* PWA install banner */}
      {showInstallBanner && (
        <div className="bg-blue-600 text-white text-sm px-4 py-2 flex items-center justify-between">
          <span>TenkiTrackerをホーム画面に追加して素早くアクセス</span>
          <div className="flex gap-2">
            <button
              onClick={handleInstall}
              className="px-3 py-1 bg-white text-blue-600 rounded-lg text-xs font-medium"
            >
              インストール
            </button>
            <button
              onClick={() => setShowInstallBanner(false)}
              className="text-white/70 hover:text-white px-1"
            >
              {'\u2715'}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <span>{'\u{1F324}\uFE0F'}</span>
            TenkiTracker
          </h1>
          <div className="flex items-center gap-2">
            {/* Notification toggle */}
            <button
              onClick={toggleNotifications}
              className={`p-2 rounded-lg transition-colors ${
                notifEnabled
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400'
              }`}
              title={notifEnabled ? '通知ON' : '通知OFF'}
            >
              {notifEnabled ? '\u{1F514}' : '\u{1F515}'}
            </button>
            <button
              onClick={() => setShowSearch(true)}
              className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              + 地点追加
            </button>
            <button
              onClick={() => setDarkMode(prev => !prev)}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={darkMode ? 'ライトモード' : 'ダークモード'}
            >
              {darkMode ? '\u2600\uFE0F' : '\u{1F319}'}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <Dashboard locations={locations} onRemoveLocation={handleRemoveLocation} />
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-4 py-4 text-xs text-slate-400 dark:text-slate-500 text-center border-t border-slate-200 dark:border-slate-700">
        <p>
          データソース: JMA AMeDAS (実測値) / Open-Meteo (JMA MSM, ECMWF IFS, GFS 予報 + アンサンブル)
        </p>
        <p className="mt-1">
          マルチモデル比較 + アンサンブル信頼帯で予報の確信度を可視化 | 頭痛予測は医学論文ベースの多因子モデル
        </p>
      </footer>

      {/* Location search modal */}
      {showSearch && (
        <LocationSearch onAdd={handleAddLocation} onClose={() => setShowSearch(false)} />
      )}
    </div>
  )
}

// PWA beforeinstallprompt type
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default App

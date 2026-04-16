import { useState, useEffect, useCallback, useRef } from 'react'
import type { Location } from './lib/types'
import { getLocations, addLocation, removeLocation } from './lib/db'
import {
  isNotificationEnabled,
  enableNotifications,
  disableNotifications,
} from './lib/notifications'
import { Dashboard } from './components/Dashboard'
import { LocationSearch } from './components/LocationSearch'

/* ── Platform detection ── */

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Mac') && 'ontouchend' in document)
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as unknown as { standalone: boolean }).standalone)
}

function App() {
  const [locations, setLocations] = useState<Location[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [showInstallGuide, setShowInstallGuide] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [notifEnabled, setNotifEnabled] = useState(isNotificationEnabled)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone)
  const menuRef = useRef<HTMLDivElement>(null)
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

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  // PWA install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    const installedHandler = () => setInstalled(true)
    window.addEventListener('appinstalled', installedHandler)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
    }
  }, [])

  const handleInstall = useCallback(async () => {
    setShowMenu(false)
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const result = await deferredPrompt.userChoice
      if (result.outcome === 'accepted') setInstalled(true)
      setDeferredPrompt(null)
    } else {
      setShowInstallGuide(true)
    }
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
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <span>{'\u{1F324}\uFE0F'}</span>
            TenkiTracker
          </h1>
          <div className="flex items-center gap-1.5">
            {/* Add location - icon only */}
            <button
              onClick={() => setShowSearch(true)}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-blue-600 dark:text-blue-400"
              title="地点追加"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="10" cy="10" r="8" />
                <line x1="10" y1="6" x2="10" y2="14" />
                <line x1="6" y1="10" x2="14" y2="10" />
              </svg>
            </button>

            {/* Menu button */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu(v => !v)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400"
                title="メニュー"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <circle cx="10" cy="4" r="1.5" />
                  <circle cx="10" cy="10" r="1.5" />
                  <circle cx="10" cy="16" r="1.5" />
                </svg>
              </button>

              {/* Dropdown menu */}
              {showMenu && (
                <div className="absolute right-0 mt-1 w-52 rounded-xl bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-50">
                  {!installed && (
                    <MenuItem
                      icon={'\u{2B07}\uFE0F'}
                      label="アプリをインストール"
                      onClick={handleInstall}
                    />
                  )}
                  <MenuItem
                    icon={notifEnabled ? '\u{1F514}' : '\u{1F515}'}
                    label={notifEnabled ? '通知をOFFにする' : '通知をONにする'}
                    onClick={() => { toggleNotifications(); setShowMenu(false) }}
                    accent={notifEnabled}
                  />
                  <MenuItem
                    icon={darkMode ? '\u2600\uFE0F' : '\u{1F319}'}
                    label={darkMode ? 'ライトモード' : 'ダークモード'}
                    onClick={() => { setDarkMode(v => !v); setShowMenu(false) }}
                  />
                </div>
              )}
            </div>
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
          データソース: JMA AMeDAS / Open-Meteo (JMA MSM, ECMWF IFS, GFS + アンサンブル)
        </p>
        <p className="mt-1">
          頭痛予測: 医学論文ベース多因子モデル (Kimoto 2011, Mukamal 2009 他)
        </p>
      </footer>

      {/* Location search modal */}
      {showSearch && (
        <LocationSearch onAdd={handleAddLocation} onClose={() => setShowSearch(false)} />
      )}

      {/* Install guide modal */}
      {showInstallGuide && (
        <InstallGuide onClose={() => setShowInstallGuide(false)} />
      )}
    </div>
  )
}

/* ── Menu item ── */

function MenuItem({
  icon,
  label,
  onClick,
  accent,
}: {
  icon: string
  label: string
  onClick: () => void
  accent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${
        accent
          ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30'
          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
      }`}
    >
      <span className="text-base">{icon}</span>
      {label}
    </button>
  )
}

/* ── Install guide modal ── */

function InstallGuide({ onClose }: { onClose: () => void }) {
  const ios = isIOS()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-5">
        <h2 className="text-lg font-bold mb-3">アプリをインストール</h2>

        {ios ? (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600 dark:text-slate-300">
              iPhoneやiPadにインストールするには:
            </p>
            <div className="space-y-2">
              <Step n={1} text={'Safari下部の共有ボタン \u{1F4E4} をタップ'} />
              <Step n={2} text={'"ホーム画面に追加" をタップ'} />
              <Step n={3} text={'"追加" をタップして完了'} />
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              ※ Safari以外のブラウザではインストールできません
            </p>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600 dark:text-slate-300">
              PCやAndroidにインストールするには:
            </p>
            <div className="space-y-2">
              <Step n={1} text={'アドレスバー右端の \u{2B07}\uFE0F アイコンをクリック'} />
              <Step n={2} text={'または ブラウザメニュー \u22EE →「アプリをインストール」'} />
              <Step n={3} text={'"インストール" をクリックして完了'} />
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              ※ Chrome, Edge, Samsung Internet に対応
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
        >
          閉じる
        </button>
      </div>
    </div>
  )
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold flex items-center justify-center">
        {n}
      </span>
      <span className="text-slate-700 dark:text-slate-200 pt-0.5">{text}</span>
    </div>
  )
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default App

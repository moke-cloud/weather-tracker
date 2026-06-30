import { useState, useEffect, useCallback, useRef } from 'react'
import type { Location } from './lib/types'
import { getLocations, addLocation, removeLocation } from './lib/db'
import {
  isNotificationEnabled,
  enableNotifications,
  disableNotifications,
  sendTestNotification,
} from './lib/notifications'
import { Dashboard } from './components/Dashboard'
import { LocationSearch } from './components/LocationSearch'
import { WeatherIcon } from './components/WeatherIcon'
import { DownloadIcon, BellIcon, BellOffIcon, SunIcon, MoonIcon } from './components/icons'
import { ambientGlow } from './lib/sky'

/* ── Platform detection ── */

type Platform = 'ios' | 'android' | 'desktop'

function detectPlatform(): Platform {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
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
  const [notifEnabled, setNotifEnabled] = useState(false)
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
    isNotificationEnabled().then(setNotifEnabled)
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
    <div className="relative min-h-dvh">
      {/* 大気のアンビエント光 (時間帯で変化・ごく控えめ) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[40vh] z-0"
        style={{ background: ambientGlow(new Date()) }}
      />

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-canvas/75 border-b border-line">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-display text-xl font-bold flex items-center gap-2">
            <WeatherIcon code={2} size={24} className="text-ink-muted" />
            TenkiTracker
          </h1>
          <div className="flex items-center gap-1.5">
            {/* Add location - icon only */}
            <button
              onClick={() => setShowSearch(true)}
              className="p-2 rounded-md text-accent-strong hover:bg-accent-soft transition-colors duration-200 ease-out"
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
                className="p-2 rounded-md text-ink-subtle hover:bg-surface-sunk hover:text-ink transition-colors duration-200 ease-out"
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
                <div className="absolute right-0 mt-2 w-52 rounded-lg bg-surface-raised shadow-lg border border-line py-1 z-50">
                  {!installed && (
                    <MenuItem
                      icon={<DownloadIcon size={16} />}
                      label="アプリをインストール"
                      onClick={handleInstall}
                    />
                  )}
                  <MenuItem
                    icon={notifEnabled ? <BellIcon size={16} /> : <BellOffIcon size={16} />}
                    label={notifEnabled ? '通知をOFFにする' : '通知をONにする'}
                    onClick={() => { toggleNotifications(); setShowMenu(false) }}
                    accent={notifEnabled}
                  />
                  {notifEnabled && (
                    <MenuItem
                      icon={<BellIcon size={16} />}
                      label="通知をテスト"
                      onClick={() => { sendTestNotification(); setShowMenu(false) }}
                    />
                  )}
                  <MenuItem
                    icon={darkMode ? <SunIcon size={16} /> : <MoonIcon size={16} />}
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
      <main className="relative z-10 max-w-4xl mx-auto px-4 py-8">
        <Dashboard locations={locations} onRemoveLocation={handleRemoveLocation} />
      </main>

      {/* Footer */}
      <footer className="relative z-10 max-w-4xl mx-auto px-4 py-6 text-xs text-ink-subtle text-center border-t border-line">
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
  icon: React.ReactNode
  label: string
  onClick: () => void
  accent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors duration-200 ease-out ${
        accent
          ? 'text-accent-strong hover:bg-accent-soft'
          : 'text-ink hover:bg-surface-sunk'
      }`}
    >
      <span className="shrink-0 text-ink-muted">{icon}</span>
      {label}
    </button>
  )
}

/* ── Install guide modal ── */

function InstallGuide({ onClose }: { onClose: () => void }) {
  const platform = detectPlatform()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-surface-raised rounded-xl shadow-lg p-5">
        <h2 className="font-display text-lg font-bold mb-3">アプリをインストール</h2>

        {platform === 'ios' && (
          <div className="space-y-3 text-sm">
            <p className="text-ink-muted">
              iPhone / iPad にインストール:
            </p>
            <div className="space-y-2">
              <Step n={1} text={'Safariで開き、下部の共有ボタン \u{1F4E4} をタップ'} />
              <Step n={2} text={'"ホーム画面に追加" をタップ'} />
              <Step n={3} text={'"追加" をタップして完了'} />
            </div>
            <p className="text-xs text-ink-subtle">
              ※ Safari でのみインストール可能です
            </p>
          </div>
        )}

        {platform === 'android' && (
          <div className="space-y-3 text-sm">
            <p className="text-ink-muted">
              Android にインストール:
            </p>
            <div className="space-y-4">
              <div>
                <p className="font-medium text-ink mb-1.5">Chrome の場合</p>
                <div className="space-y-2">
                  <Step n={1} text={'右上メニュー \u22EE をタップ'} />
                  <Step n={2} text={'"アプリをインストール" をタップ'} />
                </div>
              </div>
              <div>
                <p className="font-medium text-ink mb-1.5">Firefox / その他のブラウザ</p>
                <div className="space-y-2">
                  <Step n={1} text={'右上メニュー \u22EE をタップ'} />
                  <Step n={2} text={'"ホーム画面に追加" をタップ'} />
                </div>
              </div>
            </div>
            <p className="text-xs text-ink-subtle">
              ※ Chrome を推奨（通知機能も利用可能）
            </p>
          </div>
        )}

        {platform === 'desktop' && (
          <div className="space-y-3 text-sm">
            <p className="text-ink-muted">
              PC にインストール:
            </p>
            <div className="space-y-2">
              <Step n={1} text={'アドレスバー右端の \u{2B07}\uFE0F アイコンをクリック'} />
              <Step n={2} text={'または ブラウザメニュー \u22EE \u2192「アプリをインストール」'} />
              <Step n={3} text={'"インストール" をクリックして完了'} />
            </div>
            <p className="text-xs text-ink-subtle">
              ※ Chrome / Edge に対応
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full py-2 text-sm font-medium text-ink-muted hover:text-ink transition-colors duration-200 ease-out"
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
      <span className="nums shrink-0 w-6 h-6 rounded-full bg-accent-soft text-accent-strong text-xs font-bold flex items-center justify-center">
        {n}
      </span>
      <span className="text-ink pt-0.5">{text}</span>
    </div>
  )
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default App

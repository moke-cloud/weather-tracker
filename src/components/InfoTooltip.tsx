import { useState, useRef, useEffect, useCallback } from 'react'
import { GLOSSARY, type GlossaryKey } from '../lib/glossary'

interface InfoTooltipProps {
  /** 用語辞書 (glossary.ts) のキー。これを指定すると title/body が自動で入る */
  term?: GlossaryKey
  /** 用語辞書を使わず独自文言を指定する場合のタイトル */
  title?: string
  /** 用語辞書を使わず独自文言を指定する場合の本文 */
  body?: string
  /** アイコンサイズ調整 (Tailwind text-xs / text-sm 等) */
  className?: string
  /** 吹き出しの位置。デフォルト: auto (画面端を避けて自動判定) */
  position?: 'top' | 'bottom' | 'auto'
}

/**
 * (i) アイコン + ホバー/タップで説明を表示するツールチップ。
 * - PC: ホバー表示
 * - モバイル: タップでトグル、外側タップで閉じる
 * - キーボード: フォーカス時に表示
 */
export function InfoTooltip({
  term,
  title,
  body,
  className = 'text-slate-400 dark:text-slate-500',
  position = 'auto',
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false)
  const [placeAbove, setPlaceAbove] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const iconRef = useRef<HTMLButtonElement>(null)

  const content = term ? GLOSSARY[term] : { title: title ?? '', body: body ?? '' }

  const updatePlacement = useCallback(() => {
    if (position !== 'auto') {
      setPlaceAbove(position === 'top')
      return
    }
    const rect = iconRef.current?.getBoundingClientRect()
    if (!rect) return
    const spaceBelow = window.innerHeight - rect.bottom
    setPlaceAbove(spaceBelow < 180)
  }, [position])

  useEffect(() => {
    if (!open) return
    updatePlacement()
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open, updatePlacement])

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex items-center align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={iconRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label={`${content.title} の説明を表示`}
        aria-expanded={open}
        className={`inline-flex items-center justify-center w-4 h-4 rounded-full border border-current opacity-60 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-opacity ${className}`}
      >
        <span className="text-[9px] font-bold leading-none select-none">i</span>
      </button>
      {open && content.title && (
        <span
          role="tooltip"
          className={`absolute z-50 left-1/2 -translate-x-1/2 w-64 max-w-[80vw] rounded-lg bg-slate-900 dark:bg-slate-700 text-slate-100 text-xs leading-relaxed shadow-xl p-2.5 pointer-events-none ${
            placeAbove ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          <span className="block font-bold mb-1">{content.title}</span>
          <span className="block font-normal">{content.body}</span>
        </span>
      )}
    </span>
  )
}

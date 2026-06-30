import type { HeadacheRiskLevel } from './types'

/**
 * 通知のタイトル/本文を組み立てる純粋関数。
 * ページ (new Notification) と Service Worker (showNotification) の両方から使い、
 * 文言が二重管理にならないよう一箇所にまとめる。
 */
const LEVEL_MARK: Record<HeadacheRiskLevel, string> = {
  safe: '',
  low: '',
  moderate: '⚠️',
  high: '\u{1F6A8}',
  critical: '\u{1F198}',
}

const ICON = '/weather-tracker/icon-192.png'
const TAG = 'headache-risk'

export interface NotificationContent {
  title: string
  body: string
  icon: string
  tag: string
}

export function buildNotification(
  level: HeadacheRiskLevel,
  label: string,
  summary: string,
): NotificationContent {
  const mark = LEVEL_MARK[level]
  const title = `${mark ? mark + ' ' : ''}TenkiTracker: 頭痛リスク${label}`
  return { title, body: summary, icon: ICON, tag: TAG }
}

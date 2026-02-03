'use client'

interface MessageStatusProps {
  isRead: boolean
  isSent?: boolean
}

export default function MessageStatus({ isRead, isSent = true }: MessageStatusProps) {
  if (!isSent) {
    // 发送中
    return (
      <svg className="w-4 h-4 text-[var(--color-ink)]/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="32" className="animate-spin" />
      </svg>
    )
  }

  if (isRead) {
    // 已读 - 双勾红色
    return (
      <svg className="w-4 h-4 text-[var(--color-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M2 12l5 5L18 6" />
        <path d="M7 12l5 5L23 6" />
      </svg>
    )
  }

  // 已发送 - 双勾灰色
  return (
    <svg className="w-4 h-4 text-[var(--color-ink)]/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M2 12l5 5L18 6" />
      <path d="M7 12l5 5L23 6" />
    </svg>
  )
}

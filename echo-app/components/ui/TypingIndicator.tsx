'use client'

interface TypingIndicatorProps {
  name?: string
}

export default function TypingIndicator({ name }: TypingIndicatorProps) {
  return (
    <div className="flex items-center gap-2 font-mono text-xs text-[var(--color-ink)]/50 uppercase tracking-wider">
      <div className="flex gap-0.5">
        <span className="w-1 h-1 bg-[var(--color-ink)]/30 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1 h-1 bg-[var(--color-ink)]/30 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1 h-1 bg-[var(--color-ink)]/30 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span>{name ? `${name} typing...` : 'typing...'}</span>
    </div>
  )
}

'use client'

interface OnlineIndicatorProps {
  isOnline: boolean
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

export default function OnlineIndicator({
  isOnline,
  size = 'md',
  showLabel = false,
  className = '',
}: OnlineIndicatorProps) {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span
        className={`
          ${sizeClasses[size]} 
          ${isOnline 
            ? 'bg-[var(--color-accent)]' 
            : 'bg-[var(--color-ink)]/20'
          }
          transition-colors duration-300
        `}
      />
      {showLabel && (
        <span className={`font-mono text-xs uppercase tracking-wider ${isOnline ? 'text-[var(--color-accent)]' : 'text-[var(--color-ink)]/40'}`}>
          {isOnline ? 'LIVE' : 'OFFLINE'}
        </span>
      )}
    </div>
  )
}

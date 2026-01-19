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
          rounded-full 
          ${isOnline 
            ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' 
            : 'bg-gray-300 dark:bg-gray-600'
          }
          transition-colors duration-300
        `}
      />
      {showLabel && (
        <span className={`text-xs ${isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
          {isOnline ? '在线' : '离线'}
        </span>
      )}
    </div>
  )
}

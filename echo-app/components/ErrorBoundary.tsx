'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-paper)]">
          <div className="text-center px-6 max-w-md">
            {/* 错误图标 */}
            <div className="w-16 h-16 mx-auto mb-6 border border-[var(--color-ink)]/20 flex items-center justify-center">
              <svg 
                width="32" 
                height="32" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="1.5"
                className="text-[var(--color-accent)]"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            
            {/* 标题 */}
            <h1 className="font-serif text-2xl italic text-[var(--color-ink)] mb-3">
              出了一点问题
            </h1>
            
            {/* 描述 */}
            <p className="font-mono text-sm text-[var(--color-ink)]/60 mb-6">
              页面加载时发生错误，请刷新重试
            </p>
            
            {/* 错误详情（开发模式） */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-6 p-4 border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 text-left">
                <p className="font-mono text-xs text-[var(--color-accent)] break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}
            
            {/* 刷新按钮 */}
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-[var(--color-ink)] text-[var(--color-paper)] font-mono text-sm uppercase tracking-widest hover:bg-[var(--color-ink)]/80 transition-colors"
            >
              刷新页面 →
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary

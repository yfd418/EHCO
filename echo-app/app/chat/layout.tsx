'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import ErrorBoundary from '@/components/ErrorBoundary'

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      router.push('/')
      return
    }

    // 检查登录状态
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push('/')
        return
      }

      setLoading(false)
    }

    checkAuth()

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          router.push('/')
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [router])

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-paper)]">
        <div className="text-center">
          <h1 className="font-serif text-4xl font-normal italic text-[var(--color-ink)] mb-3">Echo.</h1>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-ink)]/40">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <div className="h-screen flex overflow-hidden bg-[var(--color-paper)]">
        {children}
      </div>
    </ErrorBoundary>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ThemeToggle from '@/components/ThemeToggle'
import { AvatarUpload } from '@/components/ui'
import type { Profile } from '@/types'

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<Profile | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (profile) {
        setUser(profile)
        setDisplayName(profile.display_name || '')
      }
    }

    fetchUser()
  }, [router])

  const handleSave = async () => {
    if (!user) return

    setSaving(true)
    setMessage(null)

    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() || null })
      .eq('id', user.id)

    if (error) {
      setMessage({ type: 'error', text: '保存失败: ' + error.message })
    } else {
      setMessage({ type: 'success', text: '保存成功！' })
      setUser({ ...user, display_name: displayName.trim() || null })
    }

    setSaving(false)
  }

  const handleAvatarUpload = (url: string) => {
    if (user) {
      setUser({ ...user, avatar_url: url })
    }
    setMessage({ type: 'success', text: '头像更新成功！' })
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-paper)]">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-ink)]/40">加载中...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-paper)]">
      {/* 头部 - 杂志风格 */}
      <div className="border-b border-[var(--color-ink)]/10">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-[var(--color-ink)]/5 text-[var(--color-ink)]/60"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="font-serif text-xl italic text-[var(--color-ink)]">Settings</h1>
          </div>
          <ThemeToggle />
        </div>
      </div>

      {/* 内容 */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* 消息提示 - 杂志风格 */}
        {message && (
          <div
            className={`mb-6 p-4 font-mono text-sm border-l-4 ${
              message.type === 'success'
                ? 'border-l-emerald-600 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-800 dark:text-emerald-300'
                : 'border-l-[var(--color-accent)] bg-red-50/50 dark:bg-red-900/10 text-red-800 dark:text-red-300'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* 头像区域 - 杂志风格 */}
        <div className="border border-[var(--color-ink)]/10 p-6 mb-6">
          <h2 className="font-mono text-xs uppercase tracking-widest text-[var(--color-ink)]/60 mb-4">头像</h2>
          <div className="flex items-center gap-6">
            <AvatarUpload
              userId={user.id}
              currentAvatarUrl={user.avatar_url}
              username={user.username}
              onUploadComplete={handleAvatarUpload}
            />
            <div>
              <p className="font-mono text-sm text-[var(--color-ink)]/70">
                点击头像更换
              </p>
              <p className="font-mono text-xs text-[var(--color-ink)]/40 mt-1">
                支持 JPG、PNG 格式，最大 2MB
              </p>
            </div>
          </div>
        </div>

        {/* 基本信息 - 杂志风格 */}
        <div className="border border-[var(--color-ink)]/10 p-6 mb-6">
          <h2 className="font-mono text-xs uppercase tracking-widest text-[var(--color-ink)]/60 mb-4">基本信息</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block font-mono text-xs uppercase tracking-widest text-[var(--color-ink)]/40 mb-2">
                用户名
              </label>
              <input
                type="text"
                value={user.username}
                disabled
                className="w-full px-0 py-3 bg-transparent border-b border-[var(--color-ink)]/10 text-[var(--color-ink)]/50 font-mono text-sm cursor-not-allowed"
              />
              <p className="font-mono text-xs text-[var(--color-ink)]/30 mt-1">用户名不可修改</p>
            </div>

            <div>
              <label className="block font-mono text-xs uppercase tracking-widest text-[var(--color-ink)]/40 mb-2">
                昵称
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="设置一个昵称"
                className="w-full px-0 py-3 bg-transparent border-b border-[var(--color-ink)]/20 text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-ink)] transition-all"
              />
            </div>
          </div>
        </div>

        {/* 保存按钮 - 杂志风格 */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-[var(--color-ink)] text-[var(--color-paper)] font-mono uppercase tracking-widest text-sm hover:bg-[var(--color-ink)]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? '保存中...' : '保存修改 →'}
        </button>

        {/* 账号信息 - 杂志风格 */}
        <div className="border border-[var(--color-ink)]/10 p-6 mt-6">
          <h2 className="font-mono text-xs uppercase tracking-widest text-[var(--color-ink)]/60 mb-4">账号信息</h2>
          <div className="font-mono text-xs text-[var(--color-ink)]/50 space-y-2">
            <p>ID: {user.id}</p>
            <p>注册时间: {new Date(user.updated_at || '').toLocaleDateString()}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

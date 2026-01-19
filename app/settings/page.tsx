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
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0F0F0F]">
        <p className="text-gray-400">加载中...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] dark:bg-[#0F0F0F]">
      {/* 头部 */}
      <div className="glass-heavy border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-600 dark:text-gray-400"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="font-medium text-gray-900 dark:text-white">设置</h1>
          </div>
          <ThemeToggle />
        </div>
      </div>

      {/* 内容 */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* 消息提示 */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-xl text-sm ${
              message.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* 头像区域 */}
        <div className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-sm font-medium text-gray-900 dark:text-white mb-4">头像</h2>
          <div className="flex items-center gap-6">
            <AvatarUpload
              userId={user.id}
              currentAvatarUrl={user.avatar_url}
              username={user.username}
              onUploadComplete={handleAvatarUpload}
            />
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                点击头像更换
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                支持 JPG、PNG 格式，最大 2MB
              </p>
            </div>
          </div>
        </div>

        {/* 基本信息 */}
        <div className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-sm font-medium text-gray-900 dark:text-white mb-4">基本信息</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                用户名
              </label>
              <input
                type="text"
                value={user.username}
                disabled
                className="w-full px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm cursor-not-allowed"
              />
              <p className="text-xs text-gray-400 mt-1">用户名不可修改</p>
            </div>

            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                昵称
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="设置一个昵称"
                className="w-full px-4 py-3 rounded-xl glass-input dark:text-white text-sm focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* 保存按钮 */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-black dark:bg-white text-white dark:text-black rounded-xl font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? '保存中...' : '保存修改'}
        </button>

        {/* 账号信息 */}
        <div className="glass-card rounded-2xl p-6 mt-6">
          <h2 className="text-sm font-medium text-gray-900 dark:text-white mb-4">账号信息</h2>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            <p>用户 ID: {user.id}</p>
            <p className="mt-1">注册时间: {new Date(user.updated_at || '').toLocaleDateString()}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import ThemeToggle from '@/components/ThemeToggle'

type AuthMode = 'login' | 'register' | 'magic-link'

export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 未配置 Supabase 时显示配置提示
  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] dark:bg-[#0F0F0F] px-4">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-lg text-center">
          <h1 className="font-serif text-5xl font-semibold tracking-tight text-black dark:text-white mb-4">
            Echo
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">
            Less noise, more signal.
          </p>
          
          <div className="bg-white dark:bg-[#1A1A1A] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-8 text-left">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-lg font-medium dark:text-white">需要配置 Supabase</h2>
            </div>
            
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
              请按以下步骤完成配置：
            </p>
            
            <ol className="space-y-4 text-sm">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs flex items-center justify-center">1</span>
                <div>
                  <p className="font-medium dark:text-white">创建 Supabase 项目</p>
                  <p className="text-gray-500 dark:text-gray-400">访问 <a href="https://supabase.com" target="_blank" className="text-black dark:text-white underline">supabase.com</a> 创建免费项目</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs flex items-center justify-center">2</span>
                <div>
                  <p className="font-medium dark:text-white">运行数据库初始化脚本</p>
                  <p className="text-gray-500 dark:text-gray-400">在 SQL Editor 中运行 <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs">supabase/init.sql</code></p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs flex items-center justify-center">3</span>
                <div>
                  <p className="font-medium dark:text-white">配置环境变量</p>
                  <p className="text-gray-500 dark:text-gray-400">编辑 <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs">.env.local</code> 文件</p>
                  <pre className="mt-2 bg-gray-900 text-gray-100 p-3 rounded-lg text-xs overflow-x-auto">
{`NEXT_PUBLIC_SUPABASE_URL=你的项目URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的Anon Key`}
                  </pre>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs flex items-center justify-center">4</span>
                <div>
                  <p className="font-medium dark:text-white">重启开发服务器</p>
                  <p className="text-gray-500 dark:text-gray-400">运行 <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs">npm run dev</code></p>
                </div>
              </li>
            </ol>
          </div>
          
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-6">
            回归纯粹沟通，拒绝社交噪音
          </p>
        </div>
      </div>
    )
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      router.push('/chat')
    }
    setLoading(false)
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    // 注册用户（通过 metadata 传递 username，触发器会自动创建 profile）
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username.toLowerCase(),
          display_name: displayName || username,
        }
      }
    })

    if (authError) {
      setMessage({ type: 'error', text: authError.message })
      setLoading(false)
      return
    }

    if (authData.user) {
      setMessage({ type: 'success', text: '注册成功！请查收验证邮件。' })
    }
    setLoading(false)
  }

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/chat`,
      },
    })

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: '魔法链接已发送，请查收邮件！' })
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-[#0a0a0a] dark:via-[#0F0F0F] dark:to-[#1a1a1a] px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="font-serif text-5xl font-semibold tracking-tight text-black dark:text-white">
            Echo
          </h1>
          <p className="mt-3 text-gray-500 dark:text-gray-400 text-sm">
            Less noise, more signal.
          </p>
        </div>

        {/* 表单卡片 - 液态玻璃效果 */}
        <div className="glass-card rounded-2xl p-8">
          {/* 模式切换标签 */}
          <div className="flex space-x-1 bg-white/50 dark:bg-black/30 rounded-xl p-1 mb-8 border border-white/30 dark:border-white/5">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === 'login'
                  ? 'glass-button text-black dark:text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              登录
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === 'register'
                  ? 'glass-button text-black dark:text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              注册
            </button>
            <button
              onClick={() => setMode('magic-link')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === 'magic-link'
                  ? 'glass-button text-black dark:text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              魔法链接
            </button>
          </div>

          {/* 消息提示 */}
          {message && (
            <div
              className={`mb-6 p-4 rounded-xl text-sm ${
                message.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-800'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* 登录表单 */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  邮箱
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl glass-input dark:text-white focus:outline-none transition-all"
                  placeholder="your@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  密码
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl glass-input dark:text-white focus:outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-black dark:bg-white text-white dark:text-black rounded-xl font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '登录中...' : '登录'}
              </button>
            </form>
          )}

          {/* 注册表单 */}
          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  用户名 <span className="text-gray-400">(用于添加好友)</span>
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  className="w-full px-4 py-3 rounded-xl glass-input dark:text-white focus:outline-none transition-all"
                  placeholder="your_username"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  昵称 <span className="text-gray-400">(可选)</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl glass-input dark:text-white focus:outline-none transition-all"
                  placeholder="你的昵称"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  邮箱
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl glass-input dark:text-white focus:outline-none transition-all"
                  placeholder="your@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  密码
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 rounded-xl glass-input dark:text-white focus:outline-none transition-all"
                  placeholder="至少 6 位"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-black dark:bg-white text-white dark:text-black rounded-xl font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '注册中...' : '创建账户'}
              </button>
            </form>
          )}

          {/* 魔法链接表单 */}
          {mode === 'magic-link' && (
            <form onSubmit={handleMagicLink} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  邮箱
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl glass-input dark:text-white focus:outline-none transition-all"
                  placeholder="your@email.com"
                />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                我们将发送一个登录链接到你的邮箱，点击即可登录，无需密码。
              </p>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-black dark:bg-white text-white dark:text-black rounded-xl font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '发送中...' : '发送魔法链接'}
              </button>
            </form>
          )}
        </div>

        {/* 底部文字 */}
        <p className="text-center text-gray-400 dark:text-gray-500 text-xs mt-8">
          回归纯粹沟通，拒绝社交噪音
        </p>
      </div>
    </div>
  )
}

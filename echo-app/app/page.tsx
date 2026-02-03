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
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-paper)] px-4">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-lg text-center">
          <h1 className="font-serif text-5xl font-normal italic tracking-tight text-[var(--color-ink)] mb-4">
            Echo.
          </h1>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-ink)]/60 mb-8">
            Less noise, more signal
          </p>
          
          <div className="border border-[var(--color-ink)]/10 p-8 text-left">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[var(--color-ink)]/10">
              <span className="text-[var(--color-accent)] text-2xl">⚠</span>
              <h2 className="font-serif text-xl text-[var(--color-ink)]">需要配置 Supabase</h2>
            </div>
            
            <p className="font-mono text-xs text-[var(--color-ink)]/60 mb-6 uppercase tracking-wider">
              请按以下步骤完成配置：
            </p>
            
            <ol className="space-y-6">
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 border border-[var(--color-ink)] text-[var(--color-ink)] font-mono text-sm flex items-center justify-center">01</span>
                <div>
                  <p className="font-serif text-lg text-[var(--color-ink)]">创建 Supabase 项目</p>
                  <p className="font-mono text-xs text-[var(--color-ink)]/50 mt-1">访问 <a href="https://supabase.com" target="_blank" className="text-[var(--color-accent)] underline">supabase.com</a> 创建免费项目</p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 border border-[var(--color-ink)] text-[var(--color-ink)] font-mono text-sm flex items-center justify-center">02</span>
                <div>
                  <p className="font-serif text-lg text-[var(--color-ink)]">运行数据库初始化脚本</p>
                  <p className="font-mono text-xs text-[var(--color-ink)]/50 mt-1">在 SQL Editor 中运行 <code className="text-[var(--color-accent)]">supabase/init.sql</code></p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 border border-[var(--color-ink)] text-[var(--color-ink)] font-mono text-sm flex items-center justify-center">03</span>
                <div>
                  <p className="font-serif text-lg text-[var(--color-ink)]">配置环境变量</p>
                  <p className="font-mono text-xs text-[var(--color-ink)]/50 mt-1">编辑 <code className="text-[var(--color-accent)]">.env.local</code> 文件</p>
                  <pre className="mt-3 bg-[var(--color-ink)] text-[var(--color-paper)] p-4 font-mono text-xs overflow-x-auto">
{`NEXT_PUBLIC_SUPABASE_URL=你的项目URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的Anon Key`}
                  </pre>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 border border-[var(--color-ink)] text-[var(--color-ink)] font-mono text-sm flex items-center justify-center">04</span>
                <div>
                  <p className="font-serif text-lg text-[var(--color-ink)]">重启开发服务器</p>
                  <p className="font-mono text-xs text-[var(--color-ink)]/50 mt-1">运行 <code className="text-[var(--color-accent)]">npm run dev</code></p>
                </div>
              </li>
            </ol>
          </div>
          
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-ink)]/40 mt-8">
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
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-paper)] px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        {/* Logo - 杂志风格 */}
        <div className="text-center mb-12">
          <h1 className="font-serif text-6xl font-normal italic tracking-tight text-[var(--color-ink)]">
            Echo.
          </h1>
          <div className="mt-4 flex items-center justify-center gap-4">
            <span className="h-px w-12 bg-[var(--color-ink)]/30"></span>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-ink)]/60">
              Less noise, more signal
            </p>
            <span className="h-px w-12 bg-[var(--color-ink)]/30"></span>
          </div>
        </div>

        {/* 表单卡片 - 杂志风格 */}
        <div className="border border-[var(--color-ink)]/10 p-8">
          {/* 模式切换标签 - 杂志风格 */}
          <div className="flex border-b border-[var(--color-ink)]/20 mb-8">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-3 font-mono text-sm uppercase tracking-widest transition-all border-b-2 -mb-px ${
                mode === 'login'
                  ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
                  : 'border-transparent text-[var(--color-ink)]/40 hover:text-[var(--color-ink)]/70'
              }`}
            >
              登录
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 py-3 font-mono text-sm uppercase tracking-widest transition-all border-b-2 -mb-px ${
                mode === 'register'
                  ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
                  : 'border-transparent text-[var(--color-ink)]/40 hover:text-[var(--color-ink)]/70'
              }`}
            >
              注册
            </button>
            <button
              onClick={() => setMode('magic-link')}
              className={`flex-1 py-3 font-mono text-sm uppercase tracking-widest transition-all border-b-2 -mb-px ${
                mode === 'magic-link'
                  ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
                  : 'border-transparent text-[var(--color-ink)]/40 hover:text-[var(--color-ink)]/70'
              }`}
            >
              魔法链接
            </button>
          </div>

          {/* 消息提示 */}
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

          {/* 登录表单 */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block font-mono text-xs uppercase tracking-widest text-[var(--color-ink)]/60 mb-2">
                  邮箱
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-0 py-3 bg-transparent border-b border-[var(--color-ink)]/20 text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-ink)] transition-all"
                  placeholder="your@email.com"
                />
              </div>
              <div>
                <label className="block font-mono text-xs uppercase tracking-widest text-[var(--color-ink)]/60 mb-2">
                  密码
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-0 py-3 bg-transparent border-b border-[var(--color-ink)]/20 text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-ink)] transition-all"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[var(--color-ink)] text-[var(--color-paper)] font-mono uppercase tracking-widest text-sm hover:bg-[var(--color-ink)]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '登录中...' : '登录 →'}
              </button>
            </form>
          )}

          {/* 注册表单 */}
          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-5">
              <div>
                <label className="block font-mono text-xs uppercase tracking-widest text-[var(--color-ink)]/60 mb-2">
                  用户名 <span className="normal-case">(用于添加好友)</span>
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  className="w-full px-0 py-3 bg-transparent border-b border-[var(--color-ink)]/20 text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-ink)] transition-all"
                  placeholder="your_username"
                />
              </div>
              <div>
                <label className="block font-mono text-xs uppercase tracking-widest text-[var(--color-ink)]/60 mb-2">
                  昵称 <span className="normal-case">(可选)</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-0 py-3 bg-transparent border-b border-[var(--color-ink)]/20 text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-ink)] transition-all"
                  placeholder="你的昵称"
                />
              </div>
              <div>
                <label className="block font-mono text-xs uppercase tracking-widest text-[var(--color-ink)]/60 mb-2">
                  邮箱
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-0 py-3 bg-transparent border-b border-[var(--color-ink)]/20 text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-ink)] transition-all"
                  placeholder="your@email.com"
                />
              </div>
              <div>
                <label className="block font-mono text-xs uppercase tracking-widest text-[var(--color-ink)]/60 mb-2">
                  密码
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-0 py-3 bg-transparent border-b border-[var(--color-ink)]/20 text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-ink)] transition-all"
                  placeholder="至少 6 位"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[var(--color-ink)] text-[var(--color-paper)] font-mono uppercase tracking-widest text-sm hover:bg-[var(--color-ink)]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '注册中...' : '创建账户 →'}
              </button>
            </form>
          )}

          {/* 魔法链接表单 */}
          {mode === 'magic-link' && (
            <form onSubmit={handleMagicLink} className="space-y-5">
              <div>
                <label className="block font-mono text-xs uppercase tracking-widest text-[var(--color-ink)]/60 mb-2">
                  邮箱
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-0 py-3 bg-transparent border-b border-[var(--color-ink)]/20 text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-ink)] transition-all"
                  placeholder="your@email.com"
                />
              </div>
              <p className="font-mono text-xs text-[var(--color-ink)]/50 leading-relaxed">
                我们将发送一个登录链接到你的邮箱，点击即可登录，无需密码。
              </p>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[var(--color-ink)] text-[var(--color-paper)] font-mono uppercase tracking-widest text-sm hover:bg-[var(--color-ink)]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '发送中...' : '发送魔法链接 →'}
              </button>
            </form>
          )}
        </div>

        {/* 底部文字 - 杂志风格 */}
        <p className="text-center font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-ink)]/40 mt-10">
          回归纯粹沟通，拒绝社交噪音
        </p>
      </div>
    </div>
  )
}

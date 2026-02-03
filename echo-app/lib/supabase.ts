import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// 检查是否配置了有效的 Supabase 环境变量
export const isSupabaseConfigured = 
  supabaseUrl.startsWith('http') && supabaseAnonKey.length > 0

// 创建 Supabase 客户端
// 如果未配置，创建一个虚拟 URL 的客户端（会在页面显示配置提示）
export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
)

// 监听 auth 错误，如果 token 无效则登出
supabase.auth.onAuthStateChange((event) => {
  if (event === 'TOKEN_REFRESHED') {
    console.log('[Auth] Token refreshed')
  } else if (event === 'SIGNED_OUT') {
    console.log('[Auth] Signed out')
  }
})

// 处理 token 刷新错误的函数
export async function handleAuthError() {
  const { error } = await supabase.auth.getSession()
  if (error?.message?.includes('Refresh Token')) {
    console.log('[Auth] Invalid refresh token, signing out...')
    await supabase.auth.signOut()
    window.location.href = '/'
  }
}


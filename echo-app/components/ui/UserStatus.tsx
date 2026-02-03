'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'

// 常用 emoji 列表
const EMOJI_LIST = ['😊', '😎', '🎉', '💪', '🔥', '💭', '🌙', '☀️', '🎵', '📚', '🏃', '😴', '🤔', '❤️', '✨']

interface UserStatus {
  id: string
  user_id: string
  content: string
  emoji?: string
  created_at: string
  expires_at: string
}

interface StatusEditorProps {
  isOpen: boolean
  onClose: () => void
  currentStatus?: UserStatus | null
  onStatusUpdated?: () => void
}

// 类型断言帮助函数，用于访问尚未定义在 database.ts 中的表和函数
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// 状态编辑器组件
export function StatusEditor({ isOpen, onClose, currentStatus, onStatusUpdated }: StatusEditorProps) {
  const [content, setContent] = useState(currentStatus?.content || '')
  const [emoji, setEmoji] = useState(currentStatus?.emoji || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (currentStatus) {
      setContent(currentStatus.content)
      setEmoji(currentStatus.emoji || '')
    }
  }, [currentStatus])

  const handleSave = async () => {
    if (!content.trim()) return

    setSaving(true)
    try {
      const { error } = await db.rpc('set_user_status', {
        p_content: content.trim(),
        p_emoji: emoji || null,
        p_duration_hours: 24,
      })

      if (error) throw error

      onStatusUpdated?.()
      onClose()
    } catch (err) {
      console.error('Failed to set status:', err)
      alert('设置状态失败')
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    setSaving(true)
    try {
      const { error } = await db.rpc('clear_user_status')
      if (error) throw error
      
      setContent('')
      setEmoji('')
      onStatusUpdated?.()
      onClose()
    } catch (err) {
      console.error('Failed to clear status:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* 背景遮罩 */}
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* 编辑器卡片 */}
          <motion.div
            className="relative w-full max-w-sm glass-heavy rounded-2xl p-6"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
          >
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              设置状态
            </h3>

            {/* Emoji 选择 */}
            <div className="mb-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">选择表情</p>
              <div className="flex flex-wrap gap-2">
                {EMOJI_LIST.map((e) => (
                  <button
                    key={e}
                    onClick={() => setEmoji(emoji === e ? '' : e)}
                    className={`w-10 h-10 text-xl rounded-lg transition-all ${
                      emoji === e
                        ? 'bg-black dark:bg-white scale-110'
                        : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* 状态内容 */}
            <div className="mb-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">说点什么</p>
              <input
                type="text"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="此刻的心情..."
                maxLength={50}
                className="w-full px-4 py-3 rounded-xl glass-input text-sm focus:outline-none dark:text-white"
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{content.length}/50</p>
            </div>

            {/* 提示 */}
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              💡 状态将在 24 小时后自动消失
            </p>

            {/* 按钮 */}
            <div className="flex gap-3">
              {currentStatus && (
                <button
                  onClick={handleClear}
                  disabled={saving}
                  className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  清除状态
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving || !content.trim()}
                className="flex-1 py-3 bg-black dark:bg-white text-white dark:text-black rounded-xl text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// 状态显示气泡组件
interface StatusBubbleProps {
  status: UserStatus
  size?: 'sm' | 'md'
  showContent?: boolean
}

export function StatusBubble({ status, size = 'md', showContent = true }: StatusBubbleProps) {
  // 计算剩余时间
  const getTimeLeft = () => {
    const expiresAt = new Date(status.expires_at).getTime()
    const now = Date.now()
    const diff = expiresAt - now

    if (diff <= 0) return '已过期'

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (hours > 0) return `${hours}小时后消失`
    return `${minutes}分钟后消失`
  }

  return (
    <div className={`flex items-center gap-2 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
      {/* Emoji 光环 */}
      {status.emoji && (
        <span className={`${size === 'sm' ? 'text-base' : 'text-lg'}`}>
          {status.emoji}
        </span>
      )}
      
      {/* 状态内容 */}
      {showContent && (
        <div className="flex flex-col">
          <span className="text-gray-700 dark:text-gray-300 line-clamp-1">
            {status.content}
          </span>
          <span className="text-gray-400 dark:text-gray-500 text-[10px]">
            {getTimeLeft()}
          </span>
        </div>
      )}
    </div>
  )
}

// Hook: 获取用户状态
export function useUserStatus(userId?: string) {
  const [status, setStatus] = useState<UserStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStatus = useCallback(async () => {
    if (!userId) {
      setStatus(null)
      setLoading(false)
      return
    }

    try {
      const { data, error } = await db
        .from('user_status')
        .select('*')
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString())
        .single()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      setStatus(data as UserStatus | null)
    } catch (err) {
      console.error('Failed to fetch status:', err)
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchStatus()

    // 实时监听状态变化
    if (userId) {
      const channel = supabase
        .channel(`status_${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_status',
            filter: `user_id=eq.${userId}`,
          },
          () => {
            fetchStatus()
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [userId, fetchStatus])

  return { status, loading, refresh: fetchStatus }
}

// Hook: 获取多个好友的状态
export function useFriendStatuses(friendIds: string[]) {
  const [statuses, setStatuses] = useState<Record<string, UserStatus>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (friendIds.length === 0) {
      setStatuses({})
      setLoading(false)
      return
    }

    const fetchStatuses = async () => {
      try {
        const { data, error } = await db
          .from('user_status')
          .select('*')
          .in('user_id', friendIds)
          .gt('expires_at', new Date().toISOString())

        if (error) throw error

        const statusMap: Record<string, UserStatus> = {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data?.forEach((s: any) => {
          statusMap[s.user_id] = s as UserStatus
        })

        setStatuses(statusMap)
      } catch (err) {
        console.error('Failed to fetch friend statuses:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchStatuses()

    // 实时监听
    const channel = supabase
      .channel('friend_statuses')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_status',
        },
        (payload) => {
          const status = payload.new as UserStatus
          if (friendIds.includes(status.user_id)) {
            if (payload.eventType === 'DELETE') {
              setStatuses((prev) => {
                const next = { ...prev }
                delete next[(payload.old as UserStatus).user_id]
                return next
              })
            } else {
              setStatuses((prev) => ({
                ...prev,
                [status.user_id]: status,
              }))
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [friendIds])

  return { statuses, loading }
}

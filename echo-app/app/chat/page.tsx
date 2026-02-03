'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ChatList from '@/components/chat/ChatList'
import { useUserStore, useConversationStore } from '@/stores'
import type { Profile, Conversation } from '@/types'

export default function ChatPage() {
  // 使用 Zustand store
  const currentUser = useUserStore((s) => s.currentUser)
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)
  const conversations = useConversationStore((s) => s.conversations)
  const setConversations = useConversationStore((s) => s.setConversations)
  
  const [mobileMenuOpen, setMobileMenuOpen] = useState(true) // 默认打开侧边栏

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // 获取当前用户档案（如果没有缓存）
      if (!currentUser) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()

        if (profile) {
          setCurrentUser(profile)
        }
      }

      // 获取好友列表（如果没有缓存）
      if (conversations.length === 0) {
        const { data: friendships } = await supabase
          .from('friendships')
          .select(`
            *,
            friend:profiles!friendships_friend_id_fkey(*)
          `)
          .eq('user_id', session.user.id)
          .eq('status', 'accepted')

        if (friendships) {
          // 转换为会话列表
          const convs: Conversation[] = friendships.map((f: { friend: Profile }) => ({
            friend: f.friend,
            last_message: null,
            unread_count: 0,
          }))
          setConversations(convs)
        }
      }
    }

    fetchData()
  }, [currentUser, conversations.length, setCurrentUser, setConversations])

  return (
    <>
      {/* 左侧好友列表 */}
      <ChatList 
        conversations={conversations} 
        currentUser={currentUser}
        selectedFriendId={null}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      {/* 右侧空状态 - 杂志风格 */}
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--color-paper)]">
        {/* 移动端菜单按钮 */}
        <button 
          onClick={() => setMobileMenuOpen(true)}
          className="md:hidden absolute top-4 left-4 p-2 hover:bg-[var(--color-ink)]/5 text-[var(--color-ink)]/60"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        <div className="text-center px-6">
          <div className="w-20 h-20 mx-auto mb-8 border border-[var(--color-ink)]/20 flex items-center justify-center">
            <svg 
              className="w-10 h-10 text-[var(--color-ink)]/30" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="1"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h2 className="font-serif text-2xl italic text-[var(--color-ink)] mb-3">
            选择一个好友开始聊天
          </h2>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-ink)]/40">
            或者搜索添加新朋友
          </p>
        </div>
      </div>
    </>
  )
}

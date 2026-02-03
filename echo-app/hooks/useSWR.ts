'use client'

import useSWR, { mutate } from 'swr'
import { supabase } from '@/lib/supabase'
import { useUserStore, useConversationStore, useMessageStore } from '@/stores'
import { 
  saveUserProfile, 
  saveConversations, 
  saveMessages, 
  getLocalUserProfile,
  getLocalConversations,
  getLocalMessages,
  generateChatId,
  cleanOldMessages,
} from '@/lib/db'
import type { Profile, Conversation, Message } from '@/types'

// ============================================
// SWR 配置
// ============================================

// 默认配置：先显示缓存，后台静默刷新
const swrConfig = {
  revalidateOnFocus: false, // 切换标签页不重新请求
  revalidateOnReconnect: true, // 断网重连后刷新
  dedupingInterval: 5000, // 5秒内相同请求去重
  errorRetryCount: 3,
}

// ============================================
// 用户数据 Hook
// ============================================

export function useCurrentUser() {
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)
  
  const fetcher = async (): Promise<Profile | null> => {
    // 先尝试从 Zustand 获取
    const cachedUser = useUserStore.getState().currentUser
    if (cachedUser) {
      return cachedUser
    }
    
    // 从 Supabase 获取 session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      throw sessionError
    }
    if (!session) return null

    // 清理过期本地消息（防止存储膨胀）
    cleanOldMessages().catch(() => {})
    
    // 尝试从 IndexedDB 获取
    const localProfile = await getLocalUserProfile(session.user.id)
    if (localProfile) {
      setCurrentUser(localProfile)
      // 继续从服务器获取最新数据
    }
    
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()

    if (profileError) {
      if (localProfile) return localProfile
      throw profileError
    }
    
    if (profile) {
      setCurrentUser(profile)
      // 保存到 IndexedDB
      await saveUserProfile(profile)
    }
    
    return profile
  }
  
  const { data, error, isLoading, isValidating } = useSWR<Profile | null>(
    'current-user',
    fetcher,
    {
      ...swrConfig,
      fallbackData: useUserStore.getState().currentUser,
      revalidateOnMount: true,
    }
  )
  
  return {
    user: data,
    isLoading,
    isValidating,
    error,
    mutate: () => mutate('current-user'),
  }
}

// ============================================
// 会话列表 Hook
// ============================================

export function useConversations(userId: string | undefined) {
  const setConversations = useConversationStore((s) => s.setConversations)
  
  const fetcher = async (): Promise<Conversation[]> => {
    if (!userId) return []
    
    // 先从 IndexedDB 获取本地缓存
    const localConvs = await getLocalConversations()
    if (localConvs.length > 0) {
      setConversations(localConvs)
    }
    
    // 从 Supabase 获取最新数据
    const { data: friendships, error: friendshipsError } = await supabase
      .from('friendships')
      .select(`
        *,
        friend:profiles!friendships_friend_id_fkey(*)
      `)
      .eq('user_id', userId)
      .eq('status', 'accepted')
    
    if (friendshipsError) {
      if (localConvs.length > 0) return localConvs
      throw friendshipsError
    }
    
    if (!friendships || friendships.length === 0) return localConvs

    const friendIds = friendships.map((f: { friend: Profile }) => f.friend.id)
    const friendIdsFilter = friendIds.join(',')

    // 批量获取最近消息，减少 N+1 查询
    const { data: recentMessages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${userId},receiver_id.in.(${friendIdsFilter})),and(sender_id.in.(${friendIdsFilter}),receiver_id.eq.${userId})`
      )
      .order('created_at', { ascending: false })
      .limit(friendIds.length * 3)

    if (messagesError) {
      if (localConvs.length > 0) return localConvs
      throw messagesError
    }

    // 批量获取未读消息（仅取 sender_id 以减少数据量）
    const { data: unreadRows, error: unreadError } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('receiver_id', userId)
      .eq('is_read', false)

    if (unreadError) {
      if (localConvs.length > 0) return localConvs
      throw unreadError
    }

    const lastMessageMap = new Map<string, Message>()
    if (recentMessages) {
      for (const msg of recentMessages as Message[]) {
        const friendId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id
        if (!lastMessageMap.has(friendId)) {
          lastMessageMap.set(friendId, msg)
        }
      }
    }

    const unreadCountMap = new Map<string, number>()
    if (unreadRows) {
      for (const row of unreadRows as { sender_id: string }[]) {
        unreadCountMap.set(row.sender_id, (unreadCountMap.get(row.sender_id) || 0) + 1)
      }
    }

    const conversations = friendships.map((f: { friend: Profile }) => {
      const friendId = f.friend.id
      return {
        friend: f.friend,
        last_message: lastMessageMap.get(friendId) || null,
        unread_count: unreadCountMap.get(friendId) || 0,
      } as Conversation
    })
    
    // 按最后消息时间排序
    conversations.sort((a, b) => {
      if (!a.last_message && !b.last_message) return 0
      if (!a.last_message) return 1
      if (!b.last_message) return -1
      return new Date(b.last_message.created_at).getTime() - 
             new Date(a.last_message.created_at).getTime()
    })
    
    // 更新状态和 IndexedDB
    setConversations(conversations)
    await saveConversations(conversations)
    
    return conversations
  }
  
  const { data, error, isLoading, isValidating } = useSWR<Conversation[]>(
    userId ? `conversations-${userId}` : null,
    fetcher,
    {
      ...swrConfig,
      fallbackData: useConversationStore.getState().conversations,
      refreshInterval: 30000, // 30秒自动刷新一次
    }
  )
  
  return {
    conversations: data || [],
    isLoading,
    isValidating,
    error,
    mutate: () => mutate(`conversations-${userId}`),
  }
}

// ============================================
// 聊天消息 Hook
// ============================================

export function useMessages(myUserId: string | undefined, friendId: string | undefined) {
  const setMessages = useMessageStore((s) => s.setMessages)
  
  const fetcher = async (): Promise<Message[]> => {
    if (!myUserId || !friendId) return []
    
    // 先从 IndexedDB 获取本地缓存
    const localMessages = await getLocalMessages(myUserId, friendId, 200)
    if (localMessages.length > 0) {
      setMessages(friendId, localMessages)
    }
    
    // 从 Supabase 获取最新数据
    const { data: messagesData, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${myUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${myUserId})`)
      .order('created_at', { ascending: true })
    
    if (messagesError) {
      if (localMessages.length > 0) return localMessages
      throw messagesError
    }
    
    if (messagesData) {
      setMessages(friendId, messagesData as Message[])
      // 保存到 IndexedDB
      await saveMessages(messagesData as Message[])
    }
    
    return messagesData as Message[] || localMessages
  }
  
  const cacheKey = myUserId && friendId ? `messages-${generateChatId(myUserId, friendId)}` : null
  
  const { data, error, isLoading, isValidating } = useSWR<Message[]>(
    cacheKey,
    fetcher,
    {
      ...swrConfig,
      fallbackData: friendId ? useMessageStore.getState().messages[friendId] || [] : [],
      revalidateOnMount: true,
    }
  )
  
  return {
    messages: data || [],
    isLoading,
    isValidating,
    error,
    mutate: () => mutate(cacheKey),
  }
}

// ============================================
// 好友档案 Hook
// ============================================

export function useFriendProfile(friendId: string | undefined) {
  const fetcher = async (): Promise<Profile | null> => {
    if (!friendId) return null
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', friendId)
      .single()
    
    if (error) {
      throw error
    }
    
    return data
  }
  
  const { data, error, isLoading } = useSWR<Profile | null>(
    friendId ? `profile-${friendId}` : null,
    fetcher,
    {
      ...swrConfig,
      revalidateOnMount: true,
    }
  )
  
  return {
    friend: data,
    isLoading,
    error,
  }
}

// ============================================
// 手动刷新工具
// ============================================

export function refreshConversations(userId: string) {
  return mutate(`conversations-${userId}`)
}

export function refreshMessages(myUserId: string, friendId: string) {
  return mutate(`messages-${generateChatId(myUserId, friendId)}`)
}

export function refreshCurrentUser() {
  return mutate('current-user')
}

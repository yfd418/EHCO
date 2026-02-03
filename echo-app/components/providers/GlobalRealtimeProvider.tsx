'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useUserStore, useConversationStore, useMessageStore, usePresenceStore, useUIStore } from '@/stores'
import { saveMessage } from '@/lib/db'
import { refreshConversations } from '@/hooks/useSWR'
import type { Message } from '@/types'

// ============================================
// 全局实时监听器
// 在整个应用中只创建一个连接，统一分发消息
// ============================================

// 全局单例状态
let isInitialized = false
let globalMessageChannel: ReturnType<typeof supabase.channel> | null = null
let globalPresenceChannel: ReturnType<typeof supabase.channel> | null = null
let globalTypingChannel: ReturnType<typeof supabase.channel> | null = null

// 新消息回调列表
type MessageCallback = (message: Message) => void
const messageCallbacks = new Set<MessageCallback>()

export function subscribeToNewMessages(callback: MessageCallback) {
  messageCallbacks.add(callback)
  return () => messageCallbacks.delete(callback)
}

// 离线后补全消息（根据本地最后一条时间拉取缺失）
async function syncMissedMessages(userId: string) {
  const conversations = useConversationStore.getState().conversations
  if (conversations.length === 0) return

  const activeConvId = useConversationStore.getState().activeConversationId

  for (const conv of conversations) {
    const friendId = conv.friend.id
    const localMessages = useMessageStore.getState().messages[friendId] || []
    const lastLocal = localMessages[localMessages.length - 1] || conv.last_message

    let query = supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${userId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${userId})`
      )
      .order('created_at', { ascending: true })
      .limit(200)

    if (lastLocal?.created_at) {
      query = query.gt('created_at', lastLocal.created_at)
    }

    const { data, error } = await query
    if (error || !data || data.length === 0) continue

    for (const msg of data as Message[]) {
      await saveMessage(msg)
      useMessageStore.getState().addMessage(friendId, msg)
      useConversationStore.getState().updateLastMessage(friendId, msg)

      if (msg.receiver_id === userId && !msg.is_read && friendId !== activeConvId) {
        useConversationStore.getState().incrementUnread(friendId)
      }
    }
  }
}

// 初始化全局实时监听
function initGlobalRealtime(userId: string) {
  if (isInitialized) return
  isInitialized = true
  
  console.log('[GlobalRealtime] Initializing for user:', userId)
  
  // 1. 消息监听 - 监听所有与当前用户相关的消息
  globalMessageChannel = supabase
    .channel(`global_messages_${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      },
      async (payload) => {
        const newMessage = payload.new as Message
        
        // 只处理与当前用户相关的消息
        if (newMessage.receiver_id !== userId && newMessage.sender_id !== userId) {
          return
        }
        
        console.log('[GlobalRealtime] New message:', newMessage.id)
        
        // 保存到 IndexedDB
        await saveMessage(newMessage)
        
        // 更新消息 store
        const friendId = newMessage.sender_id === userId 
          ? newMessage.receiver_id 
          : newMessage.sender_id
        
        useMessageStore.getState().addMessage(friendId, newMessage)
        
        // 更新会话列表的最后一条消息
        useConversationStore.getState().updateLastMessage(friendId, newMessage)
        
        // 如果是收到的消息且不是当前活跃聊天，增加未读数
        const activeConvId = useConversationStore.getState().activeConversationId
        if (newMessage.sender_id !== userId && friendId !== activeConvId) {
          useConversationStore.getState().incrementUnread(friendId)
        }
        
        // 通知所有订阅者
        messageCallbacks.forEach(cb => cb(newMessage))
        
        // 触发会话列表刷新
        refreshConversations(userId)
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
      },
      (payload) => {
        const updatedMessage = payload.new as Message
        
        // 只处理与当前用户相关的消息
        if (updatedMessage.receiver_id !== userId && updatedMessage.sender_id !== userId) {
          return
        }
        
        const friendId = updatedMessage.sender_id === userId 
          ? updatedMessage.receiver_id 
          : updatedMessage.sender_id
        
        useMessageStore.getState().updateMessage(friendId, updatedMessage.id, updatedMessage)
      }
    )
    .subscribe((status) => {
      console.log('[GlobalRealtime] Message channel status:', status)
    })
  
  // 2. 在线状态监听
  globalPresenceChannel = supabase.channel('global:presence', {
    config: {
      presence: { key: userId },
    },
  })
  
  globalPresenceChannel
    .on('presence', { event: 'sync' }, () => {
      const state = globalPresenceChannel!.presenceState()
      const onlineUsers = new Set(Object.keys(state))
      usePresenceStore.getState().setOnlineUsers(onlineUsers)
    })
    .on('presence', { event: 'join' }, ({ key }) => {
      usePresenceStore.getState().addOnlineUser(key)
    })
    .on('presence', { event: 'leave' }, ({ key }) => {
      usePresenceStore.getState().removeOnlineUser(key)
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await globalPresenceChannel!.track({ online: true })
      }
    })
  
  // 3. 打字状态监听
  globalTypingChannel = supabase.channel('global:typing')
  
  globalTypingChannel
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      const { fromUserId, toUserId, isTyping } = payload
      if (toUserId !== userId) return
      
      useUIStore.getState().setTyping(fromUserId, isTyping)
      
      // 3秒后自动清除打字状态
      if (isTyping) {
        setTimeout(() => {
          useUIStore.getState().setTyping(fromUserId, false)
        }, 3000)
      }
    })
    .subscribe()
}

// 清理全局监听
function cleanupGlobalRealtime() {
  console.log('[GlobalRealtime] Cleaning up')
  
  if (globalMessageChannel) {
    supabase.removeChannel(globalMessageChannel)
    globalMessageChannel = null
  }
  if (globalPresenceChannel) {
    supabase.removeChannel(globalPresenceChannel)
    globalPresenceChannel = null
  }
  if (globalTypingChannel) {
    supabase.removeChannel(globalTypingChannel)
    globalTypingChannel = null
  }
  
  isInitialized = false
}

// 广播打字状态
export function broadcastTyping(fromUserId: string, toUserId: string, isTyping: boolean) {
  if (!globalTypingChannel) return
  
  globalTypingChannel.send({
    type: 'broadcast',
    event: 'typing',
    payload: { fromUserId, toUserId, isTyping },
  })
}

// ============================================
// React Provider 组件
// ============================================

export function GlobalRealtimeProvider({ children }: { children: React.ReactNode }) {
  const currentUser = useUserStore((s) => s.currentUser)
  const conversationsCount = useConversationStore((s) => s.conversations.length)
  const typingTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({})
  
  // 初始化全局实时监听
  useEffect(() => {
    if (!currentUser?.id) return
    
    initGlobalRealtime(currentUser.id)
    const timeouts = typingTimeoutRef.current
    
    return () => {
      // 组件卸载时清理
      Object.values(timeouts).forEach(clearTimeout)
    }
  }, [currentUser?.id])

  // 会话列表就绪后补全离线消息
  useEffect(() => {
    if (!currentUser?.id || conversationsCount === 0) return

    syncMissedMessages(currentUser.id)
  }, [currentUser?.id, conversationsCount])
  
  // 监听网络状态
  useEffect(() => {
    const handleOnline = () => {
      useUIStore.getState().setOnline(true)
      // 重新连接
      if (currentUser?.id) {
        cleanupGlobalRealtime()
        initGlobalRealtime(currentUser.id)
        syncMissedMessages(currentUser.id)
      }
    }
    
    const handleOffline = () => {
      useUIStore.getState().setOnline(false)
    }
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [currentUser?.id])
  
  // 监听页面可见性，断开/重连
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && currentUser?.id) {
        // 页面变为可见时，确保连接正常
        if (!isInitialized) {
          initGlobalRealtime(currentUser.id)
        }
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [currentUser?.id])
  
  return <>{children}</>
}

// ============================================
// 导出清理函数（登出时使用）
// ============================================

export { cleanupGlobalRealtime }

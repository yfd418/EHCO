'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// 全局 channel 引用，避免重复创建
let presenceChannel: ReturnType<typeof supabase.channel> | null = null
let typingChannel: ReturnType<typeof supabase.channel> | null = null
let currentUserId: string | null = null
const presenceListeners: Set<(users: Set<string>) => void> = new Set()
const typingListeners: Set<(users: Set<string>) => void> = new Set()
let globalOnlineUsers = new Set<string>()
const globalTypingUsers = new Set<string>()

function notifyPresenceListeners() {
  presenceListeners.forEach(listener => listener(new Set(globalOnlineUsers)))
}

function notifyTypingListeners() {
  typingListeners.forEach(listener => listener(new Set(globalTypingUsers)))
}

function initPresenceChannel(userId: string) {
  if (presenceChannel && currentUserId === userId) {
    return // 已经初始化
  }

  // 如果用户变了，清理旧的
  if (presenceChannel && currentUserId !== userId) {
    supabase.removeChannel(presenceChannel)
    presenceChannel = null
  }

  currentUserId = userId
  console.log('[Presence] Creating channel for:', userId)

  presenceChannel = supabase.channel('global:presence', {
    config: {
      presence: {
        key: userId,
      },
    },
  })

  presenceChannel
    .on('presence', { event: 'sync' }, () => {
      const state = presenceChannel!.presenceState()
      globalOnlineUsers = new Set(Object.keys(state))
      console.log('[Presence] Sync:', Array.from(globalOnlineUsers))
      notifyPresenceListeners()
    })
    .on('presence', { event: 'join' }, ({ key }) => {
      console.log('[Presence] Join:', key)
      globalOnlineUsers.add(key)
      notifyPresenceListeners()
    })
    .on('presence', { event: 'leave' }, ({ key }) => {
      console.log('[Presence] Leave:', key)
      globalOnlineUsers.delete(key)
      notifyPresenceListeners()
    })

  presenceChannel.subscribe(async (status) => {
    console.log('[Presence] Status:', status)
    if (status === 'SUBSCRIBED') {
      await presenceChannel!.track({ online: true })
      console.log('[Presence] Tracked')
    }
  })
}

function initTypingChannel(userId: string) {
  if (typingChannel) return

  typingChannel = supabase.channel('global:typing')
  
  typingChannel
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      const { fromUserId, toUserId, isTyping } = payload
      if (toUserId !== userId) return
      
      if (isTyping) {
        globalTypingUsers.add(fromUserId)
        setTimeout(() => {
          globalTypingUsers.delete(fromUserId)
          notifyTypingListeners()
        }, 3000)
      } else {
        globalTypingUsers.delete(fromUserId)
      }
      notifyTypingListeners()
    })
    .subscribe()
}

export function usePresence(userId: string | undefined) {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set(globalOnlineUsers))
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set(globalTypingUsers))

  useEffect(() => {
    if (!userId) return

    // 初始化全局 channels
    initPresenceChannel(userId)
    initTypingChannel(userId)

    // 注册监听器
    const presenceListener = (users: Set<string>) => setOnlineUsers(users)
    const typingListener = (users: Set<string>) => setTypingUsers(users)
    
    presenceListeners.add(presenceListener)
    typingListeners.add(typingListener)

    return () => {
      presenceListeners.delete(presenceListener)
      typingListeners.delete(typingListener)
      // 不移除 channel，保持连接
    }
  }, [userId])

  const broadcastTyping = useCallback((toUserId: string, isTyping: boolean) => {
    if (!typingChannel || !userId) return
    
    typingChannel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { fromUserId: userId, toUserId, isTyping },
    })
  }, [userId])

  const isUserOnline = useCallback((checkUserId: string) => {
    return onlineUsers.has(checkUserId)
  }, [onlineUsers])

  const isUserTyping = useCallback((checkUserId: string) => {
    return typingUsers.has(checkUserId)
  }, [typingUsers])

  return {
    onlineUsers,
    isUserOnline,
    isUserTyping,
    broadcastTyping,
  }
}

export function cleanupPresence() {
  if (presenceChannel) {
    supabase.removeChannel(presenceChannel)
    presenceChannel = null
  }
  if (typingChannel) {
    supabase.removeChannel(typingChannel)
    typingChannel = null
  }
  currentUserId = null
  globalOnlineUsers.clear()
  globalTypingUsers.clear()
}

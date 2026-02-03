'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { uploadFile } from '@/lib/storage'
import { usePresence, useNotification } from '@/hooks'
import { isImageFile } from '@/lib/utils'
import type { Profile, Message, Conversation, MessageType } from '@/types'

interface UseChatRoomReturn {
  currentUser: Profile | null
  friend: Profile | null
  messages: Message[]
  conversations: Conversation[]
  loading: boolean
  uploading: boolean
  isAtBottom: boolean
  isFriendOnline: boolean
  isFriendTyping: boolean
  onlineUsers: string[]
  mobileMenuOpen: boolean
  setMobileMenuOpen: (open: boolean) => void
  setIsAtBottom: (atBottom: boolean) => void
  handleTyping: () => void
  handleSendMessage: (content: string) => Promise<void>
  handleSendFile: (file: File) => Promise<void>
}

export function useChatRoom(friendId: string): UseChatRoomReturn {
  const router = useRouter()
  
  const [currentUser, setCurrentUser] = useState<Profile | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const cachedUser = sessionStorage.getItem('echo-current-user')
      return cachedUser ? JSON.parse(cachedUser) : null
    } catch {
      return null
    }
  })
  const [friend, setFriend] = useState<Profile | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const cachedConvs = sessionStorage.getItem('echo-conversations')
      return cachedConvs ? JSON.parse(cachedConvs) : []
    } catch {
      return []
    }
  })
  const [loading, setLoading] = useState(() => {
    try {
      const cachedUser = sessionStorage.getItem('echo-current-user')
      const cachedConvs = sessionStorage.getItem('echo-conversations')
      return !(cachedUser && cachedConvs)
    } catch {
      return true
    }
  })
  const [uploading, setUploading] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)
  
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const friendRef = useRef<Profile | null>(null)

  // 保持 friend 的最新引用
  useEffect(() => {
    friendRef.current = friend
  }, [friend])

  // 在线状态和打字状态
  const { onlineUsers, isUserOnline, isUserTyping, broadcastTyping } = usePresence(currentUser?.id)
  
  // 通知功能
  const { requestPermission, notifyNewMessage } = useNotification()

  // 请求通知权限
  useEffect(() => {
    requestPermission()
  }, [requestPermission])

  // 主数据获取和实时订阅
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let localReadStatusChannel: ReturnType<typeof supabase.channel> | null = null
    let isSubscribed = false

    const fetchData = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError?.message?.includes('Refresh Token')) {
        console.log('[Auth] Invalid token, redirecting to login...')
        await supabase.auth.signOut()
        router.push('/')
        return
      }
      
      if (!session) {
        router.push('/')
        return
      }

      const myId = session.user.id

      // 获取当前用户档案
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', myId)
        .single()

      if (profile) {
        setCurrentUser(profile)
        try {
          sessionStorage.setItem('echo-current-user', JSON.stringify(profile))
        } catch { /* 忽略 */ }
      }

      // 获取好友档案
      const { data: friendProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', friendId)
        .single()

      if (friendProfile) {
        setFriend(friendProfile)
      }

      // 获取好友列表
      const { data: friendships } = await supabase
        .from('friendships')
        .select(`
          *,
          friend:profiles!friendships_friend_id_fkey(*)
        `)
        .eq('user_id', myId)
        .eq('status', 'accepted')

      if (friendships) {
        const convsWithDetails = await Promise.all(
          friendships.map(async (f: { friend: Profile }) => {
            const { data: lastMsg } = await supabase
              .from('messages')
              .select('*')
              .or(`and(sender_id.eq.${myId},receiver_id.eq.${f.friend.id}),and(sender_id.eq.${f.friend.id},receiver_id.eq.${myId})`)
              .order('created_at', { ascending: false })
              .limit(1)
              .single()

            const { count } = await supabase
              .from('messages')
              .select('*', { count: 'exact', head: true })
              .eq('sender_id', f.friend.id)
              .eq('receiver_id', myId)
              .eq('is_read', false)

            return {
              friend: f.friend,
              last_message: lastMsg || null,
              unread_count: count || 0,
            } as Conversation
          })
        )
        
        convsWithDetails.sort((a, b) => {
          if (!a.last_message && !b.last_message) return 0
          if (!a.last_message) return 1
          if (!b.last_message) return -1
          return new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime()
        })
        
        setConversations(convsWithDetails)
        try {
          sessionStorage.setItem('echo-conversations', JSON.stringify(convsWithDetails))
        } catch { /* 忽略 */ }
      }

      // 获取历史消息
      const { data: messagesData } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${myId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${myId})`)
        .order('created_at', { ascending: true })

      const unreadMessageIds: string[] = []
      
      if (messagesData) {
        const updatedMessages = messagesData.map(msg => {
          if (msg.sender_id === friendId && msg.receiver_id === myId && !msg.is_read) {
            unreadMessageIds.push(msg.id)
            return { ...msg, is_read: true }
          }
          return msg
        }) as Message[]
        setMessages(updatedMessages)
      }

      setLoading(false)

      // 设置已读状态广播通道
      const channelName = `read_status_${[myId, friendId].sort().join('_')}`
      
      localReadStatusChannel = supabase
        .channel(channelName)
        .on('broadcast', { event: 'messages_read' }, (payload) => {
          const { messageIds, readerId } = payload.payload as { messageIds: string[], readerId: string }
          
          if (readerId !== myId) {
            setMessages(prev => prev.map(msg => 
              messageIds.includes(msg.id) ? { ...msg, is_read: true } : msg
            ))
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            isSubscribed = true
            
            if (unreadMessageIds.length > 0) {
              await supabase
                .from('messages')
                .update({ is_read: true })
                .in('id', unreadMessageIds)
              
              localReadStatusChannel?.send({
                type: 'broadcast',
                event: 'messages_read',
                payload: { messageIds: unreadMessageIds, readerId: myId }
              })
            }
          }
        })

      // 实时监听消息
      channel = supabase
        .channel(`chat_${myId}_${friendId}_${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
          },
          async (payload) => {
            const newMessage = payload.new as Message
            const isRelevant = 
              (newMessage.sender_id === friendId && newMessage.receiver_id === myId) ||
              (newMessage.sender_id === myId && newMessage.receiver_id === friendId)
            
            if (isRelevant) {
              if (newMessage.sender_id === friendId) {
                const { error } = await supabase
                  .from('messages')
                  .update({ is_read: true })
                  .eq('id', newMessage.id)
                
                if (!error && isSubscribed && localReadStatusChannel) {
                  localReadStatusChannel.send({
                    type: 'broadcast',
                    event: 'messages_read',
                    payload: { messageIds: [newMessage.id], readerId: myId }
                  })
                }
                
                const messageWithRead = { ...newMessage, is_read: true }
                setMessages((prev) => {
                  if (prev.some(m => m.id === newMessage.id)) return prev
                  return [...prev, messageWithRead]
                })
                
                const currentFriend = friendRef.current
                const senderName = currentFriend?.display_name || currentFriend?.username || '好友'
                const preview = newMessage.content || (newMessage.file_name ? `[文件] ${newMessage.file_name}` : '[消息]')
                notifyNewMessage(senderName, preview, friendId)
              } else {
                setMessages((prev) => {
                  if (prev.some(m => m.id === newMessage.id)) return prev
                  
                  const tempIndex = prev.findIndex(m => 
                    m.id.startsWith('temp_') && 
                    m.content === newMessage.content &&
                    m.sender_id === newMessage.sender_id
                  )
                  
                  if (tempIndex >= 0) {
                    const updated = [...prev]
                    updated[tempIndex] = newMessage
                    return updated
                  }
                  
                  return [...prev, newMessage]
                })
              }
            }
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
            const isRelevant = 
              (updatedMessage.sender_id === friendId && updatedMessage.receiver_id === myId) ||
              (updatedMessage.sender_id === myId && updatedMessage.receiver_id === friendId)
            
            if (isRelevant) {
              setMessages((prev) => prev.map((m) => m.id === updatedMessage.id ? updatedMessage : m))
            }
          }
        )
        .subscribe()
    }

    fetchData()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
      if (localReadStatusChannel) {
        supabase.removeChannel(localReadStatusChannel)
      }
    }
  }, [friendId, notifyNewMessage, router])

  // 处理输入时广播打字状态
  const handleTyping = useCallback(() => {
    broadcastTyping(friendId, true)
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      broadcastTyping(friendId, false)
    }, 2000)
  }, [broadcastTyping, friendId])

  // 发送消息
  const handleSendMessage = useCallback(async (content: string) => {
    if (!currentUser || !friend) return

    broadcastTyping(friendId, false)
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    const tempMessage: Message = {
      id: `temp_${Date.now()}`,
      sender_id: currentUser.id,
      receiver_id: friend.id,
      content,
      message_type: 'text',
      is_read: false,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempMessage])

    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: currentUser.id,
        receiver_id: friend.id,
        content,
        message_type: 'text',
      })
      .select()
      .single()

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempMessage.id))
      console.error('发送失败:', error)
    } else if (data) {
      setMessages((prev) => 
        prev.map((m) => (m.id === tempMessage.id ? data as Message : m))
      )
    }
  }, [currentUser, friend, friendId, broadcastTyping])

  // 发送文件
  const handleSendFile = useCallback(async (file: File) => {
    if (!currentUser || !friend) return

    setUploading(true)

    const result = await uploadFile(file, currentUser.id)
    
    if (!result.success || !result.url) {
      console.error('文件上传失败:', result.error)
      alert(result.error || '文件上传失败')
      setUploading(false)
      return
    }

    const messageType: MessageType = isImageFile(file.type) ? 'image' : 'file'

    const tempMessage: Message = {
      id: `temp_${Date.now()}`,
      sender_id: currentUser.id,
      receiver_id: friend.id,
      content: '',
      message_type: messageType,
      file_url: result.url,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      is_read: false,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempMessage])

    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: currentUser.id,
        receiver_id: friend.id,
        content: '',
        message_type: messageType,
        file_url: result.url,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
      })
      .select()
      .single()

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempMessage.id))
      console.error('发送失败:', error)
    } else if (data) {
      setMessages((prev) => 
        prev.map((m) => (m.id === tempMessage.id ? data as Message : m))
      )
    }

    setUploading(false)
  }, [currentUser, friend])

  const isFriendOnline = friend ? isUserOnline(friend.id) : false
  const isFriendTyping = friend ? isUserTyping(friend.id) : false

  return {
    currentUser,
    friend,
    messages,
    conversations,
    loading,
    uploading,
    isAtBottom,
    isFriendOnline,
    isFriendTyping,
    onlineUsers: Array.from(onlineUsers),
    mobileMenuOpen,
    setMobileMenuOpen,
    setIsAtBottom,
    handleTyping,
    handleSendMessage,
    handleSendFile,
  }
}

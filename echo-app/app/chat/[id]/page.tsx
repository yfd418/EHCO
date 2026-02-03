'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Virtuoso } from 'react-virtuoso'
import { supabase } from '@/lib/supabase'
import { uploadFile } from '@/lib/storage'
import ChatList from '@/components/chat/ChatList'
import MessageBubble from '@/components/chat/MessageBubble'
import ChatInput from '@/components/chat/ChatInput'
import { OnlineIndicator, TypingIndicator, useToast } from '@/components/ui'
import { usePresence, useNotification } from '@/hooks'
import { useUserStore, useConversationStore, useMessageStore } from '@/stores'
import { getAvatarUrl, isImageFile } from '@/lib/utils'
import type { Profile, Message, Conversation, MessageType } from '@/types'

export default function ChatRoomPage() {
  const router = useRouter()
  const params = useParams()
  const { showToast } = useToast()
  const friendId = params.id as string
  
  // 使用 Zustand stores 获取缓存数据
  const currentUser = useUserStore((s) => s.currentUser)
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)
  const conversations = useConversationStore((s) => s.conversations)
  const setConversations = useConversationStore((s) => s.setConversations)
  
  // 使用 getMessages 获取稳定的数组引用，避免无限循环
  const getMessages = useMessageStore((s) => s.getMessages)
  const cachedMessages = getMessages(friendId)
  const setCachedMessages = useMessageStore((s) => s.setMessages)
  const addCachedMessage = useMessageStore((s) => s.addMessage)
  const updateCachedMessage = useMessageStore((s) => s.updateMessage)
  const replaceTemporaryMessage = useMessageStore((s) => s.replaceTemporaryMessage)
  const markMessagesAsRead = useMessageStore((s) => s.markAsRead)
  
  const [friend, setFriend] = useState<Profile | null>(null)
  const [messages, setMessages] = useState<Message[]>(cachedMessages)
  
  // 加载状态：只有在没有缓存消息时才显示 loading
  const [loading, setLoading] = useState(() => cachedMessages.length === 0)
  const [uploading, setUploading] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)
  
  // 同步缓存消息到本地状态
  useEffect(() => {
    if (cachedMessages.length > 0 && messages.length === 0) {
      setMessages(cachedMessages)
      setLoading(false)
    }
  }, [cachedMessages, messages.length])
  
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

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let localReadStatusChannel: ReturnType<typeof supabase.channel> | null = null
    let isSubscribed = false

    const fetchData = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      // 处理 token 刷新错误
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

      // 获取当前用户档案（优先使用缓存）
      const existingUser = useUserStore.getState().currentUser
      if (!existingUser || existingUser.id !== myId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', myId)
          .single()

        if (profile) {
          setCurrentUser(profile)
        }
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

      // 获取好友列表（仅当缓存为空时才获取）
      const existingConvs = useConversationStore.getState().conversations
      if (existingConvs.length === 0) {
        const { data: friendships } = await supabase
          .from('friendships')
          .select(`
            *,
            friend:profiles!friendships_friend_id_fkey(*)
          `)
          .eq('user_id', myId)
          .eq('status', 'accepted')

        if (friendships) {
        // 获取每个好友的最后一条消息和未读数
        const convsWithDetails = await Promise.all(
          friendships.map(async (f: { friend: Profile }) => {
            // 获取最后一条消息
            const { data: lastMsg } = await supabase
              .from('messages')
              .select('*')
              .or(`and(sender_id.eq.${myId},receiver_id.eq.${f.friend.id}),and(sender_id.eq.${f.friend.id},receiver_id.eq.${myId})`)
              .order('created_at', { ascending: false })
              .limit(1)
              .single()

            // 获取未读消息数
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
        
        // 按最后消息时间排序
        convsWithDetails.sort((a, b) => {
          if (!a.last_message && !b.last_message) return 0
          if (!a.last_message) return 1
          if (!b.last_message) return -1
          return new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime()
        })
        
        setConversations(convsWithDetails)
        }
      }

      // 获取历史消息（优先使用缓存，后台刷新）
      const existingMsgs = useMessageStore.getState().messages[friendId] || []
      const hasCache = existingMsgs.length > 0
      
      // 如果有缓存，先显示缓存
      if (hasCache) {
        setMessages(existingMsgs)
        setLoading(false)
      }
      
      // 后台获取最新消息
      const { data: messagesData } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${myId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${myId})`)
        .order('created_at', { ascending: true })

      // 获取需要标记为已读的消息 ID
      const unreadMessageIds: string[] = []
      
      if (messagesData) {
        // 将对方发来的未读消息在本地标记为已读
        const updatedMessages = messagesData.map(msg => {
          if (msg.sender_id === friendId && msg.receiver_id === myId && !msg.is_read) {
            unreadMessageIds.push(msg.id)
            return { ...msg, is_read: true }
          }
          return msg
        }) as Message[]
        setMessages(updatedMessages)
        // 更新缓存
        setCachedMessages(friendId, updatedMessages)
      }

      setLoading(false)

      // 设置已读状态广播通道 - 使用本地变量避免重复
      const channelName = `read_status_${[myId, friendId].sort().join('_')}`
      console.log('[ReadStatus] Creating channel:', channelName)
      
      localReadStatusChannel = supabase
        .channel(channelName)
        .on('broadcast', { event: 'messages_read' }, (payload) => {
          console.log('[ReadStatus] 📩 Received broadcast:', payload)
          const { messageIds, readerId } = payload.payload as { messageIds: string[], readerId: string }
          
          // 如果是对方标记了我发的消息为已读
          if (readerId !== myId) {
            console.log('[ReadStatus] ✅ Updating messages to read:', messageIds)
            setMessages(prev => {
              const updated = prev.map(msg => {
                if (messageIds.includes(msg.id)) {
                  console.log('[ReadStatus] 🔄 Setting is_read=true for:', msg.id)
                  return { ...msg, is_read: true }
                }
                return msg
              })
              return updated
            })
          } else {
            console.log('[ReadStatus] ⏭️ Ignoring own broadcast')
          }
        })
        .subscribe(async (status) => {
          console.log('[ReadStatus] Channel status:', status)
          
          if (status === 'SUBSCRIBED') {
            isSubscribed = true
            
            // 订阅成功后，批量更新历史消息的已读状态并广播
            if (unreadMessageIds.length > 0) {
              console.log('[ReadStatus] 📤 Marking', unreadMessageIds.length, 'messages as read and broadcasting')
              
              // 批量更新数据库
              await supabase
                .from('messages')
                .update({ is_read: true })
                .in('id', unreadMessageIds)
              
              // 广播已读状态给发送方
              localReadStatusChannel?.send({
                type: 'broadcast',
                event: 'messages_read',
                payload: { messageIds: unreadMessageIds, readerId: myId }
              })
            }
          }
        })

      // 开启实时监听消息
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
            // 只添加与当前聊天相关的消息
            const isRelevant = 
              (newMessage.sender_id === friendId && newMessage.receiver_id === myId) ||
              (newMessage.sender_id === myId && newMessage.receiver_id === friendId)
            
            if (isRelevant) {
              // 如果是对方发来的消息，标记为已读
              if (newMessage.sender_id === friendId) {
                // 标记为已读
                console.log('[Realtime] Marking message as read:', newMessage.id)
                const { error } = await supabase
                  .from('messages')
                  .update({ is_read: true })
                  .eq('id', newMessage.id)
                
                if (error) {
                  console.error('[Realtime] Failed to mark as read:', error)
                } else {
                  console.log('[Realtime] 📤 Broadcasting read status for new message')
                  // 广播已读状态给发送方
                  if (isSubscribed && localReadStatusChannel) {
                    localReadStatusChannel.send({
                      type: 'broadcast',
                      event: 'messages_read',
                      payload: { messageIds: [newMessage.id], readerId: myId }
                    })
                  }
                }
                
                // 添加消息时直接设置为已读（因为用户正在看这个聊天）
                const messageWithRead = { ...newMessage, is_read: true }
                setMessages((prev) => {
                  if (prev.some(m => m.id === newMessage.id)) return prev
                  const updated = [...prev, messageWithRead]
                  // 同步到缓存
                  setCachedMessages(friendId, updated)
                  return updated
                })
                
                // 发送浏览器通知（使用 ref 获取最新的 friend 数据）
                const currentFriend = friendRef.current
                const senderName = currentFriend?.display_name || currentFriend?.username || '好友'
                const preview = newMessage.content || (newMessage.file_name ? `[文件] ${newMessage.file_name}` : '[消息]')
                notifyNewMessage(senderName, preview, friendId)
              } else {
                // 自己发的消息 - 用真实消息替换临时消息
                setMessages((prev) => {
                  // 检查是否已存在相同 ID 的消息
                  if (prev.some(m => m.id === newMessage.id)) return prev
                  
                  // 查找临时消息（根据内容、发送者和时间窗口匹配）
                  const messageTime = new Date(newMessage.created_at).getTime()
                  const tempIndex = prev.findIndex(m => {
                    if (!m.id.startsWith('temp_')) return false
                    if (m.sender_id !== newMessage.sender_id) return false
                    if (m.content !== newMessage.content) return false
                    // 5秒内的消息视为匹配
                    const tempTime = new Date(m.created_at).getTime()
                    return Math.abs(messageTime - tempTime) < 5000
                  })
                  
                  let updated: Message[]
                  if (tempIndex >= 0) {
                    // 替换临时消息为真实消息
                    updated = [...prev]
                    updated[tempIndex] = newMessage
                  } else {
                    updated = [...prev, newMessage]
                  }
                  
                  // 同步到缓存
                  setCachedMessages(friendId, updated)
                  return updated
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
            console.log('[Realtime] Message UPDATE received:', updatedMessage.id, 'is_read:', updatedMessage.is_read)
            
            // 只更新当前聊天相关的消息
            const isRelevant = 
              (updatedMessage.sender_id === friendId && updatedMessage.receiver_id === myId) ||
              (updatedMessage.sender_id === myId && updatedMessage.receiver_id === friendId)
            
            if (isRelevant) {
              setMessages((prev) => {
                const found = prev.find(m => m.id === updatedMessage.id)
                console.log('[Realtime] ✅ Updating message, found:', !!found, 'current is_read:', found?.is_read)
                const updated = prev.map((m) => m.id === updatedMessage.id ? updatedMessage : m)
                // 同步到缓存
                setCachedMessages(friendId, updated)
                return updated
              })
            }
          }
        )
        .subscribe((status) => {
          console.log('Realtime subscription status:', status)
        })
    }

    fetchData()

    return () => {
      console.log('[Cleanup] Removing channels and timers')
      if (channel) {
        supabase.removeChannel(channel)
      }
      if (localReadStatusChannel) {
        supabase.removeChannel(localReadStatusChannel)
      }
      // 清理打字状态超时
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = null
      }
    }
  }, [friendId, notifyNewMessage, router]) // 依赖 friendId、notifyNewMessage 和 router

  // 处理输入时广播打字状态
  const handleTyping = useCallback(() => {
    broadcastTyping(friendId, true)
    
    // 清除之前的超时
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
    
    // 2秒后停止打字状态
    typingTimeoutRef.current = setTimeout(() => {
      broadcastTyping(friendId, false)
    }, 2000)
  }, [broadcastTyping, friendId])

  // 发送消息
  const handleSendMessage = async (content: string) => {
    if (!currentUser || !friend) return

    // 停止打字状态
    broadcastTyping(friendId, false)
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // 乐观更新 UI
    const tempMessage: Message = {
      id: `temp_${Date.now()}`,
      sender_id: currentUser.id,
      receiver_id: friend.id,
      content,
      message_type: 'text',
      is_read: false,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => {
      const updated = [...prev, tempMessage]
      return updated
    })

    // 发送到数据库
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
      // 发送失败，移除临时消息
      setMessages((prev) => {
        const updated = prev.filter((m) => m.id !== tempMessage.id)
        setCachedMessages(friendId, updated)
        return updated
      })
      showToast('消息发送失败，请重试', 'error')
      console.error('发送失败:', error)
    } else if (data) {
      // 用真实消息替换临时消息
      setMessages((prev) => {
        const updated = prev.map((m) => (m.id === tempMessage.id ? data as Message : m))
        setCachedMessages(friendId, updated)
        return updated
      })
    }
  }

  // 发送文件
  const handleSendFile = async (file: File) => {
    if (!currentUser || !friend) return

    setUploading(true)

    // 上传文件
    const result = await uploadFile(file, currentUser.id)
    
    if (!result.success || !result.url) {
      console.error('文件上传失败:', result.error)
      showToast(result.error || '文件上传失败', 'error')
      setUploading(false)
      return
    }

    // 确定消息类型
    const messageType: MessageType = isImageFile(file.type) ? 'image' : 'file'

    // 乐观更新 UI
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

    // 发送到数据库
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
      // 发送失败，移除临时消息
      setMessages((prev) => {
        const updated = prev.filter((m) => m.id !== tempMessage.id)
        setCachedMessages(friendId, updated)
        return updated
      })
      showToast('文件发送失败，请重试', 'error')
      console.error('发送失败:', error)
    } else if (data) {
      // 用真实消息替换临时消息
      setMessages((prev) => {
        const updated = prev.map((m) => (m.id === tempMessage.id ? data as Message : m))
        setCachedMessages(friendId, updated)
        return updated
      })
    }

    setUploading(false)
  }

  // 只有在没有缓存数据时才显示加载状态
  if (loading) {
    // 只在首次进入页面时显示 loading，切换聊天时直接渲染缓存内容
    return (
      <>
        <ChatList 
          conversations={conversations} 
          currentUser={currentUser}
          selectedFriendId={friendId}
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
          onlineUsers={onlineUsers}
        />
        <div className="flex-1 flex items-center justify-center bg-[#F2F0E9] dark:bg-[#121212]">
          <p className="font-mono text-xs text-gray-400 uppercase tracking-widest">Loading...</p>
        </div>
      </>
    )
  }

  const isFriendOnline = friend ? isUserOnline(friend.id) : false
  const isFriendTyping = friend ? isUserTyping(friend.id) : false

  return (
    <>
      {/* 左侧好友列表 */}
      <ChatList 
        conversations={conversations} 
        currentUser={currentUser}
        selectedFriendId={friendId}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
        onMobileOpen={() => setMobileMenuOpen(true)}
        onlineUsers={onlineUsers}
      />

      {/* 右侧聊天区域 - 杂志风格 */}
      <div className="flex-1 flex flex-col bg-[#F2F0E9] dark:bg-[#121212] relative">
        {/* 聊天头部 - 杂志风格 */}
        <header className="h-16 flex items-center justify-between px-8 border-b border-black/10 dark:border-white/10">
          <div className="flex items-center gap-4">
            {/* 侧边栏按钮，移动端显示 */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-2 hover:bg-black/5 dark:hover:bg-white/5 text-gray-600 dark:text-gray-300"
              aria-label="打开侧边栏"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <span className="font-mono text-xs text-black/40 dark:text-white/40 uppercase tracking-widest">Conversation with</span>
            <span className="text-xl font-serif font-bold">
              {friend?.display_name || friend?.username || 'Loading...'}
            </span>
            {isFriendOnline && (
              <span className="font-mono text-xs text-[#D93025] dark:text-[#FF4D4D]">● LIVE</span>
            )}
          </div>
          <div className="flex gap-2">
            <button className="w-8 h-8 flex items-center justify-center border border-black/20 dark:border-white/20 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
            </button>
            <button className="w-8 h-8 flex items-center justify-center border border-black/20 dark:border-white/20 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="12" cy="5" r="1"></circle>
                <circle cx="12" cy="19" r="1"></circle>
              </svg>
            </button>
          </div>
        </header>

        {/* 消息列表 - 杂志风格增加留白 */}
        {messages.length === 0 ? (
          <div className="flex-1 overflow-y-auto px-8 md:px-16 py-8 no-scrollbar pb-32 md:pb-36">
            <div className="text-center py-16 md:py-24">
              {/* 日期分隔 */}
              <div className="flex items-center justify-center mb-8">
                <span className="px-4 py-1 border border-black/20 dark:border-white/20 font-mono text-[10px] uppercase tracking-widest text-black/60 dark:text-white/60">
                  {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
              </div>
              <p className="font-serif text-xl text-gray-500 dark:text-gray-400 italic">
                This is the beginning of your conversation with {friend?.display_name || friend?.username}
              </p>
              <p className="font-mono text-xs text-gray-400 dark:text-gray-500 mt-4 uppercase tracking-widest">
                Send a message to start
              </p>
            </div>
          </div>
        ) : (
          <Virtuoso
            className="flex-1"
            data={messages}
            initialTopMostItemIndex={Math.max(messages.length - 1, 0)}
            followOutput={isAtBottom ? 'auto' : false}
            atBottomStateChange={setIsAtBottom}
            computeItemKey={(index, message) => message.id}
            overscan={200}
            itemContent={(index, message) => {
              const isOwn = message.sender_id === currentUser?.id
              const nextMessage = messages[index + 1]
              
              // 判断是否显示头像（该发送者的最后一条连续消息才显示）
              const showAvatar = !isOwn && (
                !nextMessage || 
                nextMessage.sender_id !== message.sender_id ||
                new Date(nextMessage.created_at).getTime() - new Date(message.created_at).getTime() > 60 * 1000
              )
              
              return (
                <div className="px-8 md:px-16 py-1.5">
                  <MessageBubble
                    message={message}
                    isOwn={isOwn}
                    sender={friend || undefined}
                    senderAvatar={friend?.avatar_url || undefined}
                    showAvatar={showAvatar}
                    showTime={
                      index === 0 ||
                      new Date(message.created_at).getTime() - 
                      new Date(messages[index - 1].created_at).getTime() > 
                      5 * 60 * 1000 // 5分钟间隔显示时间
                    }
                  />
                </div>
              )
            }}
            components={{
              Header: () => (
                <div className="pt-8 px-8 md:px-16">
                  {/* 日期分隔 */}
                  <div className="flex items-center justify-center mb-4">
                    <span className="px-4 py-1 border border-black/20 dark:border-white/20 font-mono text-[10px] uppercase tracking-widest text-black/60 dark:text-white/60">
                      {messages[0] ? new Date(messages[0].created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                    </span>
                  </div>
                </div>
              ),
              Footer: () => (
                <div className="px-8 md:px-16 pb-32 md:pb-36">
                  {isFriendTyping && (
                    <div className="flex justify-start">
                      <TypingIndicator />
                    </div>
                  )}
                </div>
              ),
            }}
          />
        )}

        {/* 输入框 */}
        <ChatInput 
          onSendMessage={handleSendMessage} 
          onSendFile={handleSendFile}
          onTyping={handleTyping}
          uploading={uploading}
        />
      </div>
    </>
  )
}

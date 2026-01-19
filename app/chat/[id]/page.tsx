'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { uploadFile } from '@/lib/storage'
import ChatList from '@/components/chat/ChatList'
import MessageBubble from '@/components/chat/MessageBubble'
import ChatInput from '@/components/chat/ChatInput'
import { OnlineIndicator, TypingIndicator } from '@/components/ui'
import { usePresence, useNotification } from '@/hooks'
import { getAvatarUrl, isImageFile } from '@/lib/utils'
import type { Profile, Message, Conversation, MessageType } from '@/types'

export default function ChatRoomPage() {
  const router = useRouter()
  const params = useParams()
  const friendId = params.id as string
  
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [friend, setFriend] = useState<Profile | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isUserScrollingRef = useRef(false)
  const lastMessageCountRef = useRef(0)
  const initialLoadRef = useRef(true)
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

  // 滚动到底部（不使用 smooth 动画避免干扰）
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [])

  // 监听滚动
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return
    
    const threshold = 150
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold
    
    // 如果用户不在底部，标记为用户正在滚动查看历史
    isUserScrollingRef.current = !isAtBottom
  }, [])

  // 消息变化时的滚动逻辑
  useEffect(() => {
    const messageCount = messages.length
    const prevCount = lastMessageCountRef.current
    lastMessageCountRef.current = messageCount

    // 初始加载完成后滚动到底部
    if (initialLoadRef.current && messageCount > 0) {
      initialLoadRef.current = false
      setTimeout(scrollToBottom, 50)
      return
    }

    // 如果有新消息
    if (messageCount > prevCount && prevCount > 0) {
      // 如果用户没有在滚动查看历史，则滚动到底部
      if (!isUserScrollingRef.current) {
        setTimeout(scrollToBottom, 50)
      }
    }
  }, [messages, scrollToBottom])

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

      // 获取当前用户档案
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', myId)
        .single()

      if (profile) {
        setCurrentUser(profile)
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

      // 获取历史消息
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
        })
        setMessages(updatedMessages)
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
                  return [...prev, messageWithRead]
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
                  
                  // 查找临时消息（根据内容和时间匹配）
                  const tempIndex = prev.findIndex(m => 
                    m.id.startsWith('temp_') && 
                    m.content === newMessage.content &&
                    m.sender_id === newMessage.sender_id
                  )
                  
                  if (tempIndex >= 0) {
                    // 替换临时消息为真实消息
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
            console.log('[Realtime] Message UPDATE received:', updatedMessage.id, 'is_read:', updatedMessage.is_read)
            
            // 只更新当前聊天相关的消息
            const isRelevant = 
              (updatedMessage.sender_id === friendId && updatedMessage.receiver_id === myId) ||
              (updatedMessage.sender_id === myId && updatedMessage.receiver_id === friendId)
            
            if (isRelevant) {
              setMessages((prev) => {
                const found = prev.find(m => m.id === updatedMessage.id)
                console.log('[Realtime] ✅ Updating message, found:', !!found, 'current is_read:', found?.is_read)
                return prev.map((m) => m.id === updatedMessage.id ? updatedMessage : m)
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
      console.log('[Cleanup] Removing channels')
      if (channel) {
        supabase.removeChannel(channel)
      }
      if (localReadStatusChannel) {
        supabase.removeChannel(localReadStatusChannel)
      }
    }
  }, [friendId, router]) // 依赖 friendId 和 router

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

    // 发送消息后重置滚动状态，允许自动滚动
    isUserScrollingRef.current = false

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
    setMessages((prev) => [...prev, tempMessage])

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
      setMessages((prev) => prev.filter((m) => m.id !== tempMessage.id))
      console.error('发送失败:', error)
    } else if (data) {
      // 用真实消息替换临时消息
      setMessages((prev) => 
        prev.map((m) => (m.id === tempMessage.id ? data : m))
      )
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
      alert(result.error || '文件上传失败')
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
      setMessages((prev) => prev.filter((m) => m.id !== tempMessage.id))
      console.error('发送失败:', error)
    } else if (data) {
      // 用真实消息替换临时消息
      setMessages((prev) => 
        prev.map((m) => (m.id === tempMessage.id ? data : m))
      )
    }

    setUploading(false)
  }

  if (loading) {
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
        <div className="flex-1 flex items-center justify-center bg-white dark:bg-[#0F0F0F]">
          <p className="text-gray-400">加载中...</p>
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

      {/* 右侧聊天区域 */}
      <div className="flex-1 flex flex-col bg-white dark:bg-[#0F0F0F] relative">
        {/* 聊天头部 - 液态玻璃效果 */}
        <div className="h-14 md:h-16 flex items-center justify-between px-3 md:px-6 z-10 glass-heavy border-b-0">
          <div className="flex items-center">
            {/* 移动端返回按钮 */}
            <button 
              onClick={() => router.push('/chat')}
              className="md:hidden p-2 -ml-1 mr-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full text-gray-600 dark:text-gray-300"
              title="返回"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6"></path>
              </svg>
            </button>
            {/* 在线状态指示器 */}
            <OnlineIndicator isOnline={isFriendOnline} size="md" className="mr-3" />
            <div className="flex flex-col">
              <span className="font-medium text-gray-900 dark:text-white text-sm md:text-base leading-tight">
                {friend?.display_name || friend?.username || '加载中...'}
              </span>
              {isFriendTyping ? (
                <span className="text-xs text-emerald-500 animate-pulse">正在输入...</span>
              ) : (
                <span className="text-xs text-gray-400">
                  {isFriendOnline ? '在线' : '离线'}
                </span>
              )}
            </div>
          </div>
          <button className="p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full text-gray-400">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="1"></circle>
              <circle cx="12" cy="5" r="1"></circle>
              <circle cx="12" cy="19" r="1"></circle>
            </svg>
          </button>
        </div>

        {/* 消息列表 */}
        <div 
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 no-scrollbar pb-32 md:pb-36"
        >
          {messages.length === 0 ? (
            <div className="text-center py-12 md:py-20">
              <img 
                src={friend?.avatar_url || getAvatarUrl(friend?.username || 'user')} 
                className="w-16 h-16 md:w-20 md:h-20 rounded-full mx-auto mb-4 bg-gray-100 dark:bg-gray-800"
                alt=""
              />
              <p className="text-gray-500 dark:text-gray-400 text-sm md:text-base">
                这是你和 {friend?.display_name || friend?.username} 的聊天开始
              </p>
              <p className="text-gray-400 dark:text-gray-500 text-xs md:text-sm mt-1">发送消息开始对话吧</p>
            </div>
          ) : (
            messages.map((message, index) => {
              const isOwn = message.sender_id === currentUser?.id
              const prevMessage = messages[index - 1]
              const nextMessage = messages[index + 1]
              
              // 判断是否显示头像（该发送者的最后一条连续消息才显示）
              const showAvatar = !isOwn && (
                !nextMessage || 
                nextMessage.sender_id !== message.sender_id ||
                new Date(nextMessage.created_at).getTime() - new Date(message.created_at).getTime() > 60 * 1000
              )
              
              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isOwn={isOwn}
                  senderAvatar={friend?.avatar_url || undefined}
                  showAvatar={showAvatar}
                  showTime={
                    index === 0 ||
                    new Date(message.created_at).getTime() - 
                    new Date(messages[index - 1].created_at).getTime() > 
                    5 * 60 * 1000 // 5分钟间隔显示时间
                  }
                />
              )
            })
          )}
          
          {/* 打字提示 */}
          {isFriendTyping && (
            <div className="flex justify-start">
              <TypingIndicator />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

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

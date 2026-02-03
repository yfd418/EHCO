'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Virtuoso } from 'react-virtuoso'
import { supabase } from '@/lib/supabase'
import { uploadFile } from '@/lib/storage'
import ChatList from '@/components/chat/ChatList'
import ChatInput from '@/components/chat/ChatInput'
import { useUserStore, useConversationStore, useChannelStore } from '@/stores'
import { getAvatarUrl, isImageFile, formatFullTime, formatFileSize } from '@/lib/utils'
import type { Profile, Channel, ChannelMember, ChannelMessage, MessageType, Conversation } from '@/types'

export default function ChannelPage() {
  const router = useRouter()
  const params = useParams()
  const channelId = params.id as string
  
  // 使用 Zustand stores 获取缓存数据
  const currentUser = useUserStore((s) => s.currentUser)
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)
  const conversations = useConversationStore((s) => s.conversations)
  const setConversations = useConversationStore((s) => s.setConversations)
  
  // 频道数据缓存
  const getChannel = useChannelStore((s) => s.getChannel)
  const setChannelCache = useChannelStore((s) => s.setChannel)
  const getMembers = useChannelStore((s) => s.getMembers)
  const setMembersCache = useChannelStore((s) => s.setMembers)
  const getMessages = useChannelStore((s) => s.getMessages)
  const setMessagesCache = useChannelStore((s) => s.setMessages)
  const addMessageCache = useChannelStore((s) => s.addMessage)
  
  // 从缓存获取初始数据
  const cachedChannel = getChannel(channelId)
  const cachedMembers = getMembers(channelId)
  const cachedMessages = getMessages(channelId)
  
  const [channel, setChannel] = useState<Channel | null>(cachedChannel)
  const [members, setMembers] = useState<ChannelMember[]>(cachedMembers)
  const [messages, setMessages] = useState<ChannelMessage[]>(cachedMessages)
  
  // 只有没有缓存数据时才显示 loading
  const [loading, setLoading] = useState(() => cachedMessages.length === 0)
  const [uploading, setUploading] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)
  
  // 同步缓存到本地状态
  useEffect(() => {
    if (cachedChannel && !channel) setChannel(cachedChannel)
    if (cachedMembers.length > 0 && members.length === 0) setMembers(cachedMembers)
    if (cachedMessages.length > 0 && messages.length === 0) {
      setMessages(cachedMessages)
      setLoading(false)
    }
  }, [cachedChannel, cachedMembers, cachedMessages, channel, members.length, messages.length])

  // 获取数据
  useEffect(() => {
    let messageChannel: ReturnType<typeof supabase.channel> | null = null

    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/')
        return
      }

      // 获取当前用户（如果没有缓存）
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
          const convs: Conversation[] = friendships.map((f: { friend: Profile }) => ({
            friend: f.friend,
            last_message: null,
            unread_count: 0,
          }))
          setConversations(convs)
        }
      }

      // 获取频道信息
      const { data: channelData } = await supabase
        .from('channels')
        .select('*, owner:profiles!channels_owner_id_fkey(*)')
        .eq('id', channelId)
        .single()

      if (channelData) {
        const ch = channelData as Channel
        setChannel(ch)
        setChannelCache(channelId, ch)
      } else {
        router.push('/chat')
        return
      }

      // 获取频道成员
      const { data: membersData } = await supabase
        .from('channel_members')
        .select('*, user:profiles!channel_members_user_id_fkey(*)')
        .eq('channel_id', channelId)
        .order('joined_at', { ascending: true })

      if (membersData) {
        const m = membersData as ChannelMember[]
        setMembers(m)
        setMembersCache(channelId, m)
      }

      // 获取消息
      const { data: messagesData } = await supabase
        .from('channel_messages')
        .select('*, sender:profiles!channel_messages_sender_id_fkey(*)')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(100)

      if (messagesData) {
        const msgs = messagesData as ChannelMessage[]
        setMessages(msgs)
        setMessagesCache(channelId, msgs)
      }

      setLoading(false)

      // 更新最后阅读时间
      await supabase
        .from('channel_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('channel_id', channelId)
        .eq('user_id', session.user.id)

      // 监听新消息 - 使用唯一的频道名避免重复订阅问题
      messageChannel = supabase
        .channel(`channel-messages-${channelId}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'channel_messages',
            filter: `channel_id=eq.${channelId}`,
          },
          async (payload) => {
            const newMsgPayload = payload.new as { id: string; sender_id: string }
            
            // 如果是自己发送的消息，乐观更新已经处理过了
            // 检查是否已存在（防止重复）
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsgPayload.id)) {
                return prev
              }
              // 不是自己的消息，需要获取完整信息
              return prev
            })
            
            // 获取完整消息（包含发送者信息）
            const { data: newMsg } = await supabase
              .from('channel_messages')
              .select('*, sender:profiles!channel_messages_sender_id_fkey(*)')
              .eq('id', newMsgPayload.id)
              .single()

            if (newMsg) {
              const msg = newMsg as ChannelMessage
              setMessages((prev) => {
                // 防止重复（可能乐观更新已经添加过）
                if (prev.some((m) => m.id === msg.id)) return prev
                // 检查是否有对应的临时消息需要替换
                const tempIndex = prev.findIndex(
                  (m) =>
                    m.id.startsWith('temp_') &&
                    m.sender_id === msg.sender_id &&
                    m.content === msg.content &&
                    m.message_type === msg.message_type
                )
                if (tempIndex >= 0) {
                  // 替换临时消息
                  const updated = [...prev]
                  updated[tempIndex] = msg
                  setMessagesCache(channelId, updated.filter((m) => !m.id.startsWith('temp_')))
                  return updated
                }
                // 新消息来自其他用户
                const updated = [...prev, msg]
                setMessagesCache(channelId, updated.filter((m) => !m.id.startsWith('temp_')))
                return updated
              })
            }
          }
        )
        .subscribe()
    }

    fetchData()

    return () => {
      if (messageChannel) {
        supabase.removeChannel(messageChannel)
      }
    }
  }, [channelId, router])

  // 发送消息
  const handleSendMessage = async (content: string) => {
    if (!currentUser || !channel) return

    // 创建临时消息（乐观更新）
    const tempId = `temp_${Date.now()}`
    const tempMessage: ChannelMessage = {
      id: tempId,
      channel_id: channel.id,
      sender_id: currentUser.id,
      sender: currentUser,
      content,
      message_type: 'text',
      file_url: null,
      file_name: null,
      file_size: null,
      file_type: null,
      reply_to: null,
      created_at: new Date().toISOString(),
    }

    // 立即添加到消息列表（乐观更新）
    setMessages((prev) => [...prev, tempMessage])

    const { data, error } = await supabase
      .from('channel_messages')
      .insert({
        channel_id: channel.id,
        sender_id: currentUser.id,
        content,
        message_type: 'text',
      })
      .select('*, sender:profiles!channel_messages_sender_id_fkey(*)')
      .single()

    if (error) {
      console.error('发送失败:', error)
      // 发送失败，移除临时消息
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
    } else if (data) {
      // 发送成功，替换临时消息为真实消息
      const realMessage = data as ChannelMessage
      setMessages((prev) => {
        const updated = prev.map((m) => (m.id === tempId ? realMessage : m))
        setMessagesCache(channelId, updated.filter((m) => !m.id.startsWith('temp_')))
        return updated
      })
    }
  }

  // 发送文件
  const handleSendFile = async (file: File) => {
    if (!currentUser || !channel) return

    setUploading(true)
    const result = await uploadFile(file, currentUser.id)
    
    if (!result.success || !result.url) {
      alert(result.error || '文件上传失败')
      setUploading(false)
      return
    }

    const messageType: MessageType = isImageFile(file.type) ? 'image' : 'file'

    // 创建临时消息（乐观更新）
    const tempId = `temp_${Date.now()}`
    const tempMessage: ChannelMessage = {
      id: tempId,
      channel_id: channel.id,
      sender_id: currentUser.id,
      sender: currentUser,
      content: '',
      message_type: messageType,
      file_url: result.url,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      reply_to: null,
      created_at: new Date().toISOString(),
    }

    // 立即添加到消息列表（乐观更新）
    setMessages((prev) => [...prev, tempMessage])

    const { data, error } = await supabase
      .from('channel_messages')
      .insert({
        channel_id: channel.id,
        sender_id: currentUser.id,
        content: '',
        message_type: messageType,
        file_url: result.url,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
      })
      .select('*, sender:profiles!channel_messages_sender_id_fkey(*)')
      .single()

    if (error) {
      console.error('发送文件失败:', error)
      // 发送失败，移除临时消息
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
    } else if (data) {
      // 发送成功，替换临时消息为真实消息
      const realMessage = data as ChannelMessage
      setMessages((prev) => {
        const updated = prev.map((m) => (m.id === tempId ? realMessage : m))
        setMessagesCache(channelId, updated.filter((m) => !m.id.startsWith('temp_')))
        return updated
      })
    }

    setUploading(false)
  }

  // 邀请成员
  const handleInvite = async () => {
    if (!inviteUsername.trim() || !channel) return
    
    setInviting(true)
    setInviteError(null)

    // 查找用户
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', inviteUsername.toLowerCase().trim())
      .single()

    if (userError || !user) {
      setInviteError('未找到该用户')
      setInviting(false)
      return
    }

    // 检查是否已是成员
    const { data: existing } = await supabase
      .from('channel_members')
      .select('id')
      .eq('channel_id', channel.id)
      .eq('user_id', user.id)
      .single()

    if (existing) {
      setInviteError('该用户已是频道成员')
      setInviting(false)
      return
    }

    // 添加成员
    const { error } = await supabase
      .from('channel_members')
      .insert({
        channel_id: channel.id,
        user_id: user.id,
        role: 'member',
      })

    if (error) {
      setInviteError('邀请失败: ' + error.message)
    } else {
      setInviteUsername('')
      setInviteError(null)
      // 刷新成员列表
      const { data: membersData } = await supabase
        .from('channel_members')
        .select('*, user:profiles!channel_members_user_id_fkey(*)')
        .eq('channel_id', channel.id)
        .order('joined_at', { ascending: true })
      if (membersData) {
        setMembers(membersData as ChannelMember[])
      }
    }
    setInviting(false)
  }

  // 退出频道
  const handleLeaveChannel = async () => {
    if (!currentUser || !channel) return
    if (!confirm('确定要退出该频道吗？')) return

    await supabase
      .from('channel_members')
      .delete()
      .eq('channel_id', channel.id)
      .eq('user_id', currentUser.id)

    router.push('/chat')
  }

  // 获取我的角色
  const myRole = members.find(m => m.user_id === currentUser?.id)?.role

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F2F0E9] dark:bg-[#121212]">
        <p className="font-mono text-xs text-gray-400 uppercase tracking-widest">Loading...</p>
      </div>
    )
  }

  return (
    <div className="h-screen flex bg-[#F2F0E9] dark:bg-[#121212]">
      {/* 侧边栏 */}
      <ChatList
        conversations={conversations}
        currentUser={currentUser}
        selectedFriendId={null}
        selectedChannelId={channelId}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      {/* 主聊天区域 */}
      <div className="flex-1 flex flex-col">
        {/* 头部 - 杂志风格 */}
        <header className="h-16 flex items-center justify-between px-8 border-b border-black/10 dark:border-white/10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-2 hover:bg-black/5 dark:hover:bg-white/5 text-gray-600 dark:text-gray-300"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <span className="font-mono text-xs text-black/40 dark:text-white/40 uppercase tracking-widest">Channel</span>
            <span className="text-xl font-serif font-bold">{channel?.name}</span>
            <span className="font-mono text-xs text-black/40 dark:text-white/40">{members.length} members</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowMembers(!showMembers)}
              className="w-8 h-8 flex items-center justify-center border border-black/20 dark:border-white/20 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </button>
          </div>
        </header>

        {/* 消息列表 - 杂志风格 */}
        {messages.length === 0 ? (
          <div className="flex-1 overflow-y-auto px-8 md:px-16 py-8 no-scrollbar pb-32">
            <div className="text-center py-16">
              <div className="flex items-center justify-center mb-8">
                <span className="px-4 py-1 border border-black/20 dark:border-white/20 font-mono text-[10px] uppercase tracking-widest text-black/60 dark:text-white/60">
                  {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
              </div>
              <p className="font-serif text-xl text-gray-500 dark:text-gray-400 italic">
                Welcome to {channel?.name}
              </p>
              <p className="font-mono text-xs text-gray-400 dark:text-gray-500 mt-4 uppercase tracking-widest">
                Send a message to start
              </p>
            </div>
          </div>
        ) : (
          <Virtuoso
            className="flex-1 overflow-x-hidden no-scrollbar"
            data={messages}
            initialTopMostItemIndex={Math.max(messages.length - 1, 0)}
            followOutput={isAtBottom ? 'auto' : false}
            atBottomStateChange={setIsAtBottom}
            computeItemKey={(index, message) => message.id}
            overscan={200}
            itemContent={(index, message) => {
              const isOwn = message.sender_id === currentUser?.id
              const showSender = index === 0 || messages[index - 1].sender_id !== message.sender_id
              const sender = message.sender

              return (
                <div className="px-8 md:px-16 py-2">
                  <div className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isOwn ? 'ml-auto items-end text-right' : 'items-start text-left'}`}>
                    
                    {/* 发送者名字 - 杂志风格 */}
                    {!isOwn && showSender && (
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono text-xs font-bold uppercase tracking-widest text-[#D93025] dark:text-[#FF4D4D]">
                          {sender?.display_name || sender?.username || 'Unknown'}
                        </span>
                        <span className="w-8 h-[1px] bg-black/20 dark:bg-white/20"></span>
                      </div>
                    )}

                    {/* 消息主体：侧边线 */}
                    <div className={`relative py-1 ${
                      isOwn 
                        ? 'pr-6 border-r-2 border-black dark:border-white' 
                        : 'pl-6 border-l-2 border-gray-300 dark:border-gray-600'
                    }`}>
                      
                      {/* 图片 */}
                      {message.file_url && message.message_type === 'image' && (
                        <a href={message.file_url} target="_blank" rel="noopener noreferrer" className="block mb-3">
                          <img
                            src={message.file_url}
                            alt={message.file_name || '图片'}
                            className="max-w-[280px] max-h-[280px] sharp border border-black/10 dark:border-white/10 grayscale hover:grayscale-0 transition-all duration-500"
                          />
                          <p className="text-xs font-mono text-gray-400 mt-1 italic">{message.file_name}</p>
                        </a>
                      )}
                      
                      {/* 文件 */}
                      {message.file_url && message.message_type === 'file' && (
                        <a
                          href={message.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 mb-3 hover:opacity-80 transition-opacity"
                        >
                          <div className="w-10 h-10 border border-black/20 dark:border-white/20 flex items-center justify-center">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                              <polyline points="13 2 13 9 20 9"></polyline>
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-medium truncate max-w-[180px]">{message.file_name}</p>
                            <p className="text-xs font-mono text-gray-400">
                              {message.file_size ? formatFileSize(message.file_size) : '文件'}
                            </p>
                          </div>
                        </a>
                      )}
                      
                      {/* 文本 - 大号衬线体 */}
                      {message.content && (
                        <p className="font-serif text-xl leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
                      )}
                    </div>
                    
                    {/* 时间 - 等宽字体 */}
                    <span className="text-[10px] font-mono text-gray-400 mt-2 uppercase tracking-wide">
                      {formatFullTime(message.created_at)}
                    </span>
                  </div>
                </div>
              )
            }}
            components={{
              Header: () => (
                <div className="pt-8 px-8 md:px-16">
                  <div className="flex items-center justify-center mb-4">
                    <span className="px-4 py-1 border border-black/20 dark:border-white/20 font-mono text-[10px] uppercase tracking-widest text-black/60 dark:text-white/60">
                      {messages[0] ? new Date(messages[0].created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                    </span>
                  </div>
                </div>
              ),
              Footer: () => <div className="pb-32" />,
            }}
          />
        )}

        {/* 输入框 */}
        <ChatInput
          onSendMessage={handleSendMessage}
          onSendFile={handleSendFile}
          uploading={uploading}
        />
      </div>

      {/* 成员侧边栏 */}
      {showMembers && (
        <div
          className="fixed inset-0 z-40 flex md:static md:w-72 md:border-l md:border-gray-100 md:dark:border-gray-800 md:bg-gray-50 md:dark:bg-[#1A1A1A] md:flex-col"
        >
          {/* 蒙层，仅移动端显示，点击关闭 */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm md:hidden z-0"
            onClick={() => setShowMembers(false)}
          />
          <div className="relative z-10 w-full max-w-md mx-auto md:max-w-none md:w-full h-full flex flex-col bg-gray-50 dark:bg-[#1A1A1A] md:bg-transparent md:dark:bg-transparent border-l border-gray-100 dark:border-gray-800 md:border-none rounded-t-2xl md:rounded-none shadow-2xl md:shadow-none">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h2 className="font-medium text-gray-900 dark:text-white">成员 ({members.length})</h2>
            {/* 关闭按钮，仅移动端显示 */}
            <button
              className="md:hidden p-2 ml-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400"
              onClick={() => setShowMembers(false)}
              aria-label="关闭"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          
          {/* 邀请入口 - 杂志风格 */}
          {(myRole === 'owner' || myRole === 'admin') && (
            <div className="p-4 border-b border-[var(--color-ink)]/10">
              {showInvite ? (
                <div className="space-y-3">
                  <div className="flex items-center border-b border-[var(--color-ink)]/20 focus-within:border-[var(--color-ink)]">
                    <input
                      type="text"
                      value={inviteUsername}
                      onChange={(e) => setInviteUsername(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                      placeholder="输入用户名..."
                      className="flex-1 min-w-0 bg-transparent px-0 py-2 focus:outline-none text-sm text-[var(--color-ink)] placeholder-[var(--color-ink)]/40"
                    />
                    <button
                      onClick={handleInvite}
                      disabled={inviting}
                      className="flex-shrink-0 px-3 py-1.5 bg-[var(--color-ink)] text-[var(--color-paper)] font-mono text-xs uppercase tracking-wider hover:bg-[var(--color-ink)]/80 disabled:opacity-50"
                    >
                      {inviting ? '...' : '邀请'}
                    </button>
                  </div>
                  {inviteError && (
                    <p className="font-mono text-xs text-[var(--color-accent)] px-0">{inviteError}</p>
                  )}
                  <div className="flex justify-end">
                    <button
                      onClick={() => { setShowInvite(false); setInviteError(null) }}
                      className="font-mono text-xs text-[var(--color-ink)]/40 hover:text-[var(--color-ink)]/70 uppercase tracking-wider"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowInvite(true)}
                  className="w-full py-2 font-mono text-xs uppercase tracking-widest text-[var(--color-ink)]/60 hover:text-[var(--color-ink)] hover:bg-[var(--color-ink)]/5 flex items-center justify-center gap-2 transition-all"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="8.5" cy="7" r="4"></circle>
                    <line x1="20" y1="8" x2="20" y2="14"></line>
                    <line x1="23" y1="11" x2="17" y2="11"></line>
                  </svg>
                  Invite Member
                </button>
              )}
            </div>
          )}

          {/* 成员列表 - 杂志风格 */}
          <div className="flex-1 overflow-y-auto p-4">
            {members.map((member, index) => (
              <div
                key={member.id}
                className="flex items-center py-3 border-b border-[var(--color-ink)]/5 hover:bg-[var(--color-ink)]/5 transition-all"
              >
                <span className="font-mono text-xs text-[var(--color-ink)]/30 w-6">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <img
                  src={member.user?.avatar_url || getAvatarUrl(member.user?.username || 'user')}
                  alt=""
                  className="w-8 h-8 ml-2"
                />
                <div className="ml-3 flex-1 min-w-0">
                  <p className="font-serif text-sm text-[var(--color-ink)] truncate">
                    {member.user?.display_name || member.user?.username}
                  </p>
                  <p className="font-mono text-xs text-[var(--color-ink)]/40 uppercase tracking-wider">
                    {member.role === 'owner' ? 'OWNER' : member.role === 'admin' ? 'ADMIN' : 'MEMBER'}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* 退出频道 - 杂志风格 */}
          {myRole !== 'owner' && (
            <div className="p-4 border-t border-[var(--color-ink)]/10">
              <button
                onClick={handleLeaveChannel}
                className="w-full py-2 font-mono text-xs uppercase tracking-widest text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-all"
              >
                Leave Channel
              </button>
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  )
}

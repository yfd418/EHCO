'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { uploadFile } from '@/lib/storage'
import ChatList from '@/components/chat/ChatList'
import ChatInput from '@/components/chat/ChatInput'
import { getAvatarUrl, isImageFile, formatFullTime, formatFileSize } from '@/lib/utils'
import type { Profile, Channel, ChannelMember, ChannelMessage, MessageType, Conversation } from '@/types'

export default function ChannelPage() {
  const router = useRouter()
  const params = useParams()
  const channelId = params.id as string
  
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [channel, setChannel] = useState<Channel | null>(null)
  const [members, setMembers] = useState<ChannelMember[]>([])
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const isUserScrollingRef = useRef(false)

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [])

  // 监听滚动
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const threshold = 150
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold
    isUserScrollingRef.current = !isAtBottom
  }, [])

  // 尝试从缓存恢复数据
  useEffect(() => {
    try {
      const cachedUser = sessionStorage.getItem('echo-current-user')
      const cachedConvs = sessionStorage.getItem('echo-conversations')
      
      if (cachedUser) {
        setCurrentUser(JSON.parse(cachedUser))
      }
      if (cachedConvs) {
        setConversations(JSON.parse(cachedConvs))
      }
    } catch (e) {
      // 忽略缓存读取错误
    }
  }, [])

  // 获取数据
  useEffect(() => {
    let messageChannel: ReturnType<typeof supabase.channel> | null = null

    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/')
        return
      }

      // 获取当前用户
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (profile) {
        setCurrentUser(profile)
        try {
          sessionStorage.setItem('echo-current-user', JSON.stringify(profile))
        } catch (e) { /* 忽略 */ }
      }

      // 获取好友列表（已接受的好友关系）
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
        try {
          sessionStorage.setItem('echo-conversations', JSON.stringify(convs))
        } catch (e) { /* 忽略 */ }
      }

      // 获取频道信息
      const { data: channelData } = await supabase
        .from('channels')
        .select('*, owner:profiles!channels_owner_id_fkey(*)')
        .eq('id', channelId)
        .single()

      if (channelData) {
        setChannel(channelData as Channel)
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
        setMembers(membersData as ChannelMember[])
      }

      // 获取消息
      const { data: messagesData } = await supabase
        .from('channel_messages')
        .select('*, sender:profiles!channel_messages_sender_id_fkey(*)')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(100)

      if (messagesData) {
        setMessages(messagesData as ChannelMessage[])
      }

      setLoading(false)
      setTimeout(scrollToBottom, 100)

      // 更新最后阅读时间
      await supabase
        .from('channel_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('channel_id', channelId)
        .eq('user_id', session.user.id)

      // 监听新消息
      messageChannel = supabase
        .channel(`channel-messages-${channelId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'channel_messages',
            filter: `channel_id=eq.${channelId}`,
          },
          async (payload) => {
            // 获取完整消息（包含发送者信息）
            const { data: newMsg } = await supabase
              .from('channel_messages')
              .select('*, sender:profiles!channel_messages_sender_id_fkey(*)')
              .eq('id', payload.new.id)
              .single()

            if (newMsg) {
              setMessages((prev) => [...prev, newMsg as ChannelMessage])
              if (!isUserScrollingRef.current) {
                setTimeout(scrollToBottom, 50)
              }
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
  }, [channelId, router, scrollToBottom])

  // 发送消息
  const handleSendMessage = async (content: string) => {
    if (!currentUser || !channel) return

    const { error } = await supabase
      .from('channel_messages')
      .insert({
        channel_id: channel.id,
        sender_id: currentUser.id,
        content,
        message_type: 'text',
      })

    if (error) {
      console.error('发送失败:', error)
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

    await supabase
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
      <div className="h-screen flex items-center justify-center bg-white dark:bg-[#0F0F0F]">
        <p className="text-gray-400">加载中...</p>
      </div>
    )
  }

  return (
    <div className="h-screen flex bg-white dark:bg-[#0F0F0F]">
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
        {/* 头部 */}
        <div className="h-14 md:h-16 flex items-center justify-between px-4 md:px-6 glass-heavy">
          <div className="flex items-center">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-2 mr-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full text-gray-600 dark:text-gray-300"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <div 
              className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-medium"
            >
              {channel?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="ml-3">
              <h1 className="font-medium text-gray-900 dark:text-white">{channel?.name}</h1>
              <p className="text-xs text-gray-400">{members.length} 位成员</p>
            </div>
          </div>
          <button
            onClick={() => setShowMembers(!showMembers)}
            className="p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full text-gray-400"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </button>
        </div>

        {/* 消息列表 */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8 space-y-4 no-scrollbar pb-32"
        >
          {messages.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl font-medium">
                {channel?.name?.charAt(0).toUpperCase()}
              </div>
              <p className="text-gray-500 dark:text-gray-400">
                欢迎来到 {channel?.name}
              </p>
              <p className="text-gray-400 text-sm mt-1">发送消息开始聊天吧</p>
            </div>
          ) : (
            messages.map((message, index) => {
              const isOwn = message.sender_id === currentUser?.id
              const showSender = index === 0 || messages[index - 1].sender_id !== message.sender_id
              const sender = message.sender

              return (
                <div key={message.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex ${isOwn ? 'flex-row-reverse' : 'flex-row'} items-end gap-2 max-w-[80%]`}>
                    {/* 头像 */}
                    {!isOwn && (
                      <div className={showSender ? 'visible' : 'invisible'}>
                        <img
                          src={sender?.avatar_url || getAvatarUrl(sender?.username || 'user')}
                          alt=""
                          className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800"
                        />
                      </div>
                    )}
                    
                    <div className="flex flex-col">
                      {/* 发送者名称 */}
                      {!isOwn && showSender && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 mb-1 ml-1">
                          {sender?.display_name || sender?.username}
                        </span>
                      )}
                      
                      {/* 消息气泡 */}
                      <div
                        className={`text-sm leading-relaxed overflow-hidden ${
                          isOwn
                            ? 'bg-black dark:bg-white text-white dark:text-black rounded-2xl rounded-br-none'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-2xl rounded-bl-none'
                        } ${message.file_url && message.message_type === 'image' ? 'p-2' : 'px-4 py-3'}`}
                      >
                        {/* 图片 */}
                        {message.file_url && message.message_type === 'image' && (
                          <a href={message.file_url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={message.file_url}
                              alt={message.file_name || '图片'}
                              className="max-w-[280px] max-h-[280px] rounded-lg"
                            />
                          </a>
                        )}
                        
                        {/* 文件 */}
                        {message.file_url && message.message_type === 'file' && (
                          <a
                            href={message.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3"
                          >
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              isOwn ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700'
                            }`}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                                <polyline points="13 2 13 9 20 9"></polyline>
                              </svg>
                            </div>
                            <div>
                              <p className="text-sm font-medium truncate max-w-[180px]">{message.file_name}</p>
                              <p className={`text-xs ${isOwn ? 'text-white/60' : 'text-gray-400'}`}>
                                {message.file_size ? formatFileSize(message.file_size) : '文件'}
                              </p>
                            </div>
                          </a>
                        )}
                        
                        {/* 文本 */}
                        {message.content && (
                          <p className="whitespace-pre-wrap break-words">{message.content}</p>
                        )}
                      </div>
                      
                      {/* 时间 */}
                      <span className={`text-[10px] text-gray-400 mt-1 ${isOwn ? 'text-right' : 'text-left'}`}>
                        {formatFullTime(message.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

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
          
          {/* 邀请入口 */}
          {(myRole === 'owner' || myRole === 'admin') && (
            <div className="p-4 border-b border-gray-100 dark:border-gray-800">
              {showInvite ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 bg-white dark:bg-[#0F0F0F] border border-gray-200 dark:border-gray-700 rounded-full px-3 py-2 focus-within:ring-2 focus-within:ring-black/5 dark:focus-within:ring-white/10 transition-all w-full">
                    <input
                      type="text"
                      value={inviteUsername}
                      onChange={(e) => setInviteUsername(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                      placeholder="输入用户名..."
                      className="flex-1 min-w-0 bg-transparent px-2 focus:outline-none text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 disabled:opacity-50"
                    />
                    <button
                      onClick={handleInvite}
                      disabled={inviting}
                      className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-all text-sm font-medium shadow-md
                        ${!inviting ? 'bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}
                    >
                      {inviting ? (
                        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" strokeOpacity="0.25"></circle>
                          <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"></path>
                        </svg>
                      ) : '邀请'}
                    </button>
                  </div>
                  {inviteError && (
                    <p className="text-xs text-red-500 px-2 pt-1">{inviteError}</p>
                  )}
                  <div className="flex justify-end">
                    <button
                      onClick={() => { setShowInvite(false); setInviteError(null) }}
                      className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowInvite(true)}
                  className="w-full py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg flex items-center justify-center gap-2"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="8.5" cy="7" r="4"></circle>
                    <line x1="20" y1="8" x2="20" y2="14"></line>
                    <line x1="23" y1="11" x2="17" y2="11"></line>
                  </svg>
                  邀请成员
                </button>
              )}
            </div>
          )}

          {/* 成员列表 */}
          <div className="flex-1 overflow-y-auto p-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <img
                  src={member.user?.avatar_url || getAvatarUrl(member.user?.username || 'user')}
                  alt=""
                  className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700"
                />
                <div className="ml-3 flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {member.user?.display_name || member.user?.username}
                  </p>
                  <p className="text-xs text-gray-400">
                    {member.role === 'owner' ? '创建者' : member.role === 'admin' ? '管理员' : '成员'}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* 退出频道 */}
          {myRole !== 'owner' && (
            <div className="p-4 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={handleLeaveChannel}
                className="w-full py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
              >
                退出频道
              </button>
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  )
}

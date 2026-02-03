'use client'
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ThemeToggle from '@/components/ThemeToggle'
import { OnlineIndicator } from '@/components/ui'
import type { Profile, Conversation, Channel, ChannelConversation } from '@/types'
import { formatMessageTime, getAvatarUrl, truncateText } from '@/lib/utils'
import { cleanupPresence } from '@/hooks'

// 待处理的好友请求类型
interface PendingRequest {
  id: string
  user_id: string
  created_at: string
  requester: Profile
}

interface ChannelMemberRow {
  role: string
  channel: Channel | null
}

interface ChatListProps {
  conversations: Conversation[]
  currentUser: Profile | null
  selectedFriendId: string | null
  selectedChannelId?: string | null
  mobileOpen?: boolean
  onMobileClose?: () => void
  onMobileOpen?: () => void
  onlineUsers?: Set<string>
}

export default function ChatList({ 
  conversations, 
  currentUser, 
  selectedFriendId,
  selectedChannelId,
  mobileOpen = false,
  onMobileClose,
  onMobileOpen,
  onlineUsers = new Set(),
}: ChatListProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResult, setSearchResult] = useState<Profile | null>(null)
  const [searching, setSearching] = useState(false)
  const [showAddFriend, setShowAddFriend] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  
  // 好友请求相关状态
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([])
  const [showRequests, setShowRequests] = useState(false)
  const [processingRequest, setProcessingRequest] = useState<string | null>(null)

  // 频道相关状态
  const [channels, setChannels] = useState<ChannelConversation[]>([])
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [creatingChannel, setCreatingChannel] = useState(false)
  const [activeTab, setActiveTab] = useState<'chats' | 'channels'>('chats')
  
  // 手势相关状态
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const drawerRef = useRef<HTMLDivElement>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  // 获取待处理的好友请求
  const fetchPendingRequests = useCallback(async () => {
    if (!currentUser) return
    
    const { data } = await supabase
      .from('friendships')
      .select(`
        id,
        user_id,
        created_at,
        requester:profiles!friendships_user_id_fkey(*)
      `)
      .eq('friend_id', currentUser.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (data) {
      setPendingRequests(data as unknown as PendingRequest[])
    }
  }, [currentUser])

  // 初始化时获取好友请求
  useEffect(() => {
    fetchPendingRequests()
  }, [fetchPendingRequests])

  // 监听好友请求变化（实时更新）
  useEffect(() => {
    if (!currentUser) return

    const channel = supabase
      .channel('friend-requests')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
          filter: `friend_id=eq.${currentUser.id}`,
        },
        () => {
          fetchPendingRequests()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUser, fetchPendingRequests])

  // 接受好友请求
  const handleAcceptRequest = async (request: PendingRequest) => {
    setProcessingRequest(request.id)
    
    // 更新原有的请求状态为 accepted，并创建反向好友关系
    const { error } = await supabase.from('friendships').upsert([
      { id: request.id, user_id: request.user_id, friend_id: currentUser!.id, status: 'accepted' },
      { user_id: currentUser!.id, friend_id: request.user_id, status: 'accepted' },
    ])

    if (!error) {
      setPendingRequests(prev => prev.filter(r => r.id !== request.id))
      window.location.reload() // 刷新以更新好友列表
    }
    setProcessingRequest(null)
  }

  // 拒绝好友请求
  const handleRejectRequest = async (request: PendingRequest) => {
    setProcessingRequest(request.id)
    
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', request.id)

    if (!error) {
      setPendingRequests(prev => prev.filter(r => r.id !== request.id))
    }
    setProcessingRequest(null)
  }

  // 获取用户加入的频道
  const fetchChannels = useCallback(async () => {
    if (!currentUser) return
    
    const { data } = await supabase
      .from('channel_members')
      .select(`
        role,
        channel:channels(*)
      `)
      .eq('user_id', currentUser.id)

    if (data) {
      const channelRows = data as ChannelMemberRow[]
      const channelConvs: ChannelConversation[] = channelRows
        .filter((d) => d.channel)
        .map((d) => ({
          channel: d.channel as Channel,
          last_message: null,
          unread_count: 0,
          my_role: d.role,
        }))
      setChannels(channelConvs)
    }
  }, [currentUser])

  // 初始化时获取频道
  useEffect(() => {
    fetchChannels()
  }, [fetchChannels])

  // 创建新频道
  const handleCreateChannel = async () => {
    if (!newChannelName.trim() || !currentUser) return
    
    setCreatingChannel(true)
    
    // 创建频道
    const { data: channel, error } = await supabase
      .from('channels')
      .insert({
        name: newChannelName.trim(),
        owner_id: currentUser.id,
        is_private: false,
      })
      .select()
      .single()

    if (error) {
      alert('创建失败: ' + error.message)
      setCreatingChannel(false)
      return
    }

    // 将自己添加为频道成员（owner）
    await supabase
      .from('channel_members')
      .insert({
        channel_id: channel.id,
        user_id: currentUser.id,
        role: 'owner',
      })

    setNewChannelName('')
    setShowCreateChannel(false)
    setCreatingChannel(false)
    
    // 刷新频道列表并跳转
    await fetchChannels()
    router.push(`/channel/${channel.id}`)
  }

  // 从 localStorage 恢复收起状态
  useEffect(() => {
    const saved = localStorage.getItem('echo-sidebar-collapsed')
    if (saved === 'true') {
      setCollapsed(true)
    }
  }, [])

  // 边缘滑动打开侧边栏
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      // 只在屏幕左边缘 20px 内开始的触摸才触发
      if (touch.clientX < 20 && !mobileOpen) {
        touchStartX.current = touch.clientX
        touchStartY.current = touch.clientY
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartX.current === 0) return
      
      const touch = e.touches[0]
      const deltaX = touch.clientX - touchStartX.current
      const deltaY = Math.abs(touch.clientY - touchStartY.current)
      
      // 如果垂直移动大于水平移动，忽略（可能是滚动）
      if (deltaY > Math.abs(deltaX)) {
        touchStartX.current = 0
        return
      }
      
      // 右滑打开
      if (deltaX > 50 && !mobileOpen) {
        onMobileOpen?.()
        touchStartX.current = 0
      }
    }

    const handleTouchEnd = () => {
      touchStartX.current = 0
    }

    // 只在移动端添加监听
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      document.addEventListener('touchstart', handleTouchStart, { passive: true })
      document.addEventListener('touchmove', handleTouchMove, { passive: true })
      document.addEventListener('touchend', handleTouchEnd, { passive: true })
    }

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [mobileOpen, onMobileOpen])

  // 抽屉拖拽关闭
  const handleDrawerTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    setIsDragging(true)
  }, [])

  const handleDrawerTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return
    const deltaX = e.touches[0].clientX - touchStartX.current
    // 只允许向左滑动（关闭）
    if (deltaX < 0) {
      setDragOffset(deltaX)
    }
  }, [isDragging])

  const handleDrawerTouchEnd = useCallback(() => {
    setIsDragging(false)
    // 如果滑动超过 80px，关闭抽屉
    if (dragOffset < -80) {
      onMobileClose?.()
    }
    setDragOffset(0)
  }, [dragOffset, onMobileClose])

  // 切换收起状态
  const toggleCollapsed = () => {
    const newState = !collapsed
    setCollapsed(newState)
    localStorage.setItem('echo-sidebar-collapsed', String(newState))
    // 收起时关闭添加好友面板
    if (newState) {
      setShowAddFriend(false)
    }
  }

  // 搜索用户
  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchResult(null)
    setSearchError(null)

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', searchQuery.toLowerCase().trim())
      .single()

    if (error) {
      setSearchError('未找到该用户')
    } else if (data && data.id === currentUser?.id) {
      setSearchError('不能添加自己为好友')
    } else if (data) {
      setSearchResult(data)
    } else {
      setSearchError('未找到该用户')
    }
    setSearching(false)
  }

  // 发送好友申请（改为 pending 状态，等待对方接受）
  const handleAddFriend = async () => {
    if (!searchResult || !currentUser) {
      setSearchError('请先登录')
      return
    }

    setAdding(true)

    // 检查是否已经是好友或已发送申请
    const { data: existing } = await supabase
      .from('friendships')
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('friend_id', searchResult.id)
      .single()

    if (existing) {
      if (existing.status === 'accepted') {
        setSearchError('你们已经是好友了！')
      } else if (existing.status === 'pending') {
        setSearchError('好友申请已发送，请等待对方接受')
      } else if (existing.status === 'blocked') {
        setSearchError('无法添加该用户')
      }
      setAdding(false)
      return
    }

    // 检查对方是否已经向我发送过申请
    const { data: reverseRequest } = await supabase
      .from('friendships')
      .select('*')
      .eq('user_id', searchResult.id)
      .eq('friend_id', currentUser.id)
      .single()

    if (reverseRequest && reverseRequest.status === 'pending') {
      // 对方已经向我发送申请，直接互相接受
      const { error } = await supabase.from('friendships').upsert([
        { id: reverseRequest.id, user_id: searchResult.id, friend_id: currentUser.id, status: 'accepted' },
        { user_id: currentUser.id, friend_id: searchResult.id, status: 'accepted' },
      ])

      if (error) {
        setSearchError('添加失败: ' + error.message)
        setAdding(false)
        return
      }

      setSearchQuery('')
      setSearchResult(null)
      setSearchError(null)
      setShowAddFriend(false)
      setAdding(false)
      window.location.reload()
      return
    }

    // 发送好友申请（单向 pending 状态）
    const { error } = await supabase.from('friendships').insert([
      { user_id: currentUser.id, friend_id: searchResult.id, status: 'pending' },
    ])

    if (error) {
      setSearchError('发送申请失败: ' + error.message)
      setAdding(false)
      return
    }

    setSearchQuery('')
    setSearchResult(null)
    setSearchError('好友申请已发送，等待对方接受')
    setAdding(false)
  }

  // 退出登录
  const handleLogout = async () => {
    // 清理全局 presence channels
    cleanupPresence()
    await supabase.auth.signOut()
    router.push('/')
  }

  // 处理会话点击（移动端自动关闭侧边栏）
  const handleConversationClick = () => {
    if (onMobileClose) {
      onMobileClose()
    }
  }

  // 侧边栏内容 - 杂志风格
  const sidebarContent = (
    <div className={`${collapsed ? 'w-20' : 'w-full md:w-80'} bg-[#F2F0E9] dark:bg-[#121212] border-r border-black dark:border-white flex flex-col h-full transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]`}>
      {/* 头部 - 杂志刊头 */}
      <div className={`border-b-4 border-black dark:border-white overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${collapsed ? 'p-4' : 'p-6'}`}>
        <div className={`transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${collapsed ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100 h-auto'}`}>
          <h1 className="text-5xl font-serif font-bold tracking-tighter italic whitespace-nowrap">Echo.</h1>
          <p className="font-mono text-[10px] mt-2 text-black/60 dark:text-white/60 uppercase tracking-widest whitespace-nowrap">Issue No. 24 — Conversationalist</p>
        </div>
        <div className={`transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${collapsed ? 'opacity-100 h-auto' : 'opacity-0 h-0 overflow-hidden'}`}>
          <h1 className="text-3xl font-serif font-bold tracking-tighter italic text-center">E.</h1>
        </div>
      </div>

      {/* 工具栏 */}
      <div className={`flex items-center px-4 py-3 border-b border-black/10 dark:border-white/10 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${collapsed ? 'flex-col gap-2 justify-center' : 'justify-between'}`}>
        <div className={`flex items-center transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${collapsed ? 'flex-col gap-1' : 'gap-1'}`}>
          <div className={`transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${collapsed ? 'w-0 h-0 opacity-0 overflow-hidden' : 'w-auto h-auto opacity-100'}`}>
            <ThemeToggle />
          </div>
          <div className={`transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${collapsed ? 'w-0 h-0 opacity-0 overflow-hidden' : 'w-auto h-auto opacity-100'}`}>
            <button 
              onClick={() => { setShowRequests(!showRequests); setShowAddFriend(false) }}
              className="relative p-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-gray-400 hover:text-black dark:hover:text-white"
              title="好友请求"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="8.5" cy="7" r="4"></circle>
                <line x1="20" y1="8" x2="20" y2="14"></line>
                <line x1="23" y1="11" x2="17" y2="11"></line>
              </svg>
              {pendingRequests.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 font-mono text-[10px] text-[#D93025] font-bold">
                  {pendingRequests.length > 9 ? '9+' : pendingRequests.length}
                </span>
              )}
            </button>
          </div>
          <div className={`transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${collapsed ? 'w-0 h-0 opacity-0 overflow-hidden' : 'w-auto h-auto opacity-100'}`}>
            <button 
              onClick={() => { setShowAddFriend(!showAddFriend); setShowRequests(false) }}
              className="p-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-gray-400 hover:text-black dark:hover:text-white"
              title="添加好友"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>
        </div>
        <button 
          onClick={toggleCollapsed}
          className="p-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-gray-400 hover:text-black dark:hover:text-white"
          title={collapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          <svg 
            width="20" 
            height="20" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className={`transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${collapsed ? 'rotate-180' : ''}`}
          >
            <polyline points="11 17 6 12 11 7"></polyline>
            <polyline points="18 17 13 12 18 7"></polyline>
          </svg>
        </button>
      </div>

      {/* 好友请求列表面板 - 杂志风格 */}
      {showRequests && !collapsed && (
        <div className="px-4 py-4 border-b border-[var(--color-ink)]/10 bg-[var(--color-ink)]/5 max-h-64 overflow-y-auto">
          <h3 className="font-mono text-xs uppercase tracking-widest text-[var(--color-ink)]/60 mb-4">
            Friend Requests ({pendingRequests.length})
          </h3>
          {pendingRequests.length === 0 ? (
            <p className="font-mono text-xs text-[var(--color-ink)]/40 text-center py-6">暂无好友请求</p>
          ) : (
            <div className="space-y-2">
              {pendingRequests.map((request) => (
                <div key={request.id} className="flex items-center justify-between p-3 border border-[var(--color-ink)]/10 bg-[var(--color-paper)]">
                  <div className="flex items-center min-w-0">
                    <img 
                      src={request.requester.avatar_url || getAvatarUrl(request.requester.username)} 
                      className="w-9 h-9 flex-shrink-0" 
                      alt=""
                    />
                    <div className="ml-3 min-w-0">
                      <p className="font-serif text-sm text-[var(--color-ink)] truncate">
                        {request.requester.display_name || request.requester.username}
                      </p>
                      <p className="font-mono text-xs text-[var(--color-ink)]/40 truncate">@{request.requester.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <button
                      onClick={() => handleAcceptRequest(request)}
                      disabled={processingRequest === request.id}
                      className="px-3 py-1.5 bg-[var(--color-ink)] text-[var(--color-paper)] font-mono text-xs uppercase tracking-wider hover:bg-[var(--color-ink)]/80 disabled:opacity-50"
                      title="接受"
                    >
                      √
                    </button>
                    <button
                      onClick={() => handleRejectRequest(request)}
                      disabled={processingRequest === request.id}
                      className="px-3 py-1.5 border border-[var(--color-ink)]/20 text-[var(--color-ink)]/60 font-mono text-xs uppercase tracking-wider hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
                      title="拒绝"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 添加好友面板 - 杂志风格 */}
      {showAddFriend && !collapsed && (
        <div className="px-4 py-4 border-b border-[var(--color-ink)]/10 bg-[var(--color-ink)]/5">
          {/* 统一的搜索框设计 - 杂志风格 */}
          <div className="flex items-center border-b border-[var(--color-ink)]/20 focus-within:border-[var(--color-ink)]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="输入用户名..."
              className="flex-1 min-w-0 px-0 py-2 text-sm bg-transparent text-[var(--color-ink)] focus:outline-none placeholder-[var(--color-ink)]/40"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="flex-shrink-0 p-2 text-[var(--color-ink)]/40 hover:text-[var(--color-ink)] disabled:opacity-50 transition-colors"
              title="搜索"
            >
              {searching ? (
                <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"></circle>
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              )}
            </button>
          </div>
          {searchError && (
            <div className={`mt-3 p-3 font-mono text-xs border-l-4 ${
              searchError.includes('已发送') || searchError.includes('等待')
                ? 'border-l-emerald-600 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-300'
                : 'border-l-[var(--color-accent)] bg-red-50/50 dark:bg-red-900/10 text-red-700 dark:text-red-300'
            }`}>
              {searchError}
            </div>
          )}
          {searchResult && (
            <div className="mt-3 flex items-center justify-between p-3 border border-[var(--color-ink)]/10 bg-[var(--color-paper)]">
              <div className="flex items-center">
                <img 
                  src={searchResult.avatar_url || getAvatarUrl(searchResult.username)} 
                  className="w-10 h-10" 
                  alt=""
                />
                <div className="ml-3">
                  <p className="font-serif text-sm text-[var(--color-ink)]">{searchResult.display_name || searchResult.username}</p>
                  <p className="font-mono text-xs text-[var(--color-ink)]/40">@{searchResult.username}</p>
                </div>
              </div>
              <button
                onClick={handleAddFriend}
                disabled={adding || !currentUser}
                className="px-4 py-1.5 bg-[var(--color-ink)] text-[var(--color-paper)] font-mono text-xs uppercase tracking-wider hover:bg-[var(--color-ink)]/80 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {adding ? '添加中...' : '添加 →'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 搜索框 - 杂志风格 */}
      {!collapsed && (
        <div className="px-4 py-4">
          <div className="relative group">
            <svg className="absolute left-0 top-2.5 text-[var(--color-ink)]/40 group-focus-within:text-[var(--color-ink)] transition-colors" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input 
              type="text" 
              placeholder="Search..." 
              className="w-full bg-transparent pl-7 pr-4 py-2 border-b border-[var(--color-ink)]/20 text-sm focus:outline-none focus:border-[var(--color-ink)] transition-all placeholder-[var(--color-ink)]/40 text-[var(--color-ink)]"
            />
          </div>
        </div>
      )}

      {/* 标签页切换 - 杂志风格 */}
      {!collapsed && (
        <div className="px-4 pb-4 flex border-b border-[var(--color-ink)]/10">
          <button
            onClick={() => setActiveTab('chats')}
            className={`flex-1 py-2 font-mono text-xs uppercase tracking-widest transition-all border-b-2 -mb-px ${
              activeTab === 'chats'
                ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
                : 'border-transparent text-[var(--color-ink)]/40 hover:text-[var(--color-ink)]/70'
            }`}
          >
            Private
          </button>
          <button
            onClick={() => setActiveTab('channels')}
            className={`flex-1 py-2 font-mono text-xs uppercase tracking-widest transition-all border-b-2 -mb-px ${
              activeTab === 'channels'
                ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
                : 'border-transparent text-[var(--color-ink)]/40 hover:text-[var(--color-ink)]/70'
            }`}
          >
            Channels
          </button>
        </div>
      )}

      {/* 创建频道面板 - 杂志风格 */}
      {showCreateChannel && !collapsed && (
        <div className="px-4 py-4 border-b border-[var(--color-ink)]/10 bg-[var(--color-ink)]/5">
          <div className="flex items-center border-b border-[var(--color-ink)]/20 focus-within:border-[var(--color-ink)]">
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateChannel()}
              placeholder="频道名称..."
              className="flex-1 min-w-0 px-3 py-2 text-sm bg-transparent dark:text-white focus:outline-none placeholder-gray-400"
            />
            <button
              onClick={handleCreateChannel}
              disabled={creatingChannel || !newChannelName.trim()}
              className="flex-shrink-0 p-2 text-[var(--color-ink)]/40 hover:text-[var(--color-ink)] disabled:opacity-50 transition-colors"
            >
              {creatingChannel ? (
                <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"></circle>
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              )}
            </button>
          </div>
          <button
            onClick={() => setShowCreateChannel(false)}
            className="mt-2 font-mono text-xs text-[var(--color-ink)]/40 hover:text-[var(--color-ink)]/70 uppercase tracking-wider"
          >
            取消
          </button>
        </div>
      )}

      {/* 列表区域 - 杂志索引风格 */}
      <div className={`flex-1 overflow-y-auto no-scrollbar`}>
        {/* 私聊列表 */}
        {activeTab === 'chats' && (
          <>
            {conversations.length === 0 ? (
              <div className="text-center py-12 px-4">
                {!collapsed && (
                  <>
                    <p className="font-mono text-xs text-[var(--color-ink)]/40 uppercase tracking-widest">No Conversations</p>
                    <p className="font-serif text-sm text-[var(--color-ink)]/30 mt-2 italic">点击 + 添加好友开始聊天</p>
                  </>
                )}
              </div>
            ) : (
              conversations.map((conv, index) => (
                <Link
                  key={conv.friend.id}
                  href={`/chat/${conv.friend.id}`}
                  onClick={handleConversationClick}
                  className={`group flex flex-col py-5 border-b border-black/10 dark:border-white/10 transition-all ${
                    selectedFriendId === conv.friend.id
                      ? 'bg-black/5 dark:bg-white/5 border-l-4 border-l-[#D93025] dark:border-l-[#FF4D4D]'
                      : 'hover:bg-black/5 dark:hover:bg-white/5'
                  } ${collapsed ? 'px-2 items-center' : 'px-5'}`}
                  title={collapsed ? (conv.friend.display_name || conv.friend.username) : undefined}
                >
                  {collapsed ? (
                    <div className="relative">
                      <img 
                        src={conv.friend.avatar_url || getAvatarUrl(conv.friend.username)} 
                        className="w-10 h-10 rounded-full"
                        alt=""
                      />
                      {conv.unread_count > 0 && (
                        <span className="absolute -top-1 -right-1 font-mono text-[10px] text-[#D93025] font-bold">*</span>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="flex w-full justify-between items-baseline mb-1">
                        {/* 序号 */}
                        <span className="font-mono text-xs text-black/40 dark:text-white/40">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        {/* 时间或在线状态 */}
                        {onlineUsers.has(conv.friend.id) ? (
                          <span className="font-mono text-xs text-[#D93025] dark:text-[#FF4D4D]">● LIVE</span>
                        ) : conv.last_message ? (
                          <span className="font-mono text-xs text-black/40 dark:text-white/40">
                            {formatMessageTime(conv.last_message.created_at)}
                          </span>
                        ) : null}
                      </div>
                      {/* 名字：巨大的衬线体 */}
                      <h3 className="font-serif text-2xl mb-2 group-hover:translate-x-2 transition-transform duration-300">
                        {conv.friend.display_name || conv.friend.username}
                      </h3>
                      {/* 最后消息预览 */}
                      <div className="flex items-center justify-between">
                        <p className="font-sans text-sm line-clamp-1 italic text-black/60 dark:text-white/60">
                          {conv.last_message 
                            ? conv.last_message.content 
                              ? `"${truncateText(conv.last_message.content, 30)}"`
                              : conv.last_message.file_name 
                                ? `[文件] ${conv.last_message.file_name}`
                                : '[消息]'
                            : '开始聊天吧...'
                          }
                        </p>
                        {/* 未读标记：文字而非红点 */}
                        {conv.unread_count > 0 && (
                          <span className="font-mono text-xs font-bold ml-2 text-[#D93025] dark:text-[#FF4D4D]">
                            NEW ({conv.unread_count})
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </Link>
              ))
            )}
          </>
        )}

        {/* 频道列表 */}
        {activeTab === 'channels' && (
          <>
            {/* 创建频道按钮 - 杂志风格 */}
            {!collapsed && !showCreateChannel && (
              <button
                onClick={() => setShowCreateChannel(true)}
                className="w-full py-3 flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-widest text-[var(--color-ink)]/60 hover:text-[var(--color-ink)] hover:bg-[var(--color-ink)]/5 transition-all border-b border-[var(--color-ink)]/10"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>Create Channel</span>
              </button>
            )}
            
            {channels.length === 0 ? (
              <div className="text-center py-12">
                {!collapsed && (
                  <>
                    <p className="font-mono text-xs text-[var(--color-ink)]/40 uppercase tracking-widest">No Channels</p>
                    <p className="font-serif text-sm text-[var(--color-ink)]/30 mt-2 italic">创建一个频道开始群聊</p>
                  </>
                )}
              </div>
            ) : (
              channels.map((conv, index) => (
                <Link
                  key={conv.channel.id}
                  href={`/channel/${conv.channel.id}`}
                  onClick={handleConversationClick}
                  className={`group flex flex-col py-5 border-b border-[var(--color-ink)]/10 transition-all ${
                    selectedChannelId === conv.channel.id
                      ? 'bg-[var(--color-ink)]/5 border-l-4 border-l-[var(--color-accent)]'
                      : 'hover:bg-[var(--color-ink)]/5'
                  } ${collapsed ? 'px-2 items-center' : 'px-5'}`}
                  title={collapsed ? conv.channel.name : undefined}
                >
                  {collapsed ? (
                    <div className="w-10 h-10 border border-[var(--color-ink)]/20 flex items-center justify-center font-serif text-lg text-[var(--color-ink)]">
                      {conv.channel.name.charAt(0).toUpperCase()}
                    </div>
                  ) : (
                    <>
                      <div className="flex w-full justify-between items-baseline mb-1">
                        <span className="font-mono text-xs text-[var(--color-ink)]/40">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="font-mono text-xs text-[var(--color-ink)]/40 uppercase">
                          {conv.my_role === 'owner' ? 'OWNER' : conv.my_role === 'admin' ? 'ADMIN' : 'MEMBER'}
                        </span>
                      </div>
                      <h3 className="font-serif text-2xl mb-1 group-hover:translate-x-2 transition-transform duration-300 text-[var(--color-ink)]">
                        #{conv.channel.name}
                      </h3>
                    </>
                  )}
                </Link>
              ))
            )}
          </>
        )}
      </div>

      {/* 当前用户信息 - 杂志页脚 */}
      {currentUser && (
        <div className={`p-4 border-t border-black dark:border-white ${collapsed ? 'flex justify-center' : ''}`}>
          <div className={`flex items-center ${collapsed ? 'flex-col' : 'justify-between'} font-mono text-xs uppercase`}>
            <Link
              href="/settings"
              className={`flex items-center ${collapsed ? 'flex-col' : ''} hover:opacity-80 transition-opacity`}
              title="个人设置"
            >
              {!collapsed && (
                <span className="text-black/60 dark:text-white/60 tracking-widest">Logged in as: {currentUser.display_name || currentUser.username}</span>
              )}
              {collapsed && (
                <img 
                  src={currentUser.avatar_url || getAvatarUrl(currentUser.username)} 
                  className="w-8 h-8 rounded-full"
                  alt=""
                />
              )}
            </Link>
            {!collapsed && (
              <span className="w-2 h-2 bg-[#D93025] dark:bg-[#FF4D4D] rounded-full animate-pulse"></span>
            )}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* 桌面端侧边栏 */}
      <div className="hidden md:flex">
        {sidebarContent}
      </div>

      {/* 移动端抽屉遮罩 */}
      {mobileOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          style={{ 
            opacity: isDragging ? Math.max(0, 1 + dragOffset / 320) : 1,
            transition: isDragging ? 'none' : 'opacity 0.3s'
          }}
          onClick={onMobileClose}
        />
      )}

      {/* 移动端抽屉 */}
      <div 
        ref={drawerRef}
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-72 touch-pan-y ${
          mobileOpen && !isDragging ? 'transition-transform duration-300 ease-in-out' : ''
        } ${mobileOpen ? '' : '-translate-x-full transition-transform duration-300'}`}
        style={{ 
          transform: mobileOpen 
            ? `translateX(${Math.min(0, dragOffset)}px)` 
            : 'translateX(-100%)'
        }}
        onTouchStart={handleDrawerTouchStart}
        onTouchMove={handleDrawerTouchMove}
        onTouchEnd={handleDrawerTouchEnd}
      >
        {sidebarContent}
      </div>
    </>
  )
}

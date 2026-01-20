'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ThemeToggle from '@/components/ThemeToggle'
import { OnlineIndicator } from '@/components/ui'
import type { Profile, Conversation, Friendship, Channel, ChannelConversation } from '@/types'
import { formatMessageTime, getAvatarUrl, truncateText } from '@/lib/utils'

// 待处理的好友请求类型
interface PendingRequest {
  id: string
  user_id: string
  created_at: string
  requester: Profile
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
      const channelConvs: ChannelConversation[] = data
        .filter((d: any) => d.channel)
        .map((d: any) => ({
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
    await supabase.auth.signOut()
    router.push('/')
  }

  // 处理会话点击（移动端自动关闭侧边栏）
  const handleConversationClick = () => {
    if (onMobileClose) {
      onMobileClose()
    }
  }

  // 侧边栏内容
  const sidebarContent = (
    <div className={`${collapsed ? 'w-16' : 'w-full md:w-72'} glass-heavy border-r-0 flex flex-col h-full transition-all duration-300 ease-in-out`}>
      {/* 头部 */}
      <div className="h-14 flex items-center justify-between px-3 border-b border-white/20 dark:border-white/5">
        {!collapsed && (
          <h1 className="font-serif text-lg font-semibold tracking-tight dark:text-white">Echo</h1>
        )}
        <div className={`flex items-center gap-1 ${collapsed ? 'flex-col w-full' : ''}`}>
          {!collapsed && <ThemeToggle />}
          {/* 好友请求按钮 - 带数量徽章 */}
          {!collapsed && (
            <button 
              onClick={() => { setShowRequests(!showRequests); setShowAddFriend(false) }}
              className="relative p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-black dark:hover:text-white"
              title="好友请求"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="8.5" cy="7" r="4"></circle>
                <line x1="20" y1="8" x2="20" y2="14"></line>
                <line x1="23" y1="11" x2="17" y2="11"></line>
              </svg>
              {pendingRequests.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full">
                  {pendingRequests.length > 9 ? '9+' : pendingRequests.length}
                </span>
              )}
            </button>
          )}
          {!collapsed && (
            <button 
              onClick={() => { setShowAddFriend(!showAddFriend); setShowRequests(false) }}
              className="p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-black dark:hover:text-white"
              title="添加好友"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          )}
          {/* 收起/展开按钮 */}
          <button 
            onClick={toggleCollapsed}
            className={`p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-black dark:hover:text-white ${collapsed ? 'mx-auto' : ''}`}
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
              className={`transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
            >
              <polyline points="11 17 6 12 11 7"></polyline>
              <polyline points="18 17 13 12 18 7"></polyline>
            </svg>
          </button>
        </div>
      </div>

      {/* 好友请求列表面板 */}
      {showRequests && !collapsed && (
        <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-[#1A1A1A] max-h-64 overflow-y-auto">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
            好友请求 ({pendingRequests.length})
          </h3>
          {pendingRequests.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">暂无好友请求</p>
          ) : (
            <div className="space-y-2">
              {pendingRequests.map((request) => (
                <div key={request.id} className="flex items-center justify-between p-2 bg-white dark:bg-[#0F0F0F] rounded-lg">
                  <div className="flex items-center min-w-0">
                    <img 
                      src={request.requester.avatar_url || getAvatarUrl(request.requester.username)} 
                      className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex-shrink-0" 
                      alt=""
                    />
                    <div className="ml-2 min-w-0">
                      <p className="text-sm font-medium dark:text-white truncate">
                        {request.requester.display_name || request.requester.username}
                      </p>
                      <p className="text-xs text-gray-400 truncate">@{request.requester.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    <button
                      onClick={() => handleAcceptRequest(request)}
                      disabled={processingRequest === request.id}
                      className="p-1.5 bg-black dark:bg-white text-white dark:text-black rounded-full hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
                      title="接受"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </button>
                    <button
                      onClick={() => handleRejectRequest(request)}
                      disabled={processingRequest === request.id}
                      className="p-1.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                      title="拒绝"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 添加好友面板 */}
      {showAddFriend && !collapsed && (
        <div className="px-3 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-[#1A1A1A]">
          {/* 统一的搜索框设计 - 输入框和按钮融为一体 */}
          <div className="flex items-center bg-white dark:bg-[#0F0F0F] rounded-lg border border-gray-200 dark:border-gray-700 focus-within:ring-1 focus-within:ring-black/10 dark:focus-within:ring-white/10 overflow-hidden">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="输入用户名..."
              className="flex-1 min-w-0 px-3 py-2 text-sm bg-transparent dark:text-white focus:outline-none placeholder-gray-400"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="flex-shrink-0 p-2 mr-1 text-gray-400 hover:text-black dark:hover:text-white disabled:opacity-50 transition-colors"
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
            <div className={`mt-3 p-3 text-sm rounded-lg ${
              searchError.includes('已发送') || searchError.includes('等待')
                ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
            }`}>
              {searchError}
            </div>
          )}
          {searchResult && (
            <div className="mt-3 flex items-center justify-between p-3 bg-white dark:bg-[#0F0F0F] rounded-lg">
              <div className="flex items-center">
                <img 
                  src={searchResult.avatar_url || getAvatarUrl(searchResult.username)} 
                  className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800" 
                  alt=""
                />
                <div className="ml-3">
                  <p className="text-sm font-medium dark:text-white">{searchResult.display_name || searchResult.username}</p>
                  <p className="text-xs text-gray-400">@{searchResult.username}</p>
                </div>
              </div>
              <button
                onClick={handleAddFriend}
                disabled={adding || !currentUser}
                className="px-3 py-1.5 bg-black dark:bg-white text-white dark:text-black text-xs rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {adding ? '添加中...' : '添加'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 搜索框 */}
      {!collapsed && (
        <div className="px-4 py-4">
          <div className="relative group">
            <svg className="absolute left-3 top-2.5 text-gray-400 group-focus-within:text-black dark:group-focus-within:text-white transition-colors" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input 
              type="text" 
              placeholder="搜索聊天..." 
              className="w-full bg-gray-50 dark:bg-[#1A1A1A] pl-10 pr-4 py-2 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-black/5 dark:focus:ring-white/10 transition-all placeholder-gray-400 dark:text-white"
            />
          </div>
        </div>
      )}

      {/* 标签页切换 - 私聊/频道 */}
      {!collapsed && (
        <div className="px-4 pb-2 flex gap-1">
          <button
            onClick={() => setActiveTab('chats')}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
              activeTab === 'chats'
                ? 'bg-black dark:bg-white text-white dark:text-black'
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            私聊
          </button>
          <button
            onClick={() => setActiveTab('channels')}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
              activeTab === 'channels'
                ? 'bg-black dark:bg-white text-white dark:text-black'
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            频道
          </button>
        </div>
      )}

      {/* 创建频道面板 */}
      {showCreateChannel && !collapsed && (
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-[#1A1A1A]">
          <div className="flex items-center bg-white dark:bg-[#0F0F0F] rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
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
              className="flex-shrink-0 p-2 mr-1 text-gray-400 hover:text-black dark:hover:text-white disabled:opacity-50 transition-colors"
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
            className="mt-2 text-xs text-gray-400 hover:text-gray-600"
          >
            取消
          </button>
        </div>
      )}

      {/* 列表区域 */}
      <div className={`flex-1 overflow-y-auto ${collapsed ? 'px-2' : 'px-4'} space-y-1 no-scrollbar`}>
        {/* 私聊列表 */}
        {activeTab === 'chats' && (
          <>
            {conversations.length === 0 ? (
              <div className="text-center py-12">
                {!collapsed && (
                  <>
                    <p className="text-gray-400 text-sm">还没有好友</p>
                    <p className="text-gray-300 dark:text-gray-600 text-xs mt-2">点击 + 添加好友开始聊天</p>
                  </>
                )}
              </div>
            ) : (
              conversations.map((conv) => (
                <Link
                  key={conv.friend.id}
                  href={`/chat/${conv.friend.id}`}
                  onClick={handleConversationClick}
                  className={`flex items-center ${collapsed ? 'justify-center p-2' : 'p-2.5'} rounded-xl cursor-pointer transition-all ${
                    selectedFriendId === conv.friend.id
                      ? 'glass-button'
                      : 'hover:bg-white/50 dark:hover:bg-white/5'
                  }`}
                  title={collapsed ? (conv.friend.display_name || conv.friend.username) : undefined}
                >
                  <div className="relative">
                    <img 
                      src={conv.friend.avatar_url || getAvatarUrl(conv.friend.username)} 
                      className={`${collapsed ? 'w-9 h-9' : 'w-9 h-9'} rounded-full bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700`}
                      alt=""
                    />
                    {/* 在线状态指示器 */}
                    <div className="absolute -bottom-0.5 -right-0.5">
                      <OnlineIndicator isOnline={onlineUsers.has(conv.friend.id)} size="sm" />
                    </div>
                  </div>
                  {!collapsed && (
                    <div className="ml-2.5 flex-1 min-w-0">
                      <div className="flex justify-between items-baseline">
                        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                          {conv.friend.display_name || conv.friend.username}
                        </h3>
                        {conv.last_message && (
                          <span className="text-[10px] text-gray-400">
                            {formatMessageTime(conv.last_message.created_at)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                    {conv.last_message 
                      ? conv.last_message.content 
                        ? truncateText(conv.last_message.content, 30)
                        : conv.last_message.file_name 
                          ? `[文件] ${conv.last_message.file_name}`
                          : '[消息]'
                      : '开始聊天吧'
                    }
                  </p>
                </div>
              )}
              {!collapsed && conv.unread_count > 0 && (
                <div className="ml-2 w-5 h-5 bg-black dark:bg-white text-white dark:text-black text-[10px] flex items-center justify-center rounded-full">
                  {conv.unread_count > 99 ? '99+' : conv.unread_count}
                </div>
              )}
              {collapsed && conv.unread_count > 0 && (
                <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full"></div>
              )}
            </Link>
              ))
            )}
          </>
        )}

        {/* 频道列表 */}
        {activeTab === 'channels' && (
          <>
            {/* 创建频道按钮 */}
            {!collapsed && !showCreateChannel && (
              <button
                onClick={() => setShowCreateChannel(true)}
                className="w-full p-3 mb-2 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-500 transition-colors flex items-center justify-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span className="text-sm">创建频道</span>
              </button>
            )}
            
            {channels.length === 0 ? (
              <div className="text-center py-12">
                {!collapsed && (
                  <>
                    <p className="text-gray-400 text-sm">还没有频道</p>
                    <p className="text-gray-300 dark:text-gray-600 text-xs mt-2">创建一个频道开始群聊</p>
                  </>
                )}
              </div>
            ) : (
              channels.map((conv) => (
                <Link
                  key={conv.channel.id}
                  href={`/channel/${conv.channel.id}`}
                  onClick={handleConversationClick}
                  className={`flex items-center ${collapsed ? 'justify-center p-2' : 'p-2.5'} rounded-xl cursor-pointer transition-all ${
                    selectedChannelId === conv.channel.id
                      ? 'glass-button'
                      : 'hover:bg-white/50 dark:hover:bg-white/5'
                  }`}
                  title={collapsed ? conv.channel.name : undefined}
                >
                  {/* 频道图标 */}
                  <div 
                    className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-medium text-sm"
                  >
                    {conv.channel.name.charAt(0).toUpperCase()}
                  </div>
                  {!collapsed && (
                    <div className="ml-2.5 flex-1 min-w-0">
                      <div className="flex justify-between items-baseline">
                        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                          {conv.channel.name}
                        </h3>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {conv.my_role === 'owner' ? '创建者' : conv.my_role === 'admin' ? '管理员' : '成员'}
                      </p>
                    </div>
                  )}
                </Link>
              ))
            )}
          </>
        )}
      </div>

      {/* 当前用户信息 */}
      {currentUser && (
        <div className={`p-3 border-t border-white/20 dark:border-white/5 ${collapsed ? 'flex justify-center' : ''}`}>
          <div className={`flex items-center ${collapsed ? 'flex-col' : 'justify-between'}`}>
            <Link
              href="/settings"
              className={`flex items-center ${collapsed ? 'flex-col' : ''} hover:opacity-80 transition-opacity`}
              title="个人设置"
            >
              <img 
                src={currentUser.avatar_url || getAvatarUrl(currentUser.username)} 
                className="w-8 h-8 rounded-full bg-white/50 dark:bg-white/10 border border-white/30 dark:border-white/10"
                alt=""
                title={collapsed ? currentUser.display_name || currentUser.username : undefined}
              />
              {!collapsed && (
                <div className="ml-2.5">
                  <p className="text-sm font-medium dark:text-white">{currentUser.display_name || currentUser.username}</p>
                  <p className="text-xs text-gray-400">@{currentUser.username}</p>
                </div>
              )}
            </Link>
            {!collapsed && (
              <button 
                onClick={handleLogout}
                className="p-1.5 hover:bg-white/50 dark:hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-black dark:hover:text-white"
                title="退出登录"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
              </button>
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

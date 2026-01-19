'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ThemeToggle from '@/components/ThemeToggle'
import { OnlineIndicator } from '@/components/ui'
import type { Profile, Conversation } from '@/types'
import { formatMessageTime, getAvatarUrl, truncateText } from '@/lib/utils'

interface ChatListProps {
  conversations: Conversation[]
  currentUser: Profile | null
  selectedFriendId: string | null
  mobileOpen?: boolean
  onMobileClose?: () => void
  onMobileOpen?: () => void
  onlineUsers?: Set<string>
}

export default function ChatList({ 
  conversations, 
  currentUser, 
  selectedFriendId,
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
  
  // 手势相关状态
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const drawerRef = useRef<HTMLDivElement>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

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

  // 添加好友
  const handleAddFriend = async () => {
    if (!searchResult || !currentUser) {
      setSearchError('请先登录')
      return
    }

    setAdding(true)

    // 检查是否已经是好友
    const { data: existing } = await supabase
      .from('friendships')
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('friend_id', searchResult.id)
      .single()

    if (existing) {
      setSearchError('你们已经是好友了！')
      setAdding(false)
      return
    }

    // 创建好友关系（双向）
    const { error } = await supabase.from('friendships').insert([
      { user_id: currentUser.id, friend_id: searchResult.id, status: 'accepted' },
      { user_id: searchResult.id, friend_id: currentUser.id, status: 'accepted' },
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
    
    // 刷新页面获取最新好友列表
    window.location.reload()
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
          {!collapsed && (
            <button 
              onClick={() => setShowAddFriend(!showAddFriend)}
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

      {/* 添加好友面板 */}
      {showAddFriend && !collapsed && (
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-[#1A1A1A]">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="输入用户名搜索..."
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F0F0F] dark:text-white focus:outline-none focus:ring-1 focus:ring-black/5 dark:focus:ring-white/10"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black text-sm rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
            >
              搜索
            </button>
          </div>
          {searchError && (
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg">
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
        <div className="px-5 py-4">
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

      {/* 好友列表 */}
      <div className={`flex-1 overflow-y-auto ${collapsed ? 'px-2' : 'px-3'} space-y-1 no-scrollbar`}>
        {conversations.length === 0 ? (
          <div className="text-center py-10">
            {!collapsed && (
              <>
                <p className="text-gray-400 text-sm">还没有好友</p>
                <p className="text-gray-300 dark:text-gray-600 text-xs mt-1">点击 + 添加好友开始聊天</p>
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

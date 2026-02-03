'use client'

import { create } from 'zustand'
import type { Profile, Conversation, Message, Channel, ChannelMember, ChannelMessage } from '@/types'

// ============================================
// 用户状态 Store（不使用 persist 避免 hydration 问题）
// ============================================
interface UserState {
  currentUser: Profile | null
  isAuthenticated: boolean
  isLoading: boolean
  isHydrated: boolean
  
  // Actions
  setCurrentUser: (user: Profile | null) => void
  setLoading: (loading: boolean) => void
  setHydrated: (hydrated: boolean) => void
  logout: () => void
}

export const useUserStore = create<UserState>()((set) => ({
  currentUser: null,
  isAuthenticated: false,
  isLoading: true,
  isHydrated: false,
  
  setCurrentUser: (user) => set({ 
    currentUser: user, 
    isAuthenticated: !!user,
    isLoading: false 
  }),
  
  setLoading: (loading) => set({ isLoading: loading }),
  
  setHydrated: (hydrated) => set({ isHydrated: hydrated }),
  
  logout: () => set({ 
    currentUser: null, 
    isAuthenticated: false,
    isLoading: false 
  }),
}))

// ============================================
// 会话列表 Store（不使用 persist）
// ============================================
interface ConversationState {
  conversations: Conversation[]
  activeConversationId: string | null
  
  // Actions
  setConversations: (conversations: Conversation[]) => void
  setActiveConversation: (id: string | null) => void
  updateConversation: (friendId: string, updates: Partial<Conversation>) => void
  updateLastMessage: (friendId: string, message: Message) => void
  incrementUnread: (friendId: string) => void
  clearUnread: (friendId: string) => void
}

export const useConversationStore = create<ConversationState>()((set) => ({
  conversations: [],
  activeConversationId: null,
  
  setConversations: (conversations) => set({ conversations }),
  
  setActiveConversation: (id) => set({ activeConversationId: id }),
  
  updateConversation: (friendId, updates) => set((state) => ({
    conversations: state.conversations.map((conv) =>
      conv.friend.id === friendId ? { ...conv, ...updates } : conv
    ),
  })),
  
  updateLastMessage: (friendId, message) => set((state) => {
    const conversations = [...state.conversations]
    const index = conversations.findIndex((c) => c.friend.id === friendId)
    
    if (index >= 0) {
      conversations[index] = {
        ...conversations[index],
        last_message: message,
      }
      // 重新排序：最新消息在前
      conversations.sort((a, b) => {
        if (!a.last_message && !b.last_message) return 0
        if (!a.last_message) return 1
        if (!b.last_message) return -1
        return new Date(b.last_message.created_at).getTime() - 
               new Date(a.last_message.created_at).getTime()
      })
    }
    
    return { conversations }
  }),
  
  incrementUnread: (friendId) => set((state) => ({
    conversations: state.conversations.map((conv) =>
      conv.friend.id === friendId
        ? { ...conv, unread_count: conv.unread_count + 1 }
        : conv
    ),
  })),
  
  clearUnread: (friendId) => set((state) => ({
    conversations: state.conversations.map((conv) =>
      conv.friend.id === friendId
        ? { ...conv, unread_count: 0 }
        : conv
    ),
  })),
}))

// ============================================
// 消息 Store（当前聊天的消息）
// ============================================

// 空数组常量，用于避免选择器返回新引用导致的无限循环
const EMPTY_MESSAGES: Message[] = []

interface MessageState {
  messages: Record<string, Message[]> // friendId -> messages
  
  // Getters
  getMessages: (friendId: string) => Message[]
  
  // Actions
  setMessages: (friendId: string, messages: Message[]) => void
  addMessage: (friendId: string, message: Message) => void
  updateMessage: (friendId: string, messageId: string, updates: Partial<Message>) => void
  replaceTemporaryMessage: (friendId: string, tempId: string, realMessage: Message) => void
  markAsRead: (friendId: string, messageIds: string[]) => void
}

export const useMessageStore = create<MessageState>()((set, get) => ({
  messages: {},
  
  // 使用稳定的空数组引用，避免无限循环
  getMessages: (friendId) => get().messages[friendId] || EMPTY_MESSAGES,
  
  setMessages: (friendId, messages) => set((state) => ({
    messages: { ...state.messages, [friendId]: messages },
  })),
  
  addMessage: (friendId, message) => set((state) => {
    const existing = state.messages[friendId] || []
    // 防止重复添加
    if (existing.some((m) => m.id === message.id)) {
      return state
    }
    return {
      messages: { ...state.messages, [friendId]: [...existing, message] },
    }
  }),
  
  updateMessage: (friendId, messageId, updates) => set((state) => {
    const existing = state.messages[friendId] || []
    return {
      messages: {
        ...state.messages,
        [friendId]: existing.map((m) =>
          m.id === messageId ? { ...m, ...updates } : m
        ),
      },
    }
  }),
  
  replaceTemporaryMessage: (friendId, tempId, realMessage) => set((state) => {
    const existing = state.messages[friendId] || []
    const tempIndex = existing.findIndex((m) => m.id === tempId)
    
    if (tempIndex >= 0) {
      const updated = [...existing]
      updated[tempIndex] = realMessage
      return { messages: { ...state.messages, [friendId]: updated } }
    }
    
    // 如果找不到临时消息，检查是否已存在真实消息
    if (existing.some((m) => m.id === realMessage.id)) {
      return state
    }
    
    return {
      messages: { ...state.messages, [friendId]: [...existing, realMessage] },
    }
  }),
  
  markAsRead: (friendId, messageIds) => set((state) => {
    const existing = state.messages[friendId] || []
    return {
      messages: {
        ...state.messages,
        [friendId]: existing.map((m) =>
          messageIds.includes(m.id) ? { ...m, is_read: true } : m
        ),
      },
    }
  }),
}))

// ============================================
// UI 状态 Store
// ============================================
interface UIState {
  mobileMenuOpen: boolean
  isOnline: boolean
  typingUsers: Record<string, boolean> // friendId -> isTyping
  
  // Actions
  setMobileMenuOpen: (open: boolean) => void
  setOnline: (online: boolean) => void
  setTyping: (friendId: string, isTyping: boolean) => void
}

export const useUIStore = create<UIState>()((set) => ({
  mobileMenuOpen: false,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  typingUsers: {},
  
  setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),
  
  setOnline: (online) => set({ isOnline: online }),
  
  setTyping: (friendId, isTyping) => set((state) => ({
    typingUsers: { ...state.typingUsers, [friendId]: isTyping },
  })),
}))

// ============================================
// 在线用户 Store
// ============================================
interface PresenceState {
  onlineUsers: Set<string>
  
  // Actions
  setOnlineUsers: (users: Set<string>) => void
  addOnlineUser: (userId: string) => void
  removeOnlineUser: (userId: string) => void
  isUserOnline: (userId: string) => boolean
}

export const usePresenceStore = create<PresenceState>()((set, get) => ({
  onlineUsers: new Set(),
  
  setOnlineUsers: (users) => set({ onlineUsers: users }),
  
  addOnlineUser: (userId) => set((state) => {
    const newSet = new Set(state.onlineUsers)
    newSet.add(userId)
    return { onlineUsers: newSet }
  }),
  
  removeOnlineUser: (userId) => set((state) => {
    const newSet = new Set(state.onlineUsers)
    newSet.delete(userId)
    return { onlineUsers: newSet }
  }),
  
  isUserOnline: (userId) => get().onlineUsers.has(userId),
}))

// ============================================
// 频道 Store
// ============================================

// 空数组常量，避免选择器无限循环
const EMPTY_CHANNEL_MESSAGES: ChannelMessage[] = []
const EMPTY_CHANNEL_MEMBERS: ChannelMember[] = []

interface ChannelState {
  channels: Record<string, Channel> // channelId -> channel
  members: Record<string, ChannelMember[]> // channelId -> members
  messages: Record<string, ChannelMessage[]> // channelId -> messages
  
  // Getters
  getChannel: (channelId: string) => Channel | null
  getMembers: (channelId: string) => ChannelMember[]
  getMessages: (channelId: string) => ChannelMessage[]
  
  // Actions
  setChannel: (channelId: string, channel: Channel) => void
  setMembers: (channelId: string, members: ChannelMember[]) => void
  setMessages: (channelId: string, messages: ChannelMessage[]) => void
  addMessage: (channelId: string, message: ChannelMessage) => void
  addMember: (channelId: string, member: ChannelMember) => void
  removeMember: (channelId: string, userId: string) => void
}

export const useChannelStore = create<ChannelState>()((set, get) => ({
  channels: {},
  members: {},
  messages: {},
  
  // Getters - 返回稳定引用
  getChannel: (channelId) => get().channels[channelId] || null,
  getMembers: (channelId) => get().members[channelId] || EMPTY_CHANNEL_MEMBERS,
  getMessages: (channelId) => get().messages[channelId] || EMPTY_CHANNEL_MESSAGES,
  
  // Actions
  setChannel: (channelId, channel) => set((state) => ({
    channels: { ...state.channels, [channelId]: channel },
  })),
  
  setMembers: (channelId, members) => set((state) => ({
    members: { ...state.members, [channelId]: members },
  })),
  
  setMessages: (channelId, messages) => set((state) => ({
    messages: { ...state.messages, [channelId]: messages },
  })),
  
  addMessage: (channelId, message) => set((state) => {
    const existing = state.messages[channelId] || []
    // 防止重复添加
    if (existing.some((m) => m.id === message.id)) {
      return state
    }
    return {
      messages: { ...state.messages, [channelId]: [...existing, message] },
    }
  }),
  
  addMember: (channelId, member) => set((state) => {
    const existing = state.members[channelId] || []
    if (existing.some((m) => m.user_id === member.user_id)) {
      return state
    }
    return {
      members: { ...state.members, [channelId]: [...existing, member] },
    }
  }),
  
  removeMember: (channelId, userId) => set((state) => {
    const existing = state.members[channelId] || []
    return {
      members: { ...state.members, [channelId]: existing.filter((m) => m.user_id !== userId) },
    }
  }),
}))

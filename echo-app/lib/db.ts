import Dexie, { type EntityTable } from 'dexie'
import type { Message, Profile, Conversation } from '@/types'

// ============================================
// IndexedDB 数据库定义 (使用 Dexie.js)
// ============================================

// 本地存储的消息结构（带索引字段）
interface LocalMessage extends Message {
  chatId: string // sender_receiver 组合的 ID，用于索引
}

// 本地存储的会话结构
interface LocalConversation {
  id: string // friendId
  friend: Profile
  last_message: Message | null
  unread_count: number
  updated_at: string
}

// 本地用户配置
interface LocalUserProfile {
  id: string
  profile: Profile
  lastSync: number
}

// 定义数据库
class EchoDB extends Dexie {
  messages!: EntityTable<LocalMessage, 'id'>
  conversations!: EntityTable<LocalConversation, 'id'>
  userProfiles!: EntityTable<LocalUserProfile, 'id'>

  constructor() {
    super('echo-db')
    
    this.version(1).stores({
      // 消息表：按 chatId（聊天会话）和创建时间索引
      messages: 'id, chatId, sender_id, receiver_id, created_at, [chatId+created_at]',
      // 会话表：按更新时间索引
      conversations: 'id, updated_at',
      // 用户配置表
      userProfiles: 'id, lastSync',
    })
  }
}

// 单例数据库实例
let db: EchoDB | null = null

function getDB(): EchoDB {
  if (!db) {
    db = new EchoDB()
  }
  return db
}

// ============================================
// 消息存储操作
// ============================================

// 生成聊天 ID（确保双方聊天用同一个 ID）
export function generateChatId(userId1: string, userId2: string): string {
  return [userId1, userId2].sort().join('_')
}

// 保存消息到本地
export async function saveMessages(messages: Message[]): Promise<void> {
  const db = getDB()
  const localMessages: LocalMessage[] = messages.map((msg) => ({
    ...msg,
    chatId: generateChatId(msg.sender_id, msg.receiver_id),
  }))
  
  await db.messages.bulkPut(localMessages)
}

// 保存单条消息
export async function saveMessage(message: Message): Promise<void> {
  const db = getDB()
  const localMessage: LocalMessage = {
    ...message,
    chatId: generateChatId(message.sender_id, message.receiver_id),
  }
  
  await db.messages.put(localMessage)
}

// 获取聊天消息（从本地）
export async function getLocalMessages(
  myUserId: string,
  friendId: string,
  limit = 100
): Promise<Message[]> {
  const db = getDB()
  const chatId = generateChatId(myUserId, friendId)
  
  const messages = await db.messages
    .where('chatId')
    .equals(chatId)
    .sortBy('created_at')
  
  // 返回最后 N 条消息
  return messages.slice(-limit)
}

// 更新消息已读状态
export async function markMessagesAsRead(messageIds: string[]): Promise<void> {
  const db = getDB()
  await db.messages
    .where('id')
    .anyOf(messageIds)
    .modify({ is_read: true })
}

// 删除旧消息（超过指定天数）
export async function cleanOldMessages(daysToKeep = 30): Promise<number> {
  const db = getDB()
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)
  
  const count = await db.messages
    .where('created_at')
    .below(cutoffDate.toISOString())
    .delete()
  
  return count
}

// ============================================
// 会话存储操作
// ============================================

// 保存会话列表
export async function saveConversations(conversations: Conversation[]): Promise<void> {
  const db = getDB()
  const localConversations: LocalConversation[] = conversations.map((conv) => ({
    id: conv.friend.id,
    friend: conv.friend,
    last_message: conv.last_message,
    unread_count: conv.unread_count,
    updated_at: conv.last_message?.created_at || new Date().toISOString(),
  }))
  
  await db.conversations.bulkPut(localConversations)
}

// 获取本地会话列表
export async function getLocalConversations(): Promise<Conversation[]> {
  const db = getDB()
  const localConvs = await db.conversations
    .orderBy('updated_at')
    .reverse()
    .toArray()
  
  return localConvs.map((local) => ({
    friend: local.friend,
    last_message: local.last_message,
    unread_count: local.unread_count,
  }))
}

// 更新单个会话
export async function updateConversation(
  friendId: string,
  updates: Partial<LocalConversation>
): Promise<void> {
  const db = getDB()
  await db.conversations.update(friendId, {
    ...updates,
    updated_at: new Date().toISOString(),
  })
}

// ============================================
// 用户配置存储
// ============================================

// 保存当前用户配置
export async function saveUserProfile(profile: Profile): Promise<void> {
  const db = getDB()
  await db.userProfiles.put({
    id: profile.id,
    profile,
    lastSync: Date.now(),
  })
}

// 获取本地用户配置
export async function getLocalUserProfile(userId: string): Promise<Profile | null> {
  const db = getDB()
  const local = await db.userProfiles.get(userId)
  return local?.profile || null
}

// 获取当前用户（如果有多个用户记录，取最后同步的）
export async function getCurrentUserProfile(): Promise<Profile | null> {
  const db = getDB()
  const users = await db.userProfiles.orderBy('lastSync').reverse().first()
  return users?.profile || null
}

// ============================================
// 数据库维护
// ============================================

// 清空所有数据（登出时使用）
export async function clearAllData(): Promise<void> {
  const db = getDB()
  await Promise.all([
    db.messages.clear(),
    db.conversations.clear(),
    db.userProfiles.clear(),
  ])
}

// 获取数据库使用情况
export async function getStorageStats(): Promise<{
  messageCount: number
  conversationCount: number
  estimatedSize: string
}> {
  const db = getDB()
  const messageCount = await db.messages.count()
  const conversationCount = await db.conversations.count()
  
  // 估算存储大小
  const estimate = await navigator.storage?.estimate?.()
  const usageInMB = estimate?.usage 
    ? (estimate.usage / 1024 / 1024).toFixed(2) + ' MB'
    : '未知'
  
  return {
    messageCount,
    conversationCount,
    estimatedSize: usageInMB,
  }
}

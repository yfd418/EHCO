/**
 * Echo 消息服务层
 * 统一的数据访问层，组件只调用这些方法，不关心数据来源
 */

import { supabase } from '@/lib/supabase'
import { uploadFile, compressImage } from '@/lib/storage'
import { saveMessage, saveMessages, getLocalMessages, generateChatId } from '@/lib/db'
import { isImageFile } from '@/lib/utils'
import type { Message, MessageType, Profile, Conversation } from '@/types'

// ============================================
// 消息服务
// ============================================

export interface SendMessageParams {
  senderId: string
  receiverId: string
  content: string
  channelId?: string
}

export interface SendFileParams {
  senderId: string
  receiverId?: string
  channelId?: string
  file: File
}

export interface MessageServiceResult<T = Message> {
  success: boolean
  data?: T
  error?: string
}

/**
 * 发送文本消息
 */
export async function sendMessage(params: SendMessageParams): Promise<MessageServiceResult> {
  const { senderId, receiverId, content, channelId } = params
  
  try {
    // 创建临时消息用于乐观更新
    const tempMessage: Message = {
      id: `temp_${Date.now()}`,
      sender_id: senderId,
      receiver_id: receiverId || '',
      content,
      message_type: 'text',
      is_read: false,
      created_at: new Date().toISOString(),
    }

    // 先保存到本地
    await saveMessage(tempMessage)

    // 发送到服务器
    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: senderId,
        receiver_id: receiverId || '',
        content,
        message_type: 'text',
      })
      .select()
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    // 用真实消息替换本地临时消息
    await saveMessage(data as Message)

    return { success: true, data: data as Message }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 发送文件消息（图片/文件）
 */
export async function sendFileMessage(params: SendFileParams): Promise<MessageServiceResult> {
  const { senderId, receiverId, file } = params

  try {
    // 上传文件（会自动压缩图片）
    const uploadResult = await uploadFile(file, senderId)
    
    if (!uploadResult.success || !uploadResult.url) {
      return { success: false, error: uploadResult.error || '文件上传失败' }
    }

    // 确定消息类型
    const messageType: MessageType = isImageFile(file.type) ? 'image' : 'file'

    // 创建临时消息
    const tempMessage: Message = {
      id: `temp_${Date.now()}`,
      sender_id: senderId,
      receiver_id: receiverId || '',
      content: '',
      message_type: messageType,
      file_url: uploadResult.url,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      is_read: false,
      created_at: new Date().toISOString(),
    }

    await saveMessage(tempMessage)

    // 发送到服务器
    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: senderId,
        receiver_id: receiverId || '',
        content: '',
        message_type: messageType,
        file_url: uploadResult.url,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
      })
      .select()
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    await saveMessage(data as Message)

    return { success: true, data: data as Message }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 获取聊天消息（优先本地，然后同步远程）
 */
export async function getMessages(
  myUserId: string,
  friendId: string,
  options?: { limit?: number; useLocal?: boolean }
): Promise<MessageServiceResult<Message[]>> {
  const { limit = 100, useLocal = true } = options || {}

  try {
    // 先从本地获取
    if (useLocal) {
      const localMessages = await getLocalMessages(myUserId, friendId, limit)
      if (localMessages.length > 0) {
        // 异步从服务器同步新消息
        syncMessagesFromServer(myUserId, friendId, localMessages)
        return { success: true, data: localMessages }
      }
    }

    // 从服务器获取
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${myUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${myUserId})`)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) {
      return { success: false, error: error.message }
    }

    // 保存到本地
    if (data) {
      await saveMessages(data as Message[])
    }

    return { success: true, data: data as Message[] }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 从服务器同步新消息（后台执行）
 */
async function syncMessagesFromServer(
  myUserId: string,
  friendId: string,
  localMessages: Message[]
): Promise<void> {
  try {
    const lastLocalMessage = localMessages[localMessages.length - 1]
    const lastTimestamp = lastLocalMessage?.created_at

    if (!lastTimestamp) return

    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${myUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${myUserId})`)
      .gt('created_at', lastTimestamp)
      .order('created_at', { ascending: true })

    if (data && data.length > 0) {
      await saveMessages(data as Message[])
    }
  } catch (err) {
    console.error('[MessageService] Sync failed:', err)
  }
}

/**
 * 标记消息为已读
 */
export async function markMessagesAsRead(messageIds: string[]): Promise<MessageServiceResult<void>> {
  if (messageIds.length === 0) {
    return { success: true }
  }

  try {
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .in('id', messageIds)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 删除消息（阅后即焚）
 */
export async function deleteMessage(messageId: string): Promise<MessageServiceResult<void>> {
  try {
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ============================================
// 会话服务
// ============================================

/**
 * 获取会话列表
 */
export async function getConversations(userId: string): Promise<MessageServiceResult<Conversation[]>> {
  try {
    const { data: friendships, error: friendshipsError } = await supabase
      .from('friendships')
      .select(`
        *,
        friend:profiles!friendships_friend_id_fkey(*)
      `)
      .eq('user_id', userId)
      .eq('status', 'accepted')

    if (friendshipsError) {
      return { success: false, error: friendshipsError.message }
    }

    if (!friendships) {
      return { success: true, data: [] }
    }

    const conversations = await Promise.all(
      friendships.map(async (f: { friend: Profile }) => {
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('*')
          .or(`and(sender_id.eq.${userId},receiver_id.eq.${f.friend.id}),and(sender_id.eq.${f.friend.id},receiver_id.eq.${userId})`)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('sender_id', f.friend.id)
          .eq('receiver_id', userId)
          .eq('is_read', false)

        return {
          friend: f.friend,
          last_message: lastMsg || null,
          unread_count: count || 0,
        } as Conversation
      })
    )

    // 按最后消息时间排序
    conversations.sort((a, b) => {
      if (!a.last_message && !b.last_message) return 0
      if (!a.last_message) return 1
      if (!b.last_message) return -1
      return new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime()
    })

    return { success: true, data: conversations }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ============================================
// 用户服务
// ============================================

/**
 * 获取用户资料
 */
export async function getUserProfile(userId: string): Promise<MessageServiceResult<Profile>> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: data as Profile }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 更新用户资料
 */
export async function updateUserProfile(
  userId: string,
  updates: Partial<Profile>
): Promise<MessageServiceResult<Profile>> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: data as Profile }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

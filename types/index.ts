// 用户档案
export interface Profile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  updated_at: string | null
  is_online?: boolean
}

// 好友关系状态
export type FriendshipStatus = 'pending' | 'accepted' | 'blocked'

// 好友关系
export interface Friendship {
  id: string
  user_id: string
  friend_id: string
  status: FriendshipStatus
  created_at: string
  // 关联的好友档案信息
  friend?: Profile
}

// 消息类型
export type MessageType = 'text' | 'image' | 'file'

// 文件附件信息
export interface FileAttachment {
  name: string
  size: number
  type: string
  url: string
}

// 消息
export interface Message {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  message_type?: MessageType
  file_url?: string | null
  file_name?: string | null
  file_size?: number | null
  file_type?: string | null
  is_read: boolean
  created_at: string
  // 发送者档案信息
  sender?: Profile
}

// 会话（用于聊天列表展示）
export interface Conversation {
  friend: Profile
  last_message: Message | null
  unread_count: number
}

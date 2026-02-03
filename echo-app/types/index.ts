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
export type MessageType = 'text' | 'image' | 'file' | 'system'

// 文件附件信息
export interface FileAttachment {
  name: string
  size: number
  type: string
  url: string
}

// 私聊消息
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

// =============================================
// 频道相关类型
// =============================================

// 频道成员角色
export type ChannelRole = 'owner' | 'admin' | 'member'

// 频道
export interface Channel {
  id: string
  name: string
  description: string | null
  avatar_url: string | null
  owner_id: string
  is_private: boolean
  created_at: string
  updated_at: string
  // 关联数据
  owner?: Profile
  member_count?: number
}

// 频道成员
export interface ChannelMember {
  id: string
  channel_id: string
  user_id: string
  role: ChannelRole
  nickname: string | null
  joined_at: string
  last_read_at: string
  // 关联的用户档案
  user?: Profile
}

// 频道消息
export interface ChannelMessage {
  id: string
  channel_id: string
  sender_id: string
  content: string | null
  message_type: MessageType
  file_url: string | null
  file_name: string | null
  file_size: number | null
  file_type: string | null
  reply_to: string | null
  created_at: string
  // 关联数据
  sender?: Profile
  reply_message?: ChannelMessage
}

// 频道会话（用于频道列表展示）
export interface ChannelConversation {
  channel: Channel
  last_message: ChannelMessage | null
  unread_count: number
  my_role: ChannelRole
}

-- ============================================
-- 会话视图优化 (预计算最后消息和未读数)
-- ============================================

-- 1. 创建会话视图 - 预计算每个会话的最后一条消息
CREATE OR REPLACE VIEW conversation_previews AS
WITH last_messages AS (
  SELECT DISTINCT ON (
    LEAST(sender_id, receiver_id),
    GREATEST(sender_id, receiver_id)
  )
    id,
    sender_id,
    receiver_id,
    content,
    message_type,
    file_name,
    created_at,
    is_read,
    LEAST(sender_id, receiver_id) AS user1_id,
    GREATEST(sender_id, receiver_id) AS user2_id
  FROM messages
  WHERE channel_id IS NULL  -- 只处理私聊消息
  ORDER BY 
    LEAST(sender_id, receiver_id),
    GREATEST(sender_id, receiver_id),
    created_at DESC
),
unread_counts AS (
  SELECT 
    receiver_id,
    sender_id,
    COUNT(*) AS unread_count
  FROM messages
  WHERE is_read = FALSE
    AND channel_id IS NULL
  GROUP BY receiver_id, sender_id
)
SELECT 
  lm.id AS last_message_id,
  lm.user1_id,
  lm.user2_id,
  lm.sender_id,
  lm.receiver_id,
  lm.content,
  lm.message_type,
  lm.file_name,
  lm.created_at,
  lm.is_read,
  COALESCE(uc.unread_count, 0) AS unread_count
FROM last_messages lm
LEFT JOIN unread_counts uc 
  ON uc.receiver_id = lm.user1_id AND uc.sender_id = lm.user2_id
  OR uc.receiver_id = lm.user2_id AND uc.sender_id = lm.user1_id;

-- 2. 创建获取用户会话列表的函数
CREATE OR REPLACE FUNCTION get_user_conversations(p_user_id UUID)
RETURNS TABLE (
  friend_id UUID,
  friend_username TEXT,
  friend_display_name TEXT,
  friend_avatar_url TEXT,
  last_message_id UUID,
  last_message_content TEXT,
  last_message_type TEXT,
  last_message_file_name TEXT,
  last_message_sender_id UUID,
  last_message_created_at TIMESTAMPTZ,
  last_message_is_read BOOLEAN,
  unread_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH user_conversations AS (
    SELECT 
      CASE 
        WHEN cp.user1_id = p_user_id THEN cp.user2_id
        ELSE cp.user1_id
      END AS friend_id,
      cp.last_message_id,
      cp.content AS last_message_content,
      cp.message_type::TEXT AS last_message_type,
      cp.file_name AS last_message_file_name,
      cp.sender_id AS last_message_sender_id,
      cp.created_at AS last_message_created_at,
      cp.is_read AS last_message_is_read,
      -- 只计算对方发给我的未读消息
      CASE 
        WHEN cp.sender_id != p_user_id AND cp.is_read = FALSE THEN 1
        ELSE 0
      END AS is_unread
    FROM conversation_previews cp
    WHERE cp.user1_id = p_user_id OR cp.user2_id = p_user_id
  ),
  unread_by_friend AS (
    SELECT 
      sender_id AS friend_id,
      COUNT(*) AS unread_count
    FROM messages
    WHERE receiver_id = p_user_id
      AND is_read = FALSE
      AND channel_id IS NULL
    GROUP BY sender_id
  )
  SELECT 
    uc.friend_id,
    p.username AS friend_username,
    p.display_name AS friend_display_name,
    p.avatar_url AS friend_avatar_url,
    uc.last_message_id,
    uc.last_message_content,
    uc.last_message_type,
    uc.last_message_file_name,
    uc.last_message_sender_id,
    uc.last_message_created_at,
    uc.last_message_is_read,
    COALESCE(ubf.unread_count, 0) AS unread_count
  FROM user_conversations uc
  JOIN profiles p ON p.id = uc.friend_id
  LEFT JOIN unread_by_friend ubf ON ubf.friend_id = uc.friend_id
  -- 只显示已经是好友的会话
  WHERE EXISTS (
    SELECT 1 FROM friendships f
    WHERE f.user_id = p_user_id 
      AND f.friend_id = uc.friend_id
      AND f.status = 'accepted'
  )
  ORDER BY uc.last_message_created_at DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. 创建优化索引
CREATE INDEX IF NOT EXISTS idx_messages_conversation 
ON messages (
  LEAST(sender_id, receiver_id),
  GREATEST(sender_id, receiver_id),
  created_at DESC
) WHERE channel_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_unread_count 
ON messages (receiver_id, sender_id)
WHERE is_read = FALSE AND channel_id IS NULL;

-- 4. 创建频道消息统计视图
CREATE OR REPLACE VIEW channel_message_stats AS
SELECT 
  channel_id,
  COUNT(*) AS total_messages,
  MAX(created_at) AS last_message_at,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS messages_today
FROM messages
WHERE channel_id IS NOT NULL
GROUP BY channel_id;

-- 5. 创建获取频道最后消息的函数
CREATE OR REPLACE FUNCTION get_channel_last_messages(p_channel_ids UUID[])
RETURNS TABLE (
  channel_id UUID,
  last_message_id UUID,
  last_message_content TEXT,
  last_message_type TEXT,
  last_message_sender_id UUID,
  last_message_sender_username TEXT,
  last_message_created_at TIMESTAMPTZ,
  total_messages BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH last_msgs AS (
    SELECT DISTINCT ON (m.channel_id)
      m.channel_id,
      m.id AS last_message_id,
      m.content AS last_message_content,
      m.message_type::TEXT AS last_message_type,
      m.sender_id AS last_message_sender_id,
      m.created_at AS last_message_created_at
    FROM messages m
    WHERE m.channel_id = ANY(p_channel_ids)
    ORDER BY m.channel_id, m.created_at DESC
  ),
  msg_counts AS (
    SELECT 
      m.channel_id,
      COUNT(*) AS total_messages
    FROM messages m
    WHERE m.channel_id = ANY(p_channel_ids)
    GROUP BY m.channel_id
  )
  SELECT 
    lm.channel_id,
    lm.last_message_id,
    lm.last_message_content,
    lm.last_message_type,
    lm.last_message_sender_id,
    p.username AS last_message_sender_username,
    lm.last_message_created_at,
    COALESCE(mc.total_messages, 0) AS total_messages
  FROM last_msgs lm
  LEFT JOIN profiles p ON p.id = lm.last_message_sender_id
  LEFT JOIN msg_counts mc ON mc.channel_id = lm.channel_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. 创建消息计数触发器（可选，用于实时更新统计）
-- 注意：对于高频更新场景，可以考虑使用物化视图 + 定期刷新

-- 完成
COMMENT ON VIEW conversation_previews IS '会话预览视图，包含最后一条消息和未读数';
COMMENT ON FUNCTION get_user_conversations IS '获取用户的会话列表，包含好友信息和消息预览';

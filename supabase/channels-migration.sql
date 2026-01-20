-- =============================================
-- Echo 频道功能 - 数据库迁移
-- 支持多人群聊
-- =============================================

-- 1. 频道表
CREATE TABLE IF NOT EXISTS public.channels (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name text NOT NULL,
  description text,
  avatar_url text,
  owner_id uuid REFERENCES public.profiles(id) NOT NULL,
  is_private boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  
  -- 频道名称至少2个字符
  CONSTRAINT channel_name_length CHECK (char_length(name) >= 2)
);

-- 2. 频道成员表
CREATE TABLE IF NOT EXISTS public.channel_members (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role text CHECK (role IN ('owner', 'admin', 'member')) DEFAULT 'member',
  nickname text, -- 频道内昵称（可选）
  joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  last_read_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  
  -- 每个用户在每个频道只能有一条记录
  UNIQUE(channel_id, user_id)
);

-- 3. 频道消息表
CREATE TABLE IF NOT EXISTS public.channel_messages (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid REFERENCES public.profiles(id) NOT NULL,
  content text,
  message_type text DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'system')),
  file_url text,
  file_name text,
  file_size bigint,
  file_type text,
  reply_to uuid REFERENCES public.channel_messages(id), -- 回复消息
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  
  -- 消息内容或文件至少有一个
  CONSTRAINT message_has_content CHECK (content IS NOT NULL OR file_url IS NOT NULL)
);

-- 4. 启用 RLS
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_messages ENABLE ROW LEVEL SECURITY;

-- 5. 频道 RLS 策略
-- 用户可以查看自己加入的频道，或公开频道
CREATE POLICY "Users can view joined channels"
  ON channels FOR SELECT
  USING (
    NOT is_private 
    OR id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid())
  );

-- 用户可以创建频道
CREATE POLICY "Users can create channels"
  ON channels FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- 频道所有者可以更新频道
CREATE POLICY "Owners can update channels"
  ON channels FOR UPDATE
  USING (auth.uid() = owner_id);

-- 频道所有者可以删除频道
CREATE POLICY "Owners can delete channels"
  ON channels FOR DELETE
  USING (auth.uid() = owner_id);

-- 6. 频道成员 RLS 策略
-- 频道成员可以查看同频道的其他成员
CREATE POLICY "Members can view channel members"
  ON channel_members FOR SELECT
  USING (
    channel_id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid())
  );

-- 频道管理员和所有者可以添加成员
CREATE POLICY "Admins can add members"
  ON channel_members FOR INSERT
  WITH CHECK (
    -- 自己加入公开频道
    (user_id = auth.uid() AND channel_id IN (SELECT id FROM channels WHERE NOT is_private))
    OR
    -- 管理员/所有者邀请
    channel_id IN (
      SELECT channel_id FROM channel_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- 成员可以退出频道（删除自己的记录），管理员可以移除成员
CREATE POLICY "Members can leave or admins can remove"
  ON channel_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR channel_id IN (
      SELECT channel_id FROM channel_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- 管理员可以更新成员角色
CREATE POLICY "Admins can update member roles"
  ON channel_members FOR UPDATE
  USING (
    channel_id IN (
      SELECT channel_id FROM channel_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- 7. 频道消息 RLS 策略
-- 频道成员可以查看消息
CREATE POLICY "Members can view channel messages"
  ON channel_messages FOR SELECT
  USING (
    channel_id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid())
  );

-- 频道成员可以发送消息
CREATE POLICY "Members can send messages"
  ON channel_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND channel_id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid())
  );

-- 发送者可以删除自己的消息
CREATE POLICY "Senders can delete own messages"
  ON channel_messages FOR DELETE
  USING (auth.uid() = sender_id);

-- 8. 创建索引优化查询
CREATE INDEX IF NOT EXISTS idx_channel_members_channel ON channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_messages_channel ON channel_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_messages_created ON channel_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_channel_messages_sender ON channel_messages(sender_id);

-- 9. 开启 Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE channel_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE channel_members;

-- =============================================
-- 使用说明：
-- 1. 在 Supabase SQL Editor 中运行此脚本
-- 2. 确保 Realtime 已开启
-- =============================================

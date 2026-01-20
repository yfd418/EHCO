-- =============================================
-- 修复频道 RLS 策略的无限递归问题
-- 在 Supabase SQL Editor 中执行此脚本
-- =============================================

-- 首先删除有问题的策略
DROP POLICY IF EXISTS "Members can view channel members" ON channel_members;
DROP POLICY IF EXISTS "Admins can add members" ON channel_members;
DROP POLICY IF EXISTS "Members can leave or admins can remove" ON channel_members;
DROP POLICY IF EXISTS "Admins can update member roles" ON channel_members;

-- 创建一个安全的函数来检查用户是否是频道成员
-- 使用 SECURITY DEFINER 绕过 RLS 检查，避免递归
CREATE OR REPLACE FUNCTION is_channel_member(p_channel_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = p_channel_id AND user_id = p_user_id
  );
$$;

-- 创建函数检查用户是否是频道管理员或所有者
CREATE OR REPLACE FUNCTION is_channel_admin(p_channel_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = p_channel_id 
      AND user_id = p_user_id 
      AND role IN ('owner', 'admin')
  );
$$;

-- 重新创建 channel_members 的 RLS 策略（使用函数避免递归）

-- 1. 查看成员：频道成员可以查看同频道的其他成员
CREATE POLICY "Members can view channel members"
  ON channel_members FOR SELECT
  USING (is_channel_member(channel_id, auth.uid()));

-- 2. 添加成员策略
-- 允许：所有者创建频道时添加自己 / 管理员邀请他人 / 用户加入公开频道
CREATE POLICY "Users can add members"
  ON channel_members FOR INSERT
  WITH CHECK (
    -- 频道所有者可以添加任何人（包括创建时添加自己）
    EXISTS (SELECT 1 FROM channels WHERE id = channel_id AND owner_id = auth.uid())
    OR
    -- 管理员可以邀请他人
    is_channel_admin(channel_id, auth.uid())
    OR
    -- 用户可以加入公开频道（只能添加自己）
    (user_id = auth.uid() AND EXISTS (SELECT 1 FROM channels WHERE id = channel_id AND NOT is_private))
  );

-- 3. 删除成员：成员可以退出，管理员可以移除他人
CREATE POLICY "Members can leave or admins can remove"
  ON channel_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR is_channel_admin(channel_id, auth.uid())
  );

-- 4. 更新成员：管理员可以更新成员信息
CREATE POLICY "Admins can update member roles"
  ON channel_members FOR UPDATE
  USING (is_channel_admin(channel_id, auth.uid()));

-- 同样修复 channel_messages 的策略
DROP POLICY IF EXISTS "Members can view channel messages" ON channel_messages;
DROP POLICY IF EXISTS "Members can send messages" ON channel_messages;

-- 成员可以查看消息
CREATE POLICY "Members can view channel messages"
  ON channel_messages FOR SELECT
  USING (is_channel_member(channel_id, auth.uid()));

-- 成员可以发送消息
CREATE POLICY "Members can send messages"
  ON channel_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND is_channel_member(channel_id, auth.uid())
  );

-- 修复 channels 表的查看策略
DROP POLICY IF EXISTS "Users can view joined channels" ON channels;

CREATE POLICY "Users can view joined channels"
  ON channels FOR SELECT
  USING (
    NOT is_private 
    OR is_channel_member(id, auth.uid())
    OR owner_id = auth.uid()
  );

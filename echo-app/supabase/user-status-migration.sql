-- ============================================
-- 用户状态/心情功能 (24小时后自动消失)
-- ============================================

-- 1. 创建用户状态表
CREATE TABLE IF NOT EXISTS user_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  emoji TEXT, -- 可选的 emoji
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  
  -- 每个用户同时只能有一个状态
  UNIQUE(user_id)
);

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_user_status_user_id ON user_status(user_id);
CREATE INDEX IF NOT EXISTS idx_user_status_expires_at ON user_status(expires_at);

-- 3. 启用 RLS
ALTER TABLE user_status ENABLE ROW LEVEL SECURITY;

-- 4. RLS 策略
-- 所有登录用户可以查看状态
DROP POLICY IF EXISTS "Anyone can view status" ON user_status;
CREATE POLICY "Anyone can view status" 
ON user_status FOR SELECT 
USING (
  auth.uid() IS NOT NULL 
  AND expires_at > NOW()
);

-- 用户只能管理自己的状态
DROP POLICY IF EXISTS "Users can manage own status" ON user_status;
CREATE POLICY "Users can manage own status" 
ON user_status FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 5. 创建设置状态的函数（插入或更新）
CREATE OR REPLACE FUNCTION set_user_status(
  p_content TEXT,
  p_emoji TEXT DEFAULT NULL,
  p_duration_hours INTEGER DEFAULT 24
)
RETURNS UUID AS $$
DECLARE
  status_id UUID;
BEGIN
  INSERT INTO user_status (user_id, content, emoji, expires_at)
  VALUES (
    auth.uid(),
    p_content,
    p_emoji,
    NOW() + (p_duration_hours || ' hours')::INTERVAL
  )
  ON CONFLICT (user_id) DO UPDATE SET
    content = EXCLUDED.content,
    emoji = EXCLUDED.emoji,
    created_at = NOW(),
    expires_at = NOW() + (p_duration_hours || ' hours')::INTERVAL
  RETURNING id INTO status_id;
  
  RETURN status_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. 创建清除自己状态的函数
CREATE OR REPLACE FUNCTION clear_user_status()
RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM user_status WHERE user_id = auth.uid();
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. 创建清理过期状态的函数
CREATE OR REPLACE FUNCTION cleanup_expired_status()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM user_status 
    WHERE expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. 添加定时任务清理过期状态（如果 pg_cron 可用）
DO $$
BEGIN
  -- 删除已存在的任务（如果有）
  PERFORM cron.unschedule('cleanup_expired_status');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  -- 每小时执行一次清理
  PERFORM cron.schedule(
    'cleanup_expired_status',
    '0 * * * *',  -- 每小时
    $$SELECT cleanup_expired_status()$$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule status cleanup task: %', SQLERRM;
END $$;

-- 9. 启用实时监听
ALTER PUBLICATION supabase_realtime ADD TABLE user_status;

-- 10. 创建获取好友状态的视图
CREATE OR REPLACE VIEW friend_statuses AS
SELECT 
  us.id,
  us.user_id,
  us.content,
  us.emoji,
  us.created_at,
  us.expires_at,
  p.username,
  p.display_name,
  p.avatar_url
FROM user_status us
JOIN profiles p ON p.id = us.user_id
WHERE us.expires_at > NOW();

-- 完成
COMMENT ON TABLE user_status IS '用户状态/心情，24小时后自动过期';
COMMENT ON COLUMN user_status.content IS '状态文本内容';
COMMENT ON COLUMN user_status.emoji IS '可选的 emoji 表情';
COMMENT ON COLUMN user_status.expires_at IS '状态过期时间';

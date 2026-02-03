-- ============================================
-- 消息销毁功能 (阅后即焚 / 定时清理)
-- ============================================

-- 1. 添加消息过期时间字段
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_ephemeral BOOLEAN DEFAULT FALSE;

-- 2. 创建索引以优化过期消息查询
CREATE INDEX IF NOT EXISTS idx_messages_expires_at 
ON messages (expires_at) 
WHERE expires_at IS NOT NULL;

-- 3. 创建清理过期消息的函数
CREATE OR REPLACE FUNCTION cleanup_expired_messages()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM messages 
    WHERE expires_at IS NOT NULL 
      AND expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. 创建阅后即焚触发器函数
-- 当消息被标记为已读且是阅后即焚消息时，设置30秒后过期
CREATE OR REPLACE FUNCTION handle_ephemeral_message_read()
RETURNS TRIGGER AS $$
BEGIN
  -- 如果消息是阅后即焚类型，且刚被标记为已读
  IF NEW.is_ephemeral = TRUE 
    AND NEW.is_read = TRUE 
    AND (OLD.is_read = FALSE OR OLD.is_read IS NULL)
    AND NEW.expires_at IS NULL 
  THEN
    -- 设置30秒后过期
    NEW.expires_at := NOW() + INTERVAL '30 seconds';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. 创建触发器
DROP TRIGGER IF EXISTS trigger_ephemeral_message_read ON messages;
CREATE TRIGGER trigger_ephemeral_message_read
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION handle_ephemeral_message_read();

-- 6. 创建定时任务函数（需要 pg_cron 扩展）
-- 注意：Supabase 默认支持 pg_cron，但需要在项目设置中启用
-- 每分钟清理一次过期消息

-- 首先检查 pg_cron 扩展是否已安装
DO $$
BEGIN
  -- 尝试启用 pg_cron（如果尚未启用）
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  -- 如果无法创建扩展，记录错误但继续执行
  RAISE NOTICE 'pg_cron extension could not be enabled: %', SQLERRM;
END $$;

-- 7. 添加定时任务（如果 pg_cron 可用）
DO $$
BEGIN
  -- 删除已存在的任务（如果有）
  PERFORM cron.unschedule('cleanup_expired_messages');
EXCEPTION WHEN OTHERS THEN
  -- 忽略错误
  NULL;
END $$;

DO $$
BEGIN
  -- 每分钟执行一次清理
  PERFORM cron.schedule(
    'cleanup_expired_messages',
    '* * * * *',  -- 每分钟
    $$SELECT cleanup_expired_messages()$$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule cleanup task: %', SQLERRM;
END $$;

-- 8. 添加 RLS 策略允许用户删除自己发送的消息
DROP POLICY IF EXISTS "Users can delete own messages" ON messages;
CREATE POLICY "Users can delete own messages" 
ON messages FOR DELETE 
USING (auth.uid() = sender_id);

-- 9. 创建发送阅后即焚消息的辅助函数
CREATE OR REPLACE FUNCTION send_ephemeral_message(
  p_sender_id UUID,
  p_receiver_id UUID,
  p_content TEXT,
  p_channel_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  new_message_id UUID;
BEGIN
  INSERT INTO messages (
    sender_id,
    receiver_id,
    channel_id,
    content,
    message_type,
    is_ephemeral,
    is_read
  ) VALUES (
    p_sender_id,
    p_receiver_id,
    p_channel_id,
    p_content,
    'text',
    TRUE,
    FALSE
  ) RETURNING id INTO new_message_id;
  
  RETURN new_message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. 创建设置消息定时过期的函数
CREATE OR REPLACE FUNCTION set_message_expiry(
  p_message_id UUID,
  p_expires_in_seconds INTEGER
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE messages 
  SET expires_at = NOW() + (p_expires_in_seconds || ' seconds')::INTERVAL
  WHERE id = p_message_id 
    AND sender_id = auth.uid();
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 完成
COMMENT ON COLUMN messages.expires_at IS '消息过期时间，过期后自动删除';
COMMENT ON COLUMN messages.is_ephemeral IS '是否为阅后即焚消息';

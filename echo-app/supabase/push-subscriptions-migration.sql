-- ============================================
-- Web Push 推送订阅存储
-- ============================================

-- 1. 创建推送订阅表
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,  -- PushSubscription 对象
  endpoint TEXT NOT NULL,  -- 用于去重
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 每个用户的每个端点只能有一个订阅
  UNIQUE(user_id, endpoint)
);

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);

-- 3. 启用 RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 4. RLS 策略
-- 用户只能管理自己的订阅
DROP POLICY IF EXISTS "Users can manage own subscriptions" ON push_subscriptions;
CREATE POLICY "Users can manage own subscriptions" 
ON push_subscriptions FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 5. 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_push_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_push_subscription_updated_at ON push_subscriptions;
CREATE TRIGGER trigger_push_subscription_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_push_subscription_updated_at();

-- 6. 创建保存订阅的函数
CREATE OR REPLACE FUNCTION save_push_subscription(
  p_subscription JSONB
)
RETURNS UUID AS $$
DECLARE
  subscription_id UUID;
  endpoint_url TEXT;
BEGIN
  -- 提取 endpoint
  endpoint_url := p_subscription->>'endpoint';
  
  IF endpoint_url IS NULL THEN
    RAISE EXCEPTION 'Invalid subscription: missing endpoint';
  END IF;

  INSERT INTO push_subscriptions (user_id, subscription, endpoint)
  VALUES (auth.uid(), p_subscription, endpoint_url)
  ON CONFLICT (user_id, endpoint) DO UPDATE SET
    subscription = EXCLUDED.subscription,
    updated_at = NOW()
  RETURNING id INTO subscription_id;
  
  RETURN subscription_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. 创建删除订阅的函数
CREATE OR REPLACE FUNCTION remove_push_subscription(
  p_endpoint TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM push_subscriptions 
  WHERE user_id = auth.uid() AND endpoint = p_endpoint;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. 创建清理过期订阅的函数（超过 30 天未更新的订阅可能已失效）
CREATE OR REPLACE FUNCTION cleanup_stale_subscriptions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM push_subscriptions 
    WHERE updated_at < NOW() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 完成
COMMENT ON TABLE push_subscriptions IS 'Web Push 推送订阅存储';
COMMENT ON COLUMN push_subscriptions.subscription IS 'PushSubscription JSON 对象';
COMMENT ON COLUMN push_subscriptions.endpoint IS '推送端点 URL，用于去重';

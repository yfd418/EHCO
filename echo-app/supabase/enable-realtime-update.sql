-- =============================================
-- 启用 messages 表的完整 Realtime 支持
-- =============================================

-- 1. 确保 messages 表启用了 Realtime
-- 在 Supabase Dashboard > Database > Replication 中检查 messages 表是否已启用
-- 或者运行以下命令：
alter publication supabase_realtime add table messages;

-- 2. 设置 REPLICA IDENTITY FULL 以便在 UPDATE 事件中获取完整的行数据
-- 这对于已读状态的实时同步至关重要
alter table messages replica identity full;

-- =============================================
-- 运行完成后，刷新浏览器测试已读状态
-- 
-- 测试步骤：
-- 1. 打开两个浏览器窗口，分别登录两个用户
-- 2. 用户A发送消息给用户B
-- 3. 用户B打开聊天窗口（消息会被自动标记为已读）
-- 4. 用户A应该看到消息的已读状态变为蓝色双勾
--
-- 如果仍然不工作，检查浏览器控制台是否有以下日志：
-- - "[Realtime] Message UPDATE received: xxx is_read: true"
-- =============================================

-- =============================================
-- Echo 安全性更新 - 存储策略优化
-- 运行此脚本以更新已有的存储策略
-- =============================================

-- 1. 删除旧的公开读取策略（如果存在）
DROP POLICY IF EXISTS "Allow public read" ON storage.objects;

-- 2. 删除可能已存在的认证用户策略（避免重复创建错误）
DROP POLICY IF EXISTS "Allow authenticated read" ON storage.objects;

-- 3. 创建新的仅认证用户读取策略
-- 这确保只有登录用户才能访问聊天文件，防止未授权访问
CREATE POLICY "Allow authenticated read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'chat-files');

-- 3. 可选：如果需要更严格的访问控制，可以限制用户只能读取自己参与的对话中的文件
-- 注意：这需要在 messages 表中有文件 URL 的记录，实现起来更复杂
-- 取消注释以下代码启用更严格的策略：

-- DROP POLICY IF EXISTS "Allow authenticated read" ON storage.objects;
-- CREATE POLICY "Allow participants to read chat files"
-- ON storage.objects FOR SELECT
-- TO authenticated
-- USING (
--   bucket_id = 'chat-files' 
--   AND EXISTS (
--     SELECT 1 FROM messages m
--     WHERE m.file_url LIKE '%' || storage.objects.name || '%'
--     AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
--   )
-- );

-- =============================================
-- 验证更新是否成功
-- =============================================
-- 运行以下查询检查策略：
-- SELECT policyname, cmd, roles 
-- FROM pg_policies 
-- WHERE schemaname = 'storage' AND tablename = 'objects';

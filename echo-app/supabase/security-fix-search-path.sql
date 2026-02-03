-- =============================================
-- 修复 Supabase Security Linter 警告
-- 在 Supabase SQL Editor 中执行此脚本
-- =============================================

-- 问题: function_search_path_mutable
-- 所有使用 SECURITY DEFINER 的函数都应该设置 search_path
-- 这可以防止恶意用户通过操纵 search_path 来劫持函数调用

-- =============================================
-- 1. 修复 handle_new_user 函数
-- =============================================
-- 这个函数通常用于在用户注册时自动创建 profile
-- 如果你的数据库中存在此函数，请运行以下代码：

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'username'),
    NEW.raw_user_meta_data->>'avatar_url',
    NOW()
  );
  RETURN NEW;
END;
$$;

-- 确保触发器存在
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- 2. 修复 is_channel_member 函数
-- =============================================
CREATE OR REPLACE FUNCTION public.is_channel_member(p_channel_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = p_channel_id AND user_id = p_user_id
  );
$$;

-- =============================================
-- 3. 修复 is_channel_admin 函数
-- =============================================
CREATE OR REPLACE FUNCTION public.is_channel_admin(p_channel_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = p_channel_id 
      AND user_id = p_user_id 
      AND role IN ('owner', 'admin')
  );
$$;

-- =============================================
-- 验证修复
-- =============================================
-- 运行以下查询确认 search_path 已设置：
/*
SELECT 
  proname as function_name,
  proconfig as config
FROM pg_proc
WHERE proname IN ('handle_new_user', 'is_channel_member', 'is_channel_admin')
  AND pronamespace = 'public'::regnamespace;
*/

-- =============================================
-- 关于 "Leaked Password Protection" 警告
-- =============================================
-- 这个功能需要在 Supabase Dashboard 中启用，不能通过 SQL 设置
-- 
-- 启用步骤：
-- 1. 登录 Supabase Dashboard (https://supabase.com/dashboard)
-- 2. 选择你的项目
-- 3. 进入 Authentication > Settings
-- 4. 找到 "Password Protection" 或 "Security" 部分
-- 5. 启用 "Leaked password protection" / "HaveIBeenPwned protection"
--
-- 这个功能会检查用户注册/更改密码时，密码是否已在数据泄露中出现过
-- 强烈建议在生产环境中启用此功能
-- =============================================

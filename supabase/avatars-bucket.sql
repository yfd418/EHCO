-- =============================================
-- Echo 头像存储桶设置
-- 请在 Supabase SQL Editor 中运行此脚本
-- =============================================

-- 1. 创建头像存储桶（如果不存在）
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 2. 允许所有人查看头像
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- 3. 允许已登录用户上传自己的头像
create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars' 
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. 允许用户更新自己的头像
create policy "Users can update their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars' 
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5. 允许用户删除自己的头像
create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars' 
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =============================================
-- 注意：如果上面的策略已存在，可能会报错
-- 可以先删除已有策略再重新创建
-- =============================================

-- =============================================
-- Echo 数据库初始化脚本
-- 请在 Supabase SQL Editor 中运行此脚本
-- =============================================

-- 1. 用户档案表 (基于 Supabase Auth 扩展)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  username text unique not null,
  display_name text,
  avatar_url text,
  updated_at timestamp with time zone,
  
  -- 约束：用户名至少3位
  constraint username_length check (char_length(username) >= 3)
);

-- 2. 启用行级安全 (RLS)
alter table public.profiles enable row level security;

-- RLS 策略
create policy "Public profiles are viewable by everyone" 
  on profiles for select using (true);

create policy "Users can insert their own profile" 
  on profiles for insert with check (auth.uid() = id);

create policy "Users can update own profile" 
  on profiles for update using (auth.uid() = id);

-- 3. 好友关系表 (Friendships)
create table if not exists public.friendships (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  friend_id uuid references public.profiles(id) not null,
  status text check (status in ('pending', 'accepted', 'blocked')) default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()),
  
  -- 避免重复添加
  unique(user_id, friend_id)
);

-- 启用 RLS
alter table public.friendships enable row level security;

-- RLS 策略
create policy "Users can view own friendships" 
  on friendships for select using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Users can insert friendships" 
  on friendships for insert with check (auth.uid() = user_id);

create policy "Users can update own friendships" 
  on friendships for update using (auth.uid() = user_id or auth.uid() = friend_id);

-- 4. 消息表 (Messages)
create table if not exists public.messages (
  id uuid default uuid_generate_v4() primary key,
  sender_id uuid references public.profiles(id) not null,
  receiver_id uuid references public.profiles(id) not null,
  content text not null,
  is_read boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 启用 RLS
alter table public.messages enable row level security;

-- RLS 策略
create policy "Users can view own messages" 
  on messages for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can insert messages" 
  on messages for insert with check (auth.uid() = sender_id);

create policy "Users can update own messages" 
  on messages for update using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- 5. 开启 Realtime 监听
alter publication supabase_realtime add table messages;

-- 6. 创建索引优化查询性能
create index if not exists idx_messages_sender on messages(sender_id);
create index if not exists idx_messages_receiver on messages(receiver_id);
create index if not exists idx_messages_created_at on messages(created_at);
create index if not exists idx_friendships_user on friendships(user_id);
create index if not exists idx_friendships_friend on friendships(friend_id);

-- =============================================
-- 运行完成后，请确保在 Supabase Dashboard 中：
-- 1. Authentication > URL Configuration 设置正确的 Site URL
-- 2. 启用 Email Auth 或其他认证方式
-- =============================================

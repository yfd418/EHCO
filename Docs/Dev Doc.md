# 📂 文档二：Echo 开发实施文档 (Dev Docs)

**技术栈：** Next.js 14 (App Router) + Tailwind CSS + Supabase

## 1. 数据库设计 (Schema)

请在 Supabase 的 SQL Editor 中运行以下代码，构建 Echo 的骨架。

```sql
-- 1. 用户档案表 (基于 Supabase Auth 扩展)
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  username text unique not null,
  display_name text,
  avatar_url text,
  updated_at timestamp with time zone,
  
  -- 约束：用户名至少3位
  constraint username_length check (char_length(username) >= 3)
);

-- 2. 启用行级安全 (RLS) - 这一步很重要，保护隐私
alter table public.profiles enable row level security;
create policy "Public profiles are viewable by everyone" on profiles for select using (true);
create policy "Users can insert their own profile" on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- 3. 好友关系表 (Friendships)
create table public.friendships (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  friend_id uuid references public.profiles(id) not null,
  status text check (status in ('pending', 'accepted', 'blocked')) default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()),
  
  -- 避免重复添加
  unique(user_id, friend_id)
);

-- 4. 消息表 (Messages)
create table public.messages (
  id uuid default uuid_generate_v4() primary key,
  sender_id uuid references public.profiles(id) not null,
  receiver_id uuid references public.profiles(id) not null,
  content text not null,
  is_read boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 开启 Realtime 监听 (让 Supabase 推送消息给前端)
alter publication supabase_realtime add table messages;

```

## 2. 项目目录结构 (Project Structure)

建议保持扁平清晰，符合 Next.js 规范。

```text
/echo-app
├── app/
│   ├── layout.tsx       # 全局布局 (字体引入)
│   ├── page.tsx         # 登录页/欢迎页
│   ├── chat/            # 核心聊天界面
│   │   ├── layout.tsx   # 双栏布局容器
│   │   ├── page.tsx     # 默认空状态 ("选择一个好友开始")
│   │   └── [id]/        # 具体聊天房间
│   │       └── page.tsx # 聊天主逻辑
├── components/          # UI 组件
│   ├── ui/              # Shadcn 基础组件 (Button, Input...)
│   ├── chat/            # 业务组件
│   │   ├── ChatList.tsx    # 左侧好友列表
│   │   ├── MessageBubble.tsx # 消息气泡
│   │   └── ChatInput.tsx   # 输入框
├── lib/
│   ├── supabase.ts      # Supabase 客户端初始化
│   ├── utils.ts         # 工具函数 (日期格式化等)
├── types/               # TypeScript 类型定义
│   └── index.ts         # User, Message, Friend 接口定义

```

## 3. 关键功能开发流程

### 阶段一：环境配置 (Environment Setup)

1. 在项目根目录创建 `.env.local` 文件。
2. 填入 Supabase 的 Key (从 Project Settings -> API 获取)：
```env
NEXT_PUBLIC_SUPABASE_URL=你的_Project_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的_Anon_Key

```


3. 安装 Supabase 客户端：`npm install @supabase/supabase-js`

### 阶段二：实时消息逻辑 (The Core Loop)

在 `app/chat/[id]/page.tsx` 中，你需要实现**监听逻辑**：

```typescript
// 伪代码参考
useEffect(() => {
  // 1. 获取历史消息
  const fetchMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${myId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${myId})`)
      .order('created_at', { ascending: true });
    setMessages(data);
  };

  fetchMessages();

  // 2. 开启实时监听 (Realtime Subscription)
  const channel = supabase
    .channel('chat_room')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${myId}`, // 只监听发给我的
      },
      (payload) => {
        // 当收到新消息，追加到列表
        setMessages((prev) => [...prev, payload.new]);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [friendId]);
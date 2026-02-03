# Echo - 极简即时通讯

> Less noise, more signal. 回归纯粹沟通，拒绝社交噪音。

## ✨ 特性

- 🚀 **瞬时加载** - SWR 缓存策略 + IndexedDB 本地存储
- 📱 **PWA 支持** - 添加到主屏幕，原生 App 体验
- 💬 **实时通讯** - Supabase Realtime，消息 <100ms 同步
- 🎨 **液态玻璃 UI** - iOS 风格的毛玻璃效果
- 🌓 **深色模式** - 自动跟随系统主题
- 📎 **文件传输** - 支持图片、文档、音视频
- 👆 **手势交互** - 滑动返回、触感反馈

## 🛠 技术栈

| 技术 | 用途 |
|------|------|
| **Next.js 16** | React 框架 (App Router) |
| **Supabase** | 后端即服务 (Auth + Database + Realtime) |
| **Zustand** | 轻量级全局状态管理 |
| **SWR** | 数据获取与缓存 |
| **Dexie.js** | IndexedDB 封装 (本地持久化) |
| **Framer Motion** | 动画与手势 |
| **Tailwind CSS 4** | 原子化 CSS |

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build
```

## ⚙️ 环境配置

创建 `.env.local` 文件（推荐同时提供服务端与客户端变量）：

```env
# Server 端优先读取
SUPABASE_URL=你的_Project_URL
SUPABASE_ANON_KEY=你的_Anon_Key

# Client 端读取（公开）
NEXT_PUBLIC_SUPABASE_URL=你的_Project_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的_Anon_Key
```

## 📁 项目结构

```
echo-app/
├── app/                    # 页面路由
│   ├── page.tsx           # 登录/注册
│   ├── chat/[id]/         # 私聊
│   └── channel/[id]/      # 频道
├── components/
│   ├── chat/              # 聊天组件
│   ├── motion/            # 动画组件
│   ├── providers/         # Context Providers
│   └── ui/                # 基础 UI
├── hooks/                 # 自定义 Hooks
│   ├── useSWR.ts         # SWR 数据获取
│   └── usePresence.ts    # 在线状态
├── stores/                # Zustand 状态管理
├── lib/
│   ├── db.ts             # IndexedDB 操作
│   └── supabase.ts       # Supabase 客户端
└── public/
    └── manifest.json     # PWA 配置
```

## 🎯 性能优化

### 瞬时加载策略

1. **SWR 缓存** - 打开 App 瞬间显示本地缓存，后台静默刷新
2. **IndexedDB** - 聊天记录本地持久化，离线可查看
3. **Zustand** - 全局状态共享，避免重复请求

### PWA 体验

- Service Worker 缓存静态资源
- 支持"添加到主屏幕"
- 离线资产缓存

## 📱 移动端适配

- iOS 安全区域适配 (刘海屏、底部横条)
- 触感反馈 (Haptic Feedback)
- 手势操作 (滑动返回)
- 响应式布局

## 📄 License

MIT

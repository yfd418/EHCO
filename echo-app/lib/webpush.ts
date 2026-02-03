/**
 * Echo Web Push 推送通知客户端
 * 处理 VAPID 推送订阅和通知
 */

// VAPID 公钥（需要在 Supabase Edge Function 中配置对应的私钥）
// 生成方式：npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

/**
 * 将 Base64 URL 安全编码转换为 Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray as Uint8Array<ArrayBuffer>
}

/**
 * 检查浏览器是否支持 Web Push
 */
export function isPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * 注册 Service Worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.log('[WebPush] Service Worker not supported')
    return null
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    })
    console.log('[WebPush] Service Worker registered:', registration.scope)
    return registration
  } catch (error) {
    console.error('[WebPush] Service Worker registration failed:', error)
    return null
  }
}

/**
 * 获取推送订阅
 */
export async function getSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

/**
 * 订阅推送通知
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isPushSupported()) {
    console.log('[WebPush] Push not supported')
    return null
  }

  if (!VAPID_PUBLIC_KEY) {
    console.warn('[WebPush] VAPID_PUBLIC_KEY not configured')
    return null
  }

  try {
    // 请求通知权限
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      console.log('[WebPush] Notification permission denied')
      return null
    }

    // 获取 Service Worker 注册
    const registration = await navigator.serviceWorker.ready

    // 检查是否已订阅
    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      // 创建新订阅
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource
      })
      console.log('[WebPush] Push subscription created')
    }

    return subscription
  } catch (error) {
    console.error('[WebPush] Failed to subscribe:', error)
    return null
  }
}

/**
 * 取消推送订阅
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const subscription = await getSubscription()
    if (subscription) {
      await subscription.unsubscribe()
      console.log('[WebPush] Unsubscribed from push')
      return true
    }
    return false
  } catch (error) {
    console.error('[WebPush] Failed to unsubscribe:', error)
    return false
  }
}

/**
 * 将订阅信息保存到服务器
 */
export async function saveSubscriptionToServer(
  subscription: PushSubscription,
  userId: string
): Promise<boolean> {
  try {
    // 调用 Supabase Edge Function 保存订阅
    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        subscription: subscription.toJSON(),
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to save subscription')
    }

    console.log('[WebPush] Subscription saved to server')
    return true
  } catch (error) {
    console.error('[WebPush] Failed to save subscription:', error)
    return false
  }
}

/**
 * 初始化 Web Push（完整流程）
 */
export async function initWebPush(userId: string): Promise<boolean> {
  if (!isPushSupported()) {
    return false
  }

  try {
    // 1. 注册 Service Worker
    await registerServiceWorker()

    // 2. 订阅推送
    const subscription = await subscribeToPush()
    if (!subscription) {
      return false
    }

    // 3. 保存到服务器
    await saveSubscriptionToServer(subscription, userId)

    return true
  } catch (error) {
    console.error('[WebPush] Initialization failed:', error)
    return false
  }
}

/**
 * 发送本地通知（用于测试或即时通知）
 */
export async function showLocalNotification(
  title: string,
  options?: NotificationOptions
): Promise<void> {
  if (!('Notification' in window)) {
    return
  }

  if (Notification.permission !== 'granted') {
    return
  }

  const registration = await navigator.serviceWorker.ready
  await registration.showNotification(title, {
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    ...options,
  })
}

/**
 * 监听来自 Service Worker 的消息
 */
export function onServiceWorkerMessage(
  callback: (data: { type: string; [key: string]: unknown }) => void
): () => void {
  const handler = (event: MessageEvent) => {
    callback(event.data)
  }

  navigator.serviceWorker.addEventListener('message', handler)

  return () => {
    navigator.serviceWorker.removeEventListener('message', handler)
  }
}

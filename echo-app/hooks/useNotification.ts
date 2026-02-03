'use client'

import { useCallback, useState } from 'react'

type NotificationPermission = 'granted' | 'denied' | 'default'

interface NotificationOptions {
  title: string
  body: string
  icon?: string
  tag?: string
  onClick?: () => void
}

export function useNotification() {
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission
    }
    return 'default'
  })

  // 请求通知权限
  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied' as NotificationPermission
    }

    if (Notification.permission === 'granted') {
      setPermission('granted')
      return 'granted' as NotificationPermission
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission()
      setPermission(permission)
      return permission
    }

    return 'denied' as NotificationPermission
  }, [])

  // 显示通知
  const showNotification = useCallback(
    ({ title, body, icon, tag, onClick }: NotificationOptions) => {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        return
      }

      // 如果页面在前台且可见，不显示通知
      if (document.visibilityState === 'visible') {
        return
      }

      if (Notification.permission === 'granted') {
        const notification = new Notification(title, {
          body,
          icon: icon || '/icon.svg',
          tag, // 相同tag的通知会合并
          silent: false,
        })

        if (onClick) {
          notification.onclick = () => {
            window.focus()
            onClick()
            notification.close()
          }
        }

        // 5秒后自动关闭
        setTimeout(() => notification.close(), 5000)
      }
    },
    []
  )

  // 显示新消息通知
  const notifyNewMessage = useCallback(
    (senderName: string, messagePreview: string, chatId: string) => {
      showNotification({
        title: `${senderName} 发来消息`,
        body: messagePreview.length > 50 ? messagePreview.slice(0, 50) + '...' : messagePreview,
        tag: `chat-${chatId}`,
        onClick: () => {
          window.location.href = `/chat/${chatId}`
        },
      })
    },
    [showNotification]
  )

  return {
    requestPermission,
    showNotification,
    notifyNewMessage,
    permission,
  }
}

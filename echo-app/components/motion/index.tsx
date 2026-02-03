'use client'

import { motion, AnimatePresence, PanInfo, useAnimation } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useState, useCallback, ReactNode } from 'react'

// ============================================
// 触感反馈工具函数
// ============================================

export function hapticFeedback(type: 'light' | 'medium' | 'heavy' = 'light') {
  if (typeof window === 'undefined' || !window.navigator?.vibrate) return
  
  const patterns = {
    light: [10],
    medium: [20],
    heavy: [30, 10, 30],
  }
  
  try {
    window.navigator.vibrate(patterns[type])
  } catch {
    // 忽略不支持的设备
  }
}

// ============================================
// 动画变体预设
// ============================================

export const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
}

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

export const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
}

export const slideInRight = {
  initial: { x: '100%', opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: '100%', opacity: 0 },
}

export const slideInLeft = {
  initial: { x: '-100%', opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: '-100%', opacity: 0 },
}

// 弹性动画配置
export const springConfig = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
}

export const smoothSpring = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 25,
}

// ============================================
// 消息气泡动画组件
// ============================================

interface MessageAnimationProps {
  children: ReactNode
  isOwn: boolean
  index?: number
}

export function MessageAnimation({ children, isOwn, index = 0 }: MessageAnimationProps) {
  return (
    <motion.div
      initial={{ 
        opacity: 0, 
        y: 10,
        x: isOwn ? 20 : -20,
        scale: 0.95 
      }}
      animate={{ 
        opacity: 1, 
        y: 0,
        x: 0,
        scale: 1 
      }}
      transition={{
        type: 'spring' as const,
        stiffness: 200,
        damping: 25,
        delay: Math.min(index * 0.03, 0.3),
      }}
      // 点击时微弹效果
      whileTap={{ scale: 0.98 }}
    >
      {children}
    </motion.div>
  )
}

// ============================================
// 可滑动返回的页面包装器
// ============================================

interface SwipeBackPageProps {
  children: ReactNode
  onBack?: () => void
  threshold?: number
}

export function SwipeBackPage({ children, onBack, threshold = 100 }: SwipeBackPageProps) {
  const router = useRouter()
  const controls = useAnimation()
  const [isDragging, setIsDragging] = useState(false)
  
  const handleDragEnd = useCallback(
    async (_: unknown, info: PanInfo) => {
      setIsDragging(false)
      
      // 如果滑动距离超过阈值，执行返回
      if (info.offset.x > threshold && info.velocity.x > 0) {
        hapticFeedback('medium')
        await controls.start({ x: '100%', opacity: 0 })
        if (onBack) {
          onBack()
        } else {
          router.back()
        }
      } else {
        // 否则弹回原位
        controls.start({ x: 0, opacity: 1 })
      }
    },
    [controls, onBack, router, threshold]
  )
  
  return (
    <motion.div
      className="h-full w-full"
      drag="x"
      dragDirectionLock
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0, right: 0.5 }}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
      animate={controls}
      initial={{ x: 0, opacity: 1 }}
      style={{ touchAction: 'pan-y' }}
    >
      {/* 拖动时显示返回指示器 */}
      {isDragging && (
        <motion.div
          className="fixed left-4 top-1/2 -translate-y-1/2 z-50"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 0.6, scale: 1 }}
        >
          <div className="w-10 h-10 rounded-full bg-black/20 dark:bg-white/20 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </div>
        </motion.div>
      )}
      {children}
    </motion.div>
  )
}

// ============================================
// 消息侧划回复组件
// ============================================

interface SwipeToReplyProps {
  children: ReactNode
  onReply?: () => void
  isOwn: boolean
}

export function SwipeToReply({ children, onReply, isOwn }: SwipeToReplyProps) {
  const controls = useAnimation()
  const [showReplyHint, setShowReplyHint] = useState(false)
  
  const handleDrag = useCallback(
    (_: unknown, info: PanInfo) => {
      const direction = isOwn ? -1 : 1
      const offset = info.offset.x * direction
      
      setShowReplyHint(offset > 50)
    },
    [isOwn]
  )
  
  const handleDragEnd = useCallback(
    async (_: unknown, info: PanInfo) => {
      const direction = isOwn ? -1 : 1
      const offset = info.offset.x * direction
      
      if (offset > 60 && onReply) {
        hapticFeedback('medium')
        onReply()
      }
      
      setShowReplyHint(false)
      controls.start({ x: 0 })
    },
    [controls, isOwn, onReply]
  )
  
  return (
    <div className="relative">
      {/* 回复图标 */}
      <AnimatePresence>
        {showReplyHint && (
          <motion.div
            className={`absolute top-1/2 -translate-y-1/2 ${isOwn ? 'left-0' : 'right-0'}`}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
          >
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500">
                <polyline points="9 10 4 15 9 20"></polyline>
                <path d="M20 4v7a4 4 0 0 1-4 4H4"></path>
              </svg>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: isOwn ? -80 : 0, right: isOwn ? 0 : 80 }}
        dragElastic={0.2}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        animate={controls}
        style={{ touchAction: 'pan-y' }}
      >
        {children}
      </motion.div>
    </div>
  )
}

// ============================================
// 列表项动画组件
// ============================================

interface ListItemAnimationProps {
  children: ReactNode
  index?: number
}

export function ListItemAnimation({ children, index = 0 }: ListItemAnimationProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{
        duration: 0.2,
        delay: Math.min(index * 0.05, 0.5),
      }}
      whileHover={{ backgroundColor: 'rgba(0,0,0,0.02)' }}
      whileTap={{ scale: 0.98 }}
    >
      {children}
    </motion.div>
  )
}

// ============================================
// 按钮点击动画
// ============================================

interface AnimatedButtonProps {
  children: ReactNode
  onClick?: () => void
  className?: string
  disabled?: boolean
}

export function AnimatedButton({ children, onClick, className = '', disabled }: AnimatedButtonProps) {
  const handleClick = () => {
    if (disabled) return
    hapticFeedback('light')
    onClick?.()
  }
  
  return (
    <motion.button
      className={className}
      onClick={handleClick}
      disabled={disabled}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      transition={springConfig}
    >
      {children}
    </motion.button>
  )
}

// ============================================
// 页面切换动画包装器
// ============================================

interface PageTransitionProps {
  children: ReactNode
}

export function PageTransition({ children }: PageTransitionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="h-full"
    >
      {children}
    </motion.div>
  )
}

// ============================================
// 骨架屏动画
// ============================================

export function SkeletonPulse({ className = '' }: { className?: string }) {
  return (
    <motion.div
      className={`bg-gray-200 dark:bg-gray-700 rounded ${className}`}
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

// ============================================
// 发送按钮动画
// ============================================

export function SendButtonAnimation({ isSending }: { isSending: boolean }) {
  return (
    <motion.div
      animate={isSending ? { scale: [1, 1.2, 1], rotate: [0, 15, 0] } : {}}
      transition={{ duration: 0.3 }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
      </svg>
    </motion.div>
  )
}

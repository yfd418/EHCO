'use client'

import { useEffect, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ImageLightboxProps {
  src: string
  alt?: string
  isOpen: boolean
  onClose: () => void
}

export default function ImageLightbox({ src, alt, isOpen, onClose }: ImageLightboxProps) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)

  // 重置状态
  const resetState = useCallback(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [])

  // ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  // 关闭时重置状态
  useEffect(() => {
    if (!isOpen) {
      resetState()
    }
  }, [isOpen, resetState])

  // 双击放大/缩小
  const handleDoubleClick = useCallback(() => {
    if (scale === 1) {
      setScale(2)
    } else {
      setScale(1)
      setPosition({ x: 0, y: 0 })
    }
  }, [scale])

  // 滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.2 : 0.2
    setScale(prev => Math.max(0.5, Math.min(4, prev + delta)))
  }, [])

  // 拖动
  const handleDragStart = () => setIsDragging(true)
  const handleDragEnd = () => setIsDragging(false)

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* 背景遮罩 */}
          <motion.div
            className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* 关闭按钮 */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            aria-label="关闭"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          {/* 缩放提示 */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 text-white/60 text-sm">
            <span>双击放大 | 滚轮缩放 | 拖动移动</span>
            <span className="px-2 py-1 bg-white/10 rounded">{Math.round(scale * 100)}%</span>
          </div>

          {/* 缩放控制按钮 */}
          <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2">
            <button
              onClick={() => setScale(prev => Math.max(0.5, prev - 0.5))}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
              aria-label="缩小"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
            <button
              onClick={() => {
                setScale(1)
                setPosition({ x: 0, y: 0 })
              }}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
              aria-label="重置"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="1 4 1 10 7 10"></polyline>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
              </svg>
            </button>
            <button
              onClick={() => setScale(prev => Math.min(4, prev + 0.5))}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
              aria-label="放大"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>

          {/* 图片容器 */}
          <motion.div
            className="relative max-w-[90vw] max-h-[90vh] cursor-grab active:cursor-grabbing"
            style={{ touchAction: 'none' }}
            onDoubleClick={handleDoubleClick}
            onWheel={handleWheel}
            drag={scale > 1}
            dragConstraints={{
              left: -500 * (scale - 1),
              right: 500 * (scale - 1),
              top: -300 * (scale - 1),
              bottom: 300 * (scale - 1),
            }}
            dragElastic={0.1}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ 
              scale: 1, 
              opacity: 1,
              transition: { type: 'spring', stiffness: 300, damping: 30 }
            }}
            exit={{ scale: 0.8, opacity: 0 }}
          >
            <motion.img
              src={src}
              alt={alt || '图片预览'}
              className="max-w-full max-h-[90vh] object-contain rounded-lg select-none"
              draggable={false}
              animate={{
                scale,
                x: position.x,
                y: position.y,
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

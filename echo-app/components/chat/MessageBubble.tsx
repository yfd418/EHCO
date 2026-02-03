'use client'
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react'
import { motion } from 'framer-motion'
import type { Message, Profile } from '@/types'
import { formatFullTime, formatFileSize, isImageFile, getAvatarUrl } from '@/lib/utils'
import { MessageStatus } from '@/components/ui'
import ImageLightbox from '@/components/ui/ImageLightbox'
import { MessageTextWithLinks } from '@/components/ui/LinkPreview'

interface MessageBubbleProps {
  message: Message
  isOwn: boolean
  sender?: Profile
  senderAvatar?: string
  showTime?: boolean
  showAvatar?: boolean
}

// 检查是否是音频文件
const isAudioFile = (mimeType: string): boolean => {
  return mimeType.startsWith('audio/')
}

// 检查是否是视频文件
const isVideoFile = (mimeType: string): boolean => {
  return mimeType.startsWith('video/')
}

export default function MessageBubble({ 
  message, 
  isOwn, 
  sender,
  senderAvatar,
  showTime = false,
  showAvatar = false
}: MessageBubbleProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const hasFile = message.file_url && message.file_name
  const isImage = hasFile && message.file_type && isImageFile(message.file_type)
  const isAudio = hasFile && message.file_type && isAudioFile(message.file_type)
  const isVideo = hasFile && message.file_type && isVideoFile(message.file_type)
  
  // 获取头像URL
  const avatarUrl = senderAvatar || (sender?.avatar_url) || getAvatarUrl(sender?.username || 'user')

  // 获取文件图标
  const getFileIcon = () => {
    const type = message.file_type || ''
    
    if (type.startsWith('video/')) {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="23 7 16 12 23 17 23 7"></polygon>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
        </svg>
      )
    }
    if (type.startsWith('audio/')) {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 18V5l12-2v13"></path>
          <circle cx="6" cy="18" r="3"></circle>
          <circle cx="18" cy="16" r="3"></circle>
        </svg>
      )
    }
    if (type === 'application/pdf') {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
        </svg>
      )
    }
    if (type.includes('zip') || type.includes('rar') || type.includes('7z')) {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 8v13H3V8"></path>
          <path d="M1 3h22v5H1z"></path>
          <path d="M10 12h4"></path>
        </svg>
      )
    }
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
        <polyline points="13 2 13 9 20 9"></polyline>
      </svg>
    )
  }

  // 渲染图片消息 - 杂志风格：直角边框
  const renderImageMessage = () => (
    <div className="relative" style={{ minWidth: '200px', minHeight: '150px' }}>
      {/* 骨架屏占位符 */}
      {!imageLoaded && !imageError && (
        <div 
          className="w-48 h-48 bg-gray-200 dark:bg-gray-700 animate-pulse flex items-center justify-center sharp"
          style={{ aspectRatio: '4/3' }}
        >
          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <rect x="3" y="3" width="18" height="18" rx="0" ry="0" strokeWidth="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="2"></circle>
            <polyline points="21 15 16 10 5 21" strokeWidth="2"></polyline>
          </svg>
        </div>
      )}
      {imageError ? (
        <div className="w-48 h-32 bg-gray-100 dark:bg-gray-800 flex flex-col items-center justify-center text-gray-400 sharp border border-black/10 dark:border-white/10">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span className="text-xs mt-1 font-mono">图片加载失败</span>
        </div>
      ) : (
        <>
          <button onClick={() => setLightboxOpen(true)} className="block">
            <img
              src={message.file_url!}
              alt={message.file_name || '图片'}
              loading="lazy"
              decoding="async"
              className={`max-w-full md:max-w-[320px] max-h-[320px] cursor-pointer hover:opacity-90 transition-opacity object-contain sharp border border-black/10 dark:border-white/10 grayscale hover:grayscale-0 transition-all duration-500 ${
                imageLoaded ? 'opacity-100' : 'opacity-0 absolute inset-0'
              }`}
              style={{ aspectRatio: 'auto' }}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          </button>
          <p className="text-xs font-mono text-gray-400 mt-1 italic">{message.file_name}</p>
          <ImageLightbox
            src={message.file_url!}
            alt={message.file_name || '图片'}
            isOpen={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
          />
        </>
      )}
    </div>
  )

  // 渲染音频消息
  const renderAudioMessage = () => (
    <div className={`p-3 rounded-lg ${
      isOwn ? 'bg-white/10' : 'bg-black/5 dark:bg-white/5'
    }`}>
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
          isOwn ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700'
        }`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{message.file_name}</p>
          <p className={`text-xs ${isOwn ? 'text-white/60' : 'text-gray-500 dark:text-gray-400'}`}>
            {message.file_size ? formatFileSize(message.file_size) : '音频'}
          </p>
        </div>
      </div>
      <audio 
        controls 
        className="w-full max-w-[260px] h-10"
        preload="metadata"
      >
        <source src={message.file_url!} type={message.file_type || 'audio/mpeg'} />
        您的浏览器不支持音频播放
      </audio>
    </div>
  )

  // 渲染视频消息
  const renderVideoMessage = () => (
    <div className="relative">
      <video 
        controls 
        className="max-w-full md:max-w-[320px] max-h-[320px] rounded-lg"
        preload="metadata"
      >
        <source src={message.file_url!} type={message.file_type || 'video/mp4'} />
        您的浏览器不支持视频播放
      </video>
      <div className={`mt-1 px-1 flex items-center justify-between text-xs ${
        isOwn ? 'text-white/60' : 'text-gray-500 dark:text-gray-400'
      }`}>
        <span className="truncate max-w-[220px]">{message.file_name}</span>
        <span>{message.file_size ? formatFileSize(message.file_size) : ''}</span>
      </div>
    </div>
  )

  // 渲染文件消息
  const renderFileMessage = () => (
    <a 
      href={message.file_url!} 
      target="_blank" 
      rel="noopener noreferrer"
      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
        isOwn 
          ? 'bg-white/10 hover:bg-white/20' 
          : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10'
      }`}
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
        isOwn ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700'
      }`}>
        {getFileIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{message.file_name}</p>
        <p className={`text-xs ${isOwn ? 'text-white/60' : 'text-gray-500 dark:text-gray-400'}`}>
          {message.file_size ? formatFileSize(message.file_size) : '未知大小'}
        </p>
      </div>
      <svg 
        width="18" 
        height="18" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2"
        className={isOwn ? 'text-white/60' : 'text-gray-400'}
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
    </a>
  )

  return (
    <motion.div 
      className={`flex w-full mb-8 ${isOwn ? 'justify-end' : 'justify-start'}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        type: 'spring',
        stiffness: 300,
        damping: 30,
      }}
    >
      <div className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isOwn ? 'items-end text-right' : 'items-start text-left'}`}>
        
        {/* 发送者名字 - 杂志风格：等宽字体 + 横线 */}
        {(!isOwn && showAvatar) && (
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-[#D93025] dark:text-[#FF4D4D]">
              {sender?.display_name || sender?.username || 'Unknown'}
            </span>
            <span className="w-8 h-[1px] bg-black/20 dark:bg-white/20"></span>
          </div>
        )}

        {/* 消息主体：去气泡，加侧边线 */}
        <div className={`relative py-1 ${
          isOwn 
            ? 'pr-6 border-r-2 border-black dark:border-white' 
            : 'pl-6 border-l-2 border-gray-300 dark:border-gray-600'
        }`}>
          
          {/* 文件内容 */}
          {hasFile && (
            isImage ? (
              <div className="mb-3">
                {renderImageMessage()}
              </div>
            ) : 
            isAudio ? (
              <div className="mb-3">
                {renderAudioMessage()}
              </div>
            ) : 
            isVideo ? (
              <div className="mb-3">
                {renderVideoMessage()}
              </div>
            ) : (
              <div className="mb-3">
                {renderFileMessage()}
              </div>
            )
          )}
          
          {/* 文本内容 - 大号衬线体 */}
          {message.content && (
            <MessageTextWithLinks 
              text={message.content} 
              isOwn={isOwn}
              className="font-serif text-xl leading-relaxed"
            />
          )}
        </div>

        {/* 元信息：等宽字体 */}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wide">
            {formatFullTime(message.created_at)}
          </span>
          {isOwn && (
            <>
              <span className="text-[10px] font-mono text-gray-400">•</span>
              <MessageStatus isRead={message.is_read} />
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}

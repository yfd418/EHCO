'use client'
/* eslint-disable @next/next/no-img-element */

import { useState, useRef, KeyboardEvent, ChangeEvent } from 'react'
import { formatFileSize, isImageFile } from '@/lib/utils'

interface FilePreview {
  file: File
  preview?: string // 图片预览 URL
}

interface ChatInputProps {
  onSendMessage: (content: string) => void
  onSendFile: (file: File) => Promise<void>
  onTyping?: () => void
  disabled?: boolean
  uploading?: boolean
}

export default function ChatInput({ 
  onSendMessage, 
  onSendFile,
  onTyping,
  disabled = false,
  uploading = false,
}: ChatInputProps) {
  const [message, setMessage] = useState('')
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSend = () => {
    const trimmed = message.trim()
    if (!trimmed || disabled || uploading) return

    onSendMessage(trimmed)
    setMessage('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value)
    onTyping?.()
  }

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 创建预览
    const preview: FilePreview = { file }
    
    if (isImageFile(file.type)) {
      preview.preview = URL.createObjectURL(file)
    }
    
    setFilePreview(preview)
    
    // 重置 input 以便可以重复选择同一文件
    e.target.value = ''
  }

  const handleSendFile = async () => {
    if (!filePreview || uploading) return
    
    await onSendFile(filePreview.file)
    
    // 清理预览
    if (filePreview.preview) {
      URL.revokeObjectURL(filePreview.preview)
    }
    setFilePreview(null)
  }

  const handleCancelFile = () => {
    if (filePreview?.preview) {
      URL.revokeObjectURL(filePreview.preview)
    }
    setFilePreview(null)
  }

  const hasContent = message.trim().length > 0

  // 获取文件图标
  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
      )
    }
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
          <polyline points="10 9 9 9 8 9"></polyline>
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

  return (
    <div className="w-full px-8 md:px-16 py-6 bg-[#F2F0E9] dark:bg-[#121212] relative chat-input-container">
      {/* 顶部分割线 */}
      <div className="absolute top-0 left-8 right-8 h-[1px] bg-black/10 dark:bg-white/10"></div>
      
      {/* 文件预览 */}
      {filePreview && (
        <div className="mb-4 p-4 border border-black/10 dark:border-white/10 sharp">
          <div className="flex items-center gap-3">
            {/* 预览图或图标 */}
            {filePreview.preview ? (
              <img 
                src={filePreview.preview} 
                alt="预览" 
                className="w-12 h-12 md:w-16 md:h-16 object-cover sharp border border-black/10 dark:border-white/10 grayscale"
              />
            ) : (
              <div className="w-12 h-12 md:w-16 md:h-16 border border-black/20 dark:border-white/20 flex items-center justify-center text-gray-400 sharp">
                {getFileIcon(filePreview.file.type)}
              </div>
            )}
            
            {/* 文件信息 */}
            <div className="flex-1 min-w-0">
              <p className="font-mono text-xs uppercase tracking-wider truncate">
                {filePreview.file.name}
              </p>
              <p className="font-mono text-[10px] text-gray-400 uppercase tracking-wider">
                {formatFileSize(filePreview.file.size)}
              </p>
            </div>
            
            {/* 操作按钮 */}
            <div className="flex gap-2">
              <button
                onClick={handleCancelFile}
                disabled={uploading}
                className="font-mono text-xs uppercase tracking-widest text-gray-400 hover:text-black dark:hover:text-white transition-colors disabled:opacity-50"
              >
                [×]
              </button>
              <button
                onClick={handleSendFile}
                disabled={uploading}
                className="font-mono text-xs uppercase tracking-widest font-bold hover:text-[#D93025] dark:hover:text-[#FF4D4D] transition-colors disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Send →'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-end gap-6 pt-2">
        {/* 附件按钮 */}
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z"
        />
        <button 
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          className="pb-3 text-xs font-mono uppercase tracking-widest text-black/40 dark:text-white/40 hover:text-[#D93025] dark:hover:text-[#FF4D4D] transition-colors group flex items-center gap-1 disabled:opacity-50"
        >
          <span>[+]</span> <span className="hidden md:inline">Attach</span>
        </button>

        {/* 输入框 - 杂志风格：下划线 + 大号衬线体 */}
        <div className="flex-1">
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={disabled || uploading}
            className="w-full bg-transparent border-b border-black/20 dark:border-white/20 focus:border-black dark:focus:border-white py-2 text-xl font-serif placeholder:text-black/20 dark:placeholder:text-white/20 placeholder:italic focus:outline-none transition-colors disabled:opacity-50"
          />
        </div>

        {/* 发送按钮 */}
        <button 
          onClick={handleSend}
          disabled={!hasContent || disabled || uploading}
          className={`pb-3 text-xs font-mono uppercase tracking-widest font-bold transition-colors ${
            hasContent && !disabled && !uploading
              ? 'text-black dark:text-white hover:text-[#D93025] dark:hover:text-[#FF4D4D]'
              : 'text-black/20 dark:text-white/20'
          }`}
        >
          Send &rarr;
        </button>
      </div>
    </div>
  )
}

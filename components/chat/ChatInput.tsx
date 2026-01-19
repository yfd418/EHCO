'use client'

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
    <div className="absolute bottom-0 left-0 w-full p-4 md:p-6">
      {/* 文件预览 */}
      {filePreview && (
        <div className="mb-3 p-3 bg-white dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-3">
            {/* 预览图或图标 */}
            {filePreview.preview ? (
              <img 
                src={filePreview.preview} 
                alt="预览" 
                className="w-12 h-12 md:w-16 md:h-16 object-cover rounded-lg"
              />
            ) : (
              <div className="w-12 h-12 md:w-16 md:h-16 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center text-gray-400">
                {getFileIcon(filePreview.file.type)}
              </div>
            )}
            
            {/* 文件信息 */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium dark:text-white truncate">
                {filePreview.file.name}
              </p>
              <p className="text-xs text-gray-400">
                {formatFileSize(filePreview.file.size)}
              </p>
            </div>
            
            {/* 操作按钮 */}
            <div className="flex gap-2">
              <button
                onClick={handleCancelFile}
                disabled={uploading}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
                title="取消"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
              <button
                onClick={handleSendFile}
                disabled={uploading}
                className="p-2 bg-black dark:bg-white text-white dark:text-black rounded-full hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50"
                title="发送"
              >
                {uploading ? (
                  <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"></circle>
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"></path>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center glass-heavy rounded-full px-2 py-2 focus-within:ring-2 focus-within:ring-black/5 dark:focus-within:ring-white/10 transition-all">
        {/* 文件按钮 */}
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
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-400 transition-colors disabled:opacity-50"
          title="发送文件"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
          </svg>
        </button>

        {/* 输入框 */}
        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="输入消息..."
          disabled={disabled || uploading}
          className="flex-1 bg-transparent px-4 focus:outline-none text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 h-full disabled:opacity-50"
        />

        {/* 发送按钮 */}
        <button
          onClick={handleSend}
          disabled={!hasContent || disabled || uploading}
          className={`p-2 rounded-full transition-all ${
            hasContent && !disabled && !uploading
              ? 'bg-black dark:bg-white text-white dark:text-black shadow-md hover:bg-gray-800 dark:hover:bg-gray-200'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    </div>
  )
}

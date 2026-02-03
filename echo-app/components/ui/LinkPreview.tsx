'use client'

import { useState, useEffect } from 'react'
/* eslint-disable @next/next/no-img-element */

interface LinkPreviewData {
  url: string
  title?: string
  description?: string
  image?: string
  siteName?: string
  favicon?: string
}

interface LinkPreviewProps {
  url: string
  className?: string
}

// URL 正则匹配
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g

// 安全的 URL 协议白名单
const SAFE_PROTOCOLS = ['http:', 'https:']

// 验证 URL 是否安全
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return SAFE_PROTOCOLS.includes(parsed.protocol)
  } catch {
    return false
  }
}

// 从文本中提取 URL（仅返回安全的 URL）
export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX)
  if (!matches) return []
  // 去重并过滤不安全的 URL
  return [...new Set(matches)].filter(isSafeUrl)
}

// 简单的 URL 预览组件（使用 iframe 或直接展示链接信息）
export default function LinkPreview({ url, className = '' }: LinkPreviewProps) {
  const [preview, setPreview] = useState<LinkPreviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const fetchPreview = async () => {
      try {
        setLoading(true)
        setError(false)
        
        // 解析 URL 获取基本信息
        const urlObj = new URL(url)
        const hostname = urlObj.hostname
        
        // 使用免费的 favicon API
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`
        
        // 设置基本预览（不调用外部 API，避免 CORS 问题）
        setPreview({
          url,
          title: hostname,
          description: url,
          favicon: faviconUrl,
          siteName: hostname.replace('www.', ''),
        })
        
      } catch (err) {
        console.error('Link preview error:', err)
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    fetchPreview()
  }, [url])

  if (loading) {
    return (
      <div className={`animate-pulse bg-[var(--color-ink)]/5 p-3 ${className}`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[var(--color-ink)]/10" />
          <div className="flex-1">
            <div className="h-4 bg-[var(--color-ink)]/10 w-3/4 mb-2" />
            <div className="h-3 bg-[var(--color-ink)]/10 w-1/2" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !preview) {
    return null
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block bg-[var(--color-ink)]/5 hover:bg-[var(--color-ink)]/10 
        border border-[var(--color-ink)]/10 p-3 transition-colors ${className}`}
    >
      <div className="flex items-start gap-3">
        {/* Favicon */}
        {preview.favicon && (
          <img
            src={preview.favicon}
            alt=""
            className="w-8 h-8 flex-shrink-0 bg-[var(--color-ink)]/10"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        )}
        
        <div className="flex-1 min-w-0">
          {/* 站点名 */}
          <p className="font-mono text-xs uppercase tracking-wider text-[var(--color-ink)]/40 mb-0.5">
            {preview.siteName}
          </p>
          
          {/* 标题 */}
          <p className="font-serif text-sm text-[var(--color-ink)] truncate">
            {preview.title}
          </p>
          
          {/* URL 预览 */}
          <p className="font-mono text-xs text-[var(--color-ink)]/30 truncate mt-0.5">
            {url}
          </p>
        </div>

        {/* 外链图标 */}
        <svg 
          className="w-4 h-4 text-[var(--color-ink)]/30 flex-shrink-0" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor" 
          strokeWidth="2"
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </div>
    </a>
  )
}

// 渲染带链接预览的消息文本
export function MessageTextWithLinks({ 
  text, 
  isOwn,
  className = '' 
}: { 
  text: string
  isOwn: boolean
  className?: string 
}) {
  const urls = extractUrls(text)
  
  // 将 URL 转换为可点击链接
  const renderTextWithLinks = () => {
    if (urls.length === 0) {
      return <span>{text}</span>
    }

    let lastIndex = 0
    const parts: React.ReactNode[] = []
    
    text.replace(URL_REGEX, (match, offset) => {
      // 添加 URL 之前的文本
      if (offset > lastIndex) {
        parts.push(text.slice(lastIndex, offset))
      }
      
      // 添加链接
      parts.push(
        <a
          key={offset}
          href={match}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline underline-offset-2 ${
            isOwn 
              ? 'text-white/90 hover:text-white' 
              : 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300'
          }`}
        >
          {match}
        </a>
      )
      
      lastIndex = offset + match.length
      return match
    })

    // 添加最后的文本
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex))
    }

    return <>{parts}</>
  }

  return (
    <div className={className}>
      <span className="whitespace-pre-wrap break-words block">
        {renderTextWithLinks()}
      </span>
      
      {/* 链接预览卡片（只显示第一个链接） */}
      {urls.length > 0 && (
        <div className="mt-2">
          <LinkPreview url={urls[0]} />
        </div>
      )}
    </div>
  )
}

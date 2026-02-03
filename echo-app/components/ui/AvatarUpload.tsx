'use client'
/* eslint-disable @next/next/no-img-element */

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/storage'
import { getAvatarUrl } from '@/lib/utils'

interface AvatarUploadProps {
  userId: string
  currentAvatarUrl?: string | null
  username: string
  onUploadComplete?: (url: string) => void
}

export default function AvatarUpload({
  userId,
  currentAvatarUrl,
  username,
  onUploadComplete,
}: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(currentAvatarUrl)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件')
      return
    }

    setUploading(true)

    try {
      const compressed = await compressImage(file, {
        maxSizeMB: 0.3,
        maxWidthOrHeight: 512,
      })

      // 验证文件大小 (最大 2MB)
      if (compressed.size > 2 * 1024 * 1024) {
        alert('图片大小不能超过 2MB')
        setUploading(false)
        return
      }

      // 生成唯一文件名
      const mimeExt = compressed.type?.split('/')[1]
      const fileExt = mimeExt === 'jpeg' ? 'jpg' : (mimeExt || file.name.split('.').pop() || 'jpg')
      const fileName = `${userId}/avatar.${fileExt}`

      // 上传到 Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, compressed, {
          upsert: true, // 覆盖已存在的文件
        })

      if (uploadError) {
        throw uploadError
      }

      // 获取公开 URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName)

      // 添加时间戳防止缓存
      const urlWithTimestamp = `${publicUrl}?t=${Date.now()}`

      // 更新用户档案
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: urlWithTimestamp })
        .eq('id', userId)

      if (updateError) {
        throw updateError
      }

      setAvatarUrl(urlWithTimestamp)
      onUploadComplete?.(urlWithTimestamp)
    } catch (error) {
      console.error('头像上传失败:', error)
      alert('头像上传失败，请重试')
    } finally {
      setUploading(false)
      // 重置 input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="relative group">
      <img
        src={avatarUrl || getAvatarUrl(username)}
        alt="头像"
        className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 object-cover"
      />
      
      {/* 上传覆盖层 */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
      >
        {uploading ? (
          <svg className="w-6 h-6 text-white animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
      />
    </div>
  )
}

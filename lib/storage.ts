import { supabase } from './supabase'

// 文件上传配置
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const ALLOWED_FILE_TYPES = [
  // 图片
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  // 文档
  'application/pdf', 
  'application/msword', 
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  // 压缩文件
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  // 音频 (Supabase Storage 支持的格式)
  'audio/mpeg',      // MP3
  'audio/wav',       // WAV
  'audio/ogg',       // OGG
  'audio/webm',      // WebM 音频
  'audio/aac',       // AAC
  'audio/mp4',       // M4A
  // 视频
  'video/mp4', 'video/webm', 'video/quicktime',
]

export interface UploadResult {
  success: boolean
  url?: string
  error?: string
}

// 上传文件到 Supabase Storage
export async function uploadFile(
  file: File, 
  userId: string
): Promise<UploadResult> {
  // 检查文件大小
  if (file.size > MAX_FILE_SIZE) {
    return { 
      success: false, 
      error: `文件大小不能超过 ${MAX_FILE_SIZE / 1024 / 1024}MB` 
    }
  }

  // 检查文件类型
  if (!ALLOWED_FILE_TYPES.includes(file.type) && !file.type.startsWith('image/')) {
    return { 
      success: false, 
      error: '不支持的文件类型' 
    }
  }

  try {
    // 生成唯一文件名
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 8)
    const ext = file.name.split('.').pop() || 'bin'
    const fileName = `${userId}/${timestamp}_${randomStr}.${ext}`

    // 上传到 Supabase Storage
    const { data, error } = await supabase.storage
      .from('chat-files')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (error) {
      console.error('Upload error:', error)
      return { 
        success: false, 
        error: error.message || '上传失败' 
      }
    }

    // 获取公开访问 URL
    const { data: urlData } = supabase.storage
      .from('chat-files')
      .getPublicUrl(data.path)

    return {
      success: true,
      url: urlData.publicUrl,
    }
  } catch (err) {
    console.error('Upload exception:', err)
    return { 
      success: false, 
      error: '上传过程中发生错误' 
    }
  }
}

// 删除文件
export async function deleteFile(filePath: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from('chat-files')
      .remove([filePath])

    return !error
  } catch {
    return false
  }
}

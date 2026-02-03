// 开发环境日志工具
// 仅在开发环境下输出日志，生产环境自动禁用

const isDev = process.env.NODE_ENV === 'development'

type LogLevel = 'log' | 'info' | 'warn' | 'error'

interface Logger {
  log: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  group: (label: string) => void
  groupEnd: () => void
}

function createLogger(prefix: string): Logger {
  const format = (level: LogLevel, args: unknown[]) => {
    if (!isDev && level !== 'error') return // 生产环境只保留 error
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0]
    console[level](`[${timestamp}] [${prefix}]`, ...args)
  }

  return {
    log: (...args) => format('log', args),
    info: (...args) => format('info', args),
    warn: (...args) => format('warn', args),
    error: (...args) => format('error', args), // error 始终输出
    group: (label) => isDev && console.group(`[${prefix}] ${label}`),
    groupEnd: () => isDev && console.groupEnd(),
  }
}

// 预定义的日志实例
export const logger = {
  auth: createLogger('Auth'),
  realtime: createLogger('Realtime'),
  presence: createLogger('Presence'),
  readStatus: createLogger('ReadStatus'),
  storage: createLogger('Storage'),
  general: createLogger('Echo'),
}

// 全局开发环境检查函数
export const devLog = (...args: unknown[]) => {
  if (isDev) console.log(...args)
}

// 默认导出通用日志器
export default logger.general

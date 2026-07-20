// YouTube: разбор ссылки + загрузка IFrame API для честного таймера (VID).
//
// Видео Кати лежат на YouTube. Плеер встраиваем внутрь мини-аппа (не уводим во
// внешний браузер), а через IFrame API считаем реально просмотренное время.
// Всё устойчиво к отказу: если API не загрузился — работает плоский iframe,
// минуты пишутся по номиналу.

/** id видео валиден (буквы/цифры/-/_). */
function isVideoId(value: string): boolean {
  return /^[A-Za-z0-9_-]{6,}$/.test(value)
}

/**
 * Извлекает id видео из разных форм ссылки YouTube.
 * Поддержка: youtu.be/ID, youtube.com/watch?v=ID, /embed/ID, /shorts/ID, /v/ID.
 * Не YouTube / не распознано → null.
 */
export function parseYouTubeId(url: string | null | undefined): string | null {
  if (!url) {
    return null
  }
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '')
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0] ?? ''
      return isVideoId(id) ? id : null
    }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') {
        const id = u.searchParams.get('v') ?? ''
        return isVideoId(id) ? id : null
      }
      const match = u.pathname.match(/^\/(?:embed|shorts|v)\/([^/?#]+)/)
      if (match?.[1] && isVideoId(match[1])) {
        return match[1]
      }
    }
    return null
  } catch {
    return null
  }
}

/** Минимальный тип плеера — только то, что используем. */
export interface YouTubePlayer {
  playVideo(): void
  pauseVideo(): void
  getPlayerState(): number
  getCurrentTime(): number
  destroy(): void
}

interface YouTubeNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string
      playerVars?: Record<string, number | string>
      events?: { onReady?: () => void }
    },
  ) => YouTubePlayer
  /** Состояние PLAYING === 1 (по документации IFrame API). */
  PlayerState: { PLAYING: number; ENDED: number; PAUSED: number }
}

declare global {
  interface Window {
    YT?: YouTubeNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

/** PLAYING по спецификации IFrame API. */
export const YT_PLAYING = 1

let apiPromise: Promise<YouTubeNamespace> | null = null

/**
 * Загружает IFrame API один раз. timeoutMs страхует от зависания в средах без
 * доступа к youtube.com (тогда промис отклоняется → фолбэк на плоский iframe).
 */
export function loadYouTubeIframeApi(timeoutMs = 5000): Promise<YouTubeNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('no window'))
  }
  if (window.YT?.Player) {
    return Promise.resolve(window.YT)
  }
  apiPromise ??= new Promise<YouTubeNamespace>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('YT API timeout')), timeoutMs)
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      window.clearTimeout(timer)
      if (window.YT?.Player) {
        resolve(window.YT)
      } else {
        reject(new Error('YT API missing after ready'))
      }
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => {
      window.clearTimeout(timer)
      reject(new Error('YT API load error'))
    }
    document.head.appendChild(script)
  }).catch((error) => {
    // Сбрасываем, чтобы повторная попытка была возможна.
    apiPromise = null
    throw error
  })
  return apiPromise
}

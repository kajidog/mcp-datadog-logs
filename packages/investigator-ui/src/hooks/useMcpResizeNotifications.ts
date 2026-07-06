import type { App } from '@modelcontextprotocol/ext-apps'
import { useAutoResize } from '@modelcontextprotocol/ext-apps/react'
import { useEffect, useRef } from 'react'

function measureContentSize() {
  const root = document.getElementById('root')
  const target = root?.firstElementChild instanceof HTMLElement ? root.firstElementChild : root
  if (!target) return null

  const rect = target.getBoundingClientRect()
  return {
    width: Math.ceil(window.innerWidth),
    height: Math.ceil(Math.max(rect.height, target.scrollHeight)),
  }
}

function scheduleSizeNotification(app: App) {
  const rafIds: number[] = []
  let cancelled = false

  const notify = () => {
    if (cancelled) return
    const size = measureContentSize()
    if (size && size.height > 0) void app.sendSizeChanged(size)
  }

  const scheduleAfterFrames = (frames: number) => {
    if (frames <= 0) {
      notify()
      return
    }

    const rafId = window.requestAnimationFrame(() => scheduleAfterFrames(frames - 1))
    rafIds.push(rafId)
  }

  scheduleAfterFrames(1)
  scheduleAfterFrames(3)

  return () => {
    cancelled = true
    for (const rafId of rafIds) window.cancelAnimationFrame(rafId)
  }
}

export function useMcpResizeNotifications(app: App | null, trigger: string) {
  const triggerRef = useRef(trigger)

  useAutoResize(app)

  useEffect(() => {
    triggerRef.current = trigger
    if (!app) return
    return scheduleSizeNotification(app)
  }, [app, trigger])

  useEffect(() => {
    if (!app) return

    let cleanup: (() => void) | undefined
    const schedule = () => {
      cleanup?.()
      cleanup = scheduleSizeNotification(app)
    }

    window.addEventListener('resize', schedule)
    schedule()

    return () => {
      cleanup?.()
      window.removeEventListener('resize', schedule)
    }
  }, [app])
}

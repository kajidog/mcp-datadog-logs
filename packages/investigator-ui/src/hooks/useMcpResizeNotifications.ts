import type { App } from '@modelcontextprotocol/ext-apps'
import { useAutoResize } from '@modelcontextprotocol/ext-apps/react'
import { type RefObject, useEffect, useRef } from 'react'

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

function scheduleSizeNotification(app: App, lastSentRef: RefObject<string>) {
  const rafIds: number[] = []
  let cancelled = false

  const notify = () => {
    if (cancelled) return
    const size = measureContentSize()
    if (!size || size.height <= 0) return
    const key = `${size.width}x${size.height}`
    if (key === lastSentRef.current) return
    lastSentRef.current = key
    void app.sendSizeChanged(size)
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
  const lastSentRef = useRef('')
  const triggerRef = useRef(trigger)

  useAutoResize(app)

  useEffect(() => {
    triggerRef.current = trigger
    if (!app) return
    return scheduleSizeNotification(app, lastSentRef)
  }, [app, trigger])

  useEffect(() => {
    if (!app) return

    let cleanup: (() => void) | undefined
    const schedule = () => {
      cleanup?.()
      cleanup = scheduleSizeNotification(app, lastSentRef)
    }

    // Hosts may pin body/html height, which silences the library's auto-resize
    // observer — watch #root directly so height changes driven by state local to
    // child components (row expand/collapse, collapsibles) are still reported.
    const root = document.getElementById('root')
    const observer = root ? new ResizeObserver(schedule) : null
    if (root && observer) observer.observe(root)

    window.addEventListener('resize', schedule)
    schedule()

    return () => {
      cleanup?.()
      observer?.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [app])
}

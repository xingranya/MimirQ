'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog'
import { useRouter } from '@/i18n/navigation'

export const NAVIGATION_HISTORY_INDEX_KEY = '__seeway_navigation_index'

type GuardedRouteOptions = {
  beforeNavigate?: () => void
  replace?: boolean
}

type PendingNavigation =
  | {
      kind: 'route'
      href: string
      options?: GuardedRouteOptions
    }
  | {
      kind: 'action'
      action: () => void
    }
  | {
      kind: 'history'
      delta: number
    }

type NavigationGuardContextValue = {
  registerUnsavedChanges: (sourceId: string, enabled: boolean) => void
  requestNavigation: (intent: PendingNavigation) => void
}

const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null)

function getInternalNavigationTarget(event: MouseEvent): string | null {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    !(event.target instanceof Element)
  ) {
    return null
  }

  const anchor = event.target.closest<HTMLAnchorElement>('a[href]')
  if (!anchor || anchor.hasAttribute('download')) return null
  if (anchor.target && anchor.target !== '_self') return null
  const rawHref = anchor.getAttribute('href')
  if (!rawHref || rawHref.startsWith('#')) return null

  const targetUrl = new URL(anchor.href, globalThis.window.location.href)
  const currentUrl = new URL(globalThis.window.location.href)
  if (
    targetUrl.origin !== currentUrl.origin ||
    (targetUrl.pathname === currentUrl.pathname && targetUrl.search === currentUrl.search)
  ) {
    return null
  }

  return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`
}

function readHistoryIndex(state: unknown): number | null {
  if (!state || typeof state !== 'object') return null
  const value = (state as Record<string, unknown>)[NAVIGATION_HISTORY_INDEX_KEY]
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function withHistoryIndex(state: unknown, index: number): Record<string, unknown> {
  const current = state && typeof state === 'object' ? (state as Record<string, unknown>) : {}
  return { ...current, [NAVIGATION_HISTORY_INDEX_KEY]: index }
}

export function NavigationGuardProvider({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter()
  const dirtySourcesRef = useRef(new Set<string>())
  const dirtyRef = useRef(false)
  const pendingNavigationRef = useRef<PendingNavigation | null>(null)
  const currentHistoryIndexRef = useRef(0)
  const restoringHistoryRef = useRef(false)
  const allowingHistoryRef = useRef(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [historyRestoring, setHistoryRestoring] = useState(false)
  const [navigationPending, setNavigationPending] = useState(false)

  useEffect(() => {
    dirtyRef.current = hasUnsavedChanges
  }, [hasUnsavedChanges])

  const executeNavigation = useCallback(
    (intent: PendingNavigation) => {
      if (intent.kind === 'history') {
        allowingHistoryRef.current = true
        globalThis.window.history.go(intent.delta)
        return
      }
      if (intent.kind === 'action') {
        intent.action()
        return
      }

      intent.options?.beforeNavigate?.()
      if (intent.options?.replace) router.replace(intent.href)
      else router.push(intent.href)
    },
    [router]
  )

  const requestNavigation = useCallback(
    (intent: PendingNavigation) => {
      if (!dirtyRef.current) {
        executeNavigation(intent)
        return
      }
      pendingNavigationRef.current = intent
      setNavigationPending(true)
    },
    [executeNavigation]
  )

  const registerUnsavedChanges = useCallback((sourceId: string, enabled: boolean) => {
    const sources = dirtySourcesRef.current
    const changed = enabled ? !sources.has(sourceId) : sources.has(sourceId)
    if (!changed) return
    if (enabled) sources.add(sourceId)
    else sources.delete(sourceId)
    setHasUnsavedChanges(sources.size > 0)
  }, [])

  const cancelNavigation = useCallback(() => {
    pendingNavigationRef.current = null
    setNavigationPending(false)
  }, [])

  const confirmNavigation = useCallback(() => {
    if (historyRestoring) return
    const pending = pendingNavigationRef.current
    if (!pending) return
    pendingNavigationRef.current = null
    setNavigationPending(false)
    executeNavigation(pending)
  }, [executeNavigation, historyRestoring])

  useEffect(() => {
    const history = globalThis.window.history
    const originalPushState = history.pushState
    const originalReplaceState = history.replaceState
    const initialIndex = readHistoryIndex(history.state)
    currentHistoryIndexRef.current = initialIndex ?? 0
    if (initialIndex === null) {
      originalReplaceState.call(
        history,
        withHistoryIndex(history.state, currentHistoryIndexRef.current),
        '',
        globalThis.window.location.href
      )
    }

    history.pushState = function patchedPushState(state, unused, url) {
      const nextIndex = currentHistoryIndexRef.current + 1
      currentHistoryIndexRef.current = nextIndex
      return originalPushState.call(this, withHistoryIndex(state, nextIndex), unused, url)
    }
    history.replaceState = function patchedReplaceState(state, unused, url) {
      return originalReplaceState.call(
        this,
        withHistoryIndex(state, currentHistoryIndexRef.current),
        unused,
        url
      )
    }

    const handlePopState = (event: PopStateEvent) => {
      const nextIndex = readHistoryIndex(event.state)
      if (nextIndex === null) return

      if (restoringHistoryRef.current) {
        restoringHistoryRef.current = false
        currentHistoryIndexRef.current = nextIndex
        setHistoryRestoring(false)
        return
      }
      if (allowingHistoryRef.current) {
        allowingHistoryRef.current = false
        currentHistoryIndexRef.current = nextIndex
        return
      }

      const delta = nextIndex - currentHistoryIndexRef.current
      if (delta === 0) return
      if (!dirtyRef.current) {
        currentHistoryIndexRef.current = nextIndex
        return
      }

      pendingNavigationRef.current = { kind: 'history', delta }
      setNavigationPending(true)
      restoringHistoryRef.current = true
      setHistoryRestoring(true)
      history.go(-delta)
    }

    globalThis.window.addEventListener('popstate', handlePopState, true)
    return () => {
      globalThis.window.removeEventListener('popstate', handlePopState, true)
      history.pushState = originalPushState
      history.replaceState = originalReplaceState
    }
  }, [])

  useEffect(() => {
    if (!hasUnsavedChanges) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const handleDocumentClick = (event: MouseEvent) => {
      const href = getInternalNavigationTarget(event)
      if (!href) return
      event.preventDefault()
      event.stopPropagation()
      requestNavigation({ kind: 'route', href })
    }

    globalThis.window.addEventListener('beforeunload', handleBeforeUnload)
    globalThis.document.addEventListener('click', handleDocumentClick, true)
    return () => {
      globalThis.window.removeEventListener('beforeunload', handleBeforeUnload)
      globalThis.document.removeEventListener('click', handleDocumentClick, true)
    }
  }, [hasUnsavedChanges, requestNavigation])

  const value = useMemo(
    () => ({ registerUnsavedChanges, requestNavigation }),
    [registerUnsavedChanges, requestNavigation]
  )

  return (
    <NavigationGuardContext.Provider value={value}>
      {children}
      <UnsavedChangesDialog
        open={navigationPending}
        onOpenChange={(open) => {
          if (!open) cancelNavigation()
        }}
        onDiscard={confirmNavigation}
        discardDisabled={historyRestoring}
      />
    </NavigationGuardContext.Provider>
  )
}

export function useUnsavedChanges(enabled: boolean) {
  const context = useContext(NavigationGuardContext)
  const sourceId = useId()

  useEffect(() => {
    if (!context) return
    context.registerUnsavedChanges(sourceId, enabled)
    return () => context.registerUnsavedChanges(sourceId, false)
  }, [context, enabled, sourceId])
}

export function useGuardedNavigation() {
  const context = useContext(NavigationGuardContext)
  const router = useRouter()

  return useMemo(
    () => ({
      isAvailable: Boolean(context),
      push: (href: string, beforeNavigate?: () => void) => {
        if (context) {
          context.requestNavigation({ kind: 'route', href, options: { beforeNavigate } })
          return
        }
        beforeNavigate?.()
        router.push(href)
      },
      replace: (href: string, beforeNavigate?: () => void) => {
        if (context) {
          context.requestNavigation({
            kind: 'route',
            href,
            options: { beforeNavigate, replace: true },
          })
          return
        }
        beforeNavigate?.()
        router.replace(href)
      },
      run: (action: () => void) => {
        if (context) {
          context.requestNavigation({ kind: 'action', action })
          return
        }
        action()
      },
    }),
    [context, router]
  )
}

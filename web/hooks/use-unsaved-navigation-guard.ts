'use client'

import { useCallback, useEffect, useState } from 'react'

import {
  useGuardedNavigation,
  useUnsavedChanges,
} from '@/components/providers/navigation-guard-provider'

type UnsavedNavigationGuardOptions = {
  enabled: boolean
  onNavigate: (href: string) => void
}

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

export function useUnsavedNavigationGuard({
  enabled,
  onNavigate,
}: Readonly<UnsavedNavigationGuardOptions>) {
  const guardedNavigation = useGuardedNavigation()
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  useUnsavedChanges(enabled)

  useEffect(() => {
    if (!enabled || guardedNavigation.isAvailable) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const handleDocumentClick = (event: MouseEvent) => {
      const href = getInternalNavigationTarget(event)
      if (!href) return

      event.preventDefault()
      event.stopPropagation()
      setPendingHref(href)
    }

    globalThis.window.addEventListener('beforeunload', handleBeforeUnload)
    globalThis.document.addEventListener('click', handleDocumentClick, true)
    return () => {
      globalThis.window.removeEventListener('beforeunload', handleBeforeUnload)
      globalThis.document.removeEventListener('click', handleDocumentClick, true)
    }
  }, [enabled, guardedNavigation.isAvailable])

  const cancelNavigation = useCallback(() => setPendingHref(null), [])
  const requestNavigation = useCallback(
    (href: string) => {
      if (guardedNavigation.isAvailable) {
        guardedNavigation.run(() => onNavigate(href))
        return
      }
      if (enabled) {
        setPendingHref(href)
        return
      }
      onNavigate(href)
    },
    [enabled, guardedNavigation, onNavigate]
  )
  const confirmNavigation = useCallback(() => {
    if (!pendingHref) return
    const href = pendingHref
    setPendingHref(null)
    onNavigate(href)
  }, [onNavigate, pendingHref])

  return {
    cancelNavigation,
    confirmNavigation,
    navigationPending: !guardedNavigation.isAvailable && enabled && pendingHref !== null,
    pendingHref,
    requestNavigation,
  }
}

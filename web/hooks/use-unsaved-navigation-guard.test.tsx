// @vitest-environment happy-dom

import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderHook } from '@/test/hook-harness'
import { useUnsavedNavigationGuard } from './use-unsaved-navigation-guard'

const activeHooks: Array<{ unmount: () => void }> = []

function trackHook<T extends { unmount: () => void }>(hook: T): T {
  activeHooks.push(hook)
  return hook
}

describe('useUnsavedNavigationGuard', () => {
  beforeEach(() => {
    globalThis.window.history.replaceState({}, '', '/settings')
  })

  afterEach(() => {
    for (const hook of activeHooks.splice(0)) hook.unmount()
    globalThis.document.body.replaceChildren()
  })

  it('有未保存修改时拦截应用内链接并在确认后导航', () => {
    const onNavigate = vi.fn()
    const hook = trackHook(
      renderHook(() => useUnsavedNavigationGuard({ enabled: true, onNavigate }))
    )
    const anchor = globalThis.document.createElement('a')
    anchor.href = '/knowledge'
    anchor.textContent = '知识库'
    globalThis.document.body.appendChild(anchor)

    let clickEvent: MouseEvent | undefined
    act(() => {
      clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true })
      anchor.dispatchEvent(clickEvent)
    })

    expect(clickEvent?.defaultPrevented).toBe(true)
    expect(hook.result.current.navigationPending).toBe(true)
    expect(hook.result.current.pendingHref).toBe('/knowledge')
    expect(onNavigate).not.toHaveBeenCalled()

    const unloadEvent = new Event('beforeunload', { cancelable: true })
    globalThis.window.dispatchEvent(unloadEvent)
    expect(unloadEvent.defaultPrevented).toBe(true)

    act(() => hook.result.current.confirmNavigation())
    expect(onNavigate).toHaveBeenCalledWith('/knowledge')
    expect(hook.result.current.navigationPending).toBe(false)
  })

  it('取消离开后保留当前页面', () => {
    const onNavigate = vi.fn()
    const hook = trackHook(
      renderHook(() => useUnsavedNavigationGuard({ enabled: true, onNavigate }))
    )
    const anchor = globalThis.document.createElement('a')
    anchor.href = '/history'
    globalThis.document.body.appendChild(anchor)

    act(() => {
      anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    act(() => hook.result.current.cancelNavigation())

    expect(onNavigate).not.toHaveBeenCalled()
    expect(hook.result.current.navigationPending).toBe(false)
  })

  it('没有修改时不拦截链接和页面刷新', () => {
    const onNavigate = vi.fn()
    trackHook(
      renderHook(() => useUnsavedNavigationGuard({ enabled: false, onNavigate }))
    )
    const anchor = globalThis.document.createElement('a')
    anchor.href = '/graph'
    globalThis.document.body.appendChild(anchor)

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true })
    anchor.dispatchEvent(clickEvent)
    const unloadEvent = new Event('beforeunload', { cancelable: true })
    globalThis.window.dispatchEvent(unloadEvent)

    expect(clickEvent.defaultPrevented).toBe(false)
    expect(unloadEvent.defaultPrevented).toBe(false)
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('外部链接和组合键打开方式不由应用内确认框拦截', () => {
    const onNavigate = vi.fn()
    const hook = trackHook(
      renderHook(() => useUnsavedNavigationGuard({ enabled: true, onNavigate }))
    )
    const externalAnchor = globalThis.document.createElement('a')
    externalAnchor.href = 'https://example.com/docs'
    const internalAnchor = globalThis.document.createElement('a')
    internalAnchor.href = '/knowledge'
    const hashAnchor = globalThis.document.createElement('a')
    hashAnchor.href = '#settings-runtime'
    globalThis.document.body.append(externalAnchor, internalAnchor, hashAnchor)

    const externalClick = new MouseEvent('click', { bubbles: true, cancelable: true })
    externalAnchor.dispatchEvent(externalClick)
    const modifiedClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      metaKey: true,
    })
    internalAnchor.dispatchEvent(modifiedClick)
    const hashClick = new MouseEvent('click', { bubbles: true, cancelable: true })
    hashAnchor.dispatchEvent(hashClick)

    expect(externalClick.defaultPrevented).toBe(false)
    expect(modifiedClick.defaultPrevented).toBe(false)
    expect(hashClick.defaultPrevented).toBe(false)
    expect(hook.result.current.navigationPending).toBe(false)
  })
})

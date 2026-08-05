// @vitest-environment happy-dom

import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderHook } from '@/test/hook-harness'
import { useUnsavedNavigationGuard } from './use-unsaved-navigation-guard'

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const activeHooks: Array<{ unmount: () => void }> = []

afterEach(() => {
  for (const hook of activeHooks.splice(0)) hook.unmount()
  globalThis.document.body.replaceChildren()
})

describe('useUnsavedNavigationGuard 兼容模式', () => {
  it('没有全局 Provider 时仍保护应用内链接', () => {
    const onNavigate = vi.fn()
    const hook = renderHook(() => useUnsavedNavigationGuard({ enabled: true, onNavigate }))
    activeHooks.push(hook)
    const anchor = globalThis.document.createElement('a')
    anchor.href = '/knowledge'
    globalThis.document.body.appendChild(anchor)

    act(() => {
      anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(hook.result.current.pendingHref).toBe('/knowledge')
    expect(onNavigate).not.toHaveBeenCalled()

    act(() => hook.result.current.confirmNavigation())
    expect(onNavigate).toHaveBeenCalledWith('/knowledge')
  })

  it('没有修改时立即执行调用方导航', () => {
    const onNavigate = vi.fn()
    const hook = renderHook(() => useUnsavedNavigationGuard({ enabled: false, onNavigate }))
    activeHooks.push(hook)

    act(() => hook.result.current.requestNavigation('/datasets'))

    expect(onNavigate).toHaveBeenCalledWith('/datasets')
    expect(hook.result.current.navigationPending).toBe(false)
  })
})

// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/navbar', () => ({
  Navbar: ({ isSidebarOpen, setSidebarOpen }: { isSidebarOpen: boolean; setSidebarOpen: (open: boolean) => void }) => (
    <div data-testid="navbar" data-open={String(isSidebarOpen)}>
      <button type="button" data-testid="close-sidebar" onClick={() => setSidebarOpen(false)}>
        close
      </button>
    </div>
  ),
}))

vi.mock('@/components/ui/app-background', () => ({
  AppBackground: () => null,
}))

vi.mock('@/store/document-view', () => ({
  useDocumentView: () => ({ isOpen: false }),
}))

import { AppFrame } from './app-frame'

function renderFrame(isMobile: boolean) {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: isMobile }),
  })

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(<AppFrame>content</AppFrame>)
  })

  return {
    container,
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('AppFrame responsive sidebar', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    document.body.replaceChildren()
  })

  it('starts with page content available on mobile', () => {
    const view = renderFrame(true)

    expect(view.container.querySelector('[data-testid="navbar"]')?.getAttribute('data-open')).toBe('false')
    expect(view.container.querySelector('#main-content')?.parentElement?.hasAttribute('aria-hidden')).toBe(false)

    view.unmount()
  })

  it('移动端侧栏收起后仍可从应用顶栏重新打开', () => {
    const view = renderFrame(true)
    const openButton = view.container.querySelector<HTMLButtonElement>(
      '[data-mobile-app-bar="true"] button[aria-controls="mimirq-sidebar"]'
    )

    expect(openButton).not.toBeNull()
    expect(openButton?.getAttribute('aria-expanded')).toBe('false')

    act(() => {
      openButton?.click()
    })

    expect(view.container.querySelector('[data-testid="navbar"]')?.getAttribute('data-open')).toBe('true')
    expect(openButton?.getAttribute('aria-expanded')).toBe('true')

    view.unmount()
  })

  it('preserves the desktop-open default', () => {
    const view = renderFrame(false)

    expect(view.container.querySelector('[data-testid="navbar"]')?.getAttribute('data-open')).toBe('true')

    view.unmount()
  })

  it('跨 AppFrame 重新挂载保持侧栏开合状态', () => {
    const firstView = renderFrame(false)
    act(() => {
      firstView.container.querySelector<HTMLButtonElement>('[data-testid="close-sidebar"]')?.click()
    })
    expect(firstView.container.querySelector('[data-testid="navbar"]')?.getAttribute('data-open')).toBe('false')
    firstView.unmount()

    const secondView = renderFrame(false)
    expect(secondView.container.querySelector('[data-testid="navbar"]')?.getAttribute('data-open')).toBe('false')
    secondView.unmount()
  })
})

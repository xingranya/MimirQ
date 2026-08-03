// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MOBILE_MEDIA_QUERY } from '@/hooks/use-media-query'

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

type ViewportController = {
  setWidth: (width: number) => void
}

function installViewportMedia(initialWidth: number): ViewportController {
  let width = initialWidth
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const mediaQueryList = {
    get matches() {
      return width < 768
    },
    media: MOBILE_MEDIA_QUERY,
    onchange: null,
    addEventListener: (
      _type: 'change',
      listener: (event: MediaQueryListEvent) => void
    ) => listeners.add(listener),
    removeEventListener: (
      _type: 'change',
      listener: (event: MediaQueryListEvent) => void
    ) => listeners.delete(listener),
    addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeListener: (listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    dispatchEvent: () => true,
  } as MediaQueryList

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => {
      if (query !== MOBILE_MEDIA_QUERY) {
        throw new Error(`未处理的媒体查询：${query}`)
      }
      return mediaQueryList
    }),
  })

  return {
    setWidth(nextWidth: number) {
      const previousMatches = width < 768
      width = nextWidth
      if (previousMatches === mediaQueryList.matches) return
      const event = {
        matches: mediaQueryList.matches,
        media: MOBILE_MEDIA_QUERY,
      } as MediaQueryListEvent
      listeners.forEach((listener) => listener(event))
    },
  }
}

function renderFrame(viewportWidth: number) {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true

  const viewport = installViewportMedia(viewportWidth)

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(<AppFrame>content</AppFrame>)
  })

  return {
    container,
    viewport,
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
    const view = renderFrame(767)

    expect(view.container.querySelector('[data-testid="navbar"]')?.getAttribute('data-open')).toBe('false')
    expect(view.container.querySelector('#main-content')?.parentElement?.hasAttribute('aria-hidden')).toBe(false)

    view.unmount()
  })

  it('移动端侧栏收起后仍可从应用顶栏重新打开', () => {
    const view = renderFrame(767)
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
    expect(view.container.querySelector('#main-content')?.parentElement?.getAttribute('aria-hidden')).toBe('true')

    view.unmount()
  })

  it.each([
    { width: 767, expectedOpen: 'false' },
    { width: 768, expectedOpen: 'true' },
    { width: 769, expectedOpen: 'true' },
  ])('在 $width px 使用与 Tailwind 一致的侧栏模式', ({ width, expectedOpen }) => {
    const view = renderFrame(width)

    expect(view.container.querySelector('[data-testid="navbar"]')?.getAttribute('data-open')).toBe(expectedOpen)

    view.unmount()
  })

  it('跨断点时关闭移动端覆盖层并恢复桌面偏好', () => {
    const view = renderFrame(1024)

    expect(view.container.querySelector('[data-testid="navbar"]')?.getAttribute('data-open')).toBe('true')

    act(() => view.viewport.setWidth(767))
    expect(view.container.querySelector('[data-testid="navbar"]')?.getAttribute('data-open')).toBe('false')
    expect(view.container.querySelector('#main-content')?.parentElement?.hasAttribute('aria-hidden')).toBe(false)

    act(() => view.viewport.setWidth(768))
    expect(view.container.querySelector('[data-testid="navbar"]')?.getAttribute('data-open')).toBe('true')

    view.unmount()
  })

  it('跨 AppFrame 重新挂载保持侧栏开合状态', () => {
    const firstView = renderFrame(1024)
    act(() => {
      firstView.container.querySelector<HTMLButtonElement>('[data-testid="close-sidebar"]')?.click()
    })
    expect(firstView.container.querySelector('[data-testid="navbar"]')?.getAttribute('data-open')).toBe('false')
    firstView.unmount()

    const secondView = renderFrame(1024)
    expect(secondView.container.querySelector('[data-testid="navbar"]')?.getAttribute('data-open')).toBe('false')
    secondView.unmount()
  })
})

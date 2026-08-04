// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  replace: vi.fn(),
  search: '',
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
}))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))
vi.mock('@/lib/oidc', () => ({
  completeOidcLogin: mocks.complete,
}))
vi.mock('@/components/full-screen-frame', () => ({
  FullScreenFrame: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}))
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}))
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}))

import OidcCallbackPage from './page'

describe('OIDC 登录回调页', () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    mocks.search = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  async function renderPage() {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<OidcCallbackPage />)
      await Promise.resolve()
    })
    return { container, root }
  }

  it('使用授权结果建立会话并跳转', async () => {
    mocks.search = 'code=authorization-code&state=oauth-state'
    mocks.complete.mockResolvedValue({ returnTo: '/knowledge' })

    const { root } = await renderPage()

    expect(mocks.complete).toHaveBeenCalledWith({
      code: 'authorization-code',
      state: 'oauth-state',
    })
    expect(mocks.replace).toHaveBeenCalledWith('/knowledge')
    act(() => root.unmount())
  })

  it('缺少必要参数时提示返回登录页', async () => {
    const { container, root } = await renderPage()

    expect(container.textContent).toContain('登录请求无效，请返回登录页重新开始。')
    expect(mocks.complete).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it('身份提供方拒绝登录时不回显原始说明', async () => {
    mocks.search = 'error=access_denied&error_description=debug%20stack%20trace'
    const { container, root } = await renderPage()

    expect(container.textContent).toContain('身份提供方拒绝了登录请求。请确认账号权限后重试。')
    expect(container.textContent).not.toContain('debug stack trace')

    const backButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('返回登录')
    )
    act(() => backButton?.click())
    expect(mocks.replace).toHaveBeenCalledWith('/auth')
    act(() => root.unmount())
  })

  it('未知兑换异常使用安全兜底文案', async () => {
    mocks.search = 'code=authorization-code&state=oauth-state'
    mocks.complete.mockRejectedValue(new Error('provider debug stack trace'))
    const { container, root } = await renderPage()

    expect(container.textContent).toContain('单点登录失败，请返回登录页重试。')
    expect(container.textContent).not.toContain('provider debug stack trace')
    act(() => root.unmount())
  })
})

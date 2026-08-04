// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  consume: vi.fn(),
  setAuthSession: vi.fn(),
}))

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))
vi.mock('@/lib/saml-session', () => ({
  consumeSamlBridgeState: mocks.consume,
  getSamlCallbackErrorMessage: (code: string) =>
    code === 'saml_invalid_response'
      ? '身份提供方返回了无效的登录响应。'
      : code === '单点登录失败，请返回登录页重试。'
        ? code
        : '单点登录失败，请返回登录页重试。',
}))
vi.mock('@/lib/auth-storage', () => ({
  setAuthSession: mocks.setAuthSession,
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

import SamlCallbackPage from './page'

describe('SAML 登录回调页', () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/auth/saml/callback')
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('成功兑换桥接会话并跳转', async () => {
    mocks.consume.mockResolvedValue({
      kind: 'success',
      returnTo: '/datasets/123',
      session: {
        user: { id: 'user-1' },
        token: { access_token: 'jwt-token', token_type: 'bearer', expires_in: 3600 },
      },
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<SamlCallbackPage />)
      await Promise.resolve()
    })

    expect(mocks.setAuthSession).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.objectContaining({ access_token: 'jwt-token' }),
      })
    )
    expect(mocks.replace).toHaveBeenCalledWith('/datasets/123')

    act(() => root.unmount())
  })

  it('映射路由错误且不兑换会话', async () => {
    window.history.replaceState({}, '', '/auth/saml/callback?error=saml_invalid_response')

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<SamlCallbackPage />)
      await Promise.resolve()
    })

    expect(mocks.consume).not.toHaveBeenCalled()
    expect(container.textContent).toContain('身份提供方返回了无效的登录响应。')
    expect(container.textContent).not.toContain('saml_invalid_response')

    const backButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('返回登录')
    )
    act(() => backButton?.click())
    expect(mocks.replace).toHaveBeenCalledWith('/auth')
    act(() => root.unmount())
  })

  it('不回显任意路由错误文本', async () => {
    window.history.replaceState({}, '', '/auth/saml/callback?error=debug%20stack%20trace')

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<SamlCallbackPage />)
      await Promise.resolve()
    })

    expect(mocks.consume).not.toHaveBeenCalled()
    expect(container.textContent).toContain('单点登录失败，请返回登录页重试。')
    expect(container.textContent).not.toContain('debug stack trace')
    act(() => root.unmount())
  })

  it('桥接会话缺失时提示重新登录', async () => {
    mocks.consume.mockResolvedValue(null)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<SamlCallbackPage />)
      await Promise.resolve()
    })

    expect(container.textContent).toContain('登录会话已失效，请返回登录页重新开始。')
    expect(mocks.setAuthSession).not.toHaveBeenCalled()
    act(() => root.unmount())
  })
})

// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  acceptTenantInvitation: vi.fn(),
  push: vi.fn(),
  setAuthSession: vi.fn(),
}))

vi.mock('next/image', () => ({
  default: ({
    priority: _priority,
    unoptimized: _unoptimized,
    ...props
  }: React.ComponentProps<'img'> & { priority?: boolean; unoptimized?: boolean }) =>
    React.createElement('img', props),
}))
vi.mock('@/i18n/navigation', () => ({
  Link: (props: React.ComponentProps<'a'>) => React.createElement('a', props),
  useRouter: () => ({ push: mocks.push }),
}))
vi.mock('@/lib/api', () => ({
  authApi: { acceptTenantInvitation: mocks.acceptTenantInvitation },
}))
vi.mock('@/lib/auth-storage', () => ({ setAuthSession: mocks.setAuthSession }))

import TenantInvitationPage from './page'

function setInputValue(input: HTMLInputElement | null, value: string) {
  expect(input).not.toBeNull()
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input?.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('成员邀请接受页', () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    mocks.acceptTenantInvitation.mockReset()
    mocks.push.mockReset()
    mocks.setAuthSession.mockReset()
    globalThis.location.hash = '#token=signed-invitation'
  })

  afterEach(() => {
    document.body.innerHTML = ''
    globalThis.location.hash = ''
  })

  it('使用邀请令牌创建会话并进入首页', async () => {
    mocks.acceptTenantInvitation.mockResolvedValue({
      token: { access_token: 'access-token', token_type: 'bearer', expires_in: 1800 },
      user: { id: 'user-2', email: 'member@example.com' },
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<TenantInvitationPage />)
      await Promise.resolve()
    })
    setInputValue(container.querySelector('#invitation-username'), 'member')
    setInputValue(container.querySelector('#invitation-password'), 'member-password')
    setInputValue(container.querySelector('#invitation-confirm-password'), 'member-password')

    await act(async () => {
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })

    await vi.waitFor(() => {
      expect(mocks.acceptTenantInvitation).toHaveBeenCalledWith({
        token: 'signed-invitation',
        username: 'member',
        password: 'member-password',
      })
    })
    expect(mocks.setAuthSession).toHaveBeenCalledOnce()
    expect(mocks.push).toHaveBeenCalledWith('/')
    act(() => root.unmount())
  })

  it('从查询参数读取邀请令牌', async () => {
    globalThis.location.hash = ''
    globalThis.history.replaceState(null, '', '/auth/invite?token=query-invitation')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<TenantInvitationPage />)
      await Promise.resolve()
    })

    expect(container.querySelector('form')).not.toBeNull()
    expect(container.textContent).not.toContain('邀请链接无效')
    act(() => root.unmount())
  })

  it('缺少令牌时显示可恢复提示', async () => {
    globalThis.location.hash = ''
    globalThis.history.replaceState(null, '', '/auth/invite')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<TenantInvitationPage />)
      await Promise.resolve()
    })

    expect(container.textContent).toContain('邀请链接无效')
    expect(container.querySelector('a[href="/auth"]')).not.toBeNull()
    act(() => root.unmount())
  })
})

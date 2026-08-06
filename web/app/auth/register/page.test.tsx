// @vitest-environment happy-dom

import React, { act } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authApiMock = vi.hoisted(() => ({
  getSelfRegistrationOptions: vi.fn(),
  selfRegister: vi.fn(),
}))
const routerMock = vi.hoisted(() => ({ push: vi.fn() }))
const sessionMock = vi.hoisted(() => ({ setAuthSession: vi.fn() }))

vi.mock('next/image', () => ({
  default: ({
    priority: _priority,
    unoptimized: _unoptimized,
    ...props
  }: React.ComponentProps<'img'> & { priority?: boolean; unoptimized?: boolean }) =>
    React.createElement('img', props),
}))
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement('a', { href }, children),
  useRouter: () => routerMock,
}))
vi.mock('@/lib/api', () => ({ authApi: authApiMock }))
vi.mock('@/lib/auth-storage', () => ({ setAuthSession: sessionMock.setAuthSession }))
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  SelectTrigger: ({ children }: React.PropsWithChildren) =>
    React.createElement('div', null, children),
  SelectValue: () => null,
  SelectContent: ({ children }: React.PropsWithChildren) =>
    React.createElement('div', null, children),
  SelectItem: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
}))

import EmployeeRegistrationPage from './page'

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <EmployeeRegistrationPage />
      </QueryClientProvider>
    )
  })
  return { container, root, queryClient }
}

function setInputValue(input: HTMLInputElement | null, value: string) {
  expect(input).not.toBeNull()
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input?.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('员工自助注册页', () => {
  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    authApiMock.getSelfRegistrationOptions.mockReset()
    authApiMock.selfRegister.mockReset()
    routerMock.push.mockReset()
    sessionMock.setAuthSession.mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('选择唯一成员组并完成查看者账号注册', async () => {
    authApiMock.getSelfRegistrationOptions.mockResolvedValue({
      enabled: true,
      groups: [{ id: 'group-1', name: '内容运营' }],
    })
    authApiMock.selfRegister.mockResolvedValue({
      token: { access_token: 'token', token_type: 'bearer', expires_in: 3600 },
      user: { id: 'employee-1', email: 'employee@example.com' },
    })
    const { container, root, queryClient } = renderPage()

    await act(async () => {
      await vi.waitFor(() => expect(container.querySelector('form')).not.toBeNull())
      await vi.waitFor(() => {
        const button = Array.from(container.querySelectorAll('button')).find((item) =>
          item.textContent?.includes('完成注册')
        )
        expect(button?.hasAttribute('disabled')).toBe(false)
      })
    })

    setInputValue(container.querySelector('#employee-email'), 'employee@example.com')
    setInputValue(container.querySelector('#employee-username'), 'employee')
    setInputValue(container.querySelector('#employee-password'), 'employee-password')
    setInputValue(container.querySelector('#employee-confirm-password'), 'employee-password')

    await act(async () => {
      container
        .querySelector('form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })

    await vi.waitFor(() =>
      expect(authApiMock.selfRegister).toHaveBeenCalledWith({
        email: 'employee@example.com',
        username: 'employee',
        password: 'employee-password',
        group_id: 'group-1',
      })
    )
    expect(sessionMock.setAuthSession).toHaveBeenCalled()
    expect(routerMock.push).toHaveBeenCalledWith('/')

    act(() => root.unmount())
    queryClient.clear()
  })

  it('开关关闭时不显示注册表单', async () => {
    authApiMock.getSelfRegistrationOptions.mockResolvedValue({ enabled: false, groups: [] })
    const { container, root, queryClient } = renderPage()

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('暂未开放自助注册'))
    })
    expect(container.querySelector('form')).toBeNull()
    expect(container.textContent).toContain('请联系管理员发送邀请链接')

    act(() => root.unmount())
    queryClient.clear()
  })
})

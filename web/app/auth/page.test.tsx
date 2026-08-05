// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authApiMock = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
}))
const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
}))
const sessionMock = vi.hoisted(() => ({
  setAuthSession: vi.fn(),
}))
const oidcMock = vi.hoisted(() => ({
  enabled: false,
  providers: [] as Array<{ id: string; name?: string; issuer: string; client_id: string }>,
  startOidcLogin: vi.fn(),
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
  useRouter: () => routerMock,
}))
vi.mock('@/lib/api', () => ({
  authApi: authApiMock,
}))
vi.mock('@/lib/auth-storage', () => ({
  setAuthSession: sessionMock.setAuthSession,
}))
vi.mock('@/lib/oidc', () => ({
  isOidcEnabled: () => oidcMock.enabled,
  startOidcLogin: oidcMock.startOidcLogin,
}))
vi.mock('@/lib/oidc-providers', () => ({
  getOidcPublicProvidersFromEnv: () => oidcMock.providers,
}))

import AuthPage from './page'

function setInputValue(input: HTMLInputElement | null, value: string) {
  expect(input).not.toBeNull()
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input?.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function findButtonByText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text)
  )
  expect(button).not.toBeUndefined()
  return button as HTMLButtonElement
}

function clickButtonByText(container: HTMLElement, text: string) {
  const button = findButtonByText(container, text)
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

async function submitForm(container: HTMLElement) {
  await act(async () => {
    container
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await Promise.resolve()
  })
}

describe('auth page registration', () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    authApiMock.login.mockReset()
    authApiMock.register.mockReset()
    routerMock.push.mockReset()
    sessionMock.setAuthSession.mockReset()
    oidcMock.enabled = false
    oidcMock.providers = []
    oidcMock.startOidcLogin.mockReset()
  })

  it('企业登录总开关关闭时不显示已配置的身份源', () => {
    oidcMock.enabled = false
    oidcMock.providers = [
      {
        id: 'company',
        name: '公司统一登录',
        issuer: 'https://id.example.com',
        client_id: 'client-id',
      },
    ]
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => root.render(<AuthPage />))

    expect(container.textContent).not.toContain('公司统一登录')
    expect(container.textContent).not.toContain('选择企业登录方式')

    act(() => root.unmount())
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('显示公司管理员邮箱并提供邮件链接', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<AuthPage />)
    })

    const contact = container.querySelector<HTMLAnchorElement>(
      'a[href="mailto:xingranya@qq.com"]'
    )
    expect(contact?.textContent).toContain('xingranya@qq.com')

    act(() => root.unmount())
  })

  it('passes the optional bootstrap token during first-owner registration', async () => {
    authApiMock.register.mockResolvedValue({
      token: { access_token: 'token', token_type: 'bearer', expires_in: 3600 },
      user: { id: 'owner-1' },
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<AuthPage />)
    })

    clickButtonByText(container, '首次设置')
    setInputValue(container.querySelector('#email'), 'owner@example.com')
    setInputValue(container.querySelector('#username'), 'owner')
    setInputValue(container.querySelector('#bootstrapToken'), 'bootstrap-secret')
    setInputValue(container.querySelector('#password'), 'correct-horse-battery-staple')
    setInputValue(container.querySelector('#confirmPassword'), 'correct-horse-battery-staple')

    await submitForm(container)

    await vi.waitFor(() =>
      expect(authApiMock.register).toHaveBeenCalledWith({
        email: 'owner@example.com',
        username: 'owner',
        password: 'correct-horse-battery-staple',
        bootstrapToken: 'bootstrap-secret',
      })
    )
    expect(sessionMock.setAuthSession).toHaveBeenCalledWith({
      token: { access_token: 'token', token_type: 'bearer', expires_in: 3600 },
      user: { id: 'owner-1' },
    })
    expect(routerMock.push).toHaveBeenCalledWith('/')

    act(() => root.unmount())
  })

  it('初始化密钥缺失时显示可执行的中文提示', async () => {
    authApiMock.register.mockRejectedValue({
      response: {
        status: 403,
        data: { detail: 'Initial registration bootstrap token required' },
      },
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<AuthPage />)
    })

    clickButtonByText(container, '首次设置')
    setInputValue(container.querySelector('#email'), 'owner@example.com')
    setInputValue(container.querySelector('#username'), 'owner')
    setInputValue(container.querySelector('#password'), 'correct-horse-battery-staple')
    setInputValue(container.querySelector('#confirmPassword'), 'correct-horse-battery-staple')

    await submitForm(container)

    await vi.waitFor(() => {
      expect(container.textContent).toContain('初始化密钥无效或缺失，请核对后重试。')
    })

    act(() => root.unmount())
  })

  it('首次设置关闭时引导登录或联系管理员', async () => {
    authApiMock.register.mockRejectedValue({
      response: {
        status: 409,
        data: { detail: '首次设置已关闭。如需开通账号，请发送邮件至 xingranya@qq.com。' },
      },
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<AuthPage />)
    })

    clickButtonByText(container, '首次设置')
    setInputValue(container.querySelector('#email'), 'owner@example.com')
    setInputValue(container.querySelector('#username'), 'owner')
    setInputValue(container.querySelector('#password'), 'correct-horse-battery-staple')
    setInputValue(container.querySelector('#confirmPassword'), 'correct-horse-battery-staple')

    await submitForm(container)

    await vi.waitFor(() => {
      expect(container.textContent).toContain('首次设置已关闭')
      expect(container.textContent).toContain('请使用已有账号登录')
      expect(container.textContent).toContain('联系管理员开通账号')
      expect(container.textContent).not.toContain('INITIAL_ADMIN')
      expect(container.textContent).not.toContain('Docker')
    })

    act(() => root.unmount())
  })

  it('announces the active auth mode through pressed button state', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<AuthPage />)
    })

    const loginButton = findButtonByText(container, '登录')
    const registerButton = findButtonByText(container, '首次设置')

    expect(loginButton.getAttribute('aria-pressed')).toBe('true')
    expect(registerButton.getAttribute('aria-pressed')).toBe('false')

    clickButtonByText(container, '首次设置')

    expect(loginButton.getAttribute('aria-pressed')).toBe('false')
    expect(registerButton.getAttribute('aria-pressed')).toBe('true')

    act(() => root.unmount())
  })
})

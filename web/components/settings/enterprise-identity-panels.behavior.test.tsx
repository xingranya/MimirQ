// @vitest-environment happy-dom

import { act, type AnchorHTMLAttributes } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  samlMetadata: vi.fn(),
  getServiceProviderConfig: vi.fn(),
  oidcEnabled: false,
  oidcProviders: [] as Array<{
    id: string
    name?: string
    issuer: string
    client_id: string
  }>,
}))

vi.mock('@/lib/api', () => ({
  authApi: { samlMetadata: mocks.samlMetadata },
  scimApi: { getServiceProviderConfig: mocks.getServiceProviderConfig },
}))

vi.mock('@/lib/client-storage', () => ({
  readClientStorage: () => null,
}))

vi.mock('@/lib/oidc', () => ({
  isOidcEnabled: () => mocks.oidcEnabled,
}))

vi.mock('@/lib/oidc-providers', () => ({
  getOidcPublicProvidersFromEnv: () => mocks.oidcProviders,
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

import { OidcOpsPanel } from './oidc-ops-panel'
import { SamlOpsPanel } from './saml-ops-panel'
import { ScimProvisioningPanel } from './scim-provisioning-panel'

function setInputValue(input: HTMLInputElement | null, value: string) {
  expect(input).not.toBeNull()
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )?.set
    setter?.call(input, value)
    input?.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('企业身份配置状态', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.oidcEnabled = false
    mocks.oidcProviders = []
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('SCIM 只有验证成功后显示已连接，凭据变化后恢复待验证', async () => {
    mocks.getServiceProviderConfig.mockResolvedValue({ patch: true })
    act(() => root.render(<ScimProvisioningPanel />))

    expect(container.textContent).toContain('未填写凭据')
    const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes('验证连接')
    )
    expect(button?.disabled).toBe(true)

    setInputValue(container.querySelector('#scim-tenant-id'), 'tenant-a')
    setInputValue(container.querySelector('#scim-access-token'), 'token-a')
    expect(container.textContent).toContain('待验证')
    expect(button?.disabled).toBe(false)

    await act(async () => button?.click())
    await vi.waitFor(() => expect(container.textContent).toContain('已连接'))
    expect(mocks.getServiceProviderConfig).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      scimToken: 'token-a',
    })

    setInputValue(container.querySelector('#scim-access-token'), 'token-b')
    expect(container.textContent).toContain('待验证')
    expect(container.textContent).not.toContain('已连接')
  })

  it('SCIM 未启用时给出部署动作，不把错误当成空状态', async () => {
    mocks.getServiceProviderConfig.mockRejectedValue({
      response: { status: 404, data: { detail: 'SCIM not enabled' } },
    })
    act(() => root.render(<ScimProvisioningPanel />))
    setInputValue(container.querySelector('#scim-tenant-id'), 'tenant-a')
    setInputValue(container.querySelector('#scim-access-token'), 'token-a')

    const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes('验证连接')
    )
    await act(async () => button?.click())

    await vi.waitFor(() =>
      expect(container.textContent).toContain('SCIM 服务尚未启用')
    )
    expect(container.textContent).toContain('连接失败')
  })

  it('SAML 未配置时显示可恢复的检查结果', async () => {
    mocks.samlMetadata.mockRejectedValue({
      response: { status: 503, data: { detail: 'saml not configured' } },
    })
    act(() => root.render(<SamlOpsPanel />))

    const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes('检查并下载元数据')
    )
    await act(async () => button?.click())

    await vi.waitFor(() => expect(container.textContent).toContain('尚未可用'))
    expect(container.textContent).toContain('SAML 尚未启用')
  })

  it('OIDC 区分未配置、停用和已发布入口', () => {
    mocks.oidcProviders = [
      {
        id: 'company',
        name: '公司统一登录',
        issuer: 'https://id.example.com',
        client_id: 'client-id',
      },
    ]
    act(() => root.render(<OidcOpsPanel />))
    expect(container.textContent).toContain('登录入口已停用')

    mocks.oidcEnabled = true
    act(() => root.render(<OidcOpsPanel />))
    expect(container.textContent).toContain('1 个登录入口已发布')
    expect(container.textContent).toContain('公司统一登录已显示在登录页')
  })
})

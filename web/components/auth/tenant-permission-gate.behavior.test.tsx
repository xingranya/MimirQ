// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TENANT_PERMISSIONS } from '@/lib/tenant-permissions'

const authState = vi.hoisted(() => ({ isDevMode: false }))
const accessState = vi.hoisted(() => ({
  data: {
    tenant_id: 'tenant-1',
    account_id: 'account-1',
    role: 'member',
    permissions: [] as string[],
    is_active: true,
    is_current: true,
  },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => authState,
}))

vi.mock('@/hooks/use-tenant-access', () => ({
  useTenantAccess: () => accessState,
}))

vi.mock('@/components/app-frame', () => ({
  AppFrame: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('@/components/ui/page-loading', () => ({
  PageLoading: () => <div>正在校验页面权限</div>,
}))

vi.mock('@/components/ui/page-scaffold', () => ({
  PageScaffold: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))

import { TenantPermissionGate } from './tenant-permission-gate'

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  authState.isDevMode = false
  accessState.data.permissions = []
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('TenantPermissionGate', () => {
  it('权限不足时不挂载受保护的查询组件', async () => {
    const mounted = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    function ProtectedQuery() {
      mounted()
      return <div>检索集健康度请求</div>
    }

    await act(async () => {
      root.render(
        <TenantPermissionGate
          permission={TENANT_PERMISSIONS.OBSERVABILITY_READ}
          pageName="检索集健康度"
          withFrame={false}
        >
          <ProtectedQuery />
        </TenantPermissionGate>
      )
    })

    expect(mounted).not.toHaveBeenCalled()
    expect(container.textContent).toContain('无权限访问')
    expect(container.textContent).not.toContain('检索集健康度请求')

    act(() => root.unmount())
  })

  it('具备权限时挂载受保护的查询组件', async () => {
    accessState.data.permissions = [TENANT_PERMISSIONS.OBSERVABILITY_READ]
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <TenantPermissionGate
          permission={TENANT_PERMISSIONS.OBSERVABILITY_READ}
          pageName="检索集健康度"
          withFrame={false}
        >
          <div>检索集健康度请求</div>
        </TenantPermissionGate>
      )
    })

    expect(container.textContent).toBe('检索集健康度请求')

    act(() => root.unmount())
  })
})

// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  allowed: false,
  clientRenders: vi.fn(),
}))

vi.mock('next/dynamic', () => ({
  default: () =>
    function MockObservabilityPageClient() {
      mocks.clientRenders()
      return <div data-testid="observability-client" />
    },
}))

vi.mock('@/components/auth/tenant-permission-gate', () => ({
  TenantPermissionGate: ({
    children,
    pageName,
    permission,
  }: Readonly<{
    children: React.ReactNode
    pageName: string
    permission: string
  }>) => (
    <div data-page-name={pageName} data-permission={permission}>
      {mocks.allowed ? children : <span>无权限访问</span>}
    </div>
  ),
}))

vi.mock('@/components/ui/page-loading', () => ({
  PageLoading: () => <div>正在加载</div>,
}))

import ObservabilityPage from './page'

describe('检索监控页面权限门禁', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true
    mocks.allowed = false
    mocks.clientRenders.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('无权限时不挂载客户端面板', async () => {
    await act(async () => root.render(<ObservabilityPage />))

    expect(container.firstElementChild?.getAttribute('data-permission')).toBe(
      'observability.read'
    )
    expect(container.firstElementChild?.getAttribute('data-page-name')).toBe(
      '检索监控'
    )
    expect(container.textContent).toContain('无权限访问')
    expect(mocks.clientRenders).not.toHaveBeenCalled()
  })

  it('有权限时只挂载一次客户端面板', async () => {
    mocks.allowed = true
    await act(async () => root.render(<ObservabilityPage />))

    expect(container.querySelector('[data-testid="observability-client"]')).not.toBeNull()
    expect(mocks.clientRenders).toHaveBeenCalledTimes(1)
  })
})

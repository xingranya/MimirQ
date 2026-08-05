// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentTenantAccess: vi.fn(),
  listTenantMembers: vi.fn(),
  request: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  rbacApi: {
    getCurrentTenantAccess: mocks.getCurrentTenantAccess,
    listTenantMembers: mocks.listTenantMembers,
  },
  rtbfApi: { request: mocks.request },
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    info: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/components/settings/settings-switch', () => ({
  SettingsSwitch: ({
    checked,
    disabled,
    onCheckedChange,
    'aria-label': ariaLabel,
  }: {
    checked: boolean
    disabled?: boolean
    onCheckedChange: (checked: boolean) => void
    'aria-label': string
  }) => (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    />
  ),
}))

vi.mock('@/components/settings/governance-ops-panel', () => ({
  GovernanceOpsPanel: ({
    canManage,
    accessLoading,
  }: {
    canManage: boolean
    accessLoading: boolean
  }) => (
    <div
      data-testid="governance-ops-permission"
      data-can-manage={String(canManage)}
      data-access-loading={String(accessLoading)}
    />
  ),
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}))

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogAction: (props: ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...props} />,
  AlertDialogCancel: (props: ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...props} />,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

import { GovernanceSection } from './governance-section'

const ACCESS_BASE = {
  tenant_id: 'tenant-1',
  account_id: 'account-1',
  role: 'owner',
  permissions: ['settings.read', 'lifecycle.manage'],
  is_active: true,
  is_current: true,
}

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

describe('数据治理配置与权限', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true
    mocks.getCurrentTenantAccess.mockResolvedValue(ACCESS_BASE)
    mocks.listTenantMembers.mockResolvedValue({ items: [] })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    queryClient.clear()
    container.remove()
  })

  async function renderSection(settingsWritable = true) {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <GovernanceSection
            settingsWritable={settingsWritable}
            isGovernanceEnabled
            isPiiAnonymizeEnabled
            isSecretsRedactEnabled={false}
            isQuarantineOnDropEnabled={false}
            updateGovernance={vi.fn()}
          />
        </QueryClientProvider>
      )
    })
    await act(async () => {
    await act(async () => {
      await vi.waitFor(() =>
        expect(
          container
            .querySelector('[data-testid="governance-ops-permission"]')
            ?.getAttribute('data-access-loading')
        ).toBe('false')
      )
    })
    })
  }

  it('系统设置只读时只禁用默认开关，不误禁用治理运维', async () => {
    await renderSection(false)

    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="启用或关闭默认数据治理"]'
      )?.disabled
    ).toBe(true)
    expect(
      container
        .querySelector('[data-testid="governance-ops-permission"]')
        ?.getAttribute('data-can-manage')
    ).toBe('true')
  })

  it('主开关关闭时保留子项值但不允许单独修改', async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <GovernanceSection
            settingsWritable
            isGovernanceEnabled={false}
            isPiiAnonymizeEnabled
            isSecretsRedactEnabled
            isQuarantineOnDropEnabled
            updateGovernance={vi.fn()}
          />
        </QueryClientProvider>
      )
    })

    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="启用或关闭默认数据治理"]'
      )?.disabled
    ).toBe(false)
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="启用或关闭个人信息脱敏"]'
      )?.disabled
    ).toBe(true)
  })

  it('扫描上限与失败重试按后端边界收敛，并保留零次重试', async () => {
    await renderSection()

    const maxDocs = container.querySelector<HTMLInputElement>('#rtbf-max-docs')
    const maxRetries = container.querySelector<HTMLInputElement>('#rtbf-max-retries')
    setInputValue(maxDocs, '5000')
    setInputValue(maxRetries, '0')

    expect(maxDocs?.value).toBe('1000')
    expect(maxRetries?.value).toBe('0')
  })

  it('安全预演失败时在区块内显示可恢复提示', async () => {
    mocks.request.mockRejectedValueOnce(new Error('服务暂不可用'))
    await renderSection()

    const action = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('开始安全预演')
    )
    await act(async () => {
      await vi.waitFor(() => expect(action?.disabled).toBe(false))
    })
    await act(async () => action?.click())

    await act(async () => {
      await vi.waitFor(() =>
        expect(container.querySelector('[role="alert"]')?.textContent).toContain(
          '服务暂不可用'
        )
      )
    })
    expect(container.textContent).toContain('请检查目标账号和权限后重试')
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
  })

  it('没有个人数据管理权限时不加载成员列表', async () => {
    mocks.getCurrentTenantAccess.mockResolvedValueOnce({
      ...ACCESS_BASE,
      role: 'viewer',
      permissions: ['settings.read'],
    })
    await renderSection()

    expect(container.textContent).toContain('没有管理个人数据的权限')
    expect(mocks.listTenantMembers).not.toHaveBeenCalled()
    expect(
      container
        .querySelector('[data-testid="governance-ops-permission"]')
        ?.getAttribute('data-can-manage')
    ).toBe('false')
  })
})

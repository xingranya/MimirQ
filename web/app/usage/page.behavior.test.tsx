// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCost: vi.fn(),
  getDatasets: vi.fn(),
  getQuota: vi.fn(),
  getSummary: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  datasetApi: { listAll: mocks.getDatasets },
  usageApi: {
    getChatCostUsageSummary: mocks.getCost,
    getChatTokenQuotaStatus: mocks.getQuota,
    getChatTokenUsageSummary: mocks.getSummary,
  },
}))

vi.mock('@/components/app-frame', () => ({
  AppFrame: ({ children }: Readonly<{ children: ReactNode }>) => <>{children}</>,
}))

vi.mock('@/components/auth/tenant-permission-gate', () => ({
  TenantPermissionGate: ({ children }: Readonly<{ children: ReactNode }>) => <>{children}</>,
}))

vi.mock('@/components/usage/tenant-quota-panel', () => ({
  TenantQuotaPanel: () => <div data-testid="tenant-quota-panel" />,
}))

vi.mock('@/components/ui/page-scaffold', () => ({
  PageScaffold: ({ children }: Readonly<{ children: ReactNode }>) => <main>{children}</main>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    disabled,
    onClick,
    type,
  }: Readonly<{
    children: ReactNode
    disabled?: boolean
    onClick?: () => void
    type?: 'button' | 'submit' | 'reset'
  }>) => (
    <button type={type || 'button'} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: Readonly<{ children: ReactNode }>) => <div>{children}</div>,
  SelectContent: ({ children }: Readonly<{ children: ReactNode }>) => <div>{children}</div>,
  SelectItem: ({ children }: Readonly<{ children: ReactNode }>) => <span>{children}</span>,
  SelectTrigger: ({
    children,
    'aria-label': ariaLabel,
  }: Readonly<{ children: ReactNode; 'aria-label'?: string }>) => (
    <button type="button" aria-label={ariaLabel}>
      {children}
    </button>
  ),
  SelectValue: () => <span />,
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    children,
    href,
  }: Readonly<{ children: ReactNode; href: string }>) => (
    <a href={href}>{children}</a>
  ),
}))

import UsagePage from './page'

const summaryPayload = {
  total_assistant_tokens: 120,
  total_assistant_messages: 3,
  window_start: '2026-08-01T00:00:00Z',
  window_end: '2026-08-02T00:00:00Z',
  by_dataset: [
    {
      dataset_id: 'dataset-a',
      assistant_messages: 3,
      assistant_tokens: 120,
    },
  ],
}

const costPayload = {
  total_llm_total_tokens: 240,
  total_embedding_query_tokens: 30,
  total_retrieval_elapsed_sec: 1.2,
  total_assistant_messages: 3,
  window_start: '2026-08-01T00:00:00Z',
  window_end: '2026-08-02T00:00:00Z',
  by_dataset: [
    {
      dataset_id: 'dataset-a',
      llm_total_tokens: 240,
      embedding_query_tokens: 30,
      retrieval_elapsed_sec_sum: 1.2,
      assistant_messages: 3,
    },
  ],
}

describe('用量页分区错误状态', () => {
  let container: HTMLDivElement
  let queryClient: QueryClient
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    mocks.getSummary.mockResolvedValue(summaryPayload)
    mocks.getCost.mockResolvedValue(costPayload)
    mocks.getQuota.mockResolvedValue({ enabled: true, exceeded: false, remaining: 500 })
    mocks.getDatasets.mockResolvedValue([{ id: 'dataset-a', name: '产品资料' }])
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    queryClient.clear()
    container.remove()
  })

  async function renderPage() {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <UsagePage />
        </QueryClientProvider>
      )
    })
  }

  async function waitForText(text: string) {
    await act(async () => {
      await vi.waitFor(() => {
        expect(container.textContent).toContain(text)
      })
    })
  }

  it('汇总失败时不显示为暂无对话用量', async () => {
    mocks.getSummary.mockRejectedValue(new Error('summary unavailable'))
    await renderPage()

    await waitForText('对话用量加载失败')
    expect(container.textContent).toContain('部分数据加载失败')
    expect(container.textContent).not.toContain('统计期内还没有可显示的对话用量。')
    expect(mocks.getCost).toHaveBeenCalledTimes(1)
  })

  it('成本失败时保留其他数据并提供局部重试', async () => {
    mocks.getCost.mockRejectedValue(new Error('cost unavailable'))
    await renderPage()

    await waitForText('成本数据加载失败')
    expect(container.textContent).toContain('产品资料')
    expect(container.textContent).toContain('成本数据加载失败，请重试。')
    expect(container.textContent).not.toContain('统计期内还没有可显示的成本数据。')
  })

  it('聊天配额失败时不误报为未启用', async () => {
    mocks.getQuota.mockRejectedValue(new Error('quota unavailable'))
    await renderPage()

    await waitForText('聊天配额加载失败')
    expect(container.textContent).toContain('聊天配额读取失败')
    expect(container.textContent).not.toContain('额度正常')
    expect(container.textContent).not.toContain('未启用')
  })

  it('名称加载失败时保留数据集编号和跳转', async () => {
    mocks.getDatasets.mockRejectedValue(new Error('labels unavailable'))
    await renderPage()

    await waitForText('数据集名称加载失败')
    expect(container.textContent).toContain('名称待重试')
    expect(container.textContent).not.toContain('已删除或无权访问')
    expect(container.querySelector('a[href*="dataset=dataset-a"]')).not.toBeNull()
  })
})

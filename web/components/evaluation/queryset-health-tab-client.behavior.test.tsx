// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type RunsPayload = {
  enabled: boolean
  path: string
  total: number
  truncated: boolean
  items: Array<Record<string, unknown>>
  timeseries: Record<string, unknown[]>
}

type QueryOptions = {
  queryKey: unknown
  enabled?: boolean
}

const mocks = vi.hoisted(() => ({
  runsState: {
    data: undefined as RunsPayload | undefined,
    isLoading: false,
    isFetching: false,
    error: null as Error | null,
  },
  diffState: {
    data: undefined as { diff: Record<string, unknown> } | undefined,
    isLoading: false,
    isFetching: false,
    error: null as Error | null,
  },
  runsRefetch: vi.fn(() => Promise.resolve()),
  diffRefetch: vi.fn(() => Promise.resolve()),
  diffEnabledHistory: [] as boolean[],
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: QueryOptions) => {
    const key = JSON.stringify(options.queryKey)
    if (key.includes('queryset-health-runs')) {
      return { ...mocks.runsState, refetch: mocks.runsRefetch }
    }
    mocks.diffEnabledHistory.push(Boolean(options.enabled))
    return { ...mocks.diffState, refetch: mocks.diffRefetch }
  },
}))

vi.mock('recharts', () => ({
  LineChart: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
}))

vi.mock('@/components/ui/safe-responsive-chart', () => ({
  SafeResponsiveChart: () => null,
}))

vi.mock('@/components/ui/select', () => ({
  Select: () => null,
  SelectContent: () => null,
  SelectItem: () => null,
  SelectTrigger: () => null,
  SelectValue: () => null,
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

import { QuerysetHealthTab } from './queryset-health-tab-client'

const firstRun = {
  generated_at: '2026-08-05T10:00:00Z',
  status: 'healthy',
  metrics: {
    hit_at_k: 0.5,
    mrr: 0.4,
    ndcg_at_k: 0.45,
    p95_latency_ms: 120,
  },
  risk: {
    miss_rate: 0.1,
    weak_hit_rate: 0.2,
  },
}

const secondRun = {
  ...firstRun,
  generated_at: '2026-08-04T10:00:00Z',
}

function runsPayload(items: Array<Record<string, unknown>>): RunsPayload {
  return {
    enabled: true,
    path: '/runs/queryset_health/history.jsonl',
    total: items.length,
    truncated: false,
    items,
    timeseries: {},
  }
}

describe('QuerysetHealthTab request states', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    mocks.runsState.data = runsPayload([])
    mocks.runsState.isLoading = false
    mocks.runsState.isFetching = false
    mocks.runsState.error = null
    mocks.diffState.data = undefined
    mocks.diffState.isLoading = false
    mocks.diffState.isFetching = false
    mocks.diffState.error = null
    mocks.diffEnabledHistory.length = 0
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    document.body.innerHTML = ''
  })

  it('shows an explicit initial loading state without placeholder metrics', async () => {
    mocks.runsState.data = undefined
    mocks.runsState.isLoading = true
    mocks.runsState.isFetching = true

    await renderPage()

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      '正在加载健康记录'
    )
    expect(container.textContent).not.toContain('最新快照')
    expect(container.textContent).not.toContain('暂无健康快照')
  })

  it('shows a recoverable initial error without rendering the dashboard', async () => {
    mocks.runsState.data = undefined
    mocks.runsState.error = new Error('service unavailable')

    await renderPage()

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '健康记录加载失败'
    )
    expect(container.textContent).not.toContain('最新快照')

    await act(async () => {
      findButton('重新加载')?.click()
      await Promise.resolve()
    })
    expect(mocks.runsRefetch).toHaveBeenCalledTimes(1)
  })

  it('only shows the empty state after a successful empty response', async () => {
    await renderPage()

    expect(container.textContent).toContain('暂无健康快照')
    expect(container.textContent).toContain('完成一次检索集评测后')
    expect(container.textContent).not.toContain('最新快照')
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('keeps the last successful dashboard visible when refresh fails', async () => {
    mocks.runsState.data = runsPayload([firstRun, secondRun])
    mocks.runsState.error = new Error('refresh failed')

    await renderPage()

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      '当前仍显示上次成功加载的健康记录'
    )
    expect(container.textContent).toContain('最新快照')
    expect(container.textContent).toContain('50.0%')

    await act(async () => {
      findButton('重新加载')?.click()
      await Promise.resolve()
    })
    expect(mocks.runsRefetch).toHaveBeenCalledTimes(1)
  })

  it('disables diff loading after a refresh removes the selected snapshots', async () => {
    mocks.runsState.data = runsPayload([firstRun, secondRun])
    await renderPage()

    expect(mocks.diffEnabledHistory.at(-1)).toBe(true)

    mocks.runsState.data = runsPayload([
      { ...firstRun, generated_at: '2026-08-06T10:00:00Z' },
    ])
    await renderPage()

    expect(mocks.diffEnabledHistory.at(-1)).toBe(false)
    expect(container.textContent).toContain('至少需要两个快照才能比较')
  })

  it('keeps the last diff visible when recalculation fails', async () => {
    mocks.runsState.data = runsPayload([firstRun, secondRun])
    mocks.diffState.data = {
      diff: {
        metric_deltas: {
          hit_at_k_delta: 0.1,
        },
      },
    }
    mocks.diffState.error = new Error('diff refresh failed')

    await renderPage()

    expect(container.textContent).toContain(
      '差异刷新失败，当前仍显示上次计算结果'
    )
    expect(container.textContent).toContain('+10.0%')

    await act(async () => {
      findButton('重新计算')?.click()
      await Promise.resolve()
    })
    expect(mocks.diffRefetch).toHaveBeenCalledTimes(1)
  })

  async function renderPage() {
    await act(async () => {
      root.render(<QuerysetHealthTab />)
      await Promise.resolve()
    })
  }

  function findButton(label: string) {
    return Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes(label)
    )
  }
})

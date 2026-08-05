// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type SimilarityCollectionsPayload = {
  collections: Array<{
    id: string
    label: string
    kind: string
    count: number
  }>
}

const mocks = vi.hoisted(() => ({
  queryState: {
    data: { collections: [] } as SimilarityCollectionsPayload | undefined,
    isFetching: false,
    error: null as Error | null,
  },
  refetch: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    ...mocks.queryState,
    refetch: mocks.refetch,
  }),
}))

vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: () => false,
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

import { RagvizSimilarityWorkbench } from './similarity-workbench'

describe('RagvizSimilarityWorkbench accessibility', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
    vi.clearAllMocks()
    mocks.queryState.data = { collections: [] }
    mocks.queryState.isFetching = false
    mocks.queryState.error = null
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('marks collapsed sidebars as inert', () => {
    act(() => {
      root.render(<RagvizSimilarityWorkbench />)
    })

    const leftSidebar = container.querySelector('[role="separator"][aria-label="调整左侧栏宽度"]')
      ?.parentElement as HTMLElement | null
    const rightSidebar = container.querySelector('[role="separator"][aria-label="调整右侧栏宽度"]')
      ?.parentElement as HTMLElement | null

    const leftToggle = container.querySelector(
      '[aria-label="收起左侧栏"]'
    ) as HTMLButtonElement | null
    const rightToggle = container.querySelector(
      '[aria-label="收起右侧栏"]'
    ) as HTMLButtonElement | null
    expect(leftToggle).not.toBeNull()
    expect(rightToggle).not.toBeNull()

    act(() => {
      leftToggle?.click()
    })

    expect(leftSidebar?.getAttribute('aria-hidden')).toBe('true')
    expect(leftSidebar?.hasAttribute('inert')).toBe(true)

    act(() => {
      rightToggle?.click()
    })

    expect(rightSidebar?.getAttribute('aria-hidden')).toBe('true')
    expect(rightSidebar?.hasAttribute('inert')).toBe(true)
  })

  it('resizes the left sidebar from the keyboard', () => {
    act(() => {
      root.render(<RagvizSimilarityWorkbench />)
    })

    const separator = container.querySelector(
      '[role="separator"][aria-label="调整左侧栏宽度"]'
    ) as HTMLElement | null
    expect(separator?.getAttribute('aria-valuenow')).toBe('312')

    act(() => {
      separator?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })

    expect(separator?.getAttribute('aria-valuenow')).toBe('336')
  })

  it('distinguishes initial loading from an empty response', () => {
    mocks.queryState.data = undefined
    mocks.queryState.isFetching = true

    act(() => {
      root.render(<RagvizSimilarityWorkbench />)
    })

    expect(container.querySelector('[role="status"]')?.textContent).toContain('正在加载数据源')
    expect(container.textContent).not.toContain('暂无可分析的数据源')
    expect(container.querySelector('select')).toBeNull()
    expect(findButton('计算相似度')).toBeUndefined()
  })

  it('shows a recoverable initial error without exposing configuration controls', () => {
    mocks.queryState.data = undefined
    mocks.queryState.error = new Error('service unavailable')

    act(() => {
      root.render(<RagvizSimilarityWorkbench />)
    })

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('数据源加载失败')
    expect(container.querySelector('select')).toBeNull()
    expect(findButton('计算相似度')).toBeUndefined()

    act(() => {
      findButton('重新加载')?.click()
    })
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
  })

  it('only shows the empty state after a successful empty response', () => {
    act(() => {
      root.render(<RagvizSimilarityWorkbench />)
    })

    expect(container.textContent).toContain('暂无可分析的数据源')
    expect(container.textContent).toContain('请先在知识库中上传并完成入库')
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelector('select')).toBeNull()
  })

  it('names both axis selectors and only enables calculation for valid selections', () => {
    mocks.queryState.data = {
      collections: [
        { id: 'ready', label: '产品知识库', kind: 'dataset', count: 8 },
        { id: 'empty', label: '空知识库', kind: 'dataset', count: 0 },
      ],
    }

    act(() => {
      root.render(<RagvizSimilarityWorkbench />)
    })

    const xSelect = selectByLabel('横轴数据源 1')
    const ySelect = selectByLabel('纵轴数据源 1')
    const calculateButton = findButton('计算相似度')
    expect(xSelect).toBeDefined()
    expect(ySelect).toBeDefined()
    expect(calculateButton?.disabled).toBe(true)

    changeSelect(xSelect, 'ready')
    changeSelect(ySelect, 'ready')

    expect(findButton('计算相似度')?.disabled).toBe(false)

    mocks.queryState.data = {
      collections: [
        { id: 'ready', label: '产品知识库', kind: 'dataset', count: 0 },
        { id: 'empty', label: '空知识库', kind: 'dataset', count: 0 },
      ],
    }
    act(() => {
      root.render(<RagvizSimilarityWorkbench />)
    })

    expect(findButton('计算相似度')?.disabled).toBe(true)
    expect(container.textContent).toContain('所选数据源暂无可分析内容')
  })

  it('keeps a successful snapshot usable when refresh fails', () => {
    mocks.queryState.data = {
      collections: [{ id: 'ready', label: '产品知识库', kind: 'dataset', count: 8 }],
    }
    mocks.queryState.error = new Error('refresh failed')

    act(() => {
      root.render(<RagvizSimilarityWorkbench />)
    })

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      '当前仍显示上次成功加载的数据源'
    )
    const xSelect = selectByLabel('横轴数据源 1')
    const ySelect = selectByLabel('纵轴数据源 1')
    changeSelect(xSelect, 'ready')
    changeSelect(ySelect, 'ready')
    expect(findButton('计算相似度')?.disabled).toBe(false)

    act(() => {
      findButton('重新加载')?.click()
    })
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
  })

  it('disables calculation when a refreshed snapshot removes a selection', () => {
    mocks.queryState.data = {
      collections: [{ id: 'ready', label: '产品知识库', kind: 'dataset', count: 8 }],
    }

    act(() => {
      root.render(<RagvizSimilarityWorkbench />)
    })

    changeSelect(selectByLabel('横轴数据源 1'), 'ready')
    changeSelect(selectByLabel('纵轴数据源 1'), 'ready')
    expect(findButton('计算相似度')?.disabled).toBe(false)

    mocks.queryState.data = {
      collections: [{ id: 'replacement', label: '新知识库', kind: 'dataset', count: 4 }],
    }
    act(() => {
      root.render(<RagvizSimilarityWorkbench />)
    })

    expect(findButton('计算相似度')?.disabled).toBe(true)
    expect(container.textContent).toContain('所选数据源已不可用，请重新选择')
  })

  function findButton(label: string) {
    return Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes(label)
    )
  }

  function selectByLabel(label: string) {
    return (container.querySelector(`select[aria-label="${label}"]`) ?? undefined) as
      HTMLSelectElement | undefined
  }

  function changeSelect(select: HTMLSelectElement | undefined, value: string) {
    expect(select).toBeDefined()
    act(() => {
      if (!select) return
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }
})

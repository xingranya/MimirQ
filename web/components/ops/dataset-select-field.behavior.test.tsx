// @vitest-environment happy-dom

import { act, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  refreshDatasets: vi.fn(),
  state: {
    datasets: [] as Array<{ id: string; name: string }>,
    isLoading: false,
    error: null as Error | null,
  },
}))

vi.mock('@/hooks/use-datasets', () => ({
  useDatasets: () => ({
    ...mocks.state,
    refreshDatasets: mocks.refreshDatasets,
  }),
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, disabled }: { children: ReactNode; disabled?: boolean }) => (
    <div data-select-disabled={String(Boolean(disabled))}>{children}</div>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}))

import { DatasetSelectField } from './dataset-select-field'

describe('数据集选择字段', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true
    mocks.state = { datasets: [], isLoading: false, error: null }
    mocks.refreshDatasets.mockResolvedValue(undefined)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderField(onChange = vi.fn()) {
    act(() =>
      root.render(
        <DatasetSelectField
          value=""
          onChange={onChange}
          label="绑定数据集"
          autoSelectFirst
        />
      )
    )
    return onChange
  }

  it('加载失败与空列表使用不同状态，失败时可重试', async () => {
    mocks.state = {
      datasets: [],
      isLoading: false,
      error: new Error('请求失败'),
    }
    renderField()

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '数据集加载失败'
    )
    const retry = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('重新加载')
    )
    act(() => retry?.click())
    expect(mocks.refreshDatasets).toHaveBeenCalledOnce()

    mocks.state = { datasets: [], isLoading: false, error: null }
    act(() =>
      root.render(
        <DatasetSelectField value="" onChange={vi.fn()} label="绑定数据集" />
      )
    )
    expect(container.textContent).toContain('暂无可用数据集')
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('成功加载后自动选择首个数据集', async () => {
    mocks.state = {
      datasets: [{ id: 'dataset-1', name: '产品资料' }],
      isLoading: false,
      error: null,
    }
    const onChange = renderField()

    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith('dataset-1'))
    expect(container.textContent).not.toContain('暂无可用数据集')
  })

  it('可见标签与下拉触发器关联', () => {
    mocks.state = {
      datasets: [{ id: 'dataset-1', name: '产品资料' }],
      isLoading: false,
      error: null,
    }
    renderField()

    const label = container.querySelector<HTMLLabelElement>('label')
    const trigger = container.querySelector<HTMLButtonElement>('button[id]')
    expect(label?.htmlFor).toBeTruthy()
    expect(label?.htmlFor).toBe(trigger?.id)
  })
})

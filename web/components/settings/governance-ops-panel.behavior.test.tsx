// @vitest-environment happy-dom

import { act, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listStaleDocumentsByDataset: vi.fn(),
  deletePreset: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  governanceApi: {
    listStaleDocumentsByDataset: mocks.listStaleDocumentsByDataset,
  },
  chunkPresetApi: { delete: mocks.deletePreset },
}))

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: vi.fn() },
}))

vi.mock('@/components/ops/dataset-select-field', () => ({
  DatasetSelectField: ({ onChange }: { onChange: (value: string) => void }) => (
    <button type="button" onClick={() => onChange('dataset-1')}>
      选择测试数据集
    </button>
  ),
}))

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  SelectValue: () => <span>已过期</span>,
}))

import { GovernanceOpsPanel } from './governance-ops-panel'

function setInputValue(input: HTMLInputElement | null, value: string) {
  expect(input).not.toBeNull()
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input?.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('数据集复核运维', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    vi.clearAllMocks()
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    mocks.listStaleDocumentsByDataset.mockResolvedValue({ items: [], total: 0 })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderPanel(canManage = true) {
    act(() => root.render(<GovernanceOpsPanel canManage={canManage} accessLoading={false} />))
  }

  function findButton(label: string) {
    return Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes(label)
    )
  }

  it('到期窗口保留合法零值并限制在 0 到 365 天', async () => {
    renderPanel()
    act(() => findButton('选择测试数据集')?.click())

    const input = container.querySelector<HTMLInputElement>('#governance-due-window')
    setInputValue(input, '0')
    expect(input?.value).toBe('0')
    setInputValue(input, '999')
    expect(input?.value).toBe('365')

    await act(async () => findButton('查询待复核文档')?.click())
    expect(mocks.listStaleDocumentsByDataset).toHaveBeenCalledWith('dataset-1', {
      mode: 'overdue',
      due_within_days: 365,
      limit: 50,
    })
  })

  it('查询失败时清除旧结果并显示区块内错误', async () => {
    mocks.listStaleDocumentsByDataset.mockRejectedValueOnce(new Error('复核服务暂不可用'))
    renderPanel()
    act(() => findButton('选择测试数据集')?.click())
    await act(async () => findButton('查询待复核文档')?.click())

    await vi.waitFor(() =>
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('复核服务暂不可用')
    )
    expect(container.textContent).toContain('请检查当前选择和账号权限后重试')
    expect(mocks.toastError).toHaveBeenCalledOnce()
  })

  it('没有数据集维护权限时保持只读', () => {
    renderPanel(false)

    expect(container.textContent).toContain('当前账号没有数据集维护权限')
    expect(container.querySelector('fieldset')).toBeNull()
    expect(findButton('选择测试数据集')).toBeUndefined()
    expect(mocks.listStaleDocumentsByDataset).not.toHaveBeenCalled()
  })
})

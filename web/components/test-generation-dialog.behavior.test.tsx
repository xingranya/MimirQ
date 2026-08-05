// @vitest-environment happy-dom

import * as React from 'react'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateFromDocuments: vi.fn(),
  generateFromConversations: vi.fn(),
  refetchDocuments: vi.fn(),
  refetchDatasets: vi.fn(),
  refetchConversations: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  documents: [
    {
      id: 'document-1',
      dataset_id: 'dataset-1',
      filename: '产品手册.pdf',
      chunk_count: 12,
    },
    {
      id: 'document-2',
      dataset_id: 'dataset-2',
      filename: '服务说明.pdf',
      chunk_count: 8,
    },
  ],
  datasets: [
    { id: 'dataset-1', name: '产品知识库' },
    { id: 'dataset-2', name: '服务知识库' },
  ],
  conversations: [{ id: 'conversation-1', title: '产品咨询', message_count: 6 }],
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === 'documents') {
      return {
        data: { items: mocks.documents },
        error: null,
        isLoading: false,
        refetch: mocks.refetchDocuments,
      }
    }
    if (queryKey[0] === 'datasets') {
      return {
        data: mocks.datasets,
        error: null,
        isLoading: false,
        refetch: mocks.refetchDatasets,
      }
    }
    return {
      data: { items: mocks.conversations },
      error: null,
      isLoading: false,
      refetch: mocks.refetchConversations,
    }
  },
}))

vi.mock('@/lib/api', () => ({
  chatApi: { listConversations: vi.fn() },
  datasetApi: { listAll: vi.fn() },
  documentApi: { list: vi.fn() },
  evaluationApi: {
    generateFromDocuments: mocks.generateFromDocuments,
    generateFromConversations: mocks.generateFromConversations,
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

vi.mock('@/components/ui/select', () => {
  type SelectContextValue = {
    onValueChange?: (value: string) => void
  }
  const SelectContext = React.createContext<SelectContextValue>({})

  return {
    Select: ({
      children,
      onValueChange,
      value,
    }: Readonly<{
      children: React.ReactNode
      onValueChange?: (value: string) => void
      value?: string
    }>) => (
      <SelectContext.Provider value={{ onValueChange }}>
        <div data-select-value={value}>{children}</div>
      </SelectContext.Provider>
    ),
    SelectContent: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
    SelectItem: ({ children, value }: Readonly<{ children: React.ReactNode; value: string }>) => {
      const context = React.useContext(SelectContext)
      return (
        <button type="button" onClick={() => context.onValueChange?.(value)}>
          {children}
        </button>
      )
    },
    SelectTrigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button type="button" {...props}>
        {children}
      </button>
    ),
    SelectValue: ({ placeholder }: Readonly<{ placeholder?: string }>) => (
      <span>{placeholder}</span>
    ),
  }
})

import { TestGenerationDialog } from './test-generation-dialog'

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll('button')).find(
    (item) => item.textContent?.trim() === text
  )
  expect(button, `未找到按钮：${text}`).toBeDefined()
  return button as HTMLButtonElement
}

function sourceButtonByText(text: string): HTMLButtonElement {
  const button = Array.from(
    document.body.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')
  ).find((item) => item.textContent?.includes(text))
  expect(button, `未找到来源按钮：${text}`).toBeDefined()
  return button as HTMLButtonElement
}

function checkboxFor(labelText: string): HTMLInputElement {
  const label = Array.from(document.body.querySelectorAll('label')).find((item) =>
    item.textContent?.includes(labelText)
  )
  const checkbox = label?.querySelector<HTMLInputElement>('input[type="checkbox"]')
  expect(checkbox, `未找到复选框：${labelText}`).toBeDefined()
  return checkbox as HTMLInputElement
}

function ReopenHarness() {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        打开生成
      </button>
      <TestGenerationDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}

describe('测试问题生成弹窗', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    mocks.refetchDocuments.mockResolvedValue(undefined)
    mocks.refetchDatasets.mockResolvedValue(undefined)
    mocks.refetchConversations.mockResolvedValue(undefined)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    document.body.innerHTML = ''
  })

  it('默认只预览，按知识库筛选文档，并在生成期间阻止关闭', async () => {
    let resolveGeneration:
      | ((value: {
          status: string
          generated_questions: Array<{
            question: string
            source_type: 'document'
            source_id: string
            metadata: Record<string, never>
          }>
          saved_case_ids: string[]
        }) => void)
      | undefined
    mocks.generateFromDocuments.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGeneration = resolve
        })
    )
    const onClose = vi.fn()

    await act(async () => {
      root.render(<TestGenerationDialog open onClose={onClose} />)
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain('产品手册.pdf')
    expect(document.body.textContent).toContain('服务说明.pdf')
    act(() => buttonByText('产品知识库').click())
    expect(document.body.textContent).toContain('产品手册.pdf')
    expect(document.body.textContent).not.toContain('服务说明.pdf')

    act(() => checkboxFor('产品手册.pdf').click())
    act(() => buttonByText('下一步').click())

    const autoSaveSwitch = document.body.querySelector('[role="switch"]')
    expect(autoSaveSwitch?.getAttribute('aria-checked')).toBe('false')
    expect(document.body.textContent).toContain('默认仅预览')

    await act(async () => {
      buttonByText('生成问题').click()
      await Promise.resolve()
    })

    expect(mocks.generateFromDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset_id: 'dataset-1',
        document_ids: ['document-1'],
        auto_save_as_cases: false,
      })
    )
    const disabledClose = buttonByText('操作进行中，暂不能关闭')
    expect(disabledClose.disabled).toBe(true)
    act(() => disabledClose.click())
    expect(onClose).not.toHaveBeenCalled()

    await act(async () => {
      resolveGeneration?.({
        status: 'completed',
        generated_questions: [
          {
            question: '产品支持哪些部署方式？',
            source_type: 'document',
            source_id: 'document-1',
            metadata: {},
          },
        ],
        saved_case_ids: [],
      })
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain('本次结果仅供预览')
    expect(document.body.textContent).toContain('产品支持哪些部署方式？')
  })

  it('切换来源会清理另一来源的选择', async () => {
    await act(async () => {
      root.render(<TestGenerationDialog open onClose={vi.fn()} />)
      await Promise.resolve()
    })

    act(() => buttonByText('产品知识库').click())
    act(() => checkboxFor('产品手册.pdf').click())
    expect(document.body.textContent).toContain('已选 1 项')

    act(() => sourceButtonByText('历史对话').click())
    act(() => checkboxFor('产品咨询').click())
    expect(document.body.textContent).toContain('已选 1 项')

    act(() => sourceButtonByText('知识库文档').click())
    expect(document.body.textContent).toContain('已选 0 项')
    expect(
      document.body.querySelector('[data-select-value]')?.getAttribute('data-select-value')
    ).toBe('__all_datasets__')
    expect(buttonByText('下一步').disabled).toBe(true)
  })

  it('关闭后重新打开会恢复默认来源和参数', async () => {
    await act(async () => {
      root.render(<ReopenHarness />)
      await Promise.resolve()
    })

    act(() => sourceButtonByText('历史对话').click())
    expect(sourceButtonByText('历史对话').getAttribute('aria-pressed')).toBe('true')

    act(() => buttonByText('关闭').click())
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()

    await act(async () => {
      buttonByText('打开生成').click()
      await Promise.resolve()
    })

    expect(sourceButtonByText('知识库文档').getAttribute('aria-pressed')).toBe('true')
    expect(document.body.textContent).toContain('已选 0 项')
  })
})

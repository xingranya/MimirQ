// @vitest-environment happy-dom

import React, { act } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { queryKeys } from '@/lib/query-keys'

const datasetApiMock = vi.hoisted(() => ({
  get: vi.fn(),
  getIngestionPolicy: vi.fn(),
  getIngestionStats: vi.fn(),
  updateIngestionPolicy: vi.fn(),
}))
const pipelineApiMock = vi.hoisted(() => ({
  ingestionPreview: vi.fn(),
  listGovernanceProfiles: vi.fn(),
}))
const guardState = vi.hoisted(() => ({ enabled: false }))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'dataset-1' }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/lib/api', () => ({ datasetApi: datasetApiMock, pipelineApi: pipelineApiMock }))
vi.mock('@/lib/client-logging', () => ({ reportClientError: vi.fn() }))
vi.mock('@/lib/secure-random', () => ({ randomBase36Id: () => 'test-rule-id' }))
vi.mock('@/contexts/pipeline-capabilities-context', () => ({
  usePipelineCapabilities: () => ({ capabilities: null }),
}))
vi.mock('@/components/app-frame', () => ({
  AppFrame: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-app-frame': 'true' }, children),
}))
vi.mock('@/components/datasets/dataset-detail-shell', () => ({
  DatasetDetailShell: ({
    children,
    actions,
  }: {
    children: React.ReactNode
    actions?: React.ReactNode
  }) => React.createElement('main', null, actions, children),
}))
vi.mock('@/hooks/use-unsaved-navigation-guard', () => ({
  useUnsavedNavigationGuard: ({ enabled }: { enabled: boolean }) => {
    guardState.enabled = enabled
    return {
      cancelNavigation: vi.fn(),
      confirmNavigation: vi.fn(),
      navigationPending: false,
      requestNavigation: vi.fn(),
    }
  },
}))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import DatasetIngestionPolicyPage from './page'

function createRule(id: string, name: string) {
  return {
    id,
    name,
    enabled: true,
    match: { extensions: ['.pdf'], filename_regex: null },
    preprocess: { enabled: false, steps: [] },
    parser_backend: 'auto',
    chunk_strategy: null,
    governance_profile_ref: null,
    pipeline_patch: {},
  }
}

const SERVER_POLICY = {
  version: '1',
  writable: true,
  rules: [createRule('rule-1', '合同规则'), createRule('rule-2', '报告规则')],
}

const PREVIEW_RESULT = {
  rule: {
    matched: true,
    rule_name: '合同规则',
    parser_backend: 'auto',
    chunk_strategy: null,
    governance_profile_ref: null,
  },
  preprocess: { changed: false },
  parse: { markdown: '上次成功的解析结果' },
  clean: { markdown: '上次成功的治理结果', issues: [], diff_unified: '' },
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

function renderPage(queryClient = createTestQueryClient()) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <DatasetIngestionPolicyPage />
      </QueryClientProvider>
    )
  })

  return { container, root }
}

function findButton(scope: ParentNode, label: string): HTMLButtonElement {
  const button = Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find((item) =>
    item.textContent?.includes(label)
  )
  expect(button, `未找到按钮：${label}`).not.toBeUndefined()
  return button as HTMLButtonElement
}

function findButtons(scope: ParentNode, label: string): HTMLButtonElement[] {
  return Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).filter((item) =>
    item.textContent?.includes(label)
  )
}

function selectFile(input: HTMLInputElement, file: File) {
  act(() => {
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  guardState.enabled = false
  Object.values(datasetApiMock).forEach((mock) => mock.mockReset())
  Object.values(pipelineApiMock).forEach((mock) => mock.mockReset())
  datasetApiMock.get.mockResolvedValue({ id: 'dataset-1', name: '客户知识库' })
  datasetApiMock.getIngestionPolicy.mockResolvedValue(SERVER_POLICY)
  datasetApiMock.getIngestionStats.mockResolvedValue({
    total_documents: 2,
    total_chunks: 8,
    total_characters: 1200,
    by_status: { completed: 2, failed: 0 },
    last_processed_at: '2026-08-05T10:00:00Z',
  })
  datasetApiMock.updateIngestionPolicy.mockResolvedValue(SERVER_POLICY)
  pipelineApiMock.listGovernanceProfiles.mockResolvedValue({ total: 0, items: [] })
  pipelineApiMock.ingestionPreview.mockResolvedValue(PREVIEW_RESULT)
})

afterEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('入库策略请求状态', () => {
  it('首次策略请求失败时禁止编辑并可就地重试', async () => {
    datasetApiMock.getIngestionPolicy.mockRejectedValueOnce(new Error('service unavailable'))
    const { container, root } = renderPage()

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('无法加载入库策略'))
    })
    expect(container.textContent).not.toContain('还没有入库规则')
    expect(findButton(container, '新增规则').disabled).toBe(true)
    const previewInput = container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(previewInput).not.toBeNull()
    selectFile(
      previewInput as HTMLInputElement,
      new File(['preview'], 'preview.pdf', { type: 'application/pdf' })
    )
    expect(findButton(container, '生成预览').disabled).toBe(true)

    act(() => findButton(container, '重新加载').click())
    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('合同规则'))
    })

    act(() => root.unmount())
  })

  it('统计请求失败时显示错误而不是直接隐藏', async () => {
    datasetApiMock.getIngestionStats.mockRejectedValueOnce(new Error('stats unavailable'))
    const { container, root } = renderPage()

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('入库统计加载失败'))
      await vi.waitFor(() => expect(container.textContent).toContain('合同规则'))
    })

    act(() => root.unmount())
  })

  it('后台刷新失败时保留本地规则草稿', async () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(queryKeys.datasets.ingestionPolicy('dataset-1'), SERVER_POLICY)
    datasetApiMock.getIngestionPolicy.mockRejectedValueOnce(new Error('refresh failed'))
    const { container, root } = renderPage(queryClient)

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('刷新入库策略失败'))
    })
    act(() => {
      findButtons(container, '删除')[0]?.click()
      findButton(container, '重新加载').click()
    })
    await act(async () => {
      await vi.waitFor(() => expect(datasetApiMock.getIngestionPolicy).toHaveBeenCalledTimes(2))
    })

    expect(container.textContent).not.toContain('合同规则')
    expect(container.textContent).toContain('报告规则')
    expect(container.textContent).toContain('有未保存更改')

    act(() => root.unmount())
  })

  it('保存期间产生的新修改不会被已提交策略覆盖', async () => {
    let resolveSave: ((value: typeof SERVER_POLICY) => void) | undefined
    datasetApiMock.updateIngestionPolicy.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve
      })
    )
    const { container, root } = renderPage()

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('合同规则'))
    })
    act(() => findButtons(container, '删除')[0]?.click())
    act(() => findButton(container, '保存策略').click())
    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('正在保存'))
    })
    expect(guardState.enabled).toBe(true)

    act(() => findButtons(container, '删除')[0]?.click())
    await act(async () => {
      resolveSave?.(SERVER_POLICY)
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(container.textContent).not.toContain('正在保存'))

    expect(datasetApiMock.updateIngestionPolicy).toHaveBeenCalledWith(
      'dataset-1',
      expect.objectContaining({ rules: [expect.objectContaining({ id: 'rule-2' })] })
    )
    expect(container.textContent).toContain('还没有入库规则')
    expect(container.textContent).toContain('有未保存更改')

    act(() => root.unmount())
  })

  it('保存失败时保留草稿并隐藏后端内部异常', async () => {
    let rejectSave: ((reason: Error) => void) | undefined
    datasetApiMock.updateIngestionPolicy.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectSave = reject
      })
    )
    const { container, root } = renderPage()

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('合同规则'))
    })
    act(() => findButtons(container, '删除')[0]?.click())
    act(() => findButton(container, '保存策略').click())
    await act(async () => {
      await vi.waitFor(() => expect(datasetApiMock.updateIngestionPolicy).toHaveBeenCalledTimes(1))
      rejectSave?.(new Error('postgresql://internal-user:internal-password@db:5432'))
      await Promise.resolve()
    })
    await vi.waitFor(() =>
      expect(container.textContent).toContain('保存入库策略失败，请检查规则内容和操作权限后重试')
    )

    expect(container.textContent).not.toContain('internal-password')
    expect(container.textContent).not.toContain('合同规则')
    expect(container.textContent).toContain('有未保存更改')

    act(() => root.unmount())
  })

  it('预览使用当前尚未保存的策略草稿', async () => {
    const { container, root } = renderPage()

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('合同规则'))
    })
    act(() => findButtons(container, '删除')[0]?.click())

    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(fileInput).not.toBeNull()
    const file = new File(['draft'], 'draft.pdf', { type: 'application/pdf' })
    selectFile(fileInput as HTMLInputElement, file)
    act(() => findButton(container, '生成预览').click())

    await act(async () => {
      await vi.waitFor(() => expect(pipelineApiMock.ingestionPreview).toHaveBeenCalledTimes(1))
    })
    expect(pipelineApiMock.ingestionPreview).toHaveBeenCalledWith(
      file,
      {
        dataset_id: 'dataset-1',
        diff_max_lines: 2000,
        policy: {
          version: '1',
          rules: [expect.objectContaining({ id: 'rule-2' })],
        },
      },
      { signal: expect.any(AbortSignal) }
    )

    act(() => root.unmount())
  })

  it('策略变化时取消进行中的预览并清除旧结果', async () => {
    let resolvePreview: ((value: typeof PREVIEW_RESULT) => void) | undefined
    pipelineApiMock.ingestionPreview.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePreview = resolve
      })
    )
    const { container, root } = renderPage()

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('合同规则'))
    })
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(fileInput).not.toBeNull()
    selectFile(
      fileInput as HTMLInputElement,
      new File(['preview'], 'preview.pdf', { type: 'application/pdf' })
    )
    act(() => findButton(container, '生成预览').click())
    await act(async () => {
      await vi.waitFor(() => expect(pipelineApiMock.ingestionPreview).toHaveBeenCalledTimes(1))
    })

    const firstSignal = pipelineApiMock.ingestionPreview.mock.calls[0]?.[2]?.signal as AbortSignal
    expect(firstSignal.aborted).toBe(false)
    act(() => findButtons(container, '删除')[0]?.click())
    expect(firstSignal.aborted).toBe(true)

    await act(async () => {
      resolvePreview?.(PREVIEW_RESULT)
      await Promise.resolve()
    })
    expect(container.textContent).not.toContain('上次成功的解析结果')

    pipelineApiMock.ingestionPreview.mockResolvedValueOnce(PREVIEW_RESULT)
    await act(async () => {
      findButton(container, '生成预览').click()
      await vi.waitFor(() => expect(pipelineApiMock.ingestionPreview).toHaveBeenCalledTimes(2))
    })
    await vi.waitFor(() => expect(container.textContent).toContain('上次成功的解析结果'))
    act(() => findButtons(container, '删除')[0]?.click())
    expect(container.textContent).not.toContain('上次成功的解析结果')

    act(() => root.unmount())
  })

  it('只读成员可以查看和预览，但不能修改策略', async () => {
    datasetApiMock.getIngestionPolicy.mockResolvedValueOnce({
      ...SERVER_POLICY,
      writable: false,
    })
    const { container, root } = renderPage()

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('当前为只读模式'))
    })
    expect(findButton(container, '保存策略').disabled).toBe(true)
    expect(findButton(container, '从模板添加').disabled).toBe(true)
    expect(findButton(container, '新增规则').disabled).toBe(true)
    expect(findButtons(container, '编辑')[0]?.disabled).toBe(true)
    expect(findButtons(container, '删除')[0]?.disabled).toBe(true)

    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(fileInput).not.toBeNull()
    const file = new File(['preview'], 'preview.pdf', { type: 'application/pdf' })
    selectFile(fileInput as HTMLInputElement, file)
    expect(findButton(container, '生成预览').disabled).toBe(false)
    act(() => findButton(container, '生成预览').click())

    await act(async () => {
      await vi.waitFor(() => expect(pipelineApiMock.ingestionPreview).toHaveBeenCalledTimes(1))
    })
    expect(pipelineApiMock.ingestionPreview.mock.calls[0]?.[1]).toEqual({
      dataset_id: 'dataset-1',
      diff_max_lines: 2000,
      policy: undefined,
    })

    act(() => root.unmount())
  })

  it('预览失败时保留旧结果，切换文件后忽略旧响应', async () => {
    const { container, root } = renderPage()

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('合同规则'))
    })
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(fileInput).not.toBeNull()
    const firstFile = new File(['first'], 'first.pdf', { type: 'application/pdf' })
    selectFile(fileInput as HTMLInputElement, firstFile)
    await act(async () => {
      findButton(container, '生成预览').click()
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(container.textContent).toContain('上次成功的解析结果'))

    let rejectPreview: ((reason: Error) => void) | undefined
    pipelineApiMock.ingestionPreview.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectPreview = reject
      })
    )
    act(() => findButton(container, '生成预览').click())
    await act(async () => {
      await vi.waitFor(() => expect(pipelineApiMock.ingestionPreview).toHaveBeenCalledTimes(2))
      rejectPreview?.(new Error('http://internal-parser:8000/secret'))
      await Promise.resolve()
    })
    await vi.waitFor(() =>
      expect(container.textContent).toContain('生成预览失败，请检查文件和解析服务后重试')
    )
    expect(container.textContent).toContain('上次成功的解析结果')
    expect(container.textContent).not.toContain('internal-parser')

    let resolveStalePreview: ((value: typeof PREVIEW_RESULT) => void) | undefined
    pipelineApiMock.ingestionPreview.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStalePreview = resolve
      })
    )
    act(() => findButton(container, '生成预览').click())
    await act(async () => {
      await vi.waitFor(() => expect(pipelineApiMock.ingestionPreview).toHaveBeenCalledTimes(3))
    })
    const staleSignal = pipelineApiMock.ingestionPreview.mock.calls[2]?.[2]?.signal as AbortSignal
    expect(staleSignal.aborted).toBe(false)
    const secondFile = new File(['second'], 'second.pdf', { type: 'application/pdf' })
    selectFile(fileInput as HTMLInputElement, secondFile)
    expect(staleSignal.aborted).toBe(true)
    await act(async () => {
      resolveStalePreview?.(PREVIEW_RESULT)
      await Promise.resolve()
    })
    expect(container.textContent).not.toContain('上次成功的解析结果')

    act(() => root.unmount())
  })
})

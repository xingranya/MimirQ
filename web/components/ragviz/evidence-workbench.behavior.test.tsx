// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDatasets: vi.fn(),
  retrieveEvidence: vi.fn(),
  toastMessage: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  datasetApi: { listAll: mocks.getDatasets },
  ragApi: { retrieveEvidence: mocks.retrieveEvidence },
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    'actions.export': '导出结果',
    'actions.reset': '清除结果',
    'actions.search': '检索',
    'actions.searching': '检索中…',
    'controls.allDocuments': '全部可访问文档',
    'controls.datasetPlaceholder': '选择知识库',
    'controls.datasetScope': '知识范围',
    'controls.loadingDatasets': '正在加载知识库…',
    'controls.profile': '检索强度',
    'controls.profilePlaceholder': '选择检索强度',
    'controls.query': '需要验证的问题',
    'controls.queryPlaceholder': '输入问题',
    'errors.retrieveFailed': '证据检索失败，请稍后重试',
    'profiles.coverage80': '扩展检索（提高覆盖）',
    'profiles.recall20': '快速检索（减少候选）',
    'profiles.recall50': '标准检索（默认）',
    'results.citations.emptyContent': '该引用没有可显示的原文内容。',
    'results.citations.emptyHits': '本次检索没有返回引用。',
    'results.citations.fallbackTitle': '未命名引用',
    'results.citations.hitsHint': '按相关度核对引用来源和原文片段。',
    'results.citations.noCitations': '没有检索到可用引用。',
    'results.citations.scoreLabel': '相关度',
    'results.citations.title': '引用内容',
    'results.summary.citations': '引用数量',
    'results.summary.retrievalElapsed': '检索耗时',
    'results.summary.topRelevanceScore': '最高相关度',
    'toasts.abstainTriggered': '当前证据不足，建议拒绝回答',
    'toasts.exportedPack': '验证结果已导出',
    'toasts.foundEvidence': '找到证据',
    'toasts.noEvidence': '没有找到可用证据',
  }[key] || key),
}))

vi.mock('sonner', () => ({
  toast: {
    message: mocks.toastMessage,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  },
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: Readonly<{ children: ReactNode }>) => <div>{children}</div>,
  SelectContent: ({ children }: Readonly<{ children: ReactNode }>) => <div>{children}</div>,
  SelectItem: ({ children }: Readonly<{ children: ReactNode }>) => <span>{children}</span>,
  SelectTrigger: ({ children }: Readonly<{ children: ReactNode }>) => <div>{children}</div>,
  SelectValue: () => <span />,
}))

vi.mock('@/components/auth-image', () => ({
  AuthImage: () => <span />,
  AuthImageLink: ({ children }: Readonly<{ children: ReactNode }>) => <span>{children}</span>,
}))

import { EvidenceWorkbench } from './evidence-workbench'

const evidenceResponse = {
  query: '退款期限',
  query_for_retrieval: '产品退款期限',
  citations: [
    {
      document_id: 'document-secret-id',
      document_name: '售后政策.pdf',
      chunk_content: '签收后七天内可申请退货。',
      relevance_score: 0.92,
      page_number: 3,
    },
  ],
  has_evidence: true,
  abstain_triggered: false,
  abstain_reason: null,
  metrics: {
    top_relevance_score: 0.92,
    retrieval_elapsed_sec: 0.24,
  },
}

describe('证据验证工作台', () => {
  let container: HTMLDivElement
  let queryClient: QueryClient
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    mocks.getDatasets.mockResolvedValue([{ id: 'dataset-a', name: '产品资料' }])
    mocks.retrieveEvidence.mockResolvedValue(evidenceResponse)
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
    vi.restoreAllMocks()
  })

  async function renderWorkbench() {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <EvidenceWorkbench />
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

  function setQuery(value: string) {
    const textarea = container.querySelector('textarea')
    if (!textarea) throw new Error('未找到问题输入框')
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value'
    )?.set
    valueSetter?.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function findButton(text: string) {
    return Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes(text)
    )
  }

  it('检索成功后显示自然中文状态和引用内容', async () => {
    await renderWorkbench()
    await act(async () => setQuery('退款期限'))
    await act(async () => findButton('检索')?.click())
    await waitForText('找到可用证据')

    expect(container.textContent).toContain('售后政策.pdf · 第 3 页')
    expect(container.textContent).toContain('签收后七天内可申请退货。')
    expect(container.textContent).not.toContain('document-secret-id')
    expect(container.textContent).not.toContain('has_evidence')
    expect(container.textContent).not.toContain('abstain_triggered')
  })

  it('拒答原因使用用户可理解的中文', async () => {
    mocks.retrieveEvidence.mockResolvedValue({
      ...evidenceResponse,
      citations: [],
      has_evidence: false,
      abstain_triggered: true,
      abstain_reason: 'top_relevance_lt_min',
    })
    await renderWorkbench()
    await act(async () => setQuery('未知问题'))
    await act(async () => findButton('检索')?.click())
    await waitForText('建议拒绝回答')

    expect(container.textContent).toContain('最高相关度未达到要求')
    expect(container.textContent).not.toContain('top_relevance_lt_min')
  })

  it('知识范围加载失败时提供独立重试', async () => {
    mocks.getDatasets
      .mockRejectedValueOnce(new Error('datasets unavailable'))
      .mockResolvedValueOnce([{ id: 'dataset-a', name: '产品资料' }])
    await renderWorkbench()
    await waitForText('知识范围加载失败')

    await act(async () => findButton('重新加载')?.click())
    await waitForText('产品资料')

    expect(mocks.getDatasets).toHaveBeenCalledTimes(2)
    expect(container.textContent).not.toContain('知识范围加载失败')
  })

  it('导出结果使用产生当前结果时的问题', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockImplementation(
      (_object: Blob | MediaSource) => 'blob:test'
    )
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    await renderWorkbench()
    await act(async () => setQuery('退款期限'))
    await act(async () => findButton('检索')?.click())
    await waitForText('找到可用证据')

    await act(async () => setQuery('已经改成另一个问题'))
    await act(async () => findButton('导出结果')?.click())

    const blob = createObjectURL.mock.calls[0]?.[0]
    expect(blob).toBeInstanceOf(Blob)
    if (!(blob instanceof Blob)) throw new Error('导出内容不是 Blob')
    const payload = JSON.parse(await blob.text()) as { query: string }
    expect(payload.query).toBe('退款期限')
  })
})

// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type EvidenceResponse = {
  citations: Array<{
    document_id: string
    chunk_id: string
    document_name: string
    chunk_content: string
  }>
  query_for_retrieval: string
  metrics: Record<string, never>
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const mocks = vi.hoisted(() => ({
  createRegressionCase: vi.fn(),
  retrieveEvidence: vi.fn(),
  invalidateQueries: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { total: 0, items: [], fullyLoaded: true },
    error: null,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  useMutation: ({ mutationFn }: { mutationFn: (payload: unknown) => Promise<unknown> }) => ({
    mutateAsync: mutationFn,
  }),
}))

vi.mock('@/lib/api', () => ({
  evaluationApi: {
    createRegressionCase: mocks.createRegressionCase,
    deleteRegressionCase: vi.fn(),
    listRegressionCases: vi.fn(),
    patchRegressionCase: vi.fn(),
  },
  ragApi: { retrieveEvidence: mocks.retrieveEvidence },
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
  },
}))

import { TestCaseManager } from './test-case-manager'

function evidenceResponse(documentName: string, chunkId: string): EvidenceResponse {
  return {
    citations: [
      {
        document_id: `document-${chunkId}`,
        chunk_id: chunkId,
        document_name: documentName,
        chunk_content: `${documentName} 的证据正文`,
      },
    ],
    query_for_retrieval: 'normalized query',
    metrics: {},
  }
}

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll('button')).find(
    (item) => item.textContent?.trim() === text
  )
  expect(button, `未找到按钮：${text}`).toBeDefined()
  return button as HTMLButtonElement
}

function changeTextarea(id: string, value: string) {
  const textarea = document.body.querySelector(`#${id}`) as HTMLTextAreaElement | null
  expect(textarea, `未找到输入框：${id}`).not.toBeNull()
  if (!textarea) return
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  valueSetter?.call(textarea, value)
  textarea.dispatchEvent(new InputEvent('input', { bubbles: true }))
}

async function openRetrieval(datasetId: string, question: string) {
  act(() => buttonByText('新增标准问答').click())
  act(() => changeTextarea('regression-case-question', question))
  await act(async () => {
    buttonByText('检索并选择标准证据').click()
    await Promise.resolve()
  })
  expect(mocks.retrieveEvidence).toHaveBeenLastCalledWith({
    query: question,
    dataset_id: datasetId,
  })
}

describe('评测证据草稿异步状态', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    mocks.createRegressionCase.mockResolvedValue({ id: 'case-created' })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    document.body.innerHTML = ''
  })

  it('数据集切走再切回时丢弃旧检索，并保持新请求的忙碌状态', async () => {
    const oldRequest = deferred<EvidenceResponse>()
    const newRequest = deferred<EvidenceResponse>()
    mocks.retrieveEvidence
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise)

    await act(async () => {
      root.render(<TestCaseManager datasetId="dataset-a" />)
      await Promise.resolve()
    })
    await openRetrieval('dataset-a', '旧问题')

    await act(async () => {
      root.render(<TestCaseManager datasetId="dataset-b" />)
      await Promise.resolve()
    })
    await act(async () => {
      root.render(<TestCaseManager datasetId="dataset-a" />)
      await Promise.resolve()
    })
    await openRetrieval('dataset-a', '新问题')

    await act(async () => {
      oldRequest.resolve(evidenceResponse('旧文档.pdf', 'old-chunk'))
      await Promise.resolve()
    })

    expect(document.body.textContent).not.toContain('旧文档.pdf')
    expect(buttonByText('操作进行中，暂不能关闭').disabled).toBe(true)
    expect(document.body.querySelector('[role="dialog"]')?.getAttribute('aria-busy')).toBe('true')

    await act(async () => {
      newRequest.resolve(evidenceResponse('新文档.pdf', 'new-chunk'))
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain('选择标准证据')
    expect(document.body.textContent).toContain('新文档.pdf')
  })

  it('旧创建完成后不关闭新数据集导入的证据草稿', async () => {
    const createRequest = deferred<{ id: string }>()
    mocks.retrieveEvidence.mockResolvedValue(evidenceResponse('数据集 A 文档.pdf', 'chunk-a'))
    mocks.createRegressionCase.mockReturnValueOnce(createRequest.promise)

    await act(async () => {
      root.render(<TestCaseManager datasetId="dataset-a" />)
      await Promise.resolve()
    })
    await openRetrieval('dataset-a', '数据集 A 问题')
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      buttonByText('创建基准样本').click()
      await Promise.resolve()
    })
    expect(buttonByText('操作进行中，暂不能关闭').disabled).toBe(true)

    await act(async () => {
      root.render(<TestCaseManager datasetId="dataset-b" />)
      await Promise.resolve()
    })

    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement | null
    expect(input).not.toBeNull()
    const importedPack = new File(
      [
        JSON.stringify({
          dataset_id: 'dataset-b',
          query: '数据集 B 问题',
          citations: evidenceResponse('数据集 B 文档.pdf', 'chunk-b').citations,
        }),
      ],
      'evidence-pack.json',
      { type: 'application/json' }
    )
    Object.defineProperty(input, 'files', { configurable: true, value: [importedPack] })

    await act(async () => {
      input?.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(document.body.textContent).toContain('数据集 B 文档.pdf')

    await act(async () => {
      createRequest.resolve({ id: 'old-case' })
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain('选择标准证据')
    expect(document.body.textContent).toContain('数据集 B 文档.pdf')
    expect(mocks.toastSuccess).not.toHaveBeenCalledWith('已创建基准评测样本')
  })
})

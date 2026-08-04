// @vitest-environment happy-dom

import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderHook, waitForAssertion } from '@/test/hook-harness'

const mocks = vi.hoisted(() => ({
  createItem: vi.fn(),
  datasetGet: vi.fn(),
  feedbackToEvidence: vi.fn(),
  importItems: vi.fn(),
  listItems: vi.fn(),
  listSuites: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    message: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('@/lib/api', () => ({
  datasetApi: { get: mocks.datasetGet },
  evidenceApi: {
    createItem: mocks.createItem,
    importItems: mocks.importItems,
    listItems: mocks.listItems,
    listSuites: mocks.listSuites,
  },
  feedbackApi: { toEvidenceItem: mocks.feedbackToEvidence },
  ragApi: { retrieveEvidence: vi.fn() },
}))

import { useEvidenceSuiteWorkbenchState } from './use-evidence-suite-workbench-state'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

function suite(id: string, datasetId: string) {
  return {
    id,
    dataset_id: datasetId,
    name: id,
    description: null,
    tags: [],
    item_counts: null,
  }
}

describe('证据工作台数据集切换', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.datasetGet.mockImplementation(async (datasetId: string) => ({
      id: datasetId,
      name: datasetId,
    }))
    mocks.listItems.mockResolvedValue({ items: [] })
    mocks.importItems.mockResolvedValue({
      parsed: 1,
      created: 1,
      skipped: 0,
      errors: [],
    })
  })

  it('新数据集证据集返回前阻止所有旧证据集写入', async () => {
    const datasetBSuites = deferred<{ items: ReturnType<typeof suite>[] }>()
    mocks.listSuites.mockImplementation(({ dataset_id }: { dataset_id: string }) => {
      if (dataset_id === 'dataset-b') return datasetBSuites.promise
      return Promise.resolve({ items: [suite('suite-a', 'dataset-a')] })
    })

    let datasetId = 'dataset-a'
    const hook = renderHook(() => useEvidenceSuiteWorkbenchState(datasetId))
    await waitForAssertion(() => {
      expect(hook.result.current.selectedSuiteId).toBe('suite-a')
      expect(hook.result.current.datasetTransitioning).toBe(false)
    })

    datasetId = 'dataset-b'
    hook.rerender()

    expect(hook.result.current.datasetTransitioning).toBe(true)
    expect(hook.result.current.selectedSuite).toBeNull()
    expect(hook.result.current.selectedSuiteId).toBe('')

    await act(async () => {
      await hook.result.current.handleImportQAFaq(
        new File(['question,answer'], 'questions.csv', { type: 'text/csv' })
      )
      await hook.result.current.handleConvertFeedbackToEvidence('feedback-a')
    })
    act(() => hook.result.current.openCreateItem())

    expect(mocks.importItems).not.toHaveBeenCalled()
    expect(mocks.feedbackToEvidence).not.toHaveBeenCalled()
    expect(hook.result.current.createItemOpen).toBe(false)

    await act(async () => {
      datasetBSuites.resolve({ items: [suite('suite-b', 'dataset-b')] })
      await datasetBSuites.promise
    })
    await waitForAssertion(() => {
      expect(hook.result.current.selectedSuiteId).toBe('suite-b')
      expect(hook.result.current.datasetTransitioning).toBe(false)
    })

    await act(async () => {
      await hook.result.current.handleImportQAFaq(
        new File(['question,answer'], 'questions.csv', { type: 'text/csv' })
      )
    })
    expect(mocks.importItems).toHaveBeenCalledWith('suite-b', expect.any(File))
    hook.unmount()
  })

  it('忽略切换前尚未返回的证据集响应', async () => {
    const datasetASuites = deferred<{ items: ReturnType<typeof suite>[] }>()
    mocks.listSuites.mockImplementation(({ dataset_id }: { dataset_id: string }) => {
      if (dataset_id === 'dataset-a') return datasetASuites.promise
      return Promise.resolve({ items: [suite('suite-b', 'dataset-b')] })
    })

    let datasetId = 'dataset-a'
    const hook = renderHook(() => useEvidenceSuiteWorkbenchState(datasetId))
    expect(hook.result.current.datasetTransitioning).toBe(true)

    datasetId = 'dataset-b'
    hook.rerender()
    await waitForAssertion(() => {
      expect(hook.result.current.selectedSuiteId).toBe('suite-b')
      expect(hook.result.current.datasetTransitioning).toBe(false)
    })

    await act(async () => {
      datasetASuites.resolve({ items: [suite('suite-a', 'dataset-a')] })
      await datasetASuites.promise
    })

    expect(hook.result.current.selectedSuiteId).toBe('suite-b')
    expect(hook.result.current.selectedSuite?.dataset_id).toBe('dataset-b')
    hook.unmount()
  })
})
